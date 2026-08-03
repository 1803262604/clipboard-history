/**
 * IPC 处理器 — 注册所有主进程 ↔ 渲染进程的通信通道。
 * 每个 handler 负责一个 IPC 通道，做参数验证和业务逻辑。
 */

const { ipcMain, clipboard, nativeImage } = require('electron');
const database = require('./database');
const imageStore = require('./image-store');
const fileClipboard = require('./file-clipboard');
const ocrService = require('./ocr-service');

// 窗口引用
let mainWindow = null;

const ITEM_TYPES = new Set(['all', 'text', 'image']);

function normalizeType(type) {
  return ITEM_TYPES.has(type) ? type : 'all';
}

function normalizePageValue(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeItemIds(ids) {
  if (!Array.isArray(ids)) {
    throw new Error('条目 ID 必须是数组');
  }

  const normalized = [...new Set(ids.map(id => Number(id)))]
    .filter(id => Number.isInteger(id) && id > 0);
  if (normalized.length === 0) {
    throw new Error('至少选择一条有效记录');
  }
  if (normalized.length > fileClipboard.MAX_FILE_COUNT) {
    throw new Error(`一次最多处理 ${fileClipboard.MAX_FILE_COUNT} 条记录`);
  }
  return normalized;
}

function setWindow(win) {
  mainWindow = win;
}

/**
 * 注册所有 IPC handlers
 */
function registerHandlers() {

  // ---- 历史记录 ----

  ipcMain.handle('clipboard:getItems', (_event, limit = 20, offset = 0, type = 'all') => {
    try {
      const safeLimit = normalizePageValue(limit, 20, 100);
      const safeOffset = normalizePageValue(offset, 0, Number.MAX_SAFE_INTEGER);
      const safeType = normalizeType(type);
      const items = database.getItems(safeLimit, safeOffset, safeType);
      const total = database.getItemCount(safeType);
      return { items, total };
    } catch (err) {
      console.error('[clipboard:getItems] Error:', err.message);
      return { items: [], total: 0 };
    }
  });

  ipcMain.handle('clipboard:search', (_event, query, limit = 20, offset = 0, type = 'all') => {
    try {
      const safeLimit = normalizePageValue(limit, 20, 100);
      const safeOffset = normalizePageValue(offset, 0, Number.MAX_SAFE_INTEGER);
      const safeType = normalizeType(type);
      const safeQuery = typeof query === 'string'
        ? query.trim().substring(0, 500)
        : '';
      if (!safeQuery) {
        const items = database.getItems(safeLimit, safeOffset, safeType);
        const total = database.getItemCount(safeType);
        return { items, total };
      }
      const items = database.searchItems(safeQuery, safeLimit, safeOffset, safeType);
      const total = database.getSearchItemCount(safeQuery, safeType);
      return { items, total };
    } catch (err) {
      console.error('[clipboard:search] Error:', err.message);
      return { items: [], total: 0 };
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

  ipcMain.handle('clipboard:deleteBatch', (_event, ids) => {
    try {
      const safeIds = normalizeItemIds(ids);
      const items = database.deleteItems(safeIds);
      for (const item of items) {
        if (item.type === 'image' && item.image_path) {
          imageStore.deleteImage(item.image_path);
        }
      }
      return { deleted: items.length };
    } catch (err) {
      console.error('[clipboard:deleteBatch] Error:', err.message);
      return { deleted: 0, error: err.message };
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

  ipcMain.handle('clipboard:copyImageFiles', async (_event, ids) => {
    try {
      const safeIds = normalizeItemIds(ids);
      const items = database.getItemsByIds(safeIds);
      if (items.some(item => item.type !== 'image')) {
        throw new Error('只能将图片记录复制为文件');
      }

      const filePaths = items.map(item => imageStore.getImagePath(item.image_path));
      const copied = await fileClipboard.copyFilesToClipboard(filePaths);
      return { copied };
    } catch (err) {
      console.error('[clipboard:copyImageFiles] Error:', err.message);
      return { copied: 0, error: err.message };
    }
  });

  ipcMain.handle('clipboard:recognizeImageText', async (event, id) => {
    try {
      const safeId = Number(id);
      if (!Number.isInteger(safeId) || safeId <= 0) {
        throw new Error('图片 ID 无效');
      }

      const item = database.getItemById(safeId);
      if (!item || item.type !== 'image' || !item.image_path) {
        throw new Error('未找到图片记录');
      }

      const imageBuffer = imageStore.loadImage(item.image_path);
      if (!imageBuffer) {
        const error = new Error('图片文件不存在');
        error.userMessage = error.message;
        throw error;
      }

      const sender = event.sender;
      const text = await ocrService.recognizeText(imageBuffer, progress => {
        try {
          if (!sender.isDestroyed()) {
            sender.send('clipboard:ocrProgress', {
              id: safeId,
              status: progress.status,
              progress: progress.progress,
            });
          }
        } catch (progressError) {
          console.warn('[clipboard:ocrProgress] Error:', progressError.message);
        }
      });
      try {
        clipboard.writeText(text);
      } catch (clipboardError) {
        const error = new Error('文字已识别，但写入剪贴板失败');
        error.userMessage = error.message;
        throw error;
      }
      return { copied: true, charCount: Array.from(text).length };
    } catch (err) {
      console.error('[clipboard:recognizeImageText] Error:', err.message);
      return {
        copied: false,
        error: err.userMessage || '文字识别失败，请重试',
      };
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
