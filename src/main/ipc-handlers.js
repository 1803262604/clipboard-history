/**
 * IPC 处理器 — 注册所有主进程 ↔ 渲染进程的通信通道。
 * 每个 handler 负责一个 IPC 通道，做参数验证和业务逻辑。
 */

const { ipcMain, clipboard, nativeImage } = require('electron');
const database = require('./database');
const imageStore = require('./image-store');

// 窗口引用
let mainWindow = null;

function setWindow(win) {
  mainWindow = win;
}

/**
 * 注册所有 IPC handlers
 */
function registerHandlers() {

  // ---- 历史记录 ----

  ipcMain.handle('clipboard:getItems', (_event, limit = 20, offset = 0) => {
    try {
      const items = database.getItems(limit, offset);
      const total = database.getItemCount();
      return { items, total };
    } catch (err) {
      console.error('[clipboard:getItems] Error:', err.message);
      return { items: [], total: 0 };
    }
  });

  ipcMain.handle('clipboard:search', (_event, query, limit = 20, offset = 0) => {
    try {
      if (!query || query.trim().length === 0) {
        return database.getItems(limit, offset);
      }
      return database.searchItems(query.trim(), limit, offset);
    } catch (err) {
      console.error('[clipboard:search] Error:', err.message);
      return [];
    }
  });

  // ---- 条目操作 ----

  ipcMain.handle('clipboard:pin', (_event, id, pinned) => {
    try {
      database.pinItem(id, pinned);
      return true;
    } catch (err) {
      console.error('[clipboard:pin] Error:', err.message);
      return false;
    }
  });

  ipcMain.handle('clipboard:delete', (_event, id) => {
    try {
      const item = database.deleteItem(id);
      if (item && item.type === 'image' && item.image_path) {
        imageStore.deleteImage(item.image_path);
      }
      return true;
    } catch (err) {
      console.error('[clipboard:delete] Error:', err.message);
      return false;
    }
  });

  ipcMain.handle('clipboard:copy', (_event, id) => {
    try {
      const item = database.getItemById(id);
      if (!item) return false;

      if (item.type === 'text' && item.content) {
        clipboard.writeText(item.content);
      } else if (item.type === 'image' && item.image_path) {
        const imgBuffer = imageStore.loadImage(item.image_path);
        if (imgBuffer) {
          const img = nativeImage.createFromBuffer(imgBuffer);
          clipboard.writeImage(img);
        } else {
          return false;
        }
      }
      return true;
    } catch (err) {
      console.error('[clipboard:copy] Error:', err.message);
      return false;
    }
  });

  ipcMain.handle('clipboard:getImage', (_event, id) => {
    try {
      const item = database.getItemById(id);
      if (!item || item.type !== 'image' || !item.image_path) return null;

      const base64 = imageStore.loadImageAsBase64(item.image_path);
      return {
        base64,
        width: item.image_width,
        height: item.image_height,
        filename: item.image_path,
      };
    } catch (err) {
      console.error('[clipboard:getImage] Error:', err.message);
      return null;
    }
  });

  // ---- 设置 ----

  ipcMain.handle('settings:get', (_event, key) => {
    try {
      return database.getSetting(key);
    } catch (err) {
      console.error('[settings:get] Error:', err.message);
      return null;
    }
  });

  ipcMain.handle('settings:set', (_event, key, value) => {
    try {
      database.setSetting(key, value);

      // 特殊处理：快捷键变更需要重新注册
      if (key === 'hotkey') {
        const hotkeyModule = require('./hotkey');
        hotkeyModule.registerHotkey(value, () => {
          if (mainWindow) {
            if (mainWindow.isVisible() && mainWindow.isFocused()) {
              mainWindow.hide();
            } else {
              mainWindow.show();
              mainWindow.focus();
            }
          }
        });
      }

      // 特殊处理：开机自启变更
      if (key === 'auto_start') {
        const autoStart = require('./auto-start');
        autoStart.setAutoStart(value === 'true');
      }

      return true;
    } catch (err) {
      console.error('[settings:set] Error:', err.message);
      return false;
    }
  });

  ipcMain.handle('settings:getAll', () => {
    try {
      return database.getAllSettings();
    } catch (err) {
      console.error('[settings:getAll] Error:', err.message);
      return {};
    }
  });

  // ---- 窗口 ----

  ipcMain.handle('window:hide', () => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }
      return true;
    } catch (err) {
      return false;
    }
  });

  ipcMain.handle('window:setOpacity', (_event, opacity) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setOpacity(opacity);
      }
      return true;
    } catch (err) {
      return false;
    }
  });

  ipcMain.handle('clipboard:getStorageInfo', () => {
    try {
      const count = database.getItemCount();
      const imageSize = imageStore.getImageStorageSize();
      return { count, imageSize };
    } catch (err) {
      return { count: 0, imageSize: 0 };
    }
  });

  ipcMain.handle('clipboard:clearAll', () => {
    try {
      // 删除所有非置顶条目
      const items = database.getItems(999999, 0);
      let deleted = 0;
      for (const item of items) {
        if (!item.is_pinned) {
          database.deleteItem(item.id);
          if (item.type === 'image' && item.image_path) {
            imageStore.deleteImage(item.image_path);
          }
          deleted++;
        }
      }
      return { deleted };
    } catch (err) {
      console.error('[clipboard:clearAll] Error:', err.message);
      return { deleted: 0 };
    }
  });

  ipcMain.handle('window:setAlwaysOnTop', (_event, on) => {
    try {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(on);
        database.setSetting('always_on_top', on ? 'true' : 'false');
      }
      return true;
    } catch (err) {
      return false;
    }
  });

  console.log('✅ IPC handlers 注册完成');
}

module.exports = {
  registerHandlers,
  setWindow,
};
