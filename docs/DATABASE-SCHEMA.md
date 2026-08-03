# 数据库表结构

## 数据库信息

- **引擎**：SQLite 3
- **库名**：better-sqlite3（Node.js 绑定）
- **文件位置**：`{app.getPath('userData')}/clipboard-history.db`
- **图片存储**：`{app.getPath('userData')}/images/`

---

## clipboard_items 表

```sql
CREATE TABLE IF NOT EXISTS clipboard_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    type            TEXT    NOT NULL CHECK(type IN ('text', 'image')),
    content         TEXT,               -- 文字内容（图片时为 NULL）
    image_path      TEXT,               -- 图片文件名（文字时为 NULL），格式："{id}_{hash前8位}.png"
    image_hash      TEXT,               -- 图片 SHA-256 哈希，用于去重
    char_count      INTEGER DEFAULT 0,  -- 文字长度（图片时为 0）
    image_width     INTEGER,            -- 图片宽度（像素）
    image_height    INTEGER,            -- 图片高度（像素）
    is_pinned       INTEGER DEFAULT 0   CHECK(is_pinned IN (0, 1)),
    created_at      TEXT    NOT NULL,   -- ISO 8601 格式，首次记录时间
    last_copied_at  TEXT                -- ISO 8601 格式，最后一次复制时间
);
```

### 字段说明

| 字段 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `id` | INTEGER | 自增主键 | `1` |
| `type` | TEXT | 内容类型 | `'text'` 或 `'image'` |
| `content` | TEXT | 文字内容（最大10万字符） | `'cd /d "d:\\...'` |
| `image_path` | TEXT | 图片文件名（不含路径） | `'42_a1b2c3d4.png'` |
| `image_hash` | TEXT | SHA-256 十六进制（64字符） | `'e3b0c442...'` |
| `char_count` | INTEGER | 字符数 | `247` |
| `image_width` | INTEGER | 图片宽度（像素） | `1920` |
| `image_height` | INTEGER | 图片高度（像素） | `1080` |
| `is_pinned` | INTEGER | 是否置顶（0/1） | `0` |
| `created_at` | TEXT | 首次记录时间（用于过期计算） | `'2026-05-30T14:30:00.000Z'` |
| `last_copied_at` | TEXT | 最后一次复制时间（用于排序） | `'2026-05-30T14:35:00.000Z'` |

### 关键设计

- `created_at` ≠ `last_copied_at`：前者用于过期清理（按照首次出现计算），后者用于列表排序（重复复制时更新）
- `image_path` 只存文件名，完整路径 = `{userData}/images/{image_path}`
- 文字内容最大存储 100,000 字符，超长截断（但保存完整长度到 `char_count`）

---

## 索引

```sql
CREATE INDEX IF NOT EXISTS idx_items_created
    ON clipboard_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_pinned
    ON clipboard_items(is_pinned);
CREATE INDEX IF NOT EXISTS idx_items_type
    ON clipboard_items(type);
CREATE INDEX IF NOT EXISTS idx_items_hash
    ON clipboard_items(image_hash);
```

---

## 全文搜索 (FTS5)

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
    content,
    content=clipboard_items,
    content_rowid=id,
    tokenize='unicode61'
);
```

### FTS 同步触发器

```sql
-- 插入时自动同步
CREATE TRIGGER IF NOT EXISTS items_ai AFTER INSERT ON clipboard_items
WHEN new.type = 'text' AND new.content IS NOT NULL
BEGIN
    INSERT INTO clipboard_fts(rowid, content) VALUES (new.id, new.content);
END;

-- 删除时自动同步
CREATE TRIGGER IF NOT EXISTS items_ad AFTER DELETE ON clipboard_items
WHEN old.type = 'text'
BEGIN
    INSERT INTO clipboard_fts(clipboard_fts, rowid, content) VALUES ('delete', old.id, old.content);
END;

-- 更新时自动同步
CREATE TRIGGER IF NOT EXISTS items_au AFTER UPDATE ON clipboard_items
WHEN new.type = 'text' AND old.content IS NOT NULL
BEGIN
    INSERT INTO clipboard_fts(clipboard_fts, rowid, content) VALUES ('delete', old.id, old.content);
    INSERT INTO clipboard_fts(rowid, content) VALUES (new.id, new.content);
END;
```

### 搜索示例

```sql
-- 基本搜索
SELECT c.*, snippet(clipboard_fts, 2, '<mark>', '</mark>', '...', 40)
FROM clipboard_fts f
JOIN clipboard_items c ON f.rowid = c.id
WHERE clipboard_fts MATCH '关键词'
ORDER BY c.is_pinned DESC, c.last_copied_at DESC
LIMIT 20;

-- 前缀搜索
WHERE clipboard_fts MATCH 'clip*'
```

---

## settings 表

```sql
CREATE TABLE IF NOT EXISTS settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);
```

### 默认设置

```sql
INSERT OR IGNORE INTO settings (key, value) VALUES ('retention_days', '30');
INSERT OR IGNORE INTO settings (key, value) VALUES ('max_items', '1000');
INSERT OR IGNORE INTO settings (key, value) VALUES ('hotkey', 'Ctrl+Shift+V');
INSERT OR IGNORE INTO settings (key, value) VALUES ('auto_start', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'system');
INSERT OR IGNORE INTO settings (key, value) VALUES ('image_layout', 'list');
```

### 设置项说明

| key | 默认值 | 说明 |
|-----|--------|------|
| `retention_days` | `30` | 保存天数（1-90） |
| `max_items` | `1000` | 最大条目数 |
| `hotkey` | `Ctrl+Shift+V` | 全局快捷键 |
| `auto_start` | `true` | 是否开机自启 |
| `theme` | `system` | 主题（light/dark/system） |
| `always_on_top` | `false` | 窗口是否置顶 |
| `image_layout` | `list` | 图片视图排布（list/grid） |
