const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const { autoUpdater } = require("electron-updater");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const WEB_URL = process.env.ELECTRON_WEB_URL || "http://127.0.0.1:5173";
const API_URL = process.env.ELECTRON_API_URL || "http://127.0.0.1:5000";

let viteProcess;
let webServer;
let backendProcess;
let mainWindow;

function startVite() {
  const viteCli = path.join(
    __dirname,
    "node_modules",
    "vite",
    "bin",
    "vite.js",
  );

  viteProcess = spawn(process.execPath, [viteCli, "--host", "127.0.0.1"], {
    cwd: __dirname,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
    },
  });

  viteProcess.on("error", (error) => {
    console.error("Could not start Vite:", error);
  });
}

function startProductionWebServer() {
  const distDir = path.join(__dirname, "dist");
  const mimeTypes = {
    ".css": "text/css",
    ".html": "text/html",
    ".ico": "image/x-icon",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  webServer = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, WEB_URL);
    const relativePath = decodeURIComponent(requestUrl.pathname)
      .replace(/^[/\\]+/, "")
      .replace(/[/\\]+$/, "");
    const requestedPath = path.resolve(
      distDir,
      relativePath === "" ? "index.html" : relativePath,
    );
    const isInsideDist = path.relative(distDir, requestedPath).startsWith("..") === false;
    const filePath = isInsideDist && fs.existsSync(requestedPath)
      ? requestedPath
      : path.join(distDir, "index.html");

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(500);
        response.end("Could not load application.");
        return;
      }

      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      });
      response.end(content);
    });
  });

  return new Promise((resolve, reject) => {
    webServer.once("error", reject);
    webServer.listen(5173, "127.0.0.1", resolve);
  });
}

function getPackagedBackendPath() {
  const executableName =
    process.platform === "win32" ? "airleakage-backend.exe" : "airleakage-backend";

  return path.join(
    process.resourcesPath,
    "backend",
    "airleakage-backend",
    executableName,
  );
}

function startPackagedBackend() {
  const backendPath = getPackagedBackendPath();

  if (!fs.existsSync(backendPath)) {
    throw new Error(`Packaged backend was not found: ${backendPath}`);
  }

  backendProcess = spawn(backendPath, [], {
    cwd: path.dirname(backendPath),
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      AIR_LEAKAGE_DATA_DIR: path.join(app.getPath("userData"), "data"),
    },
  });

  backendProcess.on("error", (error) => {
    console.error("Could not start backend:", error);
  });

  backendProcess.on("exit", (code, signal) => {
    if (!app.isQuitting) {
      console.error(`Backend exited unexpectedly: code=${code}, signal=${signal}`);
    }
  });
}

async function waitForUrl(url, retries = 150) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  throw new Error(`Server is not available at ${url}`);
}

async function waitForWebServer(retries = 150) {
  await waitForUrl(WEB_URL, retries);
}

async function waitForBackend(retries = 150) {
  await waitForUrl(`${API_URL}/api/settings`, retries);
}

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "Air Leakage Project",
    frame: false,
    autoHideMenuBar: true,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const isToggleDevTools =
      input.key === "F12" ||
      (input.control && input.shift && input.key.toLowerCase() === "i");

    if (isToggleDevTools) {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  if (process.env.ELECTRON_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.once("did-finish-load", () => {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    });
  }

  mainWindow.maximize();
  mainWindow.loadURL(WEB_URL);
}

function setupAutoUpdater() {
  if (!app.isPackaged) return;

  if (process.env.ELECTRON_GITHUB_OWNER && process.env.ELECTRON_GITHUB_REPO) {
    autoUpdater.setFeedURL({
      provider: "github",
      owner: process.env.ELECTRON_GITHUB_OWNER,
      repo: process.env.ELECTRON_GITHUB_REPO,
      releaseType: "release",
    });
  }

  if (process.env.ELECTRON_UPDATE_URL) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: process.env.ELECTRON_UPDATE_URL,
    });
  }

  autoUpdater.autoDownload = true;

  autoUpdater.on("error", (error) => {
    console.error("Auto update error:", error);
  });

  autoUpdater.on("update-downloaded", () => {
    const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow;
    dialog
      .showMessageBox(focusedWindow, {
        type: "info",
        title: "Có bản cập nhật mới",
        message: "Bản cập nhật đã tải xong. Khởi động lại để cài đặt ngay?",
        buttons: ["Khởi động lại", "Để sau"],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error("Could not check for updates:", error);
  });
}

app
  .whenReady()
  .then(async () => {
    ipcMain.handle("dialog:showSaveDialog", async (event, options) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      return dialog.showSaveDialog(win, options);
    });

    ipcMain.handle("app:close", () => app.quit());

    if (app.isPackaged) {
      startPackagedBackend();
      await waitForBackend();
      await startProductionWebServer();
    } else {
      startVite();
      await waitForWebServer();
    }

    createWindow();
    setupAutoUpdater();
  })
  .catch((error) => {
    console.error("Could not start the application:", error);
    dialog.showErrorBox("Air Leakage Project", error.message);
    app.quit();
  });

app.on("will-quit", () => {
  app.isQuitting = true;
  viteProcess?.kill();
  backendProcess?.kill();
  webServer?.close();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
