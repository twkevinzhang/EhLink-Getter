"use strict";
const electron = require("electron");
const path = require("path");
const utils = require("@electron-toolkit/utils");
const child_process = require("child_process");
const axios = require("axios");
let mainWindow;
let pythonProcess = null;
const SIDECAR_PORT = 8e3;
const SIDECAR_URL = `http://127.0.0.1:${SIDECAR_PORT}`;
function startSidecar() {
  const isDev = utils.is.dev;
  let pythonExecutable = "python";
  let scriptPath = path.join(electron.app.getAppPath(), "sidecar", "main.py");
  if (!isDev) {
    pythonExecutable = path.join(
      process.resourcesPath,
      "sidecar",
      process.platform === "win32" ? "eh-sidecar.exe" : "eh-sidecar"
    );
    scriptPath = "";
  }
  const args = isDev ? [scriptPath] : [];
  pythonProcess = child_process.spawn(pythonExecutable, args, {
    env: { ...process.env, SIDECAR_PORT: SIDECAR_PORT.toString() },
    shell: true
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
        mainWindow?.webContents.send("python-log", {
          level: "info",
          message: line.trim()
        });
      }
    }
  });
  pythonProcess.stderr?.on("data", (data) => {
    console.error(`Sidecar error: ${data}`);
    mainWindow?.webContents.send("python-log", {
      level: "error",
      message: data.toString()
    });
  });
  pythonProcess.on("close", (code) => {
    console.log(`Sidecar process exited with code ${code}`);
  });
}
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1e3,
    height: 700,
    show: false,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon: path.join(__dirname, "../../resources/icon.png") } : {},
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}
electron.ipcMain.handle("start-favorites-task", async () => {
  try {
    await axios.post(`${SIDECAR_URL}/tasks/favorites`);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("search-metadata", async (_, query) => {
  try {
    const response = await axios.get(`${SIDECAR_URL}/search`, {
      params: { q: query }
    });
    return response.data;
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("save-config", async (_, config) => {
  try {
    await axios.post(`${SIDECAR_URL}/config`, config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("open-folder", async (_, folderPath) => {
  if (folderPath) {
    electron.shell.openPath(folderPath);
  } else {
    electron.shell.openPath(electron.app.getPath("downloads"));
  }
});
electron.ipcMain.handle("select-directory", async () => {
  const { canceled, filePaths } = await require("electron").dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"]
  });
  if (!canceled) {
    return filePaths[0];
  }
  return null;
});
electron.app.whenReady().then(() => {
  utils.electronApp.setAppUserModelId("com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  startSidecar();
  createWindow();
  electron.app.on("activate", function() {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  if (pythonProcess) {
    pythonProcess.kill();
  }
});
