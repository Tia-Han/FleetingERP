const StockQueryPage = {
  _rows: [],
  canEdit() { return ['admin', 'warehouse_manager'].includes(App.currentUser?.role); },
  openAction(action, skuId, locationId) {
    const row = this._rows.find(r => r.sku_id === skuId && r.location_id === locationId);
    if (!row) return;
    if (action === 'edit') return ProductsPage.openEditor(row.product_id);
    if (action === 'check' && this.canEdit()) return App.navigate('inventoryCheck', {location_id: locationId, sku_id: skuId});
    if (action === 'transfer' && ['admin','warehouse_manager','store_clerk'].includes(App.currentUser?.role)) return App.navigate('transfer', {location_id: locationId, sku: {id:skuId,sku_code:row.sku_code,product_name:row.product_name,volume:row.volume}});
  },
  async render() {
    const locId = App.currentLocation || '';
    const locRes = await API.getLocations();
    const catRes = await API.getCategories();
    const locations = locRes.success ? locRes.data : [];
    const categories = catRes.success ? catRes.data : [];
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>库存查询 <button class="btn btn-sm" style="float:right" ${Formatter.event('click', 'stockQuery-1')} >品类管理</button></h2>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="form-group" style="margin:0"><label>场所</label><select id="sq-location" ${Formatter.event('change', 'stockQuery-2')} ><option value="">全部</option>${locations.map(l => `<option value="${l.id}" ${l.id == locId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
          <div class="form-group" style="margin:0"><label>品类</label><select id="sq-category" ${Formatter.event('change', 'stockQuery-2')} ><option value="">全部</option>${categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="form-group" style="margin:0"><label>规格类型</label><select id="sq-spec" ${Formatter.event('change', 'stockQuery-2')} ><option value="">全部</option><option value="整装">整装</option><option value="分装">分装</option></select></div>
          <div class="form-group" style="margin:0"><label>预警</label><select id="sq-alert" ${Formatter.event('change', 'stockQuery-2')} ><option value="">全部</option><option value="low">低库存</option><option value="zero">无库存</option></select></div>
          <div class="form-group" style="margin:0"><label>搜索</label><input type="text" id="sq-search" placeholder="商品名/条码（支持单字模糊）"></div>
        </div>
      </div>
      <div id="sq-results">加载中...</div>`;
    this.load();
    const searchInput = document.getElementById('sq-search');
    if (searchInput) {
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.load();
        }
      });
    }
    SearchSuggest.attach({
      inputId: 'sq-search', minLength: 1,
      searchFn: async (kw) => {
        const res = await API.getBalances({});
        if (!res.success) return [];
        return res.data.filter(b =>
          SearchSuggest.fuzzyMatch(b.product_name, kw) ||
          SearchSuggest.fuzzyMatch(b.brand_name, kw) ||
          (b.sku_code && SearchSuggest.fuzzyMatch(b.sku_code, kw)) ||
          (b.barcode && SearchSuggest.fuzzyMatch(b.barcode, kw))
        );
      },
      renderItem: (b) => `<div style="display:flex;justify-content:space-between"><span>${esc(b.brand_name)} - ${esc(b.product_name)} ${esc(b.volume)}</span><span style="color:#999">库存:${esc(b.quantity)}</span></div>`,
      onSelect: (b) => { document.getElementById('sq-search').value = b.product_name; this.load(); }
    });
  },

  async showCategoryManager() {
    const catRes = await API.getCategories();
    const categories = catRes.success ? catRes.data : [];
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card">
      <h2>品类管理</h2>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <input type="text" id="cat-new-name" placeholder="新品类名称" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px">
        <button class="btn btn-primary" ${Formatter.event('click', 'stockQuery-3')} >添加</button>
      </div>
      <table><thead><tr><th>品类</th><th>操作</th></tr></thead><tbody id="cat-list">
        ${categories.map(c => `<tr id="cat-row-${c.id}"><td id="cat-cell-${c.id}">${esc(c.name)}</td><td>
          <button class="btn btn-sm" ${Formatter.action('category-edit', c.id, c.name)}>重命名</button>
          <button class="btn btn-danger btn-sm" ${Formatter.action('category-delete', c.name)}>删除</button>
        </td></tr>`).join('')}
      </tbody></table>
      <div style="margin-top:12px;text-align:right">
        <button class="btn" ${Formatter.event('click', 'stockQuery-4')} >关闭</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  },

  async addCategory() {
    const name = document.getElementById('cat-new-name').value.trim();
    if (!name) return App.toast('品类名不能为空', 'error');
    const res = await API.saveCategory(null, name);
    App.toast(res.message);
    if (res.success) { document.querySelector('.modal-overlay').remove(); this.showCategoryManager(); this.render(); }
  },

  editCategory(id, oldName) {
    const cell = document.getElementById('cat-cell-' + id);
    cell.innerHTML = `<input type="text" id="cat-edit-input" value="${esc(oldName)}" style="width:100%;padding:4px;border:1px solid #ddd;border-radius:4px">
      <button class="btn btn-primary btn-sm" style="margin-top:4px" ${Formatter.action('category-save', oldName)}>保存</button>`;
  },

  async saveCategoryRename(oldName) {
    const newName = document.getElementById('cat-edit-input').value.trim();
    if (!newName || newName === oldName) {
      const catRes = await API.getCategories();
      const cat = catRes.data.find(c => c.name === oldName);
      if (cat) document.getElementById('cat-cell-' + cat.id).innerHTML = oldName;
      return;
    }
    const res = await API.saveCategory(oldName, newName);
    App.toast(res.message);
    if (res.success) { document.querySelector('.modal-overlay').remove(); this.showCategoryManager(); this.render(); }
  },

  async deleteCategory(name) {
    const res = await API.deleteCategory(name);
    App.toast(res.message);
    if (res.success) { document.querySelector('.modal-overlay').remove(); this.showCategoryManager(); this.render(); }
  },

  async load() {
    const params = {};
    const loc = document.getElementById('sq-location').value;
    const cat = document.getElementById('sq-category').value;
    const spec = document.getElementById('sq-spec').value;
    const alert = document.getElementById('sq-alert').value;
    const search = document.getElementById('sq-search').value.trim();
    if (loc) params.location_id = loc;
    if (cat) params.category = cat;
    if (spec) params.spec_type = spec;
    if (search) params.search = search;
    const request = this._loadRequest = (this._loadRequest || 0) + 1;
    const res = await API.getBalances(params);
    if (request !== this._loadRequest || !document.getElementById('sq-results')) return;
    const div = document.getElementById('sq-results');
    if (!res.success) { div.innerHTML = '<p>加载失败</p>'; return; }
    let data = res.data;
    this._rows = data;
    if (alert === 'low') {
      data = data.filter(b => b.is_low_stock);
    } else if (alert === 'zero') {
      data = data.filter(b => b.quantity <= 0);
    }
    if (data.length === 0) { div.innerHTML = '<div class="card"><p>暂无库存数据</p></div>'; return; }
    const totalValue = data.reduce((sum, b) => sum + b.stock_value, 0);
    div.innerHTML = `<div class="card">
      <p style="margin-bottom:12px">共 ${data.length} 条记录 | 总价值: <strong>${Formatter.money(totalValue)}</strong></p>
      <table><thead><tr><th>场所</th><th>品牌</th><th>商品</th><th>规格</th><th>类型</th><th>库存</th><th>单位成本</th><th>库存价值</th><th>预警</th><th>操作</th></tr></thead><tbody>
        ${data.map(b => `<tr>
          <td>${esc(b.location_name)}</td><td>${esc(b.brand_name)}</td><td>${esc(b.product_name)}</td><td>${esc(b.volume)}</td><td>${esc(b.spec_type)}</td>
          <td>${esc(b.quantity)}</td><td>${Formatter.money(b.cost_price)}</td><td>${Formatter.money(b.stock_value)}</td>
          <td>${b.quantity <= 0 ? '<span class="badge badge-danger">无库存</span>' : (b.is_low_stock ? '<span class="badge badge-warning">低库存</span>' : '')}</td>
          <td>${this.canEdit() ? `<button class="btn btn-sm" ${Formatter.event('click','stock-query-action','edit',b.sku_id,b.location_id)}>编辑商品</button> <button class="btn btn-sm" ${Formatter.event('click','stock-query-action','check',b.sku_id,b.location_id)}>发起盘点</button>` : ''}
          ${['admin','warehouse_manager','store_clerk'].includes(App.currentUser?.role) ? `<button class="btn btn-sm" ${Formatter.event('click','stock-query-action','transfer',b.sku_id,b.location_id)}>发起调拨</button>` : ''}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }
};

Formatter.onAction('category-edit', (...args) => StockQueryPage.editCategory(...args));
Formatter.onAction('category-delete', (name) => StockQueryPage.deleteCategory(name));
Formatter.onAction('category-save', (name) => StockQueryPage.saveCategoryRename(name));

// CSP-compatible event handlers; template arguments remain JSON data.
Formatter.onEvent("stockQuery-1", function(event) { return StockQueryPage.showCategoryManager(); });
Formatter.onEvent("stockQuery-2", function(event) { return StockQueryPage.load(); });
Formatter.onEvent("stockQuery-3", function(event) { return StockQueryPage.addCategory(); });
Formatter.onEvent("stockQuery-4", function(event) { this.closest('.modal-overlay').remove(); StockQueryPage.render() });

Formatter.onEvent('stock-query-action', function(event, action, skuId, locationId) { return StockQueryPage.openAction(action, skuId, locationId); });
