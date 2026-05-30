/**
 * 图标生成器 — 生成应用图标和托盘图标 PNG 文件。
 * 用法: node tools/generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 输出目录
const outDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// ============================================================
//  PNG 编码器 (最小实现)
// ============================================================

function createPNG(width, height, pixels) {
  // pixels: Buffer of RGBA data (width * height * 4)

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT — 对每行添加 filter byte (0) 后压缩
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter: None
    pixels.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 查找表
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF);
}

// ============================================================
//  像素绘制工具
// ============================================================

function createPixels(w, h) {
  return Buffer.alloc(w * h * 4, 0);
}

function setPixel(pixels, w, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= w || y < 0 || y >= w) return;
  const i = (y * w + x) * 4;
  pixels[i] = r;
  pixels[i + 1] = g;
  pixels[i + 2] = b;
  pixels[i + 3] = a;
}

function fillRect(pixels, w, x, y, rw, rh, r, g, b, a = 255) {
  for (let dy = 0; dy < rh; dy++) {
    for (let dx = 0; dx < rw; dx++) {
      setPixel(pixels, w, x + dx, y + dy, r, g, b, a);
    }
  }
}

function fillCircle(pixels, w, cx, cy, radius, r, g, b, a = 255) {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(pixels, w, cx + dx, cy + dy, r, g, b, a);
      }
    }
  }
}

function fillRoundedRect(pixels, w, x, y, rw, rh, radius, r, g, b, a = 255) {
  // 主体
  fillRect(pixels, w, x + radius, y, rw - radius * 2, rh, r, g, b, a);
  fillRect(pixels, w, x, y + radius, rw, rh - radius * 2, r, g, b, a);
  // 四角
  fillCircle(pixels, w, x + radius, y + radius, radius, r, g, b, a);
  fillCircle(pixels, w, x + rw - radius - 1, y + radius, radius, r, g, b, a);
  fillCircle(pixels, w, x + radius, y + rh - radius - 1, radius, r, g, b, a);
  fillCircle(pixels, w, x + rw - radius - 1, y + rh - radius - 1, radius, r, g, b, a);
}

// ============================================================
//  大图标 256x256
// ============================================================

function generateAppIcon() {
  const S = 256;
  const pixels = createPixels(S, S);

  // 背景：深蓝圆角方形
  fillRoundedRect(pixels, S, 16, 16, S - 32, S - 32, 40, 41, 98, 174, 255);

  // 剪贴板主体 (白色)
  const cx = S / 2, cy = S / 2 + 10;
  const bw = 110, bh = 140;
  const bx = cx - bw / 2, by = cy - bh / 2;
  fillRoundedRect(pixels, S, bx, by, bw, bh, 16, 255, 255, 255, 255);

  // 剪贴板顶部夹子
  const clipW = 50, clipH = 24;
  const clipX = cx - clipW / 2, clipY = by - clipH + 6;
  fillRoundedRect(pixels, S, clipX, clipY, clipW, clipH, 8, 200, 210, 220, 255);

  // 纸面文字线条
  const lineX = bx + 28, lineW = bw - 56;
  const lineY1 = by + 36;
  fillRect(pixels, S, lineX, lineY1, lineW, 8, 180, 190, 200, 255);
  fillRect(pixels, S, lineX, lineY1 + 24, lineW - 35, 8, 180, 190, 200, 255);
  fillRect(pixels, S, lineX, lineY1 + 48, lineW - 15, 8, 180, 190, 200, 255);
  fillRect(pixels, S, lineX, lineY1 + 72, lineW - 45, 8, 180, 190, 200, 255);

  const buf = createPNG(S, S, pixels);
  fs.writeFileSync(path.join(outDir, 'icon.png'), buf);
  console.log('✅ icon.png (256x256)');
}

// ============================================================
//  小托盘图标 32x32
// ============================================================

function generateTrayIcon() {
  const S = 32;
  const pixels = createPixels(S, S);

  // 简洁白色剪贴板形状（透明背景，适合亮/暗任务栏）
  const cx = S / 2, cy = S / 2 + 2;
  const bw = 20, bh = 24;
  const bx = Math.round(cx - bw / 2), by = Math.round(cy - bh / 2);

  // 主体
  fillRoundedRect(pixels, S, bx, by, bw, bh, 4, 255, 255, 255, 255);

  // 顶部夹子
  fillRoundedRect(pixels, S, cx - 8, by - 5, 16, 7, 3, 230, 235, 240, 255);

  // 主体内两条线
  fillRect(pixels, S, bx + 5, by + 8, bw - 10, 3, 180, 190, 200, 255);
  fillRect(pixels, S, bx + 5, by + 15, bw - 14, 3, 180, 190, 200, 255);

  const buf = createPNG(S, S, pixels);
  fs.writeFileSync(path.join(outDir, 'tray-icon.png'), buf);
  console.log('✅ tray-icon.png (32x32)');
}

// ============================================================
//  执行
// ============================================================

generateAppIcon();
generateTrayIcon();
console.log('图标生成完成 → assets/');
