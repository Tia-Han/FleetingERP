const SearchSuggest = {
  _activeDropdown: null,
  _activeInputId: null,

  attach(config) {
    const { inputId, resultsId, searchFn, renderItem, onSelect, minLength = 1, debounceMs = 350 } = config;
    const input = document.getElementById(inputId);
    if (!input) return;
    const results = resultsId ? document.getElementById(resultsId) : null;

    input.addEventListener('input', () => {
      this._hideDropdown();
      this._activeInputId = inputId;
      clearTimeout(input._ssTimer);
      const keyword = input.value.trim();
      if (keyword.length < minLength) {
        if (results) results.innerHTML = '';
        return;
      }
      input._ssTimer = setTimeout(() => this._doSearch(input, results, keyword, searchFn, renderItem, onSelect), debounceMs);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(input._ssTimer);
        const keyword = input.value.trim();
        if (keyword.length >= minLength) {
          this._doSearch(input, results, keyword, searchFn, renderItem, onSelect, true);
        }
      }
    });
  },

  async _doSearch(input, results, keyword, searchFn, renderItem, onSelect, isEnter) {
    const items = await searchFn(keyword);
    if (items.length === 0) {
      if (results) results.innerHTML = '<p style="color:#999;padding:8px">未找到匹配项</p>';
      this._hideDropdown();
      return;
    }
    if (isEnter && items.length === 1) {
      onSelect(items[0]);
      input.value = '';
      if (results) results.innerHTML = '';
      this._hideDropdown();
      return;
    }
    if (results) results.innerHTML = '';
    this._showDropdown(input, items, renderItem, onSelect);
  },

  _showDropdown(input, items, renderItem, onSelect) {
    this._hideDropdown();
    const rect = input.getBoundingClientRect();
    const dropdown = document.createElement('div');
    dropdown.style.cssText = `position:fixed;top:${rect.bottom}px;left:${rect.left}px;width:${rect.width}px;max-height:280px;overflow-y:auto;background:#fff;border:1px solid #ddd;border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999`;
    dropdown.innerHTML = items.map((item, idx) => {
      const html = renderItem(item, idx);
      return `<div class="ss-dropdown-item" data-idx="${idx}" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0">${html}</div>`;
    }).join('');
    document.body.appendChild(dropdown);
    this._activeDropdown = dropdown;
    this._activeInput = input;

    const reposition = () => {
      if (!this._activeDropdown || !this._activeInput) return;
      const r = this._activeInput.getBoundingClientRect();
      this._activeDropdown.style.top = r.bottom + 'px';
      this._activeDropdown.style.left = r.left + 'px';
      this._activeDropdown.style.width = r.width + 'px';
    };
    this._scrollHandler = reposition;
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    dropdown.querySelectorAll('.ss-dropdown-item').forEach(el => {
      const idx = parseInt(el.dataset.idx);
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onSelect(items[idx]);
        input.value = '';
        this._hideDropdown();
      });
      el.addEventListener('mouseenter', () => { el.style.background = '#f0f7ff'; });
      el.addEventListener('mouseleave', () => { el.style.background = ''; });
    });

    const closeHandler = (e) => {
      if (!dropdown.contains(e.target) && e.target !== input) {
        this._hideDropdown();
        document.removeEventListener('mousedown', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('mousedown', closeHandler), 0);
  },

  _hideDropdown() {
    if (this._activeDropdown) {
      this._activeDropdown.remove();
      this._activeDropdown = null;
    }
    if (this._scrollHandler) {
      window.removeEventListener('scroll', this._scrollHandler, true);
      window.removeEventListener('resize', this._scrollHandler);
      this._scrollHandler = null;
    }
    this._activeInput = null;
  },

  fuzzyMatch(text, keyword) {
    if (!text) return false;
    text = String(text).toLowerCase();
    keyword = keyword.toLowerCase();
    if (text.includes(keyword)) return true;
    let ki = 0;
    for (let i = 0; i < text.length && ki < keyword.length; i++) {
      if (text[i] === keyword[ki]) ki++;
    }
    return ki === keyword.length;
  }
};
