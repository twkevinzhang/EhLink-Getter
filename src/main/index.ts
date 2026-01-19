import { app, shell, BrowserWindow, ipcMain } from "electron";
import { join, dirname } from "path";
import * as fs from "fs";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { spawn, ChildProcess } from "child_process";
import axios from "axios";
import { MetadataService } from "./services/metadata_service";
import { ConfigService } from "./services/config_service";

let mainWindow: BrowserWindow;
let pythonProcess: ChildProcess | null = null;
const configService = new ConfigService();
let currentConfig = configService.loadConfig();

const SIDECAR_PORT = 8000;
const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`;

let isQuitting = false;

function startSidecar() {
  const isDev = is.dev;
  let pythonExecutable = "python";
  if (isDev) {
    const venvPython = join(app.getAppPath(), ".venv", "bin", "python");
    if (fs.existsSync(venvPython)) {
      pythonExecutable = venvPython;
    }
  }
  let scriptPath = join(app.getAppPath(), "sidecar", "main.py");

  if (!isDev) {
    // In production, use the bundled binary
    pythonExecutable = join(
      process.resourcesPath,
      "sidecar",
      process.platform === "win32" ? "sidecar.exe" : "sidecar",
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
    // Open DevTools in development mode for debugging
    if (is.dev) {
      mainWindow.webContents.openDevTools();
    }
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
ipcMain.handle("select-save-path", async () => {
  const { canceled, filePath } =
    await require("electron").dialog.showSaveDialog(mainWindow, {
      title: "Select Output CSV Path",
      defaultPath: "gallery-links.csv",
      filters: [{ name: "CSV Files", extensions: ["csv"] }],
    });
  if (!canceled) {
    return filePath;
  }
  return null;
});

ipcMain.handle("map-metadata", async (_, payload: any) => {
  try {
    const service = new MetadataService(payload.metadata_path);
    const rawResults = await service.findMultipleLinks(
      payload.keywords,
      1000,
      true,
    );

    const filteredResults = rawResults.map((item) => {
      const itemFiltered: any = {};
      for (const field of payload.fields) {
        if (field === "link") {
          itemFiltered.link = `https://e-hentai.org/g/${item.gid}/${item.token}/`;
        } else if (item[field] !== undefined) {
          itemFiltered[field] = item[field];
        }
      }
      return itemFiltered;
    });

    return { results: filteredResults };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle(
  "fetch-page",
  async (_, payload: { url: string; next?: string }) => {
    try {
      const response = await axios.get(`${SIDECAR_URL}/tasks/fetch`, {
        params: { url: payload.url, next: payload.next },
      });
      return response.data;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
);

ipcMain.handle("save-json", async (_, payload: { path: string; data: any }) => {
  try {
    const actualPath = payload.path;
    // Ensure directory exists
    if (!fs.existsSync(join(dirname(actualPath)))) {
      fs.mkdirSync(join(dirname(actualPath)), { recursive: true });
    }

    fs.writeFileSync(actualPath, JSON.stringify(payload.data, null, 2), "utf8");
    return { status: "saved", path: actualPath };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle(
  "save-csv",
  async (_, payload: { path: string; results: any[] }) => {
    try {
      const csvContent = [
        "\ufeffTitle,Link", // Add UTF-8 BOM for Excel compatibility
        ...payload.results.map((item) => {
          // Escape double quotes and wrap in quotes
          const escapedTitle = `"${(item.title || "").replace(/"/g, '""')}"`;
          const escapedLink = `"${(item.link || "").replace(/"/g, '""')}"`;
          return `${escapedTitle},${escapedLink}`;
        }),
      ].join("\n");

      // Replace {execute_started_at} if present (though frontend might have handled it)
      let actualPath = payload.path;
      if (actualPath.includes("{execute_started_at}")) {
        const now = new Date();
        const timestamp =
          now.getFullYear() +
          String(now.getMonth() + 1).padStart(2, "0") +
          String(now.getDate()).padStart(2, "0") +
          "_" +
          String(now.getHours()).padStart(2, "0") +
          String(now.getMinutes()).padStart(2, "0") +
          String(now.getSeconds()).padStart(2, "0");
        actualPath = actualPath.replace("{execute_started_at}", timestamp);
      }

      // Ensure directory exists
      if (!fs.existsSync(join(dirname(actualPath)))) {
        fs.mkdirSync(join(dirname(actualPath)), { recursive: true });
      }

      fs.writeFileSync(actualPath, csvContent, "utf8");
      return { status: "saved", path: actualPath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
);

ipcMain.handle("search-metadata", async (_, query: string) => {
  try {
    // We need the metadata path from state... actually App.vue passes it in some calls,
    // but searchMetadata in SidecarAPI doesn't take it currently.
    // In metadata_service.py it used config.metadata_path.
    // For now I'll use a hardcoded default or handle it better.
    // MapMetadata takes it, so let's assume metadata.json in current dir as default.
    const service = new MetadataService("metadata.json");
    const results = await service.findLinks(query);
    return { results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle("get-config", async () => {
  return currentConfig;
});

ipcMain.handle("save-config", async (_, config: any) => {
  try {
    currentConfig = config;
    configService.saveConfig(config);
    await axios.post(`${SIDECAR_URL}/config`, config);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle(
  "start-download",
  async (_, payload: { jobId: string; images: any[] }) => {
    try {
      await axios.post(`${SIDECAR_URL}/job/start`, {
        job_id: payload.jobId,
        images: payload.images,
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
);

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

  // Sync config to sidecar once it's up
  const syncConfig = async (retries = 5) => {
    try {
      await axios.post(`${SIDECAR_URL}/config`, currentConfig);
      console.log("Config synced to sidecar");
    } catch (e) {
      if (retries > 0) {
        setTimeout(() => syncConfig(retries - 1), 2000);
      } else {
        console.error("Failed to sync config to sidecar after retries");
      }
    }
  };
  syncConfig();

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
