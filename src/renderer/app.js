/**
 * 主控制器 — 初始化、数据、搜索、设置、事件。
 */

const App = {

  // 状态
  items: [],
  total: 0,
  offset: 0,
  pageSize: 20,
  isSearching: false,
  searchQuery: '',
  isLoading: false,

  // DOM 缓存
  els: {},

  /**
   * 应用初始化
   */
  async init() {
    this._cacheElements();
    this._bindEvents();
    this._bindIPCEvents();
    await this.loadItems();
    await this.loadSettings();
    this.updateStatusBar();
  },

  _cacheElements() {
    const ids = [
      'searchInput', 'clearSearchBtn', 'settingsBtn',
      'mainContent', 'emptyState', 'noResultsState', 'listContent',
      'pinnedSection', 'pinnedList', 'pinnedCount',
      'recentSection', 'recentList',
      'loadMoreBtn', 'statusBar', 'statusText', 'toast',
      // 设置面板
      'settingsPanel', 'settingsCloseBtn',
      'retentionSlider', 'retentionValue',
      'maxItemsSelect', 'hotkeyDisplay', 'recordHotkeyBtn',
      'imagePreview', 'imagePreviewImg', 'imagePreviewClose', 'imagePreviewInfo',
      'textPreview', 'textPreviewContent', 'textPreviewCopy', 'textPreviewClose',
      'alwaysOnTopBtn', 'autoStartToggle', 'translucentToggle',
      'clearAllBtn',
      'opacitySlider', 'opacityValue', 'opacityGroup',
    ];
    for (const id of ids) {
      this.els[id] = document.getElementById(id);
    }
  },

  // ========================================
  //  事件绑定
  // ========================================

  _bindEvents() {
    // 搜索
    let searchTimer = null;
    this.els.searchInput.addEventListener('input', () => {
      const query = this.els.searchInput.value.trim();
      this.els.clearSearchBtn.style.display = query ? 'block' : 'none';

      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.searchQuery = query;
        this.offset = 0;
        if (query) {
          this.isSearching = true;
          this.performSearch(query);
        } else {
          this.isSearching = false;
          this.loadItems();
        }
      }, 300);
    });

    this.els.clearSearchBtn.addEventListener('click', () => {
      this.els.searchInput.value = '';
      this.els.clearSearchBtn.style.display = 'none';
      this.searchQuery = '';
      this.isSearching = false;
      this.offset = 0;
      this.loadItems();
    });

    this.els.loadMoreBtn.addEventListener('click', () => {
      this.loadMore();
    });

    // 设置面板
    this.els.settingsBtn.addEventListener('click', () => {
      this.showSettings();
    });

    // 图片预览关闭
    this.els.imagePreviewClose.addEventListener('click', () => this.hideImagePreview());
    this.els.imagePreview.addEventListener('click', (e) => {
      if (e.target === this.els.imagePreview) this.hideImagePreview();
    });
    // 点击图片本身：复制
    this.els.imagePreviewImg.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (this._previewImageId) {
        const ok = await window.clipboardAPI.copyToClipboard(this._previewImageId);
        if (ok) this.showToast('✅ 图片已复制到剪贴板');
      }
    });

    // 文字全文弹窗
    this.els.textPreviewClose.addEventListener('click', () => this.hideTextPreview());
    this.els.textPreviewCopy.addEventListener('click', () => {
      const text = this.els.textPreviewContent.value;
      navigator.clipboard.writeText(text).then(() => {
        this.showToast('✅ 已复制到剪贴板');
      });
    });

    // 清空全部历史
    this.els.clearAllBtn.addEventListener('click', () => {
      this.clearAllHistory();
    });

    // 窗口置顶按钮
    this.els.alwaysOnTopBtn.addEventListener('click', () => {
      this.toggleAlwaysOnTop();
    });
    this.els.settingsCloseBtn.addEventListener('click', () => {
      this.hideSettings();
    });

    // 设置项变更
    this.els.retentionSlider.addEventListener('input', () => {
      const val = this.els.retentionSlider.value;
      this.els.retentionValue.textContent = `${val} 天`;
    });
    this.els.retentionSlider.addEventListener('change', () => {
      window.clipboardAPI.setSetting('retention_days', this.els.retentionSlider.value);
    });
    this.els.maxItemsSelect.addEventListener('change', () => {
      window.clipboardAPI.setSetting('max_items', this.els.maxItemsSelect.value);
    });
    this.els.autoStartToggle.addEventListener('change', () => {
      window.clipboardAPI.setSetting('auto_start', this.els.autoStartToggle.checked ? 'true' : 'false');
    });
    this.els.translucentToggle.addEventListener('change', () => {
      const on = this.els.translucentToggle.checked;
      window.clipboardAPI.setSetting('translucent_mode', on ? 'true' : 'false');
      this.els.opacityGroup.style.display = on ? '' : 'none';
      window.clipboardAPI.setOpacity(on ? this.els.opacitySlider.value / 100 : 1);
    });
    this.els.opacitySlider.addEventListener('input', () => {
      const val = this.els.opacitySlider.value;
      this.els.opacityValue.textContent = `${val}%`;
      if (this.els.translucentToggle.checked) {
        window.clipboardAPI.setOpacity(val / 100);
      }
    });
    this.els.opacitySlider.addEventListener('change', () => {
      window.clipboardAPI.setSetting('translucent_opacity', this.els.opacitySlider.value);
    });

    // 录制热键
    this.els.recordHotkeyBtn.addEventListener('click', () => {
      this._startHotkeyRecording();
    });

    // 键盘
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!this.els.imagePreview.classList.contains('hidden')) {
          this.hideImagePreview();
        } else if (!this.els.textPreview.classList.contains('hidden')) {
          this.hideTextPreview();
        } else if (!this.els.settingsPanel.classList.contains('hidden')) {
          this.hideSettings();
        } else {
          window.clipboardAPI.hideWindow();
        }
      }
      if (e.key === 'f' && e.ctrlKey) {
        e.preventDefault();
        this.els.searchInput.focus();
      }
    });
  },

  _bindIPCEvents() {
    if (!window.clipboardAPI) return;
    window.clipboardAPI.onNewItem((item) => {
      if (!this.isSearching) {
        this.items.unshift(item);
        this.total++;
        this.renderList();
        this.updateStatusBar();
      }
    });
    window.clipboardAPI.onItemUpdated(() => {
      if (!this.isSearching) {
        this.offset = 0;
        this.loadItems();
      }
    });
  },

  // ========================================
  //  数据
  // ========================================

  async loadItems() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.offset = 0;
    try {
      const result = await window.clipboardAPI.getItems(this.pageSize, 0);
      this.items = result.items || [];
      this.total = result.total || 0;
      this.renderList();
    } catch (err) {
      console.error(err);
      this.showEmptyState();
    }
    this.isLoading = false;
  },

  async loadMore() {
    if (this.isLoading) return;
    this.isLoading = true;
    this.offset += this.pageSize;
    try {
      let result;
      if (this.isSearching) {
        result = { items: await window.clipboardAPI.searchItems(this.searchQuery, this.pageSize, this.offset), total: this.total };
      } else {
        result = await window.clipboardAPI.getItems(this.pageSize, this.offset);
      }
      this.items = this.items.concat(result.items || []);
      this.total = result.total || this.total;
      this.renderList();
    } catch (err) {
      console.error(err);
    }
    this.isLoading = false;
  },

  async performSearch(query) {
    if (this.isLoading) return;
    this.isLoading = true;
    try {
      this.items = await window.clipboardAPI.searchItems(query, this.pageSize, 0) || [];
      this.renderList();
    } catch (err) {
      console.error(err);
    }
    this.isLoading = false;
  },

  async refreshList() {
    this.offset = 0;
    if (this.isSearching) {
      await this.performSearch(this.searchQuery);
    } else {
      await this.loadItems();
    }
  },

  // ========================================
  //  渲染
  // ========================================

  renderList() {
    this.els.pinnedList.innerHTML = '';
    this.els.recentList.innerHTML = '';

    if (this.items.length === 0) {
      if (this.isSearching) {
        this.els.emptyState.classList.add('hidden');
        this.els.noResultsState.classList.remove('hidden');
        this.els.listContent.classList.add('hidden');
        document.getElementById('noResultsMsg').textContent = `未找到 "${this.searchQuery}" 的相关结果`;
      } else {
        this.showEmptyState();
      }
      return;
    }

    this.els.emptyState.classList.add('hidden');
    this.els.noResultsState.classList.add('hidden');
    this.els.listContent.classList.remove('hidden');

    const pinned = this.items.filter(i => i.is_pinned);
    const recent = this.items.filter(i => !i.is_pinned);

    // 置顶区
    if (pinned.length > 0) {
      this.els.pinnedSection.classList.remove('hidden');
      this.els.pinnedCount.textContent = pinned.length;
      for (const item of pinned) {
        this.els.pinnedList.appendChild(Components.createItemCard(item, this.searchQuery));
      }
    } else {
      this.els.pinnedSection.classList.add('hidden');
    }

    // 时间分组
    if (recent.length > 0) {
      this.els.recentSection.classList.remove('hidden');
      // 搜索时不分组，全部显示
      if (this.isSearching) {
        for (const item of recent) {
          this.els.recentList.appendChild(Components.createItemCard(item, this.searchQuery));
        }
      } else {
        this._renderTimeGroups(recent);
      }
    } else {
      this.els.recentSection.classList.add('hidden');
    }

    const shown = pinned.length + recent.length;
    if (this.total > shown && !this.isSearching) {
      this.els.loadMoreBtn.classList.remove('hidden');
      this.els.loadMoreBtn.textContent = `加载更多 (剩余 ${this.total - shown} 条)`;
    } else {
      this.els.loadMoreBtn.classList.add('hidden');
    }

    this._bindCardClicks();
    this.updateStatusBar();
  },

  _renderTimeGroups(items) {
    // 分组
    const groups = {};
    for (const item of items) {
      const grp = Utils.getTimeGroup(item.last_copied_at || item.created_at);
      if (!groups[grp.order]) {
        groups[grp.order] = { label: grp.label, order: grp.order, items: [] };
      }
      groups[grp.order].items.push(item);
    }

    // 按时间排序：今天=0, 昨天=1, 本周=2, 本月=3, 更早=4
    const sorted = Object.values(groups).sort((a, b) => a.order - b.order);

    for (const group of sorted) {
      const wrapper = document.createElement('div');
      wrapper.className = 'time-group';

      const header = document.createElement('div');
      header.className = 'section-header';
      header.innerHTML = `<span><span class="collapse-arrow">▼</span>${group.label}</span><span class="section-count">${group.items.length}</span>`;
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        const list = header.nextElementSibling;
        if (list) list.classList.toggle('hidden');
      });
      wrapper.appendChild(header);

      const list = document.createElement('div');
      list.className = 'item-list';
      for (const item of group.items) {
        list.appendChild(Components.createItemCard(item, this.searchQuery));
      }
      wrapper.appendChild(list);
      this.els.recentList.appendChild(wrapper);
    }
  },

  _bindCardClicks() {
    document.querySelectorAll('.item-card').forEach(card => {
      const id = parseInt(card.dataset.id);
      if (isNaN(id)) return;

      // 左键：复制
      card.addEventListener('click', async () => {
        const item = this.items.find(i => i.id === id);
        const ok = await window.clipboardAPI.copyToClipboard(id);
        if (ok) {
          this.showToast(item && item.type === 'image'
            ? '✅ 图片已复制到剪贴板'
            : '✅ 已复制到剪贴板');
        }
      });

      // 右键：预览
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const item = this.items.find(i => i.id === id);
        if (item && item.type === 'image') {
          this.showImagePreview(id);
        } else if (item) {
          this.showTextPreview(item);
        }
      });
    });
  },

  async showImagePreview(id) {
    const data = await window.clipboardAPI.getImageData(id);
    if (!data || !data.base64) return;
    this.els.imagePreviewImg.src = data.base64;
    this.els.imagePreviewInfo.textContent = `${data.width}×${data.height}  ·  点击任意处关闭`;
    this.els.imagePreview.classList.remove('hidden');
    this._previewImageId = id;
  },

  hideImagePreview() {
    this.els.imagePreview.classList.add('hidden');
    this.els.imagePreviewImg.src = '';
    this._previewImageId = null;
  },

  showTextPreview(item) {
    this.els.textPreviewContent.value = item.content || '';
    this.els.textPreview.classList.remove('hidden');
  },

  hideTextPreview() {
    this.els.textPreview.classList.add('hidden');
  },

  async clearAllHistory() {
    const confirmed = confirm(
      '⚠️ 确定要清空全部历史记录吗？\n\n' +
      '此操作将删除所有非置顶的文字和图片记录，\n' +
      '已置顶的内容不会被删除。\n\n' +
      '操作不可撤销，确认继续？'
    );
    if (!confirmed) return;

    const result = await window.clipboardAPI.clearAllHistory();
    if (result.deleted > 0) {
      this.showToast(`已清空 ${result.deleted} 条记录`);
    }
    this.refreshList();
  },

  showEmptyState() {
    this.els.emptyState.classList.remove('hidden');
    this.els.noResultsState.classList.add('hidden');
    this.els.listContent.classList.add('hidden');
    this.els.pinnedSection.classList.add('hidden');
    this.els.recentSection.classList.add('hidden');
    this.els.loadMoreBtn.classList.add('hidden');
  },

  async updateStatusBar() {
    if (!this.els.statusText) return;
    try {
      const info = await window.clipboardAPI.getStorageInfo();
      this.els.statusText.textContent =
        `${info.count} 条记录 · 图片 ${Utils.formatSize(info.imageSize)}`;
    } catch (err) {
      this.els.statusText.textContent = `${this.total} 条记录`;
    }
  },

  async toggleAlwaysOnTop() {
    const btn = this.els.alwaysOnTopBtn;
    const isOn = btn.classList.contains('active');
    if (isOn) {
      btn.classList.remove('active');
      btn.style.opacity = '0.5';
      await window.clipboardAPI.setAlwaysOnTop(false);
    } else {
      btn.classList.add('active');
      btn.style.opacity = '1';
      await window.clipboardAPI.setAlwaysOnTop(true);
    }
  },

  showToast(message) {
    const toast = this.els.toast;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
  },

  // ========================================
  //  设置面板
  // ========================================

  async loadSettings() {
    try {
      const settings = await window.clipboardAPI.getAllSettings();
      this.els.retentionSlider.value = settings.retention_days || '30';
      this.els.retentionValue.textContent = `${settings.retention_days || 30} 天`;
      this.els.maxItemsSelect.value = settings.max_items || '1000';
      this.els.hotkeyDisplay.textContent = settings.hotkey || 'Ctrl+Shift+V';
      this.els.autoStartToggle.checked = settings.auto_start !== 'false';
      if (settings.always_on_top === 'true') {
        this.els.alwaysOnTopBtn.classList.add('active');
        this.els.alwaysOnTopBtn.style.opacity = '1';
      } else {
        this.els.alwaysOnTopBtn.style.opacity = '0.5';
      }
      this.els.translucentToggle.checked = settings.translucent_mode === 'true';

      // 透明度
      const opacity = parseInt(settings.translucent_opacity) || 85;
      this.els.opacitySlider.value = opacity;
      this.els.opacityValue.textContent = `${opacity}%`;
      this.els.opacityGroup.style.display = settings.translucent_mode === 'true' ? '' : 'none';

      // 启动时已由 main.js 通过 setOpacity 处理，此处仅同步 UI
    } catch (err) {
      console.error('加载设置失败:', err);
    }
  },

  showSettings() {
    this.loadSettings();
    this.els.settingsPanel.classList.remove('hidden');
  },

  hideSettings() {
    this.els.settingsPanel.classList.add('hidden');
  },

  // ========================================
  //  热键录制
  // ========================================

  _startHotkeyRecording() {
    const btn = this.els.recordHotkeyBtn;
    const display = this.els.hotkeyDisplay;

    btn.textContent = '按下组合键...';
    btn.classList.add('recording');

    const onKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Meta');

      // 必须有修饰键 + 一个普通键
      const key = e.key;
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        if (key.length === 1) {
          parts.push(key.toUpperCase());
        } else if (key === ' ') {
          parts.push('Space');
        } else {
          parts.push(key);
        }

        if (parts.length >= 2) {
          const hotkey = parts.join('+');
          display.textContent = hotkey;
          window.clipboardAPI.setSetting('hotkey', hotkey);

          btn.textContent = '修改';
          btn.classList.remove('recording');
          document.removeEventListener('keydown', onKeyDown, true);
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    // 3 秒超时
    setTimeout(() => {
      document.removeEventListener('keydown', onKeyDown, true);
      btn.textContent = '修改';
      btn.classList.remove('recording');
    }, 3000);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
