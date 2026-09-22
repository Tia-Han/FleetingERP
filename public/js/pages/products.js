const ProductsPage = {
  _currentSheet: 'products',

  async render() {
    const content = document.getElementById('content');
    content.innerHTML = '<p>加载中...</p>';
    const [productsRes, brandsRes, catRes] = await Promise.all([API.getProducts(), API.getBrands(), API.getCategories()]);
    if (!productsRes.success) { content.innerHTML = '<p>加载失败</p>'; return; }
    const brands = brandsRes.success ? brandsRes.data : [];
    this._allProducts = productsRes.data;
    this._allBrands = brands;
    this._allCategories = catRes.success ? catRes.data : [];
    this._currentSheet = 'products';
    this._renderShell();
    this._renderProductsSheet();
  },

  _renderShell() {
    document.getElementById('content').innerHTML = `
      <div style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid #eee">
        <div class="pp-tab" data-sheet="products" onclick="ProductsPage.switchSheet('products')" style="padding:12px 24px;cursor:pointer;border-bottom:2px solid #3498db;font-weight:bold;margin-bottom:-2px">商品管理</div>
        <div class="pp-tab" data-sheet="brands" onclick="ProductsPage.switchSheet('brands')" style="padding:12px 24px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px">品牌管理</div>
      </div>
      <div id="pp-sheet-content"></div>`;
  },

  switchSheet(sheet) {
    this._currentSheet = sheet;
    document.querySelectorAll('.pp-tab').forEach(t => {
      const active = t.dataset.sheet === sheet;
      t.style.fontWeight = active ? 'bold' : 'normal';
      t.style.borderBottom = active ? '2px solid #3498db' : '2px solid transparent';
    });
    if (sheet === 'products') this._renderProductsSheet();
    else this._renderBrandsSheet();
  },

  _renderProductsSheet() {
    document.getElementById('pp-sheet-content').innerHTML = `
      <div class="card">
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input type="text" id="p-search" placeholder="搜索商品名/品牌/品类" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;max-width:400px">
          <button class="btn btn-primary" onclick="ProductsPage.doSearch()">搜索</button>
          <button class="btn btn-success" onclick='ProductsPage.showAddProduct()'>+ 新增商品</button>
        </div>
        <div id="p-search-results"></div>
        <div class="table-wrapper"><div id="p-table"><table><thead><tr><th>品牌</th><th>商品名</th><th>品类</th><th>可分装</th><th>SKU 变体</th><th>操作</th></tr></thead><tbody>
          ${this._renderProductRows(this._allProducts)}
        </tbody></table></div></div>
      </div>`;
    SearchSuggest.attach({
      inputId: 'p-search',
      resultsId: 'p-search-results',
      minLength: 1,
      searchFn: async (kw) => {
        return this._allProducts.filter(p =>
          SearchSuggest.fuzzyMatch(p.name, kw) ||
          SearchSuggest.fuzzyMatch(p.brand_name, kw) ||
          SearchSuggest.fuzzyMatch(p.category, kw)
        );
      },
      renderItem: (p) => `<div style="display:flex;justify-content:space-between"><span>${esc(p.brand_name)} - ${esc(p.name)} (${esc(p.category)})</span><span style="color:#999">${p.skus.length}个SKU</span></div>`,
      onSelect: (p) => {
        document.getElementById('p-table').querySelector('tbody').innerHTML = this._renderProductRows([p]);
      }
    });
  },

  _renderBrandsSheet() {
    const brands = this._allBrands || [];
    document.getElementById('pp-sheet-content').innerHTML = `
      <div class="card">
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input type="text" id="brand-name" placeholder="品牌名称" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;max-width:300px">
          <button class="btn btn-success" onclick="ProductsPage.addBrand()">添加品牌</button>
        </div>
        <div class="table-wrapper"><table><thead><tr><th>品牌</th><th>商品数</th><th>操作</th></tr></thead><tbody>
          ${brands.map(b => `<tr><td>${esc(b.name)}</td><td>${b.product_count}</td><td>
            <button class="btn btn-primary btn-sm" onclick="ProductsPage.showEditBrand(${b.id}, '${b.name.replace(/'/g,"\\'")}')">修改</button>
            <button class="btn btn-danger btn-sm" onclick="ProductsPage.deleteBrand(${b.id})">删除</button>
          </td></tr>`).join('')}
        </tbody></table></div>
      </div>`;
  },

  _renderProductRows(products) {
    return products.map(p => `<tr><td>${esc(p.brand_name)}</td><td>${esc(p.name)}</td><td>${esc(p.category)}</td><td>${p.is_splittable ? '是' : '否'}</td>
      <td>${p.skus.map(s => `<span class="badge badge-success" style="margin-right:4px">${esc(s.volume)} ${Formatter.money(s.retail_price)}</span>`).join('') || '<span style="color:#999">无</span>'}</td>
      <td>
        <button class="btn btn-primary btn-sm" onclick="ProductsPage.showEditProduct(${p.id})">修改</button>
        <button class="btn btn-sm" onclick="ProductsPage.showAddSku(${p.id})">+SKU</button>
        <button class="btn btn-danger btn-sm" onclick="ProductsPage.deleteProduct(${p.id})">删除</button>
      </td></tr>`).join('');
  },

  doSearch() {
    const kw = document.getElementById('p-search').value.trim();
    if (!kw) {
      document.getElementById('p-table').querySelector('tbody').innerHTML = this._renderProductRows(this._allProducts);
      return;
    }
    const matched = this._allProducts.filter(p =>
      SearchSuggest.fuzzyMatch(p.name, kw) || SearchSuggest.fuzzyMatch(p.brand_name, kw) || SearchSuggest.fuzzyMatch(p.category, kw));
    document.getElementById('p-table').querySelector('tbody').innerHTML = matched.length ?
      this._renderProductRows(matched) :
      '<tr><td colspan="6" style="text-align:center;color:#999">未找到匹配商品</td></tr>';
  },

  async addBrand() {
    const name = document.getElementById('brand-name').value.trim();
    if (!name) return App.toast('请输入品牌名', 'error');
    const res = await API.createBrand(name);
    if (res.success) {
      App.toast('品牌添加成功');
      const brandsRes = await API.getBrands();
      if (brandsRes.success) this._allBrands = brandsRes.data;
      this._renderBrandsSheet();
    } else App.toast(res.message, 'error');
  },

  showEditBrand(id, name) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card" style="width:400px">
      <h2>修改品牌</h2>
      <div class="form-group"><label>品牌名称</label><input type="text" id="edit-brand-name" value="${name.replace(/"/g,'&quot;')}" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="ProductsPage.submitEditBrand(${id})">保存</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitEditBrand(id) {
    const name = document.getElementById('edit-brand-name').value.trim();
    if (!name) return App.toast('品牌名不能为空', 'error');
    const res = await API.updateBrand(id, name);
    if (res.success) {
      App.toast('品牌修改成功');
      document.querySelector('.modal-overlay').remove();
      const brandsRes = await API.getBrands();
      if (brandsRes.success) this._allBrands = brandsRes.data;
      this._renderBrandsSheet();
    } else App.toast(res.message, 'error');
  },

  async deleteBrand(id) {
    if (!confirm('确认删除此品牌？')) return;
    const res = await API.deleteBrand(id);
    if (res.success) {
      App.toast('删除成功');
      const brandsRes = await API.getBrands();
      if (brandsRes.success) this._allBrands = brandsRes.data;
      this._renderBrandsSheet();
    } else App.toast(res.message, 'error');
  },

  showAddProduct() {
    const brands = this._allBrands || [];
    const categories = this._allCategories || [];
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card" style="width:520px;max-height:90vh;overflow-y:auto">
      <h2 style="margin-bottom:16px">新增商品</h2>
      <div class="form-group"><label style="font-size:14px">条码</label><input type="text" id="p-barcode" placeholder="扫码或输入条码（可选）" style="font-size:16px;padding:10px"></div>
      <div class="form-group"><label style="font-size:14px">品牌</label>
        <select id="p-brand" style="font-size:16px;padding:10px">
          <option value="">-- 选择品牌 --</option>
          ${brands.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('')}
          <option value="__new__">+ 新建品牌</option>
        </select>
        <input type="text" id="p-new-brand" placeholder="输入新品牌名" style="display:none;margin-top:8px;font-size:16px;padding:10px">
      </div>
      <div class="form-group"><label style="font-size:14px">商品名</label><input type="text" id="p-name" placeholder="如：蓝风铃香水" style="font-size:16px;padding:10px"></div>
      <div class="form-group"><label style="font-size:14px">品类</label>
        <select id="p-category" style="font-size:16px;padding:10px">
          ${categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label style="font-size:14px;display:flex;align-items:center;gap:8px"><input type="checkbox" id="p-splittable" style="width:18px;height:18px">可分装（整装香水可分装为小规格）</label></div>
      <div style="border-top:1px solid #eee;padding-top:16px;margin-top:12px">
        <h3 style="margin-bottom:12px;color:#34495e;font-size:15px">规格信息</h3>
        <div id="p-sku-list"></div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="ProductsPage.submitProduct()">确认创建</button>
      </div></div>`;
    document.body.appendChild(overlay);

    document.getElementById('p-brand').addEventListener('change', function() {
      document.getElementById('p-new-brand').style.display = this.value === '__new__' ? 'block' : 'none';
    });

    this.addSkuRow();
  },

  showEditProduct(id) {
    const p = this._allProducts.find(x => x.id === id);
    if (!p) return;
    const brands = this._allBrands || [];
    const categories = this._allCategories || [];
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card" style="width:600px;max-height:85vh;overflow-y:auto">
      <h2>修改商品</h2>
      <div class="form-group"><label>品牌</label><select id="edit-p-brand">${brands.map(b => `<option value="${b.id}" ${b.id === p.brand_id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label>商品名</label><input type="text" id="edit-p-name" value="${esc(p.name)}"></div>
      <div class="form-group"><label>品类</label><select id="edit-p-category">${categories.map(c => `<option value="${c.name}" ${c.name===p.category?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="form-group"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="edit-p-splittable" style="width:18px;height:18px" ${p.is_splittable ? 'checked' : ''}>可分装（整装香水可分装为小规格）</label></div>
      <div style="border-top:1px solid #eee;padding-top:12px;margin-top:8px">
        <h3 style="margin-bottom:8px;color:#34495e">SKU 变体</h3>
        <table style="font-size:13px"><thead><tr><th>规格</th><th>容量(ml)</th><th>成本价</th><th>零售价</th><th>库存预警</th><th>操作</th></tr></thead><tbody>
          ${p.skus.map(s => `<tr>
            <td>${esc(s.volume)}</td><td>${s.volume_ml}</td><td>${Formatter.money(s.cost_price)}</td><td>${Formatter.money(s.retail_price)}</td><td>${s.low_stock_threshold}</td>
            <td><button class="btn btn-primary btn-sm" onclick="ProductsPage.showEditSku(${s.id})">改</button></td>
          </tr>`).join('') || '<tr><td colspan="6" style="color:#999;text-align:center">无SKU</td></tr>'}
        </tbody></table>
        <button class="btn btn-sm btn-primary" style="margin-top:8px" onclick="ProductsPage.showAddSku(${id})">+ 添加 SKU</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="ProductsPage.submitEditProduct(${id})">保存</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  showEditSku(skuId) {
    let sku = null;
    for (const p of this._allProducts) {
      sku = p.skus.find(s => s.id === skuId);
      if (sku) break;
    }
    if (!sku) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card" style="width:400px">
      <h2>修改 SKU</h2>
      <div class="form-group"><label>规格类型</label><select id="es-type"><option value="整装" ${sku.spec_type==='整装'?'selected':''}>整装</option><option value="分装" ${sku.spec_type==='分装'?'selected':''}>分装</option></select></div>
      <div class="form-group"><label>容量描述</label><input type="text" id="es-volume" value="${esc(sku.volume)}"></div>
      <div class="form-group"><label>容量数值(ml)</label><input type="number" id="es-volumeml" value="${sku.volume_ml}" step="0.5"></div>
      <div class="form-group"><label>成本价</label><input type="number" id="es-cost" value="${sku.cost_price}" step="0.01"></div>
      <div class="form-group"><label>零售价</label><input type="number" id="es-retail" value="${sku.retail_price}" step="0.01"></div>
      <div class="form-group"><label>库存预警</label><input type="number" id="es-threshold" value="${sku.low_stock_threshold}"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="ProductsPage.submitEditSku(${skuId})">保存</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitEditSku(skuId) {
    const data = {
      spec_type: document.getElementById('es-type').value,
      volume: document.getElementById('es-volume').value.trim(),
      volume_ml: parseFloat(document.getElementById('es-volumeml').value) || 0,
      cost_price: parseFloat(document.getElementById('es-cost').value) || 0,
      retail_price: parseFloat(document.getElementById('es-retail').value) || 0,
      low_stock_threshold: parseInt(document.getElementById('es-threshold').value) || 0
    };
    if (!data.volume) return App.toast('请输入容量描述', 'error');
    const res = await API.updateSku(skuId, data);
    if (res.success) {
      App.toast('SKU 修改成功');
      document.querySelectorAll('.modal-overlay').forEach(o => o.remove());
      await this._refreshProducts();
      this._renderProductsSheet();
    } else App.toast(res.message, 'error');
  },

  async deleteProduct(id) {
    if (!confirm('确认删除此商品？相关的SKU和库存记录也将被标记删除。')) return;
    const res = await API.deleteProduct(id);
    if (res.success) { App.toast('删除成功'); await this._refreshProducts(); this._renderProductsSheet(); } else App.toast(res.message, 'error');
  },

  async submitEditProduct(id) {
    const data = {
      brand_id: parseInt(document.getElementById('edit-p-brand').value),
      name: document.getElementById('edit-p-name').value.trim(),
      category: document.getElementById('edit-p-category').value,
      is_splittable: document.getElementById('edit-p-splittable').checked
    };
    if (!data.name) return App.toast('请输入商品名', 'error');
    const res = await API.updateProduct(id, data);
    if (res.success) { App.toast('商品修改成功'); document.querySelector('.modal-overlay').remove(); await this._refreshProducts(); this._renderProductsSheet(); } else App.toast(res.message, 'error');
  },

  addSkuRow() {
    const list = document.getElementById('p-sku-list');
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px;align-items:end';
    row.innerHTML = `
      <div><label style="font-size:14px">规格/容量</label><input type="text" class="sku-volume" placeholder="如 100ml" style="font-size:16px;padding:10px;width:100%;box-sizing:border-box"></div>
      <div><label style="font-size:14px">入库数量</label><input type="number" class="sku-stock-qty" value="1" min="1" style="font-size:16px;padding:10px;width:100%;box-sizing:border-box"></div>
      <div><label style="font-size:14px">成本价</label><input type="number" class="sku-cost" value="0" step="0.01" style="font-size:16px;padding:10px;width:100%;box-sizing:border-box"></div>
      <div><label style="font-size:14px">零售价</label><input type="number" class="sku-retail" value="0" step="0.01" style="font-size:16px;padding:10px;width:100%;box-sizing:border-box"></div>
      <input type="hidden" class="sku-type" value="整装">
      <input type="hidden" class="sku-volumeml" value="0">
    `;
    list.appendChild(row);
  },

  async _refreshProducts() {
    const res = await API.getProducts();
    if (res.success) this._allProducts = res.data;
  },

  async submitProduct() {
    const brandVal = document.getElementById('p-brand').value;
    const newBrand = document.getElementById('p-new-brand') ? document.getElementById('p-new-brand').value.trim() : '';
    let brandId = brandVal;
    if (brandVal === '__new__') {
      if (!newBrand) return App.toast('请输入品牌名', 'error');
      const bRes = await API.createBrand({ name: newBrand });
      if (bRes.success) brandId = bRes.data.id; else return App.toast(bRes.message || '创建品牌失败', 'error');
    }
    if (!brandId) return App.toast('请选择品牌', 'error');
    const data = {
      brand_id: parseInt(brandId),
      name: document.getElementById('p-name').value.trim(),
      category: document.getElementById('p-category').value,
      is_splittable: document.getElementById('p-splittable').checked,
      skus: []
    };
    if (!data.name) return App.toast('请输入商品名', 'error');
    const barcode = document.getElementById('p-barcode').value.trim();
    const skuRows = document.querySelectorAll('#p-sku-list > div');
    for (const row of skuRows) {
      const volume = row.querySelector('.sku-volume').value.trim();
      if (!volume) continue;
      data.skus.push({
        spec_type: row.querySelector('.sku-type').value,
        volume: volume,
        volume_ml: parseFloat(row.querySelector('.sku-volumeml').value) || 0,
        unit: '瓶',
        barcode: barcode || null,
        cost_price: parseFloat(row.querySelector('.sku-cost').value) || 0,
        retail_price: parseFloat(row.querySelector('.sku-retail').value) || 0,
        low_stock_threshold: 2
      });
    }
    const res = await API.createProduct(data);
    if (!res.success) return App.toast(res.message, 'error');
    const stockQty = parseInt(document.querySelector('.sku-stock-qty')?.value) || 0;
    if (stockQty > 0 && res.data && res.data.skus && res.data.skus[0]) {
      const sku = res.data.skus[0];
      const locId = App.currentLocation || 1;
      try {
        await API.request('POST', '/stock-in', {
          location_id: parseInt(locId),
          supplier: '',
          remark: '商品管理-新增入库',
          items: [{ sku_id: sku.id, quantity: stockQty, unit_cost: sku.cost_price }]
        });
        App.toast('商品创建成功，已入库 ' + stockQty + ' 件');
      } catch (e) {
        App.toast('商品创建成功，但自动入库失败，请手动入库', 'error');
      }
    } else {
      App.toast('商品创建成功');
    }
    document.querySelector('.modal-overlay').remove();
    await this._refreshProducts();
    this._renderProductsSheet();
  },

  showAddSku(productId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card">
      <h2>添加 SKU 变体</h2>
      <div class="form-group"><label>规格类型</label><select id="s-type"><option value="整装">整装</option><option value="分装">分装</option></select></div>
      <div class="form-group"><label>容量描述</label><input type="text" id="s-volume" placeholder="如：100ml、2ml"></div>
      <div class="form-group"><label>容量数值(ml)</label><input type="number" id="s-volumeml" placeholder="如：100" step="0.5"></div>
      <div class="form-group"><label>单位</label><input type="text" id="s-unit" value="瓶"></div>
      <div class="form-group"><label>成本价</label><input type="number" id="s-cost" value="0" step="0.01"></div>
      <div class="form-group"><label>零售价</label><input type="number" id="s-retail" value="0" step="0.01"></div>
      <div class="form-group"><label>库存预警</label><input type="number" id="s-threshold" value="0"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="ProductsPage.submitSku(${productId})">确认</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitSku(productId) {
    const data = {
      spec_type: document.getElementById('s-type').value,
      volume: document.getElementById('s-volume').value.trim(),
      volume_ml: parseFloat(document.getElementById('s-volumeml').value) || 0,
      unit: document.getElementById('s-unit').value.trim(),
      cost_price: parseFloat(document.getElementById('s-cost').value) || 0,
      retail_price: parseFloat(document.getElementById('s-retail').value) || 0,
      low_stock_threshold: parseInt(document.getElementById('s-threshold').value) || 0
    };
    if (!data.volume) return App.toast('请输入容量描述', 'error');
    const res = await API.addSku(productId, data);
    if (res.success) { App.toast('SKU 添加成功'); document.querySelector('.modal-overlay').remove(); await this._refreshProducts(); this._renderProductsSheet(); } else App.toast(res.message, 'error');
  }
};
