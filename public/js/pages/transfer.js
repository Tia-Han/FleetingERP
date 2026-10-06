const TransferPage = {
  items: [],

  async render() {
    const isCurrent=Formatter.viewRequest(this,'render');
    const params = App._navParams || {};
    App._navParams = null;
    this.items = [];
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>日常存放处间移动</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group"><label>调出存放位置</label><select id="tr-from"></select></div>
          <div class="form-group"><label>调入存放位置</label><select id="tr-to"></select></div>
        </div>
        <div class="form-group">
          <label>添加物品（扫码或搜索）</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="tr-search" placeholder="扫码或搜索物品（支持单字模糊）" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px">
            <button class="btn btn-success" ${Formatter.event('click', 'transfer-1')} >扫码枪</button><button class="btn btn-info" ${Formatter.event('click', 'transfer-2')} >相机扫码</button>
          </div>
          <div id="tr-search-results" style="margin-top:12px"></div>
        </div>
        <div class="table-wrapper"><table><thead><tr><th>物品</th><th>规格</th><th>当前库存</th><th>数量</th><th>操作</th></tr></thead><tbody id="tr-items-body"></tbody></table></div>
        <button class="btn btn-success" style="margin-top:12px" ${Formatter.event('click', 'transfer-3')} >确认移动</button>
      </div>
      <div class="card"><h2>移动记录</h2><div id="tr-history"></div></div>`;
    const locRes = await API.request('GET','/locations?destinations=1');
    if (!isCurrent()) return;
    if (locRes.success) {
      const opts = locRes.data.map(l => `<option value="${l.id}">${esc(l.name)}</option>`).join('');
      document.getElementById('tr-from').innerHTML = locRes.data.filter(l=>App.currentUser.role==='admin'||l.id===App.currentUser.location_id).map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('');
      document.getElementById('tr-to').innerHTML = opts;
    }
    if (params.location_id) document.getElementById('tr-from').value = String(params.location_id);
    const from = document.getElementById('tr-from');
    const to = document.getElementById('tr-to');
    const other = Array.from(to.options).find(o => o.value !== from.value);
    to.value = other ? other.value : '';
    from.addEventListener('change', () => { this.items = []; this.renderItems(); document.getElementById('tr-search-results').innerHTML=''; });
    if (params.sku) await this.addItem(params.sku);
    this.renderItems();
    this.loadHistory();
    SearchSuggest.attach({
      inputId: 'tr-search', resultsId: 'tr-search-results', minLength: 1,
      searchFn: async (kw) => {
        const barcodeRes = await API.getSkuByBarcode(kw);
        if (barcodeRes.success) return [barcodeRes.data];
        const res = await API.getProducts();
        if (!res.success) return [];
        const items = [];
        for (const p of res.data) {
          if (SearchSuggest.fuzzyMatch(p.name, kw) || SearchSuggest.fuzzyMatch(p.brand_name, kw)) {
            for (const s of p.skus) {
              items.push({ id: s.id, product_name: p.name, volume: s.volume, sku_code: s.sku_code });
            }
          }
        }
        return items;
      },
      renderItem: (s) => `<div style="display:flex;justify-content:space-between"><span>${esc(s.product_name)} - ${esc(s.volume)}</span><span style="color:#999">${esc(s.sku_code)}</span></div>`,
      onSelect: (s) => this.addItem(s)
    });
  },

  async onBarcodeScan(code) {
    App.handleBarcodeScan(code, (sku) => this.addItem(sku));
  },

  async searchProduct() {
    const isCurrent=Formatter.viewRequest(this,'searchProduct');
    const keyword = document.getElementById('tr-search').value.trim();
    if (!keyword) return;
    const barcodeRes = await API.getSkuByBarcode(keyword);
    if (!isCurrent()) return;
    if (barcodeRes.success) { this.addItem(barcodeRes.data); return; }
    const res = await API.getProducts();
    if (!isCurrent()) return;
    if (res.success) {
      const matched = res.data.filter(p => p.name.includes(keyword));
      const results = document.getElementById('tr-search-results');
      if (matched.length === 0) { results.innerHTML = '<p>未找到匹配物品</p>'; return; }
      results.innerHTML = matched.flatMap(p => p.skus.map(s => {
        const skuData = {id: s.id, product_name: p.name, volume: s.volume, sku_code: s.sku_code};
        return `<div style="padding:8px;border-bottom:1px solid #eee;cursor:pointer" ${Formatter.action('transfer-select', skuData)}>${esc(p.name)} - ${esc(s.volume)}</div>`;
      }).join('')).join('');
    }
  },

  async addItem(sku) {
    const existing = this.items.find(i => i.sku_id === sku.id);
    if (existing) { existing.quantity++; } else {
      const fromId = document.getElementById('tr-from').value;
      let stock = 0;
      const balRes = await API.getBalances({ location_id: fromId });
      if (balRes.success) {
        const found = balRes.data.find(b => b.sku_code === sku.sku_code);
        if (found) stock = found.quantity;
      }
      this.items.push({ sku_id: sku.id, product_name: sku.product_name, volume: sku.volume, sku_code: sku.sku_code, quantity: 1, stock });
    }
    this.renderItems();
    document.getElementById('tr-search').value = '';
    document.getElementById('tr-search-results').innerHTML = '';
  },

  renderItems() {
    const tbody = document.getElementById('tr-items-body');
    if (!tbody) return;
    if (this.items.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">暂无移动物品</td></tr>'; return; }
    tbody.innerHTML = this.items.map((item, idx) => `<tr>
      <td>${esc(item.product_name)}</td><td>${esc(item.volume)}</td>
      <td><span style="color:${item.stock < item.quantity ? '#e74c3c' : '#999'}">${esc(item.stock)}</span></td>
      <td><input type="number" value="${esc(item.quantity)}" min="1" style="width:60px" ${Formatter.event('change', 'transfer-4', idx)} ></td>
      <td><button class="btn btn-danger btn-sm" ${Formatter.event('click', 'transfer-5', idx)} >删除</button></td></tr>`).join('');
  },

  updateQty(idx, val) { this.items[idx].quantity = parseInt(val) || 1; this.renderItems(); },
  removeItem(idx) { this.items.splice(idx, 1); this.renderItems(); },

  async submit() {
    if (this.items.length === 0) return App.toast('请添加移动物品', 'error');
    const fromId = parseInt(document.getElementById('tr-from').value);
    const toId = parseInt(document.getElementById('tr-to').value);
    if (fromId === toId) return App.toast('调出和调入存放位置不能相同', 'error');
    for (const item of this.items) {
      if (item.stock < item.quantity) {
        return App.toast(`${item.product_name} 库存不足（当前: ${item.stock}, 需要: ${item.quantity}）`, 'error');
      }
    }
    const data = { from_location_id: fromId, to_location_id: toId, items: this.items.map(i => ({ sku_id: i.sku_id, quantity: i.quantity })), operator: App.currentUser.name };
    const res = await API.transfer(data);
    if (res.success) { App.toast('移动成功'); this.render(); } else App.toast(res.message, 'error');
  },

  async showDetail(id) {
    const isCurrent=Formatter.viewRequest(this,'showDetail');
    const res = await API.getTransferDetail(id);
    if (!isCurrent()) return;
    if (!res.success) return App.toast(res.message || '移动详情加载失败', 'error');
    const t = res.data;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card"><h2>移动单 #${t.id}</h2>
      <p>调出：${esc(t.from_name)} → 调入：${esc(t.to_name)}</p>
      <p>时间：${Formatter.dateTime(t.created_at)} · 操作人：${esc(t.operator)}</p>
      <table><thead><tr><th>物品</th><th>规格</th><th>数量</th></tr></thead><tbody>${t.items.map(i=>`<tr><td>${esc(i.product_name)}</td><td>${esc(i.volume)}</td><td>${i.quantity}</td></tr>`).join('')}</tbody></table>
      <button class="btn" ${Formatter.event('click','transfer-detail-close')}>关闭</button></div>`;
    document.body.appendChild(overlay);
  },
  async loadHistory() {
    const isCurrent=Formatter.viewRequest(this,'loadHistory');
    const res = await API.getTransfers();
    if (!isCurrent()) return;
    const div = document.getElementById('tr-history');
    if (!res.success || res.data.length === 0) { div.innerHTML = '<p>暂无移动记录</p>'; return; }
    const recent = res.data.slice(0, 50);
    div.innerHTML = `<div class="table-wrapper"><table><thead><tr><th>时间</th><th>从</th><th>到</th><th>物品</th></tr></thead><tbody>
      ${recent.map(t => `<tr><td>${Formatter.date(t.created_at)}</td><td>${esc(t.from_name)}</td><td>${esc(t.to_name)}</td>
        <td>${t.items.map(i => `${esc(i.product_name)} ${esc(i.volume)} x${esc(i.quantity)}`).join(', ')}</td></tr>`).join('')}
    </tbody></table></div>${res.data.length > 50 ? '<p style="color:#999;text-align:center">仅显示最近50条记录</p>' : ''}`;
  }
};

Formatter.onAction('transfer-select', (value) => TransferPage.addItem(value));

// CSP-compatible event handlers; template arguments remain JSON data.
Formatter.onEvent("transfer-1", function(event) { return Scanner.usbScan(code => TransferPage.onBarcodeScan(code)); });
Formatter.onEvent("transfer-2", function(event) { return Scanner.cameraScan(code => TransferPage.onBarcodeScan(code)); });
Formatter.onEvent("transfer-3", function(event) { return TransferPage.submit(); });
Formatter.onEvent("transfer-4", function(event, arg0) { return TransferPage.updateQty(arg0, this.value); });
Formatter.onEvent("transfer-5", function(event, arg0) { return TransferPage.removeItem(arg0); });

Formatter.onEvent('transfer-detail', function(event, id) { return TransferPage.showDetail(id); });
Formatter.onEvent('transfer-detail-close', function() { this.closest('.modal-overlay').remove(); });
