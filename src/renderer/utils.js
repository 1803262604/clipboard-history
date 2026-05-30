/**
 * 工具函数 — 日期格式化、文字截断等。
 */

const Utils = {

  /**
   * 格式化时间为相对时间描述
   * @param {string} isoString - ISO 8601 时间字符串
   * @returns {string} 如 "刚刚"、"5分钟前"、"2小时前"、"昨天 14:30"
   */
  formatTime(isoString) {
    if (!isoString) return '';

    const now = new Date();
    const date = new Date(isoString);
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 10) return '刚刚';
    if (diffSec < 60) return `${diffSec}秒前`;
    if (diffMin < 60) return `${diffMin}分钟前`;
    if (diffHour < 24) return `${diffHour}小时前`;

    // 昨天
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return `昨天 ${this._formatHM(date)}`;
    }

    // 今年内
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}月${date.getDate()}日 ${this._formatHM(date)}`;
    }

    // 跨年
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  },

  /**
   * 格式化时分
   */
  _formatHM(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  /**
   * 截断文字预览
   * @param {string} text - 原文
   * @param {number} maxLen - 最大字符数（默认 200）
   * @returns {string}
   */
  truncateText(text, maxLen = 200) {
    if (!text) return '';
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  },

  /**
   * 判断文字是否为代码/命令（含路径、命令行特征）
   */
  looksLikeCode(text) {
    if (!text) return false;
    // 含文件路径、命令行参数、URL 等
    return /[\/\\]|[a-z]:\\|https?:\/\/|^[./]|^\$ |^> |^# /.test(text.substring(0, 50));
  },

  /**
   * 格式化文件大小
   */
  getTimeGroup(isoString) {
    if (!isoString) return { label: '更早', order: 4 };

    const now = new Date();
    const date = new Date(isoString);
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (date.toDateString() === now.toDateString()) {
      return { label: '今天', order: 0 };
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return { label: '昨天', order: 1 };
    }
    if (diffDays < 7) {
      return { label: '本周', order: 2 };
    }
    if (diffDays < 30) {
      return { label: '本月', order: 3 };
    }
    return { label: '更早', order: 4 };
  },

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  },
};
