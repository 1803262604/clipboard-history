/**
 * 全局快捷键模块 — 注册/注销全局热键。
 * 默认快捷键：Ctrl+Shift+V
 */

const { globalShortcut } = require('electron');

let currentHotkey = null;
let toggleCallback = null;

/**
 * 注册全局快捷键
 * @param {string} accelerator - 快捷键字符串（如 'Ctrl+Shift+V'）
 * @param {Function} onToggle - 唤出/隐藏窗口的回调
 * @returns {boolean} 是否注册成功
 */
function registerHotkey(accelerator, onToggle) {
  // 先注销旧的热键
  unregisterHotkey();

  toggleCallback = onToggle;
  const key = accelerator || 'Ctrl+Shift+V';

  try {
    const ok = globalShortcut.register(key, () => {
      if (toggleCallback) toggleCallback();
    });

    if (ok) {
      currentHotkey = key;
      console.log(`✅ 全局快捷键已注册: ${key}`);
    } else {
      console.error(`❌ 全局快捷键注册失败: ${key}（可能被其他应用占用）`);
    }

    return ok;
  } catch (err) {
    console.error('注册全局快捷键出错:', err.message);
    return false;
  }
}

/**
 * 注销当前全局快捷键
 */
function unregisterHotkey() {
  if (currentHotkey) {
    globalShortcut.unregister(currentHotkey);
    console.log(`全局快捷键已注销: ${currentHotkey}`);
    currentHotkey = null;
  }
}

/**
 * 注销所有全局快捷键
 */
function unregisterAll() {
  globalShortcut.unregisterAll();
  currentHotkey = null;
}

/**
 * 检查快捷键是否已被注册
 * @param {string} accelerator
 * @returns {boolean}
 */
function isRegistered(accelerator) {
  return globalShortcut.isRegistered(accelerator);
}

module.exports = {
  registerHotkey,
  unregisterHotkey,
  unregisterAll,
  isRegistered,
};
