/**
 * UI 组件 — 条目卡片、分区、骨架屏。
 */

const Components = {

  /**
   * 创建单条剪贴板记录卡片
   * @param {Object} item - 数据库条目
   * @param {string} highlightQuery - 搜索关键词（用于高亮）
   * @param {Object} options - 选择模式配置
   * @returns {HTMLElement}
   */
  createItemCard(item, highlightQuery, options = {}) {
    const card = document.createElement('div');
    card.className = 'item-card' + (item.is_pinned ? ' pinned' : '');
    card.dataset.id = item.id;

    if (options.selectionMode) {
      card.classList.add('selection-mode');
      card.classList.toggle('selected', Boolean(options.selected));
      card.appendChild(this._createSelectionControl(Boolean(options.selected)));
    }

    if (item.type === 'image') {
      card.appendChild(this._createThumbnail(item));
    }

    card.appendChild(this._createBody(item, highlightQuery));
    if (!options.selectionMode) {
      card.appendChild(this._createActions(item));
    }

    return card;
  },

  _createSelectionControl(selected) {
    const control = document.createElement('label');
    control.className = 'selection-control';

    const checkbox = document.createElement('input');
    checkbox.className = 'selection-checkbox';
    checkbox.type = 'checkbox';
    checkbox.checked = selected;
    checkbox.tabIndex = -1;
    control.appendChild(checkbox);
    return control;
  },

  _createThumbnail(item) {
    const thumb = document.createElement('img');
    thumb.className = 'item-thumb';
    // 透明占位图
    thumb.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    thumb.alt = '🖼';

    if (window.clipboardAPI && item.image_path) {
      window.clipboardAPI.getImageData(item.id).then((data) => {
        if (data && data.base64) {
          thumb.src = data.base64;
        }
      }).catch(() => {});
    }

    return thumb;
  },

  _createBody(item, highlightQuery) {
    const body = document.createElement('div');
    body.className = 'item-body';

    const preview = document.createElement('div');
    preview.className = 'item-preview';

    if (item.type === 'text') {
      if (Utils.looksLikeCode(item.content)) {
        preview.classList.add('mono');
      }
      // 截断并高亮
      const text = Utils.truncateText(item.content, 200);
      if (highlightQuery) {
        this._appendHighlightedText(preview, text, highlightQuery);
      } else {
        preview.textContent = text;
      }
    } else {
      const w = item.image_width || '?';
      const h = item.image_height || '?';
      preview.textContent = `截图 (${w}×${h})`;
    }

    body.appendChild(preview);

    // 元数据
    const meta = document.createElement('div');
    meta.className = 'item-meta';

    if (item.is_pinned) {
      const pin = document.createElement('span');
      pin.className = 'pin-indicator';
      pin.textContent = '📌 已置顶';
      meta.appendChild(pin);
      meta.appendChild(this._metaDot());
    }

    const time = document.createElement('span');
    time.textContent = Utils.formatTime(item.last_copied_at || item.created_at);
    meta.appendChild(time);

    if (item.type === 'text' && item.char_count) {
      meta.appendChild(this._metaDot());
      const chars = document.createElement('span');
      chars.textContent = `${item.char_count}字`;
      meta.appendChild(chars);
    }

    if (item.type === 'image' && item.image_width) {
      meta.appendChild(this._metaDot());
      const dim = document.createElement('span');
      dim.textContent = `${item.image_width}×${item.image_height}`;
      meta.appendChild(dim);
    }

    body.appendChild(meta);
    return body;
  },

  /**
   * 高亮匹配文本（不区分大小写）
   */
  _appendHighlightedText(container, text, query) {
    if (!query) {
      container.textContent = text;
      return;
    }

    // 转义正则特殊字符
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const queryLower = query.toLocaleLowerCase();
    for (const part of text.split(regex)) {
      if (part.toLocaleLowerCase() === queryLower) {
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = part;
        container.appendChild(mark);
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
  },

  _metaDot() {
    const dot = document.createElement('span');
    dot.className = 'item-meta-dot';
    return dot;
  },

  _createActions(item) {
    const actions = document.createElement('div');
    actions.className = 'item-actions';

    if (item.type === 'image') {
      const fileBtn = document.createElement('button');
      fileBtn.className = 'action-btn file-btn';
      fileBtn.title = '复制为文件，可在资源管理器中粘贴';
      fileBtn.textContent = '📄';
      fileBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await App.copyImagesAsFiles([item.id]);
      });
      actions.appendChild(fileBtn);

      const ocrBtn = document.createElement('button');
      ocrBtn.className = 'action-btn ocr-btn';
      ocrBtn.title = '识别图片文字并复制';
      ocrBtn.textContent = '文';
      ocrBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await App.recognizeImageText(item.id);
      });
      actions.appendChild(ocrBtn);
    }

    // 置顶按钮
    const pinBtn = document.createElement('button');
    pinBtn.className = 'action-btn pin-btn';
    pinBtn.title = item.is_pinned ? '取消置顶' : '置顶';
    pinBtn.textContent = '📌';
    pinBtn.style.opacity = item.is_pinned ? '1' : '0.4';
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.clipboardAPI.pinItem(item.id, !item.is_pinned).then(() => {
        App.refreshList();
      });
    });
    actions.appendChild(pinBtn);

    // 删除按钮
    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn delete-btn';
    delBtn.title = '删除';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('确定要删除这条记录吗？')) {
        window.clipboardAPI.deleteItem(item.id).then(() => {
          App.refreshList();
        });
      }
    });
    actions.appendChild(delBtn);

    return actions;
  },

  /**
   * 创建骨架屏
   */
  createSkeleton() {
    const container = document.createElement('div');
    container.style.padding = '0 16px';
    for (let i = 0; i < 5; i++) {
      const sk = document.createElement('div');
      sk.style.cssText = `
        height: 52px; margin-bottom: 4px; border-radius: 6px;
        background: linear-gradient(90deg, var(--bg-input) 25%, var(--bg-hover) 50%, var(--bg-input) 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
      `;
      container.appendChild(sk);
    }
    return container;
  },
};
