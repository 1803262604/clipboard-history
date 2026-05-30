/**
 * Preload 脚本 — 通过 contextBridge 向渲染进程暴露安全 API。
 * 渲染进程只能调用这些白名单方法，无法直接访问 Node.js / Electron API。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardAPI', {

  // ========================================
  //  历史记录
  // ========================================

  /** 分页获取历史记录 */
  getItems: (limit, offset) =>
    ipcRenderer.invoke('clipboard:getItems', limit, offset),

  /** 搜索历史记录 */
  searchItems: (query, limit, offset) =>
    ipcRenderer.invoke('clipboard:search', query, limit, offset),

  // ========================================
  //  条目操作
  // ========================================

  /** 切换置顶 */
  pinItem: (id, pinned) =>
    ipcRenderer.invoke('clipboard:pin', id, pinned),

  /** 删除条目 */
  deleteItem: (id) =>
    ipcRenderer.invoke('clipboard:delete', id),

  /** 将条目录入系统剪贴板 */
  copyToClipboard: (id) =>
    ipcRenderer.invoke('clipboard:copy', id),

  /** 获取图片 Base64 数据（用于显示缩略图） */
  getImageData: (id) =>
    ipcRenderer.invoke('clipboard:getImage', id),

  /** 获取存储信息 */
  getStorageInfo: () =>
    ipcRenderer.invoke('clipboard:getStorageInfo'),

  /** 清空全部历史（保留置顶） */
  clearAllHistory: () =>
    ipcRenderer.invoke('clipboard:clearAll'),

  // ========================================
  //  设置
  // ========================================

  getSetting: (key) =>
    ipcRenderer.invoke('settings:get', key),

  setSetting: (key, value) =>
    ipcRenderer.invoke('settings:set', key, value),

  getAllSettings: () =>
    ipcRenderer.invoke('settings:getAll'),

  // ========================================
  //  窗口控制
  // ========================================

  /** 隐藏窗口到托盘 */
  hideWindow: () =>
    ipcRenderer.invoke('window:hide'),

  /** 设置窗口透明度 (0-1) */
  setOpacity: (value) =>
    ipcRenderer.invoke('window:setOpacity', value),

  /** 切换窗口置顶 */
  setAlwaysOnTop: (on) =>
    ipcRenderer.invoke('window:setAlwaysOnTop', on),

  // ========================================
  //  主进程 → 渲染进程 事件监听
  // ========================================

  /** 新条目通知 */
  onNewItem: (callback) => {
    ipcRenderer.on('clipboard:newItem', (_event, item) => callback(item));
  },

  /** 条目更新通知（去重时移到顶部） */
  onItemUpdated: (callback) => {
    ipcRenderer.on('clipboard:itemUpdated', (_event, id) => callback(id));
  },

  /** 条目删除通知 */
  onItemDeleted: (callback) => {
    ipcRenderer.on('clipboard:itemDeleted', (_event, id) => callback(id));
  },

  /** 移除事件监听（组件卸载时使用） */
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});
