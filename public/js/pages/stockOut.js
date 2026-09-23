const StockOutPage = {
  batchItems: [],
  currentTab: 'form', // form / history

  async render() {
    // 支持导航参数：tab, filters
    const navParams = App._navParams || {};
    if (navParams.tab === 'history') {
      this.currentTab = 'history';
    }
    if (navParams.filters) {
      Object.assign(this.historyFilters, navParams.filters);
    }
    App._navParams = null;

    this.batchItems = [];
    const locId = App.currentLocation || 1;
    document.getElementById('content').innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <div class="tab-bar" style="display:flex;border-bottom:1px solid #e5e7eb">
          <div class="tab-item ${this.currentTab === 'form' ? 'active' : ''}" data-tab="form" onclick="StockOutPage.switchTab('form')" style="padding:14px 24px;cursor:pointer;border-bottom:2px solid ${this.currentTab === 'form' ? '#0d9488' : 'transparent'};color:${this.currentTab === 'form' ? '#0d9488' : '#6b7d7d'};font-weight:${this.currentTab === 'form' ? 600 : 400}">出库/损耗登记</div>
          <div class="tab-item ${this.currentTab === 'history' ? 'active' : ''}" data-tab="history" onclick="StockOutPage.switchTab('history')" style="padding:14px 24px;cursor:pointer;border-bottom:2px solid ${this.currentTab === 'history' ? '#0d9488' : 'transparent'};color:${this.currentTab === 'history' ? '#0d9488' : '#6b7d7d'};font-weight:${this.currentTab === 'history' ? 600 : 400}">历史记录</div>
        </div>
      </div>
      <div id="so-tab-content"></div>`;

    if (this.currentTab === 'form') {
      this.renderForm(locId);
    } else {
      this.renderHistory();
    }
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  // ===== 出库开单 =====
  async renderForm(locId) {
    document.getElementById('so-tab-content').innerHTML = `
      <div class="card">
        <h2>出库/损耗登记</h2>
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
          <div class="form-group" style="flex:0 0 200px;margin:0"><label>场所</label><select id="so-location" style="width:100%"></select></div>
          <div class="form-group" style="flex:1;min-width:200px;margin:0"><label>添加商品（扫码或搜索）</label>
            <div style="display:flex;gap:8px">
              <input type="text" id="so-search" placeholder="扫码或搜索商品" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;max-width:300px" onkeydown="StockOutPage.onSearchKey(event)">
              <button class="btn btn-primary btn-sm" onclick="StockOutPage.searchProduct()">搜索</button>
              <button class="btn btn-success btn-sm" onclick="Scanner.usbScan(code => StockOutPage.onBarcodeScan(code))">扫码枪</button><button class="btn btn-info btn-sm" onclick="Scanner.cameraScan(code => StockOutPage.onBarcodeScan(code))">相机</button>
            </div>
          </div>
        </div>
        <div id="so-search-results" style="margin-bottom:12px"></div>
        <div id="so-batch-section">
          <h3>出库明细</h3>
          <div class="table-wrapper">
            <table id="so-batch-table">
              <thead><tr><th>商品</th><th>规格</th><th>当前库存</th><th>数量</th><th>类型</th><th>备注</th><th>操作</th></tr></thead>
              <tbody id="so-batch-body">
                <tr><td colspan="7" style="text-align:center;color:#999;padding:16px">请添加商品到出库列表</td></tr>
              </tbody>
            </table>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px">
            <button class="btn btn-success" onclick="StockOutPage.submitBatch()">批量提交</button>
            <button class="btn" onclick="StockOutPage.clearBatch()">清空列表</button>
          </div>
        </div>
      </div>`;

    const locRes = await API.getLocations();
    if (locRes.success) {
      document.getElementById('so-location').innerHTML = locRes.data.map(l => `<option value="${l.id}" ${l.id == locId ? 'selected' : ''}>${l.name}</option>`).join('');
    }
  },

  onSearchKey(e) { if (e.key === 'Enter') this.searchProduct(); },

  async onBarcodeScan(code) {
    App.handleBarcodeScan(code, (sku) => this.addToList(sku));
  },

  async searchProduct() {
    const keyword = document.getElementById('so-search').value.trim();
    if (!keyword) return;
    const barcodeRes = await API.getSkuByBarcode(keyword);
    if (barcodeRes.success) { this.addToList(barcodeRes.data); return; }
    const res = await API.getProducts();
    if (res.success) {
      const matched = res.data.filter(p => SearchSuggest.fuzzyMatch(p.name, keyword) || SearchSuggest.fuzzyMatch(p.brand_name, keyword));
      const results = document.getElementById('so-search-results');
      if (matched.length === 0) { results.innerHTML = '<p>未找到匹配商品</p>'; return; }
      results.innerHTML = matched.flatMap(p => p.skus.map(s => {
        const skuData = {id: s.id, product_name: p.name, volume: s.volume, sku_code: s.sku_code};
        return `<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #eee;cursor:pointer" onclick='StockOutPage.addToList(${JSON.stringify(skuData).replace(/'/g,"&#39;")})'><span>${p.name} - ${s.volume}</span><span>${s.sku_code}</span></div>`;
      }).join('')).join('');
    }
  },

  async addToList(sku) {
    const locId = document.getElementById('so-location').value;
    const balRes = await API.getBalances({ location_id: locId });
    let stock = 0;
    if (balRes.success) {
      const found = balRes.data.find(b => b.sku_code === sku.sku_code);
      if (found) stock = found.quantity;
    }
    const existing = this.batchItems.find(b => b.sku_id === sku.id);
    if (existing) {
      App.toast('该商品已在列表中');
      return;
    }
    this.batchItems.push({
      sku_id: sku.id,
      product_name: sku.product_name,
      volume: sku.volume,
      sku_code: sku.sku_code,
      stock: stock,
      quantity: 1,
      type: 'out',
      remark: ''
    });
    document.getElementById('so-search-results').innerHTML = '';
    document.getElementById('so-search').value = '';
    this.renderBatchTable();
  },

  renderBatchTable() {
    const tbody = document.getElementById('so-batch-body');
    if (this.batchItems.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#999;padding:16px">请添加商品到出库列表</td></tr>';
      return;
    }
    tbody.innerHTML = this.batchItems.map((item, idx) => `
      <tr${item.errorMsg ? ' style="background:#fff3cd"' : ''}>
        <td>${esc(item.product_name)}</td>
        <td>${esc(item.volume)}</td>
        <td>${item.stock}</td>
        <td><input type="number" value="${item.quantity}" min="1" style="width:60px;padding:4px" onchange="StockOutPage.updateItem(${idx}, 'quantity', this.value)"></td>
        <td><select style="padding:4px" onchange="StockOutPage.updateItem(${idx}, 'type', this.value)"><option value="out" ${item.type === 'out' ? 'selected' : ''}>出库</option><option value="loss" ${item.type === 'loss' ? 'selected' : ''}>损耗</option></select></td>
        <td><input type="text" value="${esc(item.remark)}" style="width:100px;padding:4px" onchange="StockOutPage.updateItem(${idx}, 'remark', this.value)"></td>
        <td><button class="btn btn-danger btn-sm" onclick="StockOutPage.removeItem(${idx})">删除</button></td>
      </tr>${item.errorMsg ? `<tr style="background:#fff3cd"><td colspan="7" style="color:#e74c3c;font-size:13px;padding:4px 8px">错误: ${esc(item.errorMsg)}</td></tr>` : ''}`).join('');
  },

  updateItem(idx, field, value) {
    if (field === 'quantity') value = parseInt(value) || 0;
    this.batchItems[idx][field] = value;
  },

  removeItem(idx) {
    this.batchItems.splice(idx, 1);
    this.renderBatchTable();
  },

  clearBatch() {
    this.batchItems = [];
    this.renderBatchTable();
  },

  async submitBatch() {
    if (this.batchItems.length === 0) return App.toast('请先添加商品', 'error');
    const locId = parseInt(document.getElementById('so-location').value);
    for (const item of this.batchItems) {
      if (!item.quantity || item.quantity <= 0) return App.toast(`${item.product_name} 数量无效`, 'error');
    }
    const data = {
      location_id: locId,
      operator: App.currentUser.name,
      items: this.batchItems.map(b => ({ sku_id: b.sku_id, quantity: b.quantity, type: b.type, remark: b.remark }))
    };
    const res = await API.stockOutBatch(data);
    if (res.success) {
      App.toast(res.message);
      if (res.data.errors && res.data.errors.length > 0) {
        const failedSkuIds = new Set(res.data.errors.map(e => e.sku_id));
        this.batchItems = this.batchItems.filter(b => failedSkuIds.has(b.sku_id));
        for (const item of this.batchItems) {
          const err = res.data.errors.find(e => e.sku_id === item.sku_id);
          if (err) item.errorMsg = err.message;
        }
        this.renderBatchTable();
        App.toast(`失败 ${res.data.errors.length} 条: ${res.data.errors.map(e => e.message).join('; ')}`, 'error');
      } else {
        this.batchItems = [];
        this.render();
      }
    } else {
      App.toast(res.message, 'error');
    }
  },

  // ===== 历史记录 =====
  historyFilters: {
    start_date: '',
    end_date: '',
    type: '',
    operator: '',
    product: '',
    brand: ''
  },
  historyOperators: [],
  _searchTimer: null,

  async renderHistory() {
    const now = new Date();
    const endDate = now.toISOString().substring(0, 10);
    const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    if (!this.historyFilters.start_date) this.historyFilters.start_date = startDate;
    if (!this.historyFilters.end_date) this.historyFilters.end_date = endDate;

    // 加载操作人列表
    if (this.historyOperators.length === 0) {
      try {
        const opRes = await API.getOperators();
        if (opRes.success) {
          this.historyOperators = opRes.data || [];
        }
      } catch (e) { console.warn('加载操作人列表失败', e); }
    }

    const operatorOptions = ['<option value="">全部操作人</option>']
      .concat(this.historyOperators.map(op =>
        `<option value="${esc(op)}" ${this.historyFilters.operator === op ? 'selected' : ''}>${esc(op)}</option>`
      )).join('');

    document.getElementById('so-tab-content').innerHTML = `
      <div class="card" style="background:#f8f9fa;padding:12px 16px">
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>开始日期</label><input type="date" id="soh-start" value="${this.historyFilters.start_date}" style="width:100%" onchange="StockOutPage.onHistoryFilterChange()"></div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>结束日期</label><input type="date" id="soh-end" value="${this.historyFilters.end_date}" style="width:100%" onchange="StockOutPage.onHistoryFilterChange()"></div>
          <div class="form-group" style="flex:0 0 150px;margin-bottom:0"><label>类型</label>
            <select id="soh-type" style="width:100%" onchange="StockOutPage.onHistoryFilterChange()">
              <option value="">全部</option>
              <option value="out" ${this.historyFilters.type === 'out' ? 'selected' : ''}>出库</option>
              <option value="loss" ${this.historyFilters.type === 'loss' ? 'selected' : ''}>损耗</option>
            </select>
          </div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>操作人</label>
            <select id="soh-operator" style="width:100%" onchange="StockOutPage.onOperatorChange()">${operatorOptions}</select>
          </div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>商品名称</label><input type="text" id="soh-product" placeholder="搜索商品" value="${esc(this.historyFilters.product)}" style="width:100%" oninput="StockOutPage.onDebounceSearch('product', this.value)"></div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>品牌</label><input type="text" id="soh-brand" placeholder="搜索品牌" value="${esc(this.historyFilters.brand)}" style="width:100%" oninput="StockOutPage.onDebounceSearch('brand', this.value)"></div>
        </div>
      </div>
      <div class="card">
        <div id="soh-list">
          <div style="text-align:center;padding:40px;color:#999">加载中...</div>
        </div>
      </div>`;

    this.loadHistory();
  },

  onHistoryFilterChange() {
    this.historyFilters.start_date = document.getElementById('soh-start').value;
    this.historyFilters.end_date = document.getElementById('soh-end').value;
    this.historyFilters.type = document.getElementById('soh-type').value;
    this.loadHistory();
  },

  onOperatorChange() {
    this.historyFilters.operator = document.getElementById('soh-operator').value;
    this.loadHistory();
  },

  onDebounceSearch(field, value) {
    this.historyFilters[field] = value.trim();
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.loadHistory(), 400);
  },

  async loadHistory() {
    const listEl = document.getElementById('soh-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#999">加载中...</div>';

    try {
      const params = { ...this.historyFilters };
      if (App.currentLocation) params.location_id = App.currentLocation;
      const res = await API.getStockOutList(params);
      
      if (!res.success || !res.data || res.data.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无出库/损耗记录</div>';
        return;
      }

      const typeMap = { out: '出库', loss: '损耗' };
      const typeClassMap = { out: 'badge-warning', loss: 'badge-danger' };

      listEl.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>日期</th>
                <th>场所</th>
                <th>商品</th>
                <th>规格</th>
                <th>类型</th>
                <th>数量</th>
                <th>操作人</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              ${res.data.map(item => `
                <tr>
                  <td>${Formatter.dateTime(item.created_at)}</td>
                  <td>${esc(item.location_name)}</td>
                  <td>${esc(item.brand_name)} ${esc(item.product_name)}</td>
                  <td>${esc(item.volume || '-')}</td>
                  <td><span class="badge ${typeClassMap[item.movement_type] || ''}">${typeMap[item.movement_type] || item.movement_type}</span></td>
                  <td style="color:#e74c3c;font-weight:500">${Math.abs(item.quantity)}</td>
                  <td>${esc(item.operator || '-')}</td>
                  <td>${esc(item.remark || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (e) {
      listEl.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c">加载失败：${esc(e.message || '未知错误')}</div>`;
    }
  }
};
