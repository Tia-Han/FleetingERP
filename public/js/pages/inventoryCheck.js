const InventoryCheckPage = {
  stockData: [],
  checkData: {},

  async render() {
    this.stockData = [];
    this.checkData = {};
    const locId = App.currentLocation || '';
    const locRes = await API.getLocations();
    const locations = locRes.success ? locRes.data : [];
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>库存盘点</h2>
        <div class="form-group"><label>盘点场所</label>
          <div style="display:flex;gap:8px">
            <select id="ic-location" onchange="InventoryCheckPage.loadStock()" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px">
              <option value="">-- 选择场所 --</option>
              ${locations.map(l => `<option value="${l.id}" ${l.id == locId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
            </select>
            <button class="btn btn-primary" onclick="InventoryCheckPage.loadStock()">加载库存</button>
          </div>
        </div>
        <div id="ic-content" style="margin-top:16px">
          <p style="color:#999;text-align:center;padding:20px">请选择场所后加载库存数据</p>
        </div>
      </div>`;
    if (locId) this.loadStock();
  },

  async loadStock() {
    const locId = document.getElementById('ic-location').value;
    if (!locId) return;
    const container = document.getElementById('ic-content');
    container.innerHTML = '<p>加载中...</p>';
    const res = await API.getBalances({ location_id: locId });
    if (!res.success) { container.innerHTML = '<p>加载失败</p>'; return; }
    this.stockData = res.data;
    this.checkData = {};
    for (const item of this.stockData) {
      this.checkData[item.sku_id] = item.quantity;
    }
    this.renderTable();
  },

  renderTable() {
    const container = document.getElementById('ic-content');
    if (this.stockData.length === 0) {
      container.innerHTML = '<p style="color:#999;text-align:center;padding:20px">该场所暂无库存数据</p>';
      return;
    }
    container.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <input type="text" id="ic-search" placeholder="搜索商品名/条码" style="flex:1;min-width:150px;padding:8px;border:1px solid #ddd;border-radius:4px" oninput="InventoryCheckPage.filterTable()">
        <button class="btn btn-success" onclick="InventoryCheckPage.submit()">提交盘点</button>
        <button class="btn" onclick="InventoryCheckPage.fillAllSystem()">全部填系统数</button>
      </div>
      <div class="table-wrapper">
        <table id="ic-table">
          <thead><tr><th>商品</th><th>品牌</th><th>规格</th><th>条码</th><th>系统库存</th><th>实盘数量</th><th>差异</th></tr></thead>
          <tbody id="ic-body">
            ${this.stockData.map(item => `<tr data-search="${esc((item.product_name + ' ' + (item.barcode || '') + ' ' + (item.brand_name || '')).toLowerCase())}">
              <td>${esc(item.product_name)}</td>
              <td>${esc(item.brand_name)}</td>
              <td>${esc(item.volume)}</td>
              <td>${esc(item.barcode || '-')}</td>
              <td style="text-align:center">${item.quantity}</td>
              <td><input type="number" value="${item.quantity}" data-sku="${item.sku_id}" style="width:80px;padding:4px;text-align:center" onchange="InventoryCheckPage.updateActual(${item.sku_id}, this.value)"></td>
              <td class="diff-cell" id="diff-${item.sku_id}" style="text-align:center;font-weight:bold"></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    this.updateAllDiffs();
  },

  updateActual(skuId, val) {
    this.checkData[skuId] = parseInt(val) || 0;
    this.updateDiff(skuId);
  },

  updateDiff(skuId) {
    const item = this.stockData.find(s => s.sku_id === skuId);
    if (!item) return;
    const diff = (this.checkData[skuId] || 0) - item.quantity;
    const cell = document.getElementById(`diff-${skuId}`);
    if (cell) {
      cell.textContent = diff === 0 ? '' : (diff > 0 ? '+' + diff : String(diff));
      cell.style.color = diff > 0 ? '#27ae60' : (diff < 0 ? '#e74c3c' : '');
    }
  },

  updateAllDiffs() {
    for (const item of this.stockData) {
      this.updateDiff(item.sku_id);
    }
  },

  fillAllSystem() {
    for (const item of this.stockData) {
      this.checkData[item.sku_id] = item.quantity;
      const input = document.querySelector(`input[data-sku="${item.sku_id}"]`);
      if (input) input.value = item.quantity;
      this.updateDiff(item.sku_id);
    }
    App.toast('已填充系统数量');
  },

  filterTable() {
    const kw = document.getElementById('ic-search').value.trim().toLowerCase();
    document.querySelectorAll('#ic-body tr').forEach(tr => {
      const searchData = tr.dataset.search || '';
      tr.style.display = !kw || searchData.includes(kw) ? '' : 'none';
    });
  },

  async submit() {
    const locId = parseInt(document.getElementById('ic-location').value);
    if (!locId) return App.toast('请选择场所', 'error');
    const items = this.stockData.map(item => ({
      sku_id: item.sku_id,
      actual_quantity: this.checkData[item.sku_id] ?? item.quantity
    }));
    const diffs = items.filter(i => {
      const orig = this.stockData.find(s => s.sku_id === i.sku_id);
      return orig && i.actual_quantity !== orig.quantity;
    });
    if (diffs.length === 0) {
      App.toast('盘点数据与系统一致，无需调整');
      return;
    }
    if (!confirm(`共有 ${diffs.length} 项差异，确认提交盘点？系统将自动调整库存。`)) return;
    const res = await API.inventoryCheck({
      location_id: locId,
      items: items,
      operator: App.currentUser.name
    });
    if (res.success) {
      const adjustments = res.data.adjustments;
      const summary = adjustments.map(a => `${a.volume}: ${a.system_qty}→${a.actual_qty} (${a.diff > 0 ? '+' : ''}${a.diff})`).join('\n');
      App.toast(`盘点完成，调整 ${res.data.adjustedCount} 项`);
      if (adjustments.length > 0) {
        alert(`盘点调整明细：\n\n${summary}`);
      }
      this.loadStock();
    } else {
      App.toast(res.message, 'error');
    }
  }
};
