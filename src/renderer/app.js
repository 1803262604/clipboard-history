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
  typeFilter: 'all',
  imageLayout: 'list',
  isBatchMode: false,
  selectedImageIds: new Set(),
  recognizingImageId: null,

  // DOM 缓存
  els: {},

  /**
   * 应用初始化
   */
  async init() {
    this._cacheElements();
    this._bindEvents();
    this._bindIPCEvents();
    await this.loadSettings();
    await this.loadItems();
    this.updateStatusBar();
  },

  _cacheElements() {
    const ids = [
      'searchInput', 'clearSearchBtn', 'settingsBtn',
      'imageLayoutControl', 'imageLayoutSelect', 'imageManageBtn',
      'batchToolbar', 'selectAllImagesBtn',
      'selectedImagesCount', 'copySelectedFilesBtn', 'deleteSelectedImagesBtn',
      'mainContent', 'emptyState', 'emptyTitle', 'emptySubtitle',
      'noResultsState', 'listContent',
      'pinnedSection', 'pinnedList', 'pinnedCount',
      'recentSection', 'recentList',
      'loadMoreBtn', 'statusBar', 'statusText', 'toast',
      // 设置面板
      'settingsPanel', 'settingsCloseBtn',
      'retentionSlider', 'retentionValue',
      'maxItemsSelect', 'hotkeyDisplay', 'recordHotkeyBtn',
      'imagePreview', 'imagePreviewImg', 'imagePreviewClose', 'imagePreviewInfo',
      'imagePreviewCopy', 'imagePreviewCopyFile', 'imagePreviewOcr',
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

    // 类型筛选
    document.querySelectorAll('.filter-btn').forEach(button => {
      button.addEventListener('click', () => {
        this.setTypeFilter(button.dataset.type);
      });
    });
    this.els.imageLayoutSelect.addEventListener('change', () => {
      this.setImageLayout(this.els.imageLayoutSelect.value);
    });

    // 截图库批量管理
    this.els.imageManageBtn.addEventListener('click', () => {
      this.toggleBatchMode();
    });
    this.els.selectAllImagesBtn.addEventListener('click', () => {
      this.toggleSelectAllImages();
    });
    this.els.copySelectedFilesBtn.addEventListener('click', () => {
      this.copySelectedImagesAsFiles();
    });
    this.els.deleteSelectedImagesBtn.addEventListener('click', () => {
      this.deleteSelectedImages();
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
    this.els.imagePreviewImg.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    this.els.imagePreviewCopy.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!this._previewImageId) return;
      const ok = await window.clipboardAPI.copyToClipboard(this._previewImageId);
      if (ok) this.showToast('图片已复制到剪贴板');
    });
    this.els.imagePreviewCopyFile.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!this._previewImageId) return;
      await this.copyImagesAsFiles([this._previewImageId]);
    });
    this.els.imagePreviewOcr.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!this._previewImageId) return;
      await this.recognizeImageText(this._previewImageId);
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
      const matchesFilter = this.typeFilter === 'all' || item.type === this.typeFilter;
      if (!this.isSearching && matchesFilter) {
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
    window.clipboardAPI.onOcrProgress(({ id, status, progress }) => {
      if (id !== this.recognizingImageId) return;

      const percent = Math.round(Math.max(0, Math.min(1, progress || 0)) * 100);
      if (status === 'recognizing text') {
        this.showToast(`正在识别文字 ${percent}%`, 0);
      } else if (status === 'loading language traineddata') {
        this.showToast(`正在加载本地识别模型 ${percent}%`, 0);
      } else {
        this.showToast('正在准备文字识别...', 0);
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
      const result = await window.clipboardAPI.getItems(
        this.pageSize,
        0,
        this.typeFilter
      );
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
      result = this.isSearching
        ? await window.clipboardAPI.searchItems(
          this.searchQuery,
          this.pageSize,
          this.offset,
          this.typeFilter
        )
        : await window.clipboardAPI.getItems(
          this.pageSize,
          this.offset,
          this.typeFilter
        );
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
      const result = await window.clipboardAPI.searchItems(
        query,
        this.pageSize,
        0,
        this.typeFilter
      );
      this.items = result.items || [];
      this.total = result.total || 0;
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

  async setTypeFilter(type) {
    if (!['all', 'text', 'image'].includes(type) || type === this.typeFilter) return;
    if (this.isLoading) return;

    this.typeFilter = type;
    document.querySelectorAll('.filter-btn').forEach(button => {
      const isActive = button.dataset.type === type;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    if (type === 'image') {
      this.els.searchInput.value = '';
      this.els.searchInput.disabled = true;
      this.els.searchInput.placeholder = '图片按时间排序';
      this.els.clearSearchBtn.style.display = 'none';
      this.searchQuery = '';
      this.isSearching = false;
    } else {
      this.els.searchInput.disabled = false;
      this.els.searchInput.placeholder = '搜索剪贴板历史...';
    }

    if (type !== 'image') {
      this.isBatchMode = false;
      this.selectedImageIds.clear();
    }
    this.updateBatchToolbar();
    await this.refreshList();
  },

  toggleBatchMode() {
    if (this.typeFilter !== 'image') return;
    this.isBatchMode = !this.isBatchMode;
    if (!this.isBatchMode) {
      this.selectedImageIds.clear();
    }
    this.renderList();
  },

  setImageLayout(layout) {
    const safeLayout = layout === 'grid' ? 'grid' : 'list';
    if (safeLayout === this.imageLayout) return;

    this.imageLayout = safeLayout;
    this.els.imageLayoutSelect.value = safeLayout;
    window.clipboardAPI.setSetting('image_layout', safeLayout);
    this.applyImageLayout();
  },

  applyImageLayout() {
    const useGrid = this.typeFilter === 'image' && this.imageLayout === 'grid';
    this.els.listContent.classList.toggle('image-grid-layout', useGrid);
  },

  toggleImageSelection(id, card) {
    if (this.selectedImageIds.has(id)) {
      this.selectedImageIds.delete(id);
    } else {
      this.selectedImageIds.add(id);
    }

    const isSelected = this.selectedImageIds.has(id);
    card.classList.toggle('selected', isSelected);
    const checkbox = card.querySelector('.selection-checkbox');
    if (checkbox) checkbox.checked = isSelected;
    this.updateBatchToolbar();
  },

  toggleSelectAllImages() {
    const imageIds = this.items
      .filter(item => item.type === 'image')
      .map(item => item.id);
    const allSelected = imageIds.length > 0 &&
      imageIds.every(id => this.selectedImageIds.has(id));

    for (const id of imageIds) {
      if (allSelected) {
        this.selectedImageIds.delete(id);
      } else {
        this.selectedImageIds.add(id);
      }
    }

    document.querySelectorAll('.item-card').forEach(card => {
      const id = Number.parseInt(card.dataset.id, 10);
      const isSelected = this.selectedImageIds.has(id);
      card.classList.toggle('selected', isSelected);
      const checkbox = card.querySelector('.selection-checkbox');
      if (checkbox) checkbox.checked = isSelected;
    });
    this.updateBatchToolbar();
  },

  updateBatchToolbar() {
    const isImageLibrary = this.typeFilter === 'image';
    this.els.imageLayoutControl.classList.toggle('hidden', !isImageLibrary);
    this.els.imageManageBtn.classList.toggle('hidden', !isImageLibrary);
    this.els.imageManageBtn.classList.toggle('active', this.isBatchMode);
    this.els.imageManageBtn.textContent = this.isBatchMode ? '完成' : '☑ 管理';
    this.els.batchToolbar.classList.toggle(
      'hidden',
      !isImageLibrary || !this.isBatchMode
    );

    const selectedCount = this.selectedImageIds.size;
    const imageIds = this.items
      .filter(item => item.type === 'image')
      .map(item => item.id);
    const allSelected = imageIds.length > 0 &&
      imageIds.every(id => this.selectedImageIds.has(id));
    this.els.selectedImagesCount.textContent = `已选 ${selectedCount} 项`;
    this.els.selectAllImagesBtn.textContent = allSelected
      ? '取消全选'
      : '全选已加载';
    this.els.copySelectedFilesBtn.disabled = selectedCount === 0;
    this.els.deleteSelectedImagesBtn.disabled = selectedCount === 0;
    this.applyImageLayout();
  },

  async copyImagesAsFiles(ids) {
    const result = await window.clipboardAPI.copyImageFiles(ids);
    if (result.copied > 0) {
      this.showToast(
        result.copied === 1
          ? '图片已复制为文件，可在资源管理器中粘贴'
          : `已复制 ${result.copied} 个图片文件`
      );
      return true;
    }

    this.showToast(result.error || '复制图片文件失败');
    return false;
  },

  async recognizeImageText(id) {
    if (this.recognizingImageId !== null) {
      this.showToast('已有图片正在识别，请稍候');
      return false;
    }

    this.recognizingImageId = id;
    this._setOcrButtonsBusy(true);
    this.showToast('正在准备文字识别...', 0);

    try {
      const result = await window.clipboardAPI.recognizeImageText(id);
      if (result.copied) {
        this.showToast(`已识别并复制 ${result.charCount} 个字符`);
        return true;
      }
      this.showToast(result.error || '文字识别失败，请重试');
      return false;
    } catch (error) {
      console.error('图片文字识别失败:', error);
      this.showToast('文字识别失败，请重试');
      return false;
    } finally {
      this.recognizingImageId = null;
      this._setOcrButtonsBusy(false);
    }
  },

  _setOcrButtonsBusy(busy) {
    document.querySelectorAll('.ocr-btn').forEach(button => {
      button.disabled = busy;
      button.classList.toggle('loading', busy);
      button.setAttribute('aria-busy', String(busy));
    });
  },

  async copySelectedImagesAsFiles() {
    const ids = [...this.selectedImageIds];
    if (ids.length === 0) return;
    await this.copyImagesAsFiles(ids);
  },

  async deleteSelectedImages() {
    const ids = [...this.selectedImageIds];
    if (ids.length === 0) return;
    if (!confirm(`确定要删除选中的 ${ids.length} 张图片吗？此操作不可撤销。`)) {
      return;
    }

    const result = await window.clipboardAPI.deleteItems(ids);
    if (result.deleted > 0) {
      this.showToast(`已删除 ${result.deleted} 张图片`);
    } else {
      this.showToast(result.error || '删除图片失败');
    }
    this.selectedImageIds.clear();
    await this.refreshList();
  },

  // ========================================
  //  渲染
  // ========================================

  renderList() {
    this.els.pinnedList.innerHTML = '';
    this.els.recentList.innerHTML = '';
    this.updateBatchToolbar();

    if (this.items.length === 0) {
      if (this.isSearching) {
        this.els.emptyState.classList.add('hidden');
        this.els.noResultsState.classList.remove('hidden');
        this.els.listContent.classList.add('hidden');
        document.getElementById('noResultsMsg').textContent =
          `未找到 "${this.searchQuery}" 的相关结果`;
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
        this.els.pinnedList.appendChild(this._createItemCard(item));
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
          this.els.recentList.appendChild(this._createItemCard(item));
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
    this.updateBatchToolbar();
    this.updateStatusBar();
  },

  _createItemCard(item) {
    return Components.createItemCard(item, this.searchQuery, {
      selectionMode: this.isBatchMode && item.type === 'image',
      selected: this.selectedImageIds.has(item.id),
    });
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
        list.appendChild(this._createItemCard(item));
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
        if (this.isBatchMode && item && item.type === 'image') {
          this.toggleImageSelection(id, card);
          return;
        }
        const ok = await window.clipboardAPI.copyToClipboard(id);
        if (ok) {
          this.showToast(item && item.type === 'image'
            ? '图片已复制到剪贴板'
            : '已复制到剪贴板');
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
    this.els.imagePreviewInfo.textContent = `${data.width}×${data.height}`;
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
    const emptyCopy = {
      all: ['暂无剪贴板历史', '开始复制文字或截图，内容将自动出现在这里'],
      text: ['暂无文字记录', '复制文字后，内容将自动出现在这里'],
      image: ['暂无截图', '截图或复制图片后，内容将自动出现在这里'],
    };
    const [title, subtitle] = emptyCopy[this.typeFilter];
    this.els.emptyTitle.textContent = title;
    this.els.emptySubtitle.textContent = subtitle;
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

  showToast(message, duration = 1500) {
    const toast = this.els.toast;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    if (duration > 0) {
      this._toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
    }
  },

  // ========================================
  //  设置面板
  // ========================================

  async loadSettings() {
    try {
      const settings = await window.clipboardAPI.getAllSettings();
      this.imageLayout = settings.image_layout === 'grid' ? 'grid' : 'list';
      this.els.imageLayoutSelect.value = this.imageLayout;
      this.applyImageLayout();
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
