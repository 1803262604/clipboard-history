/**
 * 开机自启模块 — 配置应用是否随 Windows 启动。
 * 使用 Electron 内置的 app.setLoginItemSettings() API。
 */

const { app } = require('electron');

/**
 * 设置开机自启
 * @param {boolean} enabled - 是否启用
 */
function setAutoStart(enabled) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      // 启动时不显示窗口，仅托盘运行
      args: ['--hidden'],
    });
    console.log(`开机自启: ${enabled ? '已启用' : '已禁用'}`);
  } catch (err) {
    console.error('设置开机自启失败:', err.message);
  }
}

/**
 * 获取当前开机自启状态
 * @returns {boolean}
 */
function getAutoStartStatus() {
  try {
    const settings = app.getLoginItemSettings();
    return settings.openAtLogin;
  } catch (err) {
    return false;
  }
}

module.exports = {
  setAutoStart,
  getAutoStartStatus,
};
