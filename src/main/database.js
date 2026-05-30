/**
 * 数据库模块 — SQLite 操作（sql.js WASM 版本）。
 * 所有数据库操作通过此模块进行，不直接访问 SQLite。
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const initSqlJs = require('sql.js');

// 数据库实例
let db = null;
let dbPath = null;

// 数据库是否已初始化
let initialized = false;

/**
 * 获取数据库文件路径
 */
function getDbPath() {
  if (!dbPath) {
    const userDataPath = app.getPath('userData');
    dbPath = path.join(userDataPath, 'clipboard-history.db');
  }
  return dbPath;
}

/**
 * 初始化数据库：加载 WASM、建表、加载已有数据
 */
async function initDatabase() {
  if (initialized) return;

  const SQL = await initSqlJs();
  const dbFilePath = getDbPath();

  // 尝试加载已有数据库文件
  if (fs.existsSync(dbFilePath)) {
    try {
      const fileBuffer = fs.readFileSync(dbFilePath);
      db = new SQL.Database(fileBuffer);
    } catch (err) {
      console.error('Failed to load existing database, creating new one:', err.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // 启用 WAL 模式以提升并发性能
  db.run('PRAGMA journal_mode=WAL;');

  // 创建表结构
  createTables();

  // 插入默认设置
  insertDefaultSettings();

  initialized = true;
  console.log('Database initialized at:', dbFilePath);
}

/**
 * 创建所有表、索引
 */
function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS clipboard_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      type            TEXT    NOT NULL CHECK(type IN ('text', 'image')),
      content         TEXT,
      image_path      TEXT,
      content_hash    TEXT,
      char_count      INTEGER DEFAULT 0,
      image_width     INTEGER,
      image_height    INTEGER,
      is_pinned       INTEGER DEFAULT 0 CHECK(is_pinned IN (0, 1)),
      created_at      TEXT    NOT NULL,
      last_copied_at  TEXT
    );
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_items_created
      ON clipboard_items(created_at DESC);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_items_pinned
      ON clipboard_items(is_pinned);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_items_type
      ON clipboard_items(type);
  `);
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_items_hash
      ON clipboard_items(content_hash);
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key    TEXT PRIMARY KEY,
      value  TEXT NOT NULL
    );
  `);
}

/**
 * 插入默认设置（仅在不存在时）
 */
function insertDefaultSettings() {
  const defaults = {
    retention_days: '30',
    max_items: '1000',
    hotkey: 'Ctrl+Shift+V',
    auto_start: 'true',
    theme: 'system',
    always_on_top: 'false',
    translucent_mode: 'false',
    translucent_opacity: '30',
  };

  const stmt = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  for (const [key, value] of Object.entries(defaults)) {
    stmt.run([key, value]);
  }
  stmt.free();

  save();
}

// ============================================================
//  CRUD 操作
// ============================================================

/**
 * 添加文字条目
 * @param {string} content - 文字内容（截断到 MAX_TEXT_LENGTH）
 * @param {string} hash - 内容 SHA-256 哈希
 * @returns {number} 新条目的 ID
 */
function addTextItem(content, hash) {
  const MAX_TEXT_LENGTH = 100000;
  const truncated = content.length > MAX_TEXT_LENGTH
    ? content.substring(0, MAX_TEXT_LENGTH)
    : content;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO clipboard_items
      (type, content, content_hash, char_count, created_at, last_copied_at)
    VALUES ('text', ?, ?, ?, ?, ?)
  `);
  stmt.run([truncated, hash, content.length, now, now]);
  stmt.free();

  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  save();
  return id;
}

/**
 * 添加图片条目
 * @param {string} imagePath - 图片文件名
 * @param {string} hash - 图片 SHA-256 哈希
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @returns {number} 新条目的 ID
 */
function addImageItem(imagePath, hash, width, height) {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO clipboard_items
      (type, image_path, content_hash, image_width, image_height, created_at, last_copied_at)
    VALUES ('image', ?, ?, ?, ?, ?, ?)
  `);
  stmt.run([imagePath, hash, width, height, now, now]);
  stmt.free();

  const id = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  save();
  return id;
}

/**
 * 通过哈希查找重复条目
 * @param {string} hash - 内容哈希
 * @returns {object|null} 匹配的条目，或 null
 */
function findDuplicateByHash(hash) {
  if (!hash) return null;

  const stmt = db.prepare(
    'SELECT * FROM clipboard_items WHERE content_hash = ? LIMIT 1'
  );
  stmt.bind([hash]);

  let result = null;
  if (stmt.step()) {
    result = rowToObject(stmt.get());
  }
  stmt.free();
  return result;
}

/**
 * 更新条目的 last_copied_at（重复内容去重时使用）
 * @param {number} id - 条目 ID
 */
function updateLastCopied(id) {
  const stmt = db.prepare(
    'UPDATE clipboard_items SET last_copied_at = ? WHERE id = ?'
  );
  stmt.run([new Date().toISOString(), id]);
  stmt.free();
  save();
}

/**
 * 更新图片条目的文件信息和尺寸（图片保存后回填）
 * @param {number} id - 条目 ID
 * @param {string} imagePath - 图片文件名
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 */
function updateImageItem(id, imagePath, width, height) {
  const stmt = db.prepare(
    `UPDATE clipboard_items
     SET image_path = ?, image_width = ?, image_height = ?
     WHERE id = ?`
  );
  stmt.run([imagePath, width, height, id]);
  stmt.free();
  save();
}

/**
 * 分页获取条目（置顶在前，按 last_copied_at 降序）
 * @param {number} limit - 每页条数
 * @param {number} offset - 偏移
 * @returns {Array} 条目列表
 */
function getItems(limit = 20, offset = 0) {
  const stmt = db.prepare(`
    SELECT * FROM clipboard_items
    ORDER BY is_pinned DESC, last_copied_at DESC
    LIMIT ? OFFSET ?
  `);
  stmt.bind([limit, offset]);

  const items = [];
  while (stmt.step()) {
    items.push(rowToObject(stmt.get()));
  }
  stmt.free();
  return items;
}

/**
 * 搜索条目（LIKE 模式，搜索文字内容）
 * @param {string} query - 搜索关键词
 * @param {number} limit - 每页条数
 * @param {number} offset - 偏移
 * @returns {Array} 匹配的条目列表
 */
function searchItems(query, limit = 20, offset = 0) {
  const stmt = db.prepare(`
    SELECT * FROM clipboard_items
    WHERE type = 'text' AND content LIKE ?
    ORDER BY is_pinned DESC, last_copied_at DESC
    LIMIT ? OFFSET ?
  `);
  stmt.bind([`%${query}%`, limit, offset]);

  const items = [];
  while (stmt.step()) {
    items.push(rowToObject(stmt.get()));
  }
  stmt.free();
  return items;
}

/**
 * 切换条目置顶状态
 * @param {number} id - 条目 ID
 * @param {boolean} pinned - 是否置顶
 */
function pinItem(id, pinned) {
  const stmt = db.prepare(
    'UPDATE clipboard_items SET is_pinned = ? WHERE id = ?'
  );
  stmt.run([pinned ? 1 : 0, id]);
  stmt.free();
  save();
}

/**
 * 删除条目
 * @param {number} id - 条目 ID
 * @returns {object|null} 被删除的条目（含 image_path），或 null
 */
function deleteItem(id) {
  // 先获取条目信息（需要清理图片文件）
  const stmt = db.prepare('SELECT * FROM clipboard_items WHERE id = ?');
  stmt.bind([id]);
  let item = null;
  if (stmt.step()) {
    item = rowToObject(stmt.get());
  }
  stmt.free();

  if (item) {
    const delStmt = db.prepare('DELETE FROM clipboard_items WHERE id = ?');
    delStmt.run([id]);
    delStmt.free();
    save();
  }

  return item;
}

/**
 * 根据 ID 获取条目
 * @param {number} id
 * @returns {object|null}
 */
function getItemById(id) {
  const stmt = db.prepare('SELECT * FROM clipboard_items WHERE id = ?');
  stmt.bind([id]);
  let item = null;
  if (stmt.step()) {
    item = rowToObject(stmt.get());
  }
  stmt.free();
  return item;
}

/**
 * 获取条目总数
 * @returns {number}
 */
function getItemCount() {
  const result = db.exec('SELECT COUNT(*) FROM clipboard_items');
  return result[0].values[0][0];
}

/**
 * 清理过期条目（非置顶、超过保存天数）
 * @param {number} retentionDays - 保存天数
 * @returns {Array} 被删除的条目列表（含 image_path，用于清理图片文件）
 */
function cleanupExpired(retentionDays) {
  const stmt = db.prepare(`
    SELECT * FROM clipboard_items
    WHERE is_pinned = 0
      AND created_at < datetime('now', '-' || ? || ' days')
  `);
  stmt.bind([retentionDays]);

  const expired = [];
  while (stmt.step()) {
    expired.push(rowToObject(stmt.get()));
  }
  stmt.free();

  if (expired.length > 0) {
    const ids = expired.map(item => item.id);
    const placeholders = ids.map(() => '?').join(',');
    const delStmt = db.prepare(
      `DELETE FROM clipboard_items WHERE id IN (${placeholders})`
    );
    delStmt.run(ids);
    delStmt.free();
    save();
  }

  return expired;
}

/**
 * 强制限制最大条目数（删除最旧的非置顶条目）
 * @param {number} maxItems - 最大条目数
 * @returns {Array} 被删除的条目列表
 */
function enforceMaxItems(maxItems) {
  const count = getItemCount();
  if (count <= maxItems) return [];

  const excess = count - maxItems;
  const stmt = db.prepare(`
    SELECT * FROM clipboard_items
    WHERE is_pinned = 0
    ORDER BY last_copied_at ASC
    LIMIT ?
  `);
  stmt.bind([excess]);

  const toDelete = [];
  while (stmt.step()) {
    toDelete.push(rowToObject(stmt.get()));
  }
  stmt.free();

  if (toDelete.length > 0) {
    const ids = toDelete.map(item => item.id);
    const placeholders = ids.map(() => '?').join(',');
    const delStmt = db.prepare(
      `DELETE FROM clipboard_items WHERE id IN (${placeholders})`
    );
    delStmt.run(ids);
    delStmt.free();
    save();
  }

  return toDelete;
}

// ============================================================
//  设置操作
// ============================================================

function getSetting(key) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([key]);
  let value = null;
  if (stmt.step()) {
    value = stmt.get()[0];
  }
  stmt.free();
  return value;
}

function setSetting(key, value) {
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  );
  stmt.run([key, String(value)]);
  stmt.free();
  save();
}

function getAllSettings() {
  const stmt = db.prepare('SELECT key, value FROM settings');
  const settings = {};
  while (stmt.step()) {
    const row = stmt.get();
    settings[row[0]] = row[1];
  }
  stmt.free();
  return settings;
}

// ============================================================
//  工具函数
// ============================================================

/**
 * 将 sql.js 行数据转为普通对象
 */
function rowToObject(row) {
  return {
    id: row[0],
    type: row[1],
    content: row[2],
    image_path: row[3],
    content_hash: row[4],
    char_count: row[5],
    image_width: row[6],
    image_height: row[7],
    is_pinned: row[8],
    created_at: row[9],
    last_copied_at: row[10],
  };
}

/**
 * 持久化数据库到磁盘
 */
function save() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(getDbPath(), buffer);
  } catch (err) {
    console.error('Failed to save database:', err.message);
  }
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
  if (db) {
    save();
    db.close();
    db = null;
    initialized = false;
  }
}

module.exports = {
  initDatabase,
  closeDatabase,
  addTextItem,
  addImageItem,
  findDuplicateByHash,
  updateLastCopied,
  updateImageItem,
  getItems,
  searchItems,
  pinItem,
  deleteItem,
  getItemById,
  getItemCount,
  cleanupExpired,
  enforceMaxItems,
  getSetting,
  setSetting,
  getAllSettings,
  save,
};
