/**
 * 应用入口 — 窗口、托盘、热键、数据库、剪贴板监听。
 */

const path = require('path');

let app, BrowserWindow, Menu;
try {
  const e = require('electron');
  if (typeof e === 'string') {
    console.error('当前在 Node.js 环境，请通过 npm start 启动');
    process.exit(1);
  }
  app = e.app;
  BrowserWindow = e.BrowserWindow;
  Menu = e.Menu;
} catch (err) {
  console.error('无法加载 Electron 模块:', err.message);
  process.exit(1);
}

const database = require('./database');
const clipboardMonitor = require('./clipboard-monitor');
const trayModule = require('./tray');
const hotkeyModule = require('./hotkey');
const autoStart = require('./auto-start');
const ipcHandlers = require('./ipc-handlers');
const ocrService = require('./ocr-service');

let mainWindow = null;
const isOcrSmokeTest = process.argv.includes('--ocr-smoke-test');

async function runOcrSmokeTest() {
  const fs = require('fs');
  const imagePath = path.join(app.getAppPath(), 'assets', 'icon.png');
  const imageBuffer = fs.readFileSync(imagePath);

  try {
    await ocrService.recognizeText(imageBuffer);
  } catch (error) {
    if (error.code !== 'OCR_NO_TEXT') throw error;
  } finally {
    await ocrService.terminate();
  }
}

// ============================================================
//  窗口管理
// ============================================================

function createWindow() {
  // 查找图标（开发 vs 打包路径）
  let iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  if (!require('fs').existsSync(iconPath)) {
    iconPath = path.join(process.resourcesPath || '', 'assets', 'icon.png');
  }
  if (!require('fs').existsSync(iconPath)) {
    iconPath = path.join(app.getAppPath(), 'assets', 'icon.png');
  }

  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    minWidth: 320,
    minHeight: 400,
    show: false,
    frame: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // 复原窗口位置和大小
  try {
    const wx = database.getSetting('window_x');
    const wy = database.getSetting('window_y');
    const ww = database.getSetting('window_width');
    const wh = database.getSetting('window_height');
    if (wx && wy) mainWindow.setPosition(parseInt(wx), parseInt(wy));
    if (ww && wh) mainWindow.setSize(parseInt(ww), parseInt(wh));
  } catch (err) { /* 忽略 */ }

  // 复原半透明
  if (database.getSetting('translucent_mode') === 'true') {
    const opacity = parseInt(database.getSetting('translucent_opacity'), 10) || 30;
    mainWindow.setOpacity(Math.max(0.3, Math.min(0.8, opacity / 100)));
  }

  // 复原窗口置顶
  if (database.getSetting('always_on_top') === 'true') {
    mainWindow.setAlwaysOnTop(true);
  }

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
    }
  });

  mainWindow.on('close', (event) => {
    // 保存窗口位置和大小
    try {
      const bounds = mainWindow.getBounds();
      database.setSetting('window_x', String(bounds.x));
      database.setSetting('window_y', String(bounds.y));
      database.setSetting('window_width', String(bounds.width));
      database.setSetting('window_height', String(bounds.height));
    } catch (err) { /* 忽略 */ }

    if (!mainWindow._forceQuit) {
      event.preventDefault();
      mainWindow.hide();
      trayModule.onWindowShow();
    }
  });

  mainWindow.on('show', () => {
    trayModule.onWindowShow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    ipcHandlers.setWindow(mainWindow);
    clipboardMonitor.setWindow(mainWindow);
    return;
  }

  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// ============================================================
//  应用生命周期
// ============================================================

app.whenReady().then(async () => {
  if (isOcrSmokeTest) {
    try {
      await runOcrSmokeTest();
      app.exit(0);
    } catch (error) {
      console.error('OCR 成品自检失败:', error);
      app.exit(1);
    }
    return;
  }

  Menu.setApplicationMenu(null);

  try {
    await database.initDatabase();
    console.log('✅ 数据库初始化完成');
  } catch (err) {
    console.error('❌ 数据库初始化失败:', err.message);
  }

  createWindow();
  ipcHandlers.setWindow(mainWindow);
  ipcHandlers.registerHandlers();

  trayModule.createTray(mainWindow, createWindow);
  console.log('✅ 系统托盘已就绪');

  const hotkey = database.getSetting('hotkey') || 'Ctrl+Shift+V';
  hotkeyModule.registerHotkey(hotkey, toggleWindow);

  const autoStartEnabled = database.getSetting('auto_start') !== 'false';
  autoStart.setAutoStart(autoStartEnabled);

  clipboardMonitor.setWindow(mainWindow);
  clipboardMonitor.startMonitoring();
  console.log('✅ 剪贴板监听已启动');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  clipboardMonitor.stopMonitoring();
  hotkeyModule.unregisterAll();
  trayModule.destroyTray();
  void ocrService.terminate();
  database.closeDatabase();
  console.log('✅ 应用已安全退出');
});
