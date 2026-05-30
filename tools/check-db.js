/**
 * 数据库查看工具 - 检查剪贴板历史记录
 * 用法: node tools/check-db.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 数据库文件路径
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'clipboard-history', 'clipboard-history.db');

if (!fs.existsSync(dbPath)) {
  console.log('❌ 数据库文件不存在！');
  console.log('   路径:', dbPath);
  console.log('   请先运行 npm start 启动应用');
  process.exit(1);
}

// 使用 sql.js 读取
(async () => {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  // 统计
  const count = db.exec('SELECT COUNT(*) FROM clipboard_items');
  const total = count[0].values[0][0];
  console.log(`\n📋 数据库记录: ${total} 条\n`);

  if (total === 0) {
    console.log('   还没有记录，复制一些文字或截图试试吧！');
  } else {
    // 查看最近 10 条
    const items = db.exec(`
      SELECT id, type,
             CASE WHEN type='text' THEN substr(content, 1, 60) ELSE image_path END as preview,
             char_count, image_width, image_height,
             is_pinned, created_at
      FROM clipboard_items
      ORDER BY last_copied_at DESC
      LIMIT 10
    `);

    if (items.length > 0 && items[0].values) {
      console.log('ID | 类型 | 预览 | 详情 | 时间');
      console.log('-'.repeat(80));
      for (const row of items[0].values) {
        const [id, type, preview, chars, w, h, pinned, time] = row;
        const previewText = (preview || '').substring(0, 55);
        const detail = type === 'text' ? `${chars}字` : `${w}×${h}`;
        const pinMark = pinned ? '📌' : '  ';
        const timeStr = time ? time.substring(0, 19).replace('T', ' ') : '';
        console.log(`${String(id).padStart(3)} | ${type.padEnd(5)} | ${pinMark} ${previewText.padEnd(55)} | ${detail.padEnd(10)} | ${timeStr}`);
      }
    }
  }

  db.close();
  console.log('');
})();
