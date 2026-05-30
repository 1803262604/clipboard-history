/**
 * 系统托盘模块 — 托盘图标 + 右键菜单 + 点击交互。
 */

const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;
let mainWindow = null;
let onShowCallback = null;

/**
 * 加载托盘图标（使用与窗口相同的应用图标）
 */
function createTrayIcon() {
  try {
    // 尝试多个路径（开发环境 vs 打包后）
    const paths = [
      path.join(__dirname, '..', '..', 'assets', 'icon.png'),
      path.join(process.resourcesPath || '', 'assets', 'icon.png'),
      path.join(app.getAppPath(), 'assets', 'icon.png'),
    ];
    for (const iconPath of paths) {
      if (fs.existsSync(iconPath)) {
        return nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
      }
    }
  } catch (err) {
    console.error('加载托盘图标失败:', err.message);
  }

  // 兜底：蓝色方块+白色"C"
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      buf[i] = 41; buf[i+1] = 98; buf[i+2] = 174; buf[i+3] = 255;
    }
  }
  return nativeImage.createFromBuffer(buf, { width: size, height: size });
}

/**
 * 创建系统托盘
 * @param {BrowserWindow} win - 主窗口引用
 * @param {Function} showCallback - 显示窗口的回调
 */
function createTray(win, showCallback) {
  mainWindow = win;
  onShowCallback = showCallback;

  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('剪贴板历史');

  // 左键点击：显示/隐藏窗口
  tray.on('click', () => {
    toggleWindow();
  });

  // 更新右键菜单
  updateMenu();
}

/**
 * 更新托盘右键菜单
 */
function updateMenu() {
  if (!tray) return;

  const isVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? '隐藏窗口' : '显示剪贴板历史',
      click: () => toggleWindow(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        // 标记为真正退出（防止窗口关闭事件拦截）
        if (mainWindow) {
          mainWindow._forceQuit = true;
        }
        const { app } = require('electron');
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * 切换窗口显示/隐藏
 */
function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (onShowCallback) onShowCallback();
    return;
  }

  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }

  // 更新菜单（"显示"/"隐藏"文字会变）
  updateMenu();
}

/**
 * 窗口显示时更新托盘状态
 */
function onWindowShow() {
  updateMenu();
}

/**
 * 销毁托盘
 */
function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

module.exports = {
  createTray,
  toggleWindow,
  onWindowShow,
  destroyTray,
  updateMenu,
};
