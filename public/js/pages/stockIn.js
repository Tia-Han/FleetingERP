const StockInPage = {
  items: [],
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

    this.items = [];
    const locId = App.currentLocation || 1;
    const now = new Date();
    const nowLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().substring(0, 10);
    document.getElementById('content').innerHTML = `
      <div class="card" style="padding:0;overflow:hidden">
        <div class="tab-bar" style="display:flex;border-bottom:1px solid #e5e7eb">
          <div class="tab-item ${this.currentTab === 'form' ? 'active' : ''}" data-tab="form" onclick="StockInPage.switchTab('form')" style="padding:14px 24px;cursor:pointer;border-bottom:2px solid ${this.currentTab === 'form' ? '#0d9488' : 'transparent'};color:${this.currentTab === 'form' ? '#0d9488' : '#6b7d7d'};font-weight:${this.currentTab === 'form' ? 600 : 400}">入库开单</div>
          <div class="tab-item ${this.currentTab === 'history' ? 'active' : ''}" data-tab="history" onclick="StockInPage.switchTab('history')" style="padding:14px 24px;cursor:pointer;border-bottom:2px solid ${this.currentTab === 'history' ? '#0d9488' : 'transparent'};color:${this.currentTab === 'history' ? '#0d9488' : '#6b7d7d'};font-weight:${this.currentTab === 'history' ? 600 : 400}">历史记录</div>
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

  // ===== 入库开单 =====
  async renderForm(locId, nowLocal) {
    document.getElementById('si-tab-content').innerHTML = `
      <div class="card" style="background:#f8f9fa;padding:12px 16px">
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group" style="flex:0 0 200px;margin-bottom:0"><label>入库到场所</label><select id="si-location"></select></div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>入库时间</label><input type="date" id="si-date" value="${nowLocal}" style="width:100%"></div>
          <div class="form-group" style="flex:0 0 150px;margin-bottom:0"><label>供应商</label><input type="text" id="si-supplier" placeholder="供应商" style="width:100%"></div>
          <div class="form-group" style="flex:1;min-width:150px;margin-bottom:0"><label>备注</label><input type="text" id="si-remark" placeholder="备注（可选）" style="width:100%"></div>
        </div>
      </div>
      <div class="card">
        <h2>添加商品</h2>
        <div style="display:flex;gap:8px">
          <input type="text" id="si-search" placeholder="扫码或搜索商品" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;max-width:400px">
          <button class="btn btn-success" onclick="Scanner.usbScan(code => StockInPage.onBarcodeScan(code))">扫码枪</button><button class="btn btn-info" onclick="Scanner.cameraScan(code => StockInPage.onBarcodeScan(code))">相机扫码</button>
          <button class="btn btn-primary" onclick="StockInPage.showManualAdd()">手动添加</button>
        </div>
        <div id="si-search-results" style="margin-top:12px"></div>
      </div>
      <div class="card">
        <h2>入库明细</h2>
        <div class="table-wrapper"><table><thead><tr><th>商品</th><th>规格</th><th>数量</th><th>成本单价</th><th>小计</th><th>操作</th></tr></thead><tbody id="si-items-body"></tbody></table></div>
        <div id="si-total" style="margin-top:12px;font-size:16px;font-weight:bold"></div>
        <button class="btn btn-success" style="margin-top:12px" onclick="StockInPage.submit()">确认入库</button>
      </div>`;

    const locRes = await API.getLocations();
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
      renderItem: (s) => `<div style="display:flex;justify-content:space-between"><span>${esc(s.product_name)} - ${esc(s.volume)} (${s.sku_code})</span><span style="color:#999">成本 ${Formatter.money(s.cost_price)}</span></div>`,
      onSelect: (s) => this.addItem(s)
    });
  },

  async onBarcodeScan(code) {
    App.handleBarcodeScan(code, (sku) => this.addItem(sku));
  },

  async searchProduct() {
    const keyword = document.getElementById('si-search').value.trim();
    if (!keyword) return;
    const barcodeRes = await API.getSkuByBarcode(keyword);
    if (barcodeRes.success) {
      this.addItem(barcodeRes.data);
      const searchEl = document.getElementById('si-search');
      if (searchEl) searchEl.value = '';
      const resultsEl = document.getElementById('si-search-results');
      if (resultsEl) resultsEl.innerHTML = '';
      return;
    }
    const res = await API.getProducts();
    if (res.success) {
      const matched = res.data.filter(p => SearchSuggest.fuzzyMatch(p.name, keyword) || SearchSuggest.fuzzyMatch(p.brand_name, keyword));
      const results = document.getElementById('si-search-results');
      if (!results) return;
      if (matched.length === 0) { results.innerHTML = '<p>未找到匹配商品</p>'; return; }
      results.innerHTML = matched.map(p => p.skus.map(s => {
        const skuData = {id: s.id, product_name: p.name, volume: s.volume, sku_code: s.sku_code, cost_price: s.cost_price, retail_price: s.retail_price};
        return `<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px solid #eee;cursor:pointer" onclick='StockInPage.addItem(${JSON.stringify(skuData).replace(/'/g,"&#39;")})'>
          <span>${esc(p.name)} - ${esc(s.volume)} (${s.sku_code})</span><span>成本 ${Formatter.money(s.cost_price)} / 零售 ${Formatter.money(s.retail_price)}</span></div>`;
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
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999">暂无入库商品</td></tr>';
      const totalEl = document.getElementById('si-total');
      if (totalEl) totalEl.textContent = '';
      return;
    }
    tbody.innerHTML = this.items.map((item, idx) => `<tr>
      <td>${esc(item.product_name)}</td><td>${esc(item.volume)}</td>
      <td><input type="number" value="${item.quantity}" min="1" style="width:60px" onchange="StockInPage.updateQty(${idx}, this.value)"></td>
      <td><input type="number" value="${item.unit_cost}" min="0" step="0.01" style="width:80px" onchange="StockInPage.updateCost(${idx}, this.value)"></td>
      <td>${Formatter.money(item.quantity * item.unit_cost)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="StockInPage.removeItem(${idx})">删除</button></td></tr>`).join('');
    const total = this.items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0);
    const totalEl = document.getElementById('si-total');
    if (totalEl) totalEl.textContent = `入库总成本: ${Formatter.money(total)}`;
  },

  updateQty(idx, val) { this.items[idx].quantity = parseInt(val) || 1; this.renderItems(); },
  updateCost(idx, val) { this.items[idx].unit_cost = parseFloat(val) || 0; this.renderItems(); },
  removeItem(idx) { this.items.splice(idx, 1); this.renderItems(); },

  async submit() {
    if (this.items.length === 0) return App.toast('请添加入库商品', 'error');
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
    if (res.success) { App.toast('入库成功'); this.items = []; this.render(); } else App.toast(res.message, 'error');
  },

  showManualAdd() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card" style="width:400px">
      <h2 style="margin-bottom:16px">手动添加商品</h2>
      <div class="form-group"><label style="font-size:14px">输入条码</label><input type="text" id="ma-barcode" placeholder="输入条码后回车" style="font-size:16px;padding:10px" autofocus></div>
      <p style="color:#999;font-size:13px;margin-bottom:16px">输入条码后回车，系统将查询商品。未找到则弹出新品创建界面。</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
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
  historyFilters: {
    start_date: '',
    end_date: '',
    supplier: '',
    operator: '',
    product: '',
    brand: ''
  },
  historyOperators: [],

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

    document.getElementById('si-tab-content').innerHTML = `
      <div class="card" style="background:#f8f9fa;padding:12px 16px">
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group" style="flex:0 0 160px;margin-bottom:0"><label>开始日期</label><input type="date" id="sih-start" value="${this.historyFilters.start_date}" style="width:100%" onchange="StockInPage.onHistoryFilterChange()"></div>
          <div class="form-group" style="flex:0 0 160px;margin-bottom:0"><label>结束日期</label><input type="date" id="sih-end" value="${this.historyFilters.end_date}" style="width:100%" onchange="StockInPage.onHistoryFilterChange()"></div>
          <div class="form-group" style="flex:0 0 160px;margin-bottom:0"><label>操作人</label>
            <select id="sih-operator" style="width:100%" onchange="StockInPage.onOperatorChange()">${operatorOptions}</select>
          </div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>供应商</label><input type="text" id="sih-supplier" placeholder="搜索供应商" style="width:100%" onkeyup="StockInPage.onSupplierSearch(event)"></div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>商品名称</label><input type="text" id="sih-product" placeholder="搜索商品" style="width:100%" onkeyup="StockInPage.onProductSearch(event)"></div>
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>品牌</label><input type="text" id="sih-brand" placeholder="搜索品牌" style="width:100%" onkeyup="StockInPage.onBrandSearch(event)"></div>
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

  onSupplierSearch(e) {
    if (e.key === 'Enter') {
      this.historyFilters.supplier = e.target.value.trim();
      this.loadHistory();
    }
  },

  onProductSearch(e) {
    if (e.key === 'Enter') {
      this.historyFilters.product = e.target.value.trim();
      this.loadHistory();
    }
  },

  onBrandSearch(e) {
    if (e.key === 'Enter') {
      this.historyFilters.brand = e.target.value.trim();
      this.loadHistory();
    }
  },

  async loadHistory() {
    const listEl = document.getElementById('sih-list');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#999">加载中...</div>';

    try {
      const params = { ...this.historyFilters };
      if (App.currentLocation) params.location_id = App.currentLocation;
      const res = await API.getStockInList(params);
      
      if (!res.success || !res.data || res.data.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无入库记录</div>';
        return;
      }

      listEl.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>入库单号</th>
                <th>日期</th>
                <th>场所</th>
                <th>供应商</th>
                <th>商品数</th>
                <th>总成本</th>
                <th>操作人</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              ${res.data.map(order => `
                <tr>
                  <td>#${order.id}</td>
                  <td>${Formatter.dateTime(order.created_at)}</td>
                  <td>${esc(order.location_name)}</td>
                  <td>${esc(order.supplier || '-')}</td>
                  <td>${order.item_count} 种</td>
                  <td style="color:#0d9488;font-weight:500">${Formatter.money(order.total_cost)}</td>
                  <td>${esc(order.operator || '-')}</td>
                  <td>${esc(order.remark || '-')}</td>
                  <td><button class="btn btn-sm btn-info" onclick="StockInPage.showDetail(${order.id})">查看详情</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (e) {
      listEl.innerHTML = `<div style="text-align:center;padding:40px;color:#e74c3c">加载失败：${esc(e.message || '未知错误')}</div>`;
    }
  },

  async showDetail(orderId) {
    try {
      const res = await API.getStockInDetail(orderId);
      if (!res.success) throw new Error(res.message);
      const order = res.data;

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `<div class="modal-card" style="width:600px;max-height:80vh;overflow-y:auto">
        <h2 style="margin-bottom:16px">入库单详情 #${order.id}</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;font-size:14px">
          <div><span style="color:#6b7d7d">日期：</span>${Formatter.dateTime(order.created_at)}</div>
          <div><span style="color:#6b7d7d">场所：</span>${esc(order.location_name)}</div>
          <div><span style="color:#6b7d7d">供应商：</span>${esc(order.supplier || '-')}</div>
          <div><span style="color:#6b7d7d">操作人：</span>${esc(order.operator || '-')}</div>
          <div style="grid-column:span 2"><span style="color:#6b7d7d">备注：</span>${esc(order.remark || '-')}</div>
        </div>
        <div style="font-weight:500;margin-bottom:8px">明细商品（${order.items.length} 种）</div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr><th>商品</th><th>规格</th><th>SKU编码</th><th>数量</th><th>成本单价</th><th>小计</th></tr>
            </thead>
            <tbody>
              ${order.items.map(item => `
                <tr>
                  <td>${esc(item.product_name)}</td>
                  <td>${esc(item.volume || '-')}</td>
                  <td><code>${esc(item.sku_code)}</code></td>
                  <td>${item.quantity} ${esc(item.unit || '')}</td>
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
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">关闭</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
    } catch (e) {
      App.toast(e.message || '加载失败', 'error');
    }
  }
};
