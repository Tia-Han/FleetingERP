const StockInPage = {
  items: [],
  currentTab: 'form', // form / history

  async render() {
    // 支持导航参数：tab, filters
    const navParams = App._navParams || {};
    const location = String(App.currentLocation || '');
    if (this._historyContext !== location) { this.historyFilters.location_id = location; this._historyContext = location; }
    if (navParams.tab === 'history') {
      this.currentTab = 'history';
    }
    if (navParams.filters) {
      Object.assign(this.historyFilters, navParams.filters);
    }
    App._navParams = null;

    this.items = [];
    const locId = App.currentLocation || 1;
    const now = new Date();
    const nowLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().substring(0, 10);
    document.getElementById('content').innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <div class="tab-bar" style="display:flex;border-bottom:1px solid #e5e7eb">
          <div class="tab-item ${this.currentTab === 'form' ? 'active' : ''}" data-tab="form" ${Formatter.event('click', 'stockIn-1')}  style="padding:14px 24px;cursor:pointer;border-bottom:2px solid ${this.currentTab === 'form' ? '#0d9488' : 'transparent'};color:${this.currentTab === 'form' ? '#0d9488' : '#6b7d7d'};font-weight:${this.currentTab === 'form' ? 600 : 400}">记录添置</div>
          <div class="tab-item ${this.currentTab === 'history' ? 'active' : ''}" data-tab="history" ${Formatter.event('click', 'stockIn-2')}  style="padding:14px 24px;cursor:pointer;border-bottom:2px solid ${this.currentTab === 'history' ? '#0d9488' : 'transparent'};color:${this.currentTab === 'history' ? '#0d9488' : '#6b7d7d'};font-weight:${this.currentTab === 'history' ? 600 : 400}">历史记录</div>
        </div>
      </div>
      <div id="si-tab-content"></div>`;

    if (this.currentTab === 'form') {
      this.renderForm(locId, nowLocal);
    } else {
      this.renderHistory();
    }
  },

  switchTab(tab) {
    this.currentTab = tab;
    this.render();
  },

  // ===== 记录添置 =====
  async renderForm(locId, nowLocal) {
    const isCurrent=Formatter.viewRequest(this,'renderForm');
    document.getElementById('si-tab-content').innerHTML = `
      <div class="card" style="background:#f8f9fa;padding:12px 16px">
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">

          <div class="form-group" style="flex:0 0 200px;margin-bottom:0"><label>添置到存放位置</label><select id="si-location"></select></div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>添置时间</label><input type="date" id="si-date" value="${nowLocal}" style="width:100%"></div>
          <div class="form-group" style="flex:0 0 150px;margin-bottom:0"><label>供应商</label><input type="text" id="si-supplier" placeholder="供应商" style="width:100%"></div>
          <div class="form-group" style="flex:1;min-width:150px;margin-bottom:0"><label>备注</label><input type="text" id="si-remark" placeholder="备注（可选）" style="width:100%"></div>
        </div>
      </div>
      <div class="card">
        <h2>添加物品</h2>
        <div style="display:flex;gap:8px">
          <input type="text" id="si-search" placeholder="扫码或搜索物品" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;max-width:400px">
          <button class="btn btn-success" ${Formatter.event('click', 'stockIn-3')} >扫码枪</button><button class="btn btn-info" ${Formatter.event('click', 'stockIn-4')} >相机扫码</button>
          <button class="btn btn-primary" ${Formatter.event('click', 'stockIn-5')} >手动添加</button>
        </div>
        <div id="si-search-results" style="margin-top:12px"></div>
      </div>
      <div class="card">
        <h2>添置明细</h2>
        <div class="table-wrapper"><table><thead><tr><th>物品</th><th>规格</th><th>数量</th><th>成本单价</th><th>小计</th><th>操作</th></tr></thead><tbody id="si-items-body"></tbody></table></div>
        <div id="si-total" style="margin-top:12px;font-size:16px;font-weight:bold"></div>
        <button class="btn btn-success" style="margin-top:12px" ${Formatter.event('click', 'stockIn-6')} >确认添置</button>
      </div>`;

    const locRes = await API.getLocations();
    if (!isCurrent()) return;
    if (locRes.success) {
      document.getElementById('si-location').innerHTML = locRes.data.map(l => `<option value="${l.id}" ${l.id == locId ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
    }
    this.renderItems();
    const searchInput = document.getElementById('si-search');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this.searchProduct(); }
      });
    }
    SearchSuggest.attach({
      inputId: 'si-search', resultsId: 'si-search-results', minLength: 1,
      searchFn: async (kw) => {
        const barcodeRes = await API.getSkuByBarcode(kw);
        if (barcodeRes.success) return [barcodeRes.data];
        const res = await API.getProducts();
        if (!res.success) return [];
        const items = [];
        for (const p of res.data) {
          if (SearchSuggest.fuzzyMatch(p.name, kw) || SearchSuggest.fuzzyMatch(p.brand_name, kw)) {
            for (const s of p.skus) {
              items.push({ id: s.id, product_name: p.name, volume: s.volume, sku_code: s.sku_code, cost_price: s.cost_price, retail_price: s.retail_price, brand_name: p.brand_name });
            }
          }
        }
        return items;
      },
      renderItem: (s) => `<div style="display:flex;justify-content:space-between"><span>${esc(s.product_name)} - ${esc(s.volume)} (${esc(s.sku_code)})</span><span style="color:#999">成本 ${Formatter.money(s.cost_price)}</span></div>`,
      onSelect: (s) => this.addItem(s)
    });
  },

  async onBarcodeScan(code) {
    App.handleBarcodeScan(code, (sku) => this.addItem(sku));
  },

  async searchProduct() {
    const isCurrent=Formatter.viewRequest(this,'searchProduct');
    const keyword = document.getElementById('si-search').value.trim();
    if (!keyword) return;
    const barcodeRes = await API.getSkuByBarcode(keyword);
    if (!isCurrent()) return;
    if (barcodeRes.success) {
      this.addItem(barcodeRes.data);
      const searchEl = document.getElementById('si-search');
      if (searchEl) searchEl.value = '';
      const resultsEl = document.getElementById('si-search-results');
      if (resultsEl) resultsEl.innerHTML = '';
      return;
    }
    const res = await API.getProducts();
    if (!isCurrent()) return;
    if (res.success) {
      const matched = res.data.filter(p => SearchSuggest.fuzzyMatch(p.name, keyword) || SearchSuggest.fuzzyMatch(p.brand_name, keyword));
      const results = document.getElementById('si-search-results');
      if (!results) return;
      if (matched.length === 0) { results.innerHTML = '<p>未找到匹配物品</p>'; return; }
      results.innerHTML = matched.map(p => p.skus.map(s => {
        const skuData = {id: s.id, product_name: p.name, volume: s.volume, sku_code: s.sku_code, cost_price: s.cost_price, retail_price: s.retail_price};
        return `<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #eee;cursor:pointer" ${Formatter.action('stockIn-select', skuData)}>
          <span>${esc(p.name)} - ${esc(s.volume)} (${esc(s.sku_code)})</span><span>成本 ${Formatter.money(s.cost_price)}</span></div>`;
      }).join('')).join('');
    }
  },

  addItem(sku) {
    const qty = sku._stockQty || 1;
    const existing = this.items.find(i => i.sku_id === sku.id);
    if (existing) { existing.quantity += qty; } else {
      this.items.push({ sku_id: sku.id, product_name: sku.product_name, volume: sku.volume, sku_code: sku.sku_code, quantity: qty, unit_cost: sku.cost_price });
    }
    this.renderItems();
    const searchEl = document.getElementById('si-search');
    if (searchEl) searchEl.value = '';
    const resultsEl = document.getElementById('si-search-results');
    if (resultsEl) resultsEl.innerHTML = '';
  },

  renderItems() {
    const tbody = document.getElementById('si-items-body');
    if (!tbody) return;
    if (this.items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999">暂无添置物品</td></tr>';
      const totalEl = document.getElementById('si-total');
      if (totalEl) totalEl.textContent = '';
      return;
    }
    tbody.innerHTML = this.items.map((item, idx) => `<tr>
      <td>${esc(item.product_name)}</td><td>${esc(item.volume)}</td>
      <td><input type="number" value="${esc(item.quantity)}" min="1" style="width:60px" ${Formatter.event('change', 'stockIn-7', idx)} ></td>
      <td><input type="number" value="${item.unit_cost}" min="0" step="0.01" style="width:80px" ${Formatter.event('change', 'stockIn-8', idx)} ></td>
      <td>${Formatter.money(item.quantity * item.unit_cost)}</td>
      <td><button class="btn btn-danger btn-sm" ${Formatter.event('click', 'stockIn-9', idx)} >删除</button></td></tr>`).join('');
    const total = this.items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);
    const totalEl = document.getElementById('si-total');
    if (totalEl) totalEl.textContent = `添置总成本: ${Formatter.money(total)}`;
  },

  updateQty(idx, val) { this.items[idx].quantity = parseInt(val) || 1; this.renderItems(); },
  updateCost(idx, val) { this.items[idx].unit_cost = parseFloat(val) || 0; this.renderItems(); },
  removeItem(idx) { this.items.splice(idx, 1); this.renderItems(); },

  async submit() {
    if (this.items.length === 0) return App.toast('请添加添置物品', 'error');
    const dateInput = document.getElementById('si-date');
    const stockInDate = dateInput ? dateInput.value : '';
    const data = {
      location_id: parseInt(document.getElementById('si-location').value),
      supplier: document.getElementById('si-supplier').value.trim(),
      remark: document.getElementById('si-remark').value.trim(),
      operator: App.currentUser.name,
      stock_in_date: stockInDate ? stockInDate.replace('T', ' ') : undefined,
      items: this.items.map(i => ({ sku_id: i.sku_id, quantity: i.quantity, unit_cost: i.unit_cost }))
    };
    const res = await API.stockIn(data);
    if (res.success) { App.toast('添置成功'); this.items = []; this.render(); } else App.toast(res.message, 'error');
  },

  showManualAdd() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card" style="width:400px">
      <h2 style="margin-bottom:16px">手动添加物品</h2>
      <div class="form-group"><label style="font-size:14px">输入条码</label><input type="text" id="ma-barcode" placeholder="输入条码后回车" style="font-size:16px;padding:10px" autofocus></div>
      <p style="color:#999;font-size:13px;margin-bottom:16px">输入条码后回车，系统将查询物品。未找到则弹出新品创建界面。</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" ${Formatter.event('click', 'stockIn-10')} >取消</button>
        <button class="btn btn-primary" id="ma-confirm-btn">查询</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const barcodeInput = document.getElementById('ma-barcode');
    const doSearch = () => {
      const code = barcodeInput.value.trim();
      if (!code || code.length < 4) { App.toast('条码过短，请至少4位', 'error'); return; }
      overlay.remove();
      App.handleBarcodeScan(code, (sku) => { this.addItem(sku); });
    };
    document.getElementById('ma-confirm-btn').addEventListener('click', doSearch);
    barcodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  },

  // ===== 历史记录 =====
  historyPage: 1,
  historyFilters: {
    location_id: '',
    type: '',
    start_date: '',
    end_date: '',
    supplier: '',
    operator: '',
    product: '',
    brand: ''
  },
  historyOperators: [],
  _searchTimer: null,

  async renderHistory() {
    const isCurrent=Formatter.viewRequest(this,'renderHistory');
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

    const locRes = await API.getLocations();
    if (!isCurrent()) return;
    const locations = locRes.success ? locRes.data : [];
    const operatorOptions = ['<option value="">全部操作人</option>']
      .concat(this.historyOperators.map(op => 
        `<option value="${esc(op)}" ${this.historyFilters.operator === op ? 'selected' : ''}>${esc(op)}</option>`
      )).join('');

    document.getElementById('si-tab-content').innerHTML = `
      <div class="card" style="background:#f8f9fa;padding:12px 16px">
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group" style="margin-bottom:0"><label>存放位置</label><select id="sih-location" ${Formatter.event('change', 'stockIn-history-location')}><option value="">全部存放位置</option>${locations.map(l => `<option value="${l.id}" ${String(l.id) === String(this.historyFilters.location_id) ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
          <div class="form-group" style="margin-bottom:0"><label>业务类型</label><select id="sih-type" ${Formatter.event('change', 'stockIn-history-location')}><option value="">全部</option><option value="in" ${this.historyFilters.type==='in'?'selected':''}>普通添置</option><option value="transfer_in" ${this.historyFilters.type==='transfer_in'?'selected':''}>移动添置</option></select></div>
          <div class="form-group" style="flex:0 0 160px;margin-bottom:0"><label>开始日期</label><input type="date" id="sih-start" value="${this.historyFilters.start_date}" style="width:100%" ${Formatter.event('change', 'stockIn-11')} ></div>
          <div class="form-group" style="flex:0 0 160px;margin-bottom:0"><label>结束日期</label><input type="date" id="sih-end" value="${this.historyFilters.end_date}" style="width:100%" ${Formatter.event('change', 'stockIn-11')} ></div>
          <div class="form-group" style="flex:0 0 160px;margin-bottom:0"><label>操作人</label>
            <select id="sih-operator" style="width:100%" ${Formatter.event('change', 'stockIn-12')} >${operatorOptions}</select>
          </div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>供应商</label><input type="text" id="sih-supplier" placeholder="搜索供应商" value="${esc(this.historyFilters.supplier)}" style="width:100%" ${Formatter.event('input', 'stockIn-13')} ></div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>物品名称</label><input type="text" id="sih-product" placeholder="搜索物品" value="${esc(this.historyFilters.product)}" style="width:100%" ${Formatter.event('input', 'stockIn-14')} ></div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>品牌</label><input type="text" id="sih-brand" placeholder="搜索品牌" value="${esc(this.historyFilters.brand)}" style="width:100%" ${Formatter.event('input', 'stockIn-15')} ></div>
        </div>
      </div>
      <div class="card">
        <div id="sih-list">
          <div style="text-align:center;padding:40px;color:#999">加载中...</div>
        </div>
      </div>`;

    this.loadHistory();
  },

  onHistoryFilterChange() {
    this.historyFilters.start_date = document.getElementById('sih-start').value;
    this.historyFilters.end_date = document.getElementById('sih-end').value;
    this.loadHistory();
  },

  onOperatorChange() {
    this.historyFilters.operator = document.getElementById('sih-operator').value;
    this.loadHistory();
  },

  onDebounceSearch(field, value) {
    this.historyFilters[field] = value.trim();
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.loadHistory(), 400);
  },

  async loadHistory(page = 1) {
    const isCurrent=Formatter.viewRequest(this,'loadHistory');
    this.historyPage = page;
    const request = this._historyRequest = (this._historyRequest || 0) + 1;
    const listEl = document.getElementById('sih-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#999">加载中...</div>';

    try {
      const params = { ...this.historyFilters, page, limit: 50 };
      const res = await API.getStockInHistory(params);
      if (!isCurrent()) return;

      if (request !== this._historyRequest || !listEl.isConnected) return;
      if (!res.success) throw new Error(res.message || '查询失败');
      if (!res.success || !res.data || res.data.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无添置记录</div>';
        return;
      }

      listEl.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>单号</th><th>业务类型</th>
                <th>日期</th>
                <th>存放位置</th>
                <th>供应商</th>
                <th>物品数</th>
                <th>总成本</th>
                <th>操作人</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${res.data.map(order => `
                <tr>
                  <td>${order.record_type === 'transfer_in' ? '移动' : '添置'} #${order.id}</td><td><span class="badge badge-info">${order.record_type === 'transfer_in' ? '移动添置' : '普通添置'}</span></td>
                  <td>${Formatter.dateTime(order.created_at)}</td>
                  <td>${esc(order.location_name)}</td>
                  <td>${order.record_type === 'transfer_in' ? '来自 ' + esc(order.from_name) : esc(order.supplier || '-')}</td>
                  <td>${order.item_count} 种</td>
                  <td style="color:#0d9488;font-weight:500">${order.total_cost == null ? '—' : Formatter.money(order.total_cost)}</td>
                  <td>${esc(order.operator || '-')}</td>
                  <td>${esc(order.remark || '-')}</td>
                  <td><button class="btn btn-sm btn-info" ${Formatter.event('click', 'stockIn-history-detail', order.record_type, order.id)} >查看详情</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="display:flex;gap:12px;margin-top:12px"><button class="btn" ${page<=1?'disabled':''} ${Formatter.event('click','stockIn-history-page',page-1)}>上一页</button><span>第 ${page} 页 · 共 ${res.total} 条</span><button class="btn" ${page*50>=res.total?'disabled':''} ${Formatter.event('click','stockIn-history-page',page+1)}>下一页</button></div>`;
    } catch (e) {
      listEl.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c">加载失败：${esc(e.message || '未知错误')}</div>`;
    }
  },

  async showDetail(orderId) {
    const isCurrent=Formatter.viewRequest(this,'showDetail');
    try {
      const res = await API.getStockInDetail(orderId);
      if (!isCurrent()) return;
      if (!res.success) throw new Error(res.message);
      const order = res.data;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `<div class="modal-card" style="width:600px;max-height:80vh;overflow-y:auto">
        <h2 style="margin-bottom:16px">添置单详情 #${order.id}</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:14px">
          <div><span style="color:#6b7d7d">日期：</span>${Formatter.dateTime(order.created_at)}</div>
          <div><span style="color:#6b7d7d">存放位置：</span>${esc(order.location_name)}</div>
          <div><span style="color:#6b7d7d">供应商：</span>${esc(order.supplier || '-')}</div>
          <div><span style="color:#6b7d7d">操作人：</span>${esc(order.operator || '-')}</div>
          <div style="grid-column:span 2"><span style="color:#6b7d7d">备注：</span>${esc(order.remark || '-')}</div>
        </div>
        <div style="font-weight:500;margin-bottom:8px">明细物品（${order.items.length} 种）</div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>物品</th><th>规格</th><th>SKU编码</th><th>数量</th><th>成本单价</th><th>小计</th></tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td>${esc(item.product_name)}</td>
                  <td>${esc(item.volume || '-')}</td>
                  <td><code>${esc(item.sku_code)}</code></td>
                  <td>${esc(item.quantity)} ${esc(item.unit || '')}</td>
                  <td>${Formatter.money(item.unit_cost)}</td>
                  <td style="font-weight:500">${Formatter.money(item.quantity * item.unit_cost)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="text-align:right;margin-top:16px;font-size:16px;font-weight:bold;color:#0d9488">
          合计：${Formatter.money(order.total_cost)}
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:20px">
          <button class="btn" ${Formatter.event('click', 'stockIn-10')} >关闭</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
    } catch (e) {
      App.toast(e.message || '加载失败', 'error');
    }
  }
};

Formatter.onAction('stockIn-select', (value) => StockInPage.addItem(value));

// CSP-compatible event handlers; template arguments remain JSON data.
Formatter.onEvent("stockIn-1", function(event) { return StockInPage.switchTab('form'); });
Formatter.onEvent("stockIn-2", function(event) { return StockInPage.switchTab('history'); });
Formatter.onEvent("stockIn-3", function(event) { return Scanner.usbScan(code => StockInPage.onBarcodeScan(code)); });
Formatter.onEvent("stockIn-4", function(event) { return Scanner.cameraScan(code => StockInPage.onBarcodeScan(code)); });
Formatter.onEvent("stockIn-5", function(event) { return StockInPage.showManualAdd(); });
Formatter.onEvent("stockIn-6", function(event) { return StockInPage.submit(); });
Formatter.onEvent("stockIn-7", function(event, arg0) { return StockInPage.updateQty(arg0, this.value); });
Formatter.onEvent("stockIn-8", function(event, arg0) { return StockInPage.updateCost(arg0, this.value); });
Formatter.onEvent("stockIn-9", function(event, arg0) { return StockInPage.removeItem(arg0); });
Formatter.onEvent("stockIn-10", function(event) { return this.closest('.modal-overlay').remove(); });
Formatter.onEvent("stockIn-11", function(event) { return StockInPage.onHistoryFilterChange(); });
Formatter.onEvent("stockIn-12", function(event) { return StockInPage.onOperatorChange(); });
Formatter.onEvent("stockIn-13", function(event) { return StockInPage.onDebounceSearch('supplier', this.value); });
Formatter.onEvent("stockIn-14", function(event) { return StockInPage.onDebounceSearch('product', this.value); });
Formatter.onEvent("stockIn-15", function(event) { return StockInPage.onDebounceSearch('brand', this.value); });
Formatter.onEvent("stockIn-16", function(event, arg0) { return StockInPage.showDetail(arg0); });

Formatter.onEvent('stockIn-history-location', function() {
  StockInPage.historyFilters.location_id = document.getElementById('sih-location').value;
  StockInPage.historyFilters.type = document.getElementById('sih-type').value;
  return StockInPage.loadHistory();
});
Formatter.onEvent('stockIn-history-page', function(event, page) { return StockInPage.loadHistory(page); });

Formatter.onEvent('stockIn-history-detail', function(event, type, id) { return type === 'transfer_in' ? TransferPage.showDetail(id) : StockInPage.showDetail(id); });
