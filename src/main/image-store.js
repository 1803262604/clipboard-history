/**
 * 图片存储模块 — 管理剪贴板图片文件。
 * 图片存储在 {userData}/images/ 目录下。
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { app } = require('electron');

// 图片大小限制：20MB
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

/**
 * 获取图片存储目录
 */
function getImageDir() {
  const dir = path.join(app.getPath('userData'), 'images');
  ensureDir(dir);
  return dir;
}

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 计算 Buffer 的 SHA-256 哈希
 * @param {Buffer} buffer
 * @returns {string} 十六进制哈希字符串
 */
function hashBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * 保存图片到磁盘
 * @param {Buffer} imageBuffer - PNG 图片数据
 * @param {number} itemId - 数据库条目 ID
 * @param {string} hash - 图片哈希（前8位用于文件名）
 * @returns {object} { filename, hash, width, height }
 */
function saveImage(imageBuffer, itemId, hash) {
  // 检查大小
  if (imageBuffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${imageBuffer.length} bytes (max ${MAX_IMAGE_SIZE})`);
  }

  // 如果没有传入 hash，计算一个
  const imageHash = hash || hashBuffer(imageBuffer);
  const hashPrefix = imageHash.substring(0, 8);

  // 文件名格式: {id}_{hash前8位}.png
  const filename = `${itemId}_${hashPrefix}.png`;
  const filePath = path.join(getImageDir(), filename);

  fs.writeFileSync(filePath, imageBuffer);

  // 获取图片尺寸
  let width = 0;
  let height = 0;
  try {
    const dimensions = getPngDimensions(imageBuffer);
    width = dimensions.width;
    height = dimensions.height;
  } catch (err) {
    console.error('Failed to read image dimensions:', err.message);
  }

  return { filename, hash: imageHash, width, height };
}

/**
 * 读取 PNG 图片的宽高（解析 IHDR chunk）
 */
function getPngDimensions(buffer) {
  // PNG 文件前 8 字节是签名，然后是 IHDR chunk
  // IHDR 中第 0-3 字节是宽度，第 4-7 字节是高度
  if (buffer.length < 24) {
    throw new Error('Buffer too small to be a valid PNG');
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * 获取图片完整路径
 * @param {string} filename - 图片文件名
 * @returns {string} 完整路径
 */
function getImagePath(filename) {
  return path.join(getImageDir(), filename);
}

/**
 * 读取图片文件为 Buffer
 * @param {string} filename - 图片文件名
 * @returns {Buffer|null} 图片数据，或 null
 */
function loadImage(filename) {
  const filePath = path.join(getImageDir(), filename);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath);
}

/**
 * 读取图片文件为 Base64 Data URL
 * @param {string} filename - 图片文件名
 * @returns {string|null} Base64 data URL，或 null
 */
function loadImageAsBase64(filename) {
  const buffer = loadImage(filename);
  if (!buffer) return null;
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/**
 * 删除图片文件
 * @param {string} filename - 图片文件名
 */
function deleteImage(filename) {
  if (!filename) return;
  const filePath = path.join(getImageDir(), filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * 获取图片目录大小（用于状态显示）
 * @returns {number} 字节数
 */
function getImageStorageSize() {
  const dir = getImageDir();
  let totalSize = 0;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        totalSize += fs.statSync(filePath).size;
      } catch (err) {
        // 文件可能已被删除，跳过
      }
    }
  } catch (err) {
    // 目录不存在等
  }
  return totalSize;
}

module.exports = {
  saveImage,
  loadImage,
  loadImageAsBase64,
  deleteImage,
  getImagePath,
  hashBuffer,
  getImageStorageSize,
  MAX_IMAGE_SIZE,
};
