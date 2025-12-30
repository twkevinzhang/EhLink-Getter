import { app, shell, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { spawn, ChildProcess } from "child_process";
import axios from "axios";

let mainWindow: BrowserWindow;
let pythonProcess: ChildProcess | null = null;
const SIDECAR_PORT = 8000;
const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`;

let isQuitting = false;

function startSidecar() {
  const isDev = is.dev;
  let pythonExecutable = "python";
  let scriptPath = join(app.getAppPath(), "sidecar", "main.py");

  if (!isDev) {
    // In production, use the bundled binary
    pythonExecutable = join(
      process.resourcesPath,
      "sidecar",
      process.platform === "win32" ? "eh-sidecar.exe" : "eh-sidecar"
    );
    scriptPath = ""; // Not needed for binary
  }

  const args = isDev ? [scriptPath] : [];

  pythonProcess = spawn(pythonExecutable, args, {
    env: { ...process.env, SIDECAR_PORT: SIDECAR_PORT.toString() },
    shell: true,
  });

  pythonProcess.stdout?.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        if (json.type === "log") {
          mainWindow?.webContents.send("python-log", json);
        } else if (json.type === "progress") {
          mainWindow?.webContents.send("python-progress", json);
        } else if (json.type === "task_complete") {
          mainWindow?.webContents.send("python-task-complete", json);
        }
      } catch (e) {
        // Not JSON, just regular log
        mainWindow?.webContents.send("python-log", {
          level: "info",
          message: line.trim(),
        });
      }
    }
  });

  pythonProcess.stderr?.on("data", (data) => {
    console.error(`Sidecar error: ${data}`);
    mainWindow?.webContents.send("python-log", {
      level: "error",
      message: data.toString(),
    });
  });

  pythonProcess.on("close", (code) => {
    console.log(`Sidecar process exited with code ${code}`);
    if (code !== 0 && !isQuitting) {
      // Auto restart in production if needed
      // startSidecar()
    }
  });
}

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "linux"
      ? { icon: join(__dirname, "../../resources/icon.png") }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// IPC Handlers
ipcMain.handle("start-favorites-task", async (_, outputPath?: string) => {
  try {
    await axios.post(`${SIDECAR_URL}/tasks/favorites`, null, {
      params: { output_path: outputPath },
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("stop-favorites-task", async () => {
  try {
    await axios.post(`${SIDECAR_URL}/tasks/favorites/stop`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("map-metadata", async (_, payload: any) => {
  try {
    const response = await axios.post(
      `${SIDECAR_URL}/tasks/metadata/map`,
      payload,
      { timeout: 300000 } // 5 minutes timeout
    );
    return response.data;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("search-metadata", async (_, query: string) => {
  try {
    const response = await axios.get(`${SIDECAR_URL}/search`, {
      params: { q: query },
      timeout: 300000, // 5 minutes timeout
    });
    return response.data;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("save-config", async (_, config: any) => {
  try {
    await axios.post(`${SIDECAR_URL}/config`, config);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("open-folder", async (_, folderPath: string) => {
  if (folderPath) {
    shell.openPath(folderPath);
  } else {
    shell.openPath(app.getPath("downloads"));
  }
});

ipcMain.handle("select-directory", async () => {
  const { canceled, filePaths } =
    await require("electron").dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
    });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.electron");

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  startSidecar();
  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
