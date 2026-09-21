const TransferPage = {
  items: [],

  async render() {
    this.items = [];
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>门店间调拨</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div class="form-group"><label>调出场所</label><select id="tr-from"></select></div>
          <div class="form-group"><label>调入场所</label><select id="tr-to"></select></div>
        </div>
        <div class="form-group">
          <label>添加商品（扫码或搜索）</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="tr-search" placeholder="扫码或搜索商品（支持单字模糊）" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px">
            <button class="btn btn-success" onclick="Scanner.usbScan(code => TransferPage.onBarcodeScan(code))">扫码枪</button><button class="btn btn-info" onclick="Scanner.cameraScan(code => TransferPage.onBarcodeScan(code))">相机扫码</button>
          </div>
          <div id="tr-search-results" style="margin-top:12px"></div>
        </div>
        <table><thead><tr><th>商品</th><th>规格</th><th>当前库存</th><th>数量</th><th>操作</th></tr></thead><tbody id="tr-items-body"></tbody></table>
        <button class="btn btn-success" style="margin-top:12px" onclick="TransferPage.submit()">确认调拨</button>
      </div>
      <div class="card"><h2>调拨记录</h2><div id="tr-history"></div></div>`;
    const locRes = await API.getLocations();
    if (locRes.success) {
      const opts = locRes.data.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
      document.getElementById('tr-from').innerHTML = opts;
      document.getElementById('tr-to').innerHTML = opts;
    }
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
      renderItem: (s) => `<div style="display:flex;justify-content:space-between"><span>${s.product_name} - ${s.volume}</span><span style="color:#999">${s.sku_code}</span></div>`,
      onSelect: (s) => this.addItem(s)
    });
  },

  async onBarcodeScan(code) {
    App.handleBarcodeScan(code, (sku) => this.addItem(sku));
  },

  async searchProduct() {
    const keyword = document.getElementById('tr-search').value.trim();
    if (!keyword) return;
    const barcodeRes = await API.getSkuByBarcode(keyword);
    if (barcodeRes.success) { this.addItem(barcodeRes.data); return; }
    const res = await API.getProducts();
    if (res.success) {
      const matched = res.data.filter(p => p.name.includes(keyword));
      const results = document.getElementById('tr-search-results');
      if (matched.length === 0) { results.innerHTML = '<p>未找到匹配商品</p>'; return; }
      results.innerHTML = matched.flatMap(p => p.skus.map(s => {
        const skuData = {id: s.id, product_name: p.name, volume: s.volume, sku_code: s.sku_code};
        return `<div style="padding:8px;border-bottom:1px solid #eee;cursor:pointer" onclick='TransferPage.addItem(${JSON.stringify(skuData).replace(/'/g,"&#39;")})'>${p.name} - ${s.volume}</div>`;
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
    if (this.items.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#999">暂无调拨商品</td></tr>'; return; }
    tbody.innerHTML = this.items.map((item, idx) => `<tr>
      <td>${esc(item.product_name)}</td><td>${esc(item.volume)}</td>
      <td><span style="color:${item.stock < item.quantity ? '#e74c3c' : '#999'}">${item.stock}</span></td>
      <td><input type="number" value="${item.quantity}" min="1" style="width:60px" onchange="TransferPage.updateQty(${idx}, this.value)"></td>
      <td><button class="btn btn-danger btn-sm" onclick="TransferPage.removeItem(${idx})">删除</button></td></tr>`).join('');
  },

  updateQty(idx, val) { this.items[idx].quantity = parseInt(val) || 1; this.renderItems(); },
  removeItem(idx) { this.items.splice(idx, 1); this.renderItems(); },

  async submit() {
    if (this.items.length === 0) return App.toast('请添加调拨商品', 'error');
    const fromId = parseInt(document.getElementById('tr-from').value);
    const toId = parseInt(document.getElementById('tr-to').value);
    if (fromId === toId) return App.toast('调出和调入场所不能相同', 'error');
    for (const item of this.items) {
      if (item.stock < item.quantity) {
        return App.toast(`${item.product_name} 库存不足（当前: ${item.stock}, 需要: ${item.quantity}）`, 'error');
      }
    }
    const data = { from_location_id: fromId, to_location_id: toId, items: this.items.map(i => ({ sku_id: i.sku_id, quantity: i.quantity })), operator: App.currentUser.name };
    const res = await API.transfer(data);
    if (res.success) { App.toast('调拨成功'); this.render(); } else App.toast(res.message, 'error');
  },

  async loadHistory() {
    const res = await API.getTransfers();
    const div = document.getElementById('tr-history');
    if (!res.success || res.data.length === 0) { div.innerHTML = '<p>暂无调拨记录</p>'; return; }
    const recent = res.data.slice(0, 50);
    div.innerHTML = `<table><thead><tr><th>时间</th><th>从</th><th>到</th><th>商品</th></tr></thead><tbody>
      ${recent.map(t => `<tr><td>${Formatter.date(t.created_at)}</td><td>${esc(t.from_name)}</td><td>${esc(t.to_name)}</td>
        <td>${t.items.map(i => `${esc(i.product_name)} ${esc(i.volume)} x${i.quantity}`).join(', ')}</td></tr>`).join('')}
    </tbody></table>${res.data.length > 50 ? '<p style="color:#999;text-align:center">仅显示最近50条记录</p>' : ''}`;
  }
};
