/**
 * 剪贴板监听模块 — 轮询剪贴板变化，捕获文字和图片。
 * 无外部依赖，直接使用 Electron 内置 clipboard 模块。
 */

const { clipboard, nativeImage } = require('electron');
const crypto = require('crypto');
const database = require('./database');
const imageStore = require('./image-store');

// 轮询间隔（毫秒）
const POLL_INTERVAL = 500;

// 状态
let pollingTimer = null;
let lastContentHash = null;
let mainWindow = null;
let isMonitoring = false;

// 文字长度限制
const MAX_TEXT_LENGTH = 100000;

/**
 * 设置渲染进程窗口引用（用于推送事件）
 * @param {BrowserWindow} win
 */
function setWindow(win) {
  mainWindow = win;
}

/**
 * 开始监听剪贴板
 */
function startMonitoring() {
  if (isMonitoring) return;
  isMonitoring = true;

  // 初始化哈希（避免启动时立即捕获剪贴板已有内容）
  updateHashFromCurrentClipboard();

  pollingTimer = setInterval(checkClipboard, POLL_INTERVAL);
  console.log(`剪贴板监听已启动 (${POLL_INTERVAL}ms 轮询)`);
}

/**
 * 停止监听
 */
function stopMonitoring() {
  if (!isMonitoring) return;
  isMonitoring = false;

  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  console.log('剪贴板监听已停止');
}

/**
 * 从当前剪贴板初始化哈希（防止启动时误捕获）
 */
function updateHashFromCurrentClipboard() {
  try {
    const formats = clipboard.availableFormats();
    if (formats.some(f => f.startsWith('image/'))) {
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        lastContentHash = imageStore.hashBuffer(img.toPNG());
      }
    } else {
      const text = clipboard.readText();
      if (text && text.trim().length > 0) {
        lastContentHash = crypto.createHash('sha256').update(text).digest('hex');
      }
    }
  } catch (err) {
    // 忽略初始化错误
  }
}

/**
 * 检查剪贴板内容
 */
function checkClipboard() {
  try {
    const formats = clipboard.availableFormats();

    // 优先检查图片（截图通常是图片格式）
    if (formats.some(f => f.startsWith('image/'))) {
      handleImageCapture();
    } else if (formats.includes('text/plain') || formats.includes('Text')) {
      handleTextCapture();
    }
    // 忽略其他格式（HTML、RTF、文件等）
  } catch (err) {
    console.error('剪贴板检查出错:', err.message);
  }
}

/**
 * 处理文字捕获
 */
function handleTextCapture() {
  const text = clipboard.readText();

  // 跳过空内容
  if (!text || text.trim().length === 0) return;

  // 跳过超长内容
  if (text.length > MAX_TEXT_LENGTH) return;

  // 计算哈希检测变化
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  if (hash === lastContentHash) return;
  lastContentHash = hash;

  // 检查是否与已有内容重复
  const existing = database.findDuplicateByHash(hash);
  if (existing) {
    database.updateLastCopied(existing.id);
    notifyRenderer('clipboard:itemUpdated', existing.id);
    return;
  }

  // 新增条目
  const id = database.addTextItem(text, hash);
  const item = database.getItemById(id);
  if (item) {
    notifyRenderer('clipboard:newItem', item);
  }

  // 检查是否需要清理超量条目
  enforceLimits();
}

/**
 * 处理图片捕获
 */
function handleImageCapture() {
  const img = clipboard.readImage();
  if (img.isEmpty()) return;

  const pngBuffer = img.toPNG();

  // 检查大小限制
  if (pngBuffer.length > imageStore.MAX_IMAGE_SIZE) return;

  // 获取图片尺寸
  const size = img.getSize();

  // 计算哈希
  const hash = imageStore.hashBuffer(pngBuffer);
  if (hash === lastContentHash) return;
  lastContentHash = hash;

  // 检查重复
  const existing = database.findDuplicateByHash(hash);
  if (existing) {
    database.updateLastCopied(existing.id);
    notifyRenderer('clipboard:itemUpdated', existing.id);
    return;
  }

  // 新增记录（先写入临时信息获取 ID）
  const id = database.addImageItem('temp.png', hash, size.width, size.height);

  // 保存图片文件
  const { filename } = imageStore.saveImage(pngBuffer, id, hash);

  // 更新记录中的文件名和尺寸
  database.updateImageItem(id, filename, size.width, size.height);

  const item = database.getItemById(id);
  if (item) {
    notifyRenderer('clipboard:newItem', item);
  }

  enforceLimits();
}

/**
 * 通知渲染进程
 */
function notifyRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send(channel, data);
    } catch (err) {
      // 窗口可能正在关闭
    }
  }
}

/**
 * 执行条数限制和过期清理
 */
function enforceLimits() {
  try {
    const maxItems = parseInt(database.getSetting('max_items'), 10) || 1000;
    const retentionDays = parseInt(database.getSetting('retention_days'), 10) || 30;

    // 清理过期条目
    const expired = database.cleanupExpired(retentionDays);
    for (const item of expired) {
      if (item.type === 'image' && item.image_path) {
        imageStore.deleteImage(item.image_path);
      }
    }

    // 限制最大条目数
    const removed = database.enforceMaxItems(maxItems);
    for (const item of removed) {
      if (item.type === 'image' && item.image_path) {
        imageStore.deleteImage(item.image_path);
      }
    }
  } catch (err) {
    console.error('清理条目出错:', err.message);
  }
}

module.exports = {
  startMonitoring,
  stopMonitoring,
  setWindow,
  enforceLimits,
};
