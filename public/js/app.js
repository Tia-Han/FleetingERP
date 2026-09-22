const App = {
  currentUser: null,
  currentLocation: null,
  currentPage: null,

  async init() {
    if (!API.token) { this.renderLogin(); return; }
    try {
      const res = await API.getMe();
      if (res.success) {
        this.currentUser = res.data;
        this.currentLocation = localStorage.getItem('currentLocation') || '';
        this.renderSidebar();
        this.navigate('dashboard');
      } else { this.renderLogin(); }
    } catch { this.renderLogin(); }
  },

  renderLogin() {
    document.getElementById('sidebar').innerHTML = '';
    document.getElementById('topbar').innerHTML = '';
    document.getElementById('content').innerHTML = `
      <div class="login-container">
        <div class="card">
          <h2>暗香·Fleeting</h2>
          <div class="form-group"><label>用户名</label><input type="text" id="login-username" placeholder="用户名"></div>
          <div class="form-group"><label>密码</label><input type="password" id="login-password" placeholder="密码"></div>
          <button class="btn btn-primary" style="width:100%" onclick="App.login()">登录</button>
        </div>
      </div>`;
  },

  async login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const res = await API.login(username, password);
    if (res.success) {
      API.setToken(res.data.token);
      this.currentUser = res.data.user;
      this.renderSidebar();
      this.navigate('dashboard');
    } else { this.toast(res.message, 'error'); }
  },

  logout() { API.clearToken(); this.currentUser = null; this.renderLogin(); },

  async renderSidebar() {
    const role = this.currentUser.role;
    const navItems = [
      { key: 'dashboard', label: '仪表盘', roles: ['admin', 'warehouse_manager', 'store_clerk'] },
      { key: 'products', label: '商品管理', roles: ['admin', 'warehouse_manager'] },
      { key: 'stockQuery', label: '库存查询', roles: ['admin', 'warehouse_manager', 'store_clerk'] },
      { key: 'stockIn', label: '入库', roles: ['admin', 'warehouse_manager'] },
      { key: 'stockOut', label: '出库/损耗', roles: ['admin', 'warehouse_manager', 'store_clerk'] },
      { key: 'transfer', label: '调拨', roles: ['admin', 'warehouse_manager', 'store_clerk'] },
      { key: 'movements', label: '变动流水', roles: ['admin', 'warehouse_manager', 'store_clerk'] },
      { key: 'inventoryCheck', label: '库存盘点', roles: ['admin', 'warehouse_manager'] },
      { key: 'sales', label: '销售', roles: ['admin', 'store_clerk'] },
      { key: 'customers', label: '客户', roles: ['admin', 'store_clerk'] },
      { key: 'settings', label: '设置', roles: ['admin'] },
    ];
    const visibleItems = navItems.filter(item => item.roles.includes(role));
    const locRes = await API.getLocations();
    if (locRes.success) {
      const locOptions = locRes.data.map(l => `<option value="${l.id}" ${l.id == this.currentLocation ? 'selected' : ''}>${l.name}</option>`).join('');
      document.getElementById('sidebar').innerHTML = `
        <div class="sidebar-header">
          <span class="logo">暗香·Fleeting</span>
          <select class="location-select" onchange="App.changeLocation(this.value)">
            <option value="">全部场所</option>${locOptions}
          </select>
        </div>
        <div class="nav-items">
          ${visibleItems.map(item => `<span class="nav-item" data-page="${item.key}" onclick="App.navigate('${item.key}')">${item.label}</span>`).join('')}
        </div>
        <div class="sidebar-footer">
          <span class="user-info">${this.currentUser.name}<a href="#" onclick="App.logout();return false;">退出</a></span>
        </div>`;
    }
    document.getElementById('topbar').innerHTML = `
      <button class="mobile-menu-btn" onclick="App.toggleSidebar()">☰</button>
      <span class="topbar-title" id="topbar-title">仪表盘</span>`;
    this.updateNavActive(this.currentPage || 'dashboard');
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.style.display = sidebar.classList.contains('open') ? 'block' : 'none';
  },

  closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.remove('open');
    overlay.style.display = 'none';
  },

  changeLocation(locId) {
    this.currentLocation = locId;
    localStorage.setItem('currentLocation', locId);
    if (this.currentPage) this.navigate(this.currentPage);
  },

  _getPageObj(page) {
    const map = {
      stockIn: StockInPage, stockOut: StockOutPage, split: SplitPage,
      transfer: TransferPage, sales: SalesPage
    };
    return map[page];
  },

  navigate(page) {
    if (this.currentPage && this.currentPage !== page) {
      const pagesWithData = ['stockIn', 'stockOut', 'split', 'transfer', 'sales'];
      if (pagesWithData.includes(this.currentPage)) {
        const pageObj = this._getPageObj(this.currentPage);
        if (pageObj && pageObj.items && pageObj.items.length > 0) {
          if (!confirm('当前页面有未提交的数据，切换页面将丢失数据。确定要切换吗？')) return;
        }
        if (pageObj && pageObj.batchItems && pageObj.batchItems.length > 0) {
          if (!confirm('当前页面有未提交的数据，切换页面将丢失数据。确定要切换吗？')) return;
        }
      }
    }
    this.currentPage = page;
    this.updateNavActive(page);
    const titleMap = {
      dashboard: '仪表盘', products: '商品管理', stockIn: '入库', stockOut: '出库/损耗',
      split: '分装', transfer: '调拨', stockQuery: '库存查询', movements: '变动流水',
      inventoryCheck: '盘点', sales: '销售', customers: '客户', settings: '设置'
    };
    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.textContent = titleMap[page] || page;
    if (window.innerWidth <= 768) this.closeSidebar();
    const pages = {
      dashboard: () => DashboardPage.render(),
      products: () => ProductsPage.render(),
      stockIn: () => StockInPage.render(),
      stockOut: () => StockOutPage.render(),
      split: () => SplitPage.render(),
      transfer: () => TransferPage.render(),
      sales: () => SalesPage.render(),
      customers: () => CustomersPage.render(),
      stockQuery: () => StockQueryPage.render(),
      movements: () => MovementsPage.render(),
      inventoryCheck: () => InventoryCheckPage.render(),
      settings: () => SettingsPage.render(),
    };
    if (pages[page]) pages[page](); else document.getElementById('content').innerHTML = '<p>页面未实现</p>';
  },

  updateNavActive(page) {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  },

  toast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    const duration = type === 'error' ? 5000 : 3000;
    setTimeout(() => toast.remove(), duration);
  },

  async handleBarcodeScan(code, onFound) {
    if (!code) { this.toast('扫码结果为空', 'error'); return; }
    code = String(code).trim();
    if (code.length < 4) { this.toast('条码过短，请重新扫描', 'error'); return; }
    console.log('扫码结果:', JSON.stringify(code));

    try {
      const localRes = await API.getSkuByBarcode(code);
      if (localRes && localRes.success) {
        try {
          if (onFound) onFound(localRes.data);
          this.toast('已添加: ' + localRes.data.product_name + ' ' + localRes.data.volume, 'success');
        } catch (e) {
          console.error('onFound回调执行失败:', e);
          this.toast('添加商品失败: ' + (e.message || '未知错误'), 'error');
        }
        return;
      }
    } catch (e) {
      console.error('本地条码查询失败:', e);
    }

    this.toast('正在外部数据库查询条码...', 'success');
    try {
      const lookupRes = await API.lookupBarcode(code);
      if (lookupRes && lookupRes.success) {
        this.showBarcodeLookupResult(lookupRes.data, code, onFound);
        return;
      }
    } catch (e) {
      console.error('外部条码查询失败:', e);
    }

    this.showQuickCreateProduct(code, onFound);
  },

  showQuickCreateProduct(barcode, onFound) {
    const self = this;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center';

    API.getBrands().then(brandsData => {
      const brands = brandsData.success ? brandsData.data : [];
      const brandOptions = brands.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join('');

      API.getCategories().then(catData => {
        const categories = catData.success ? catData.data : [];
        const catOptions = categories.map(c => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('');

        overlay.innerHTML = `<div class="modal-card" style="width:520px;max-height:90vh;overflow-y:auto">
          <h2 style="margin-bottom:16px">新品快速入库</h2>
          <div class="form-group"><label style="font-size:14px">条码（可修改）</label><input type="text" id="bp-barcode" value="${esc(barcode)}" style="font-size:16px;font-weight:bold;color:#2980b9;padding:10px" autofocus></div>
          <p style="color:#999;margin-bottom:16px;font-size:13px">请核对条码无误后填写商品信息，条码将永久关联此商品</p>
          <div class="form-group"><label style="font-size:14px">商品名</label><input type="text" id="bp-name" placeholder="输入商品名称" style="font-size:16px;padding:10px"></div>
          <div class="form-group"><label style="font-size:14px">品牌</label>
            <select id="bp-brand" style="font-size:16px;padding:10px">
              <option value="">-- 选择品牌 --</option>
              ${brandOptions}
              <option value="__new__">+ 新建品牌</option>
            </select>
            <input type="text" id="bp-new-brand" placeholder="输入新品牌名" style="display:none;margin-top:8px;font-size:16px;padding:10px">
          </div>
          <div class="form-group"><label style="font-size:14px">品类</label>
            <select id="bp-category" style="font-size:16px;padding:10px">
              ${catOptions || '<option value="香水">香水</option><option value="散香">散香</option><option value="蜡烛">蜡烛</option><option value="护理">护理</option>'}
            </select>
          </div>
          <div class="form-group"><label style="font-size:14px">规格/容量</label><input type="text" id="bp-volume" placeholder="如 100ml" style="font-size:16px;padding:10px"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <div class="form-group"><label style="font-size:14px">成本价</label><input type="number" id="bp-cost" value="0" step="0.01" style="font-size:16px;padding:10px;width:100%;box-sizing:border-box"></div>
            <div class="form-group"><label style="font-size:14px">零售价</label><input type="number" id="bp-retail" value="0" step="0.01" style="font-size:16px;padding:10px;width:100%;box-sizing:border-box"></div>
            <div class="form-group"><label style="font-size:14px">入库数量</label><input type="number" id="bp-stock-qty" value="1" min="1" style="font-size:16px;font-weight:bold;color:#27ae60;padding:10px;width:100%;box-sizing:border-box"></div>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
            <button class="btn" id="bp-cancel-btn">取消</button>
            <button class="btn btn-primary" id="bp-confirm-btn">创建并添加到入库</button>
          </div>
        </div>`;

        document.body.appendChild(overlay);

        document.getElementById('bp-brand').addEventListener('change', function() {
          const newInput = document.getElementById('bp-new-brand');
          newInput.style.display = this.value === '__new__' ? 'block' : 'none';
        });

        document.getElementById('bp-cancel-btn').addEventListener('click', function() {
          overlay.remove();
        });

        document.getElementById('bp-confirm-btn').addEventListener('click', function() {
          App.confirmBarcodeCreate(barcode, overlay, onFound);
        });

        const nameInput = document.getElementById('bp-name');
        if (nameInput) nameInput.focus();
      });
    });
  },

  showBarcodeLookupResult(data, barcode, onFound) {
    const self = this;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center';

    const name = data.product_name || '';
    const brand = data.brand_name || '';
    const category = data.category || '香水';
    const volume = data.volume || '';
    const image = data.image_url || '';
    const source = data.source || '外部数据库';

    const brandsRes = API.getBrands();
    brandsRes.then(brandsData => {
      const brands = brandsData.success ? brandsData.data : [];
      const brandOptions = brands.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
      const brandMatch = brands.find(b => b.name.toLowerCase() === brand.toLowerCase());

      overlay.innerHTML = `<div class="modal-card" style="width:520px;max-height:90vh;overflow-y:auto">
        <h2 style="margin-bottom:16px">条码查询结果</h2>
        <div style="display:flex;gap:16px;margin-bottom:16px">
          ${image ? `<img src="${esc(image)}" style="width:100px;height:100px;object-fit:cover;border-radius:8px" onerror="this.style.display='none'">` : ''}
          <div style="flex:1">
            <p style="font-size:18px;font-weight:bold;margin-bottom:4px">${esc(name)}</p>
            <p style="color:#666;margin-bottom:4px">品牌: ${esc(brand) || '未知'}</p>
            <p style="color:#666;margin-bottom:4px">规格: ${esc(volume) || '未知'}</p>
            <p style="color:#999;font-size:13px">数据来源: ${esc(source)}</p>
            <p style="color:#999;font-size:13px">条码: ${esc(barcode)}</p>
          </div>
        </div>
        <div style="border-top:1px solid #eee;padding-top:16px">
          <h3 style="margin-bottom:12px;color:#34495e;font-size:15px">确认入库信息</h3>
          <div class="form-group"><label style="font-size:14px">条码（可修改）</label><input type="text" id="bp-barcode" value="${esc(barcode)}" style="font-size:16px;font-weight:bold;color:#2980b9;padding:10px"></div>
          <div class="form-group"><label style="font-size:14px">商品名</label><input type="text" id="bp-name" value="${esc(name)}" style="font-size:16px;padding:10px"></div>
          <div class="form-group"><label style="font-size:14px">品牌</label>
            <select id="bp-brand" style="font-size:16px;padding:10px">
              <option value="">-- 选择品牌 --</option>
              ${brandOptions}
              <option value="__new__">+ 新建品牌</option>
            </select>
            <input type="text" id="bp-new-brand" placeholder="输入新品牌名" style="display:none;margin-top:8px;font-size:16px;padding:10px">
          </div>
          <div class="form-group"><label style="font-size:14px">品类</label>
            <select id="bp-category" style="font-size:16px;padding:10px">
              <option value="香水" ${category === '香水' ? 'selected' : ''}>香水</option>
              <option value="散香" ${category === '散香' ? 'selected' : ''}>散香</option>
              <option value="蜡烛" ${category === '蜡烛' ? 'selected' : ''}>蜡烛</option>
              <option value="护理" ${category === '护理' ? 'selected' : ''}>护理</option>
            </select>
          </div>
          <div class="form-group"><label style="font-size:14px">规格/容量</label><input type="text" id="bp-volume" value="${esc(volume)}" placeholder="如 100ml" style="font-size:16px;padding:10px"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <div class="form-group"><label style="font-size:14px">成本价</label><input type="number" id="bp-cost" value="0" step="0.01" style="font-size:16px;padding:10px;width:100%;box-sizing:border-box"></div>
            <div class="form-group"><label style="font-size:14px">零售价</label><input type="number" id="bp-retail" value="0" step="0.01" style="font-size:16px;padding:10px;width:100%;box-sizing:border-box"></div>
            <div class="form-group"><label style="font-size:14px">入库数量</label><input type="number" id="bp-stock-qty" value="1" min="1" style="font-size:16px;font-weight:bold;color:#27ae60;padding:10px;width:100%;box-sizing:border-box"></div>
          </div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
          <button class="btn btn-primary" id="bp-confirm-btn">确认创建并添加</button>
        </div>
      </div>`;

      document.body.appendChild(overlay);

      if (brandMatch) {
        document.getElementById('bp-brand').value = brandMatch.id;
      }

      document.getElementById('bp-brand').addEventListener('change', function() {
        const newInput = document.getElementById('bp-new-brand');
        newInput.style.display = this.value === '__new__' ? 'block' : 'none';
        if (this.value === '__new__' && !brand) newInput.value = brand;
      });

      document.getElementById('bp-confirm-btn').addEventListener('click', function() {
        App.confirmBarcodeCreate(barcode, overlay, onFound);
      });
    });
  },

  async confirmBarcodeCreate(originalBarcode, overlay, onFound) {
    const barcode = document.getElementById('bp-barcode').value.trim() || originalBarcode;
    const name = document.getElementById('bp-name').value.trim();
    const brandVal = document.getElementById('bp-brand').value;
    const newBrand = document.getElementById('bp-new-brand') ? document.getElementById('bp-new-brand').value.trim() : '';
    const category = document.getElementById('bp-category').value;
    const volume = document.getElementById('bp-volume').value.trim();
    const cost = parseFloat(document.getElementById('bp-cost').value) || 0;
    const retail = parseFloat(document.getElementById('bp-retail').value) || 0;
    const stockQty = parseInt(document.getElementById('bp-stock-qty')?.value) || 1;

    if (!barcode) { this.toast('条码不能为空', 'error'); return; }
    if (!name) { this.toast('商品名不能为空', 'error'); return; }

    let brandId = brandVal;
    if (brandVal === '__new__') {
      if (!newBrand) { this.toast('请输入品牌名', 'error'); return; }
      const res = await API.createBrand({ name: newBrand });
      if (res.success) { brandId = res.data.id; } else { this.toast(res.message || '创建品牌失败', 'error'); return; }
    }
    if (!brandId) { this.toast('请选择品牌', 'error'); return; }

    const volNum = parseFloat(volume) || 0;
    const prodRes = await API.createProduct({
      brand_id: parseInt(brandId),
      name: name,
      category: category,
      is_splittable: category === '香水' ? 1 : 0,
      skus: [{
        spec_type: '整装',
        volume: volume || '未知',
        volume_ml: volNum,
        unit: volume.includes('ml') ? '瓶' : (volume.includes('g') ? '个' : '瓶'),
        barcode: barcode,
        cost_price: cost,
        retail_price: retail,
        low_stock_threshold: 2
      }]
    });

    if (prodRes.success) {
      this.toast('商品创建成功', 'success');
      overlay.remove();
      const skuRes = await API.getSkuByBarcode(barcode);
      if (skuRes.success && onFound) {
        skuRes.data._stockQty = stockQty;
        onFound(skuRes.data);
        this.toast('已添加: ' + skuRes.data.product_name + ' ' + skuRes.data.volume + ' x' + stockQty, 'success');
      }
    } else {
      this.toast(prodRes.message || '创建商品失败', 'error');
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
