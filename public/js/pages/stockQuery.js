const StockQueryPage = {
  async render() {
    const locId = App.currentLocation || '';
    const locRes = await API.getLocations();
    const catRes = await API.getCategories();
    const locations = locRes.success ? locRes.data : [];
    const categories = catRes.success ? catRes.data : [];
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>库存查询 <button class="btn btn-sm" style="float:right" onclick="StockQueryPage.showCategoryManager()">品类管理</button></h2>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
          <div class="form-group" style="margin:0"><label>场所</label><select id="sq-location" onchange="StockQueryPage.load()"><option value="">全部</option>${locations.map(l => `<option value="${l.id}" ${l.id == locId ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
          <div class="form-group" style="margin:0"><label>品类</label><select id="sq-category" onchange="StockQueryPage.load()"><option value="">全部</option>${categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}</select></div>
          <div class="form-group" style="margin:0"><label>规格类型</label><select id="sq-spec" onchange="StockQueryPage.load()"><option value="">全部</option><option value="整装">整装</option><option value="分装">分装</option></select></div>
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
      renderItem: (b) => `<div style="display:flex;justify-content:space-between"><span>${esc(b.brand_name)} - ${esc(b.product_name)} ${esc(b.volume)}</span><span style="color:#999">库存:${b.quantity}</span></div>`,
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
        <button class="btn btn-primary" onclick="StockQueryPage.addCategory()">添加</button>
      </div>
      <table><thead><tr><th>品类</th><th>操作</th></tr></thead><tbody id="cat-list">
        ${categories.map(c => `<tr id="cat-row-${c.id}"><td id="cat-cell-${c.id}">${esc(c.name)}</td><td>
          <button class="btn btn-sm" onclick="StockQueryPage.editCategory(${c.id}, '${c.name.replace(/'/g,"\\'")}')">重命名</button>
          <button class="btn btn-danger btn-sm" onclick="StockQueryPage.deleteCategory('${c.name.replace(/'/g,"\\'")}')">删除</button>
        </td></tr>`).join('')}
      </tbody></table>
      <div style="margin-top:12px;text-align:right">
        <button class="btn" onclick="this.closest('.modal-overlay').remove(); StockQueryPage.render()">关闭</button>
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
    cell.innerHTML = `<input type="text" id="cat-edit-input" value="${oldName.replace(/"/g,'&quot;')}" style="width:100%;padding:4px;border:1px solid #ddd;border-radius:4px">
      <button class="btn btn-primary btn-sm" style="margin-top:4px" onclick="StockQueryPage.saveCategoryRename('${oldName.replace(/'/g,"\\'")}')">保存</button>`;
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
    const search = document.getElementById('sq-search').value.trim();
    if (loc) params.location_id = loc;
    if (cat) params.category = cat;
    if (spec) params.spec_type = spec;
    if (search) params.search = search;
    const res = await API.getBalances(params);
    const div = document.getElementById('sq-results');
    if (!res.success) { div.innerHTML = '<p>加载失败</p>'; return; }
    if (res.data.length === 0) { div.innerHTML = '<div class="card"><p>暂无库存数据</p></div>'; return; }
    const totalValue = res.data.reduce((sum, b) => sum + b.stock_value, 0);
    div.innerHTML = `<div class="card">
      <p style="margin-bottom:12px">共 ${res.data.length} 条记录 | 总价值: <strong>${Formatter.money(totalValue)}</strong></p>
      <table><thead><tr><th>场所</th><th>品牌</th><th>商品</th><th>规格</th><th>类型</th><th>库存</th><th>单位成本</th><th>库存价值</th><th>预警</th></tr></thead><tbody>
        ${res.data.map(b => `<tr>
          <td>${esc(b.location_name)}</td><td>${esc(b.brand_name)}</td><td>${esc(b.product_name)}</td><td>${esc(b.volume)}</td><td>${esc(b.spec_type)}</td>
          <td>${b.quantity}</td><td>${Formatter.money(b.cost_price)}</td><td>${Formatter.money(b.stock_value)}</td>
          <td>${b.is_low_stock ? '<span class="badge badge-warning">低库存</span>' : ''}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
  }
};
