const StockOutPage = {
  batchItems: [],

  async render() {
    this.batchItems = [];
    const locId = App.currentLocation || 1;
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>出库/损耗登记</h2>
        <div class="form-group"><label>场所</label><select id="so-location"></select></div>
        <div class="form-group">
          <label>添加商品（扫码或搜索）</label>
          <div style="display:flex;gap:8px">
            <input type="text" id="so-search" placeholder="扫码或搜索商品名/条码" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px" onkeydown="StockOutPage.onSearchKey(event)">
            <button class="btn btn-primary" onclick="StockOutPage.searchProduct()">搜索</button>
            <button class="btn btn-success" onclick="Scanner.usbScan(code => StockOutPage.onBarcodeScan(code))">扫码枪</button><button class="btn btn-info" onclick="Scanner.cameraScan(code => StockOutPage.onBarcodeScan(code))">相机扫码</button>
          </div>
          <div id="so-search-results" style="margin-top:12px"></div>
        </div>
        <div id="so-batch-section" style="margin-top:16px">
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
  }
};
