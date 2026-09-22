const SalesPage = {
  items: [],
  customer: null,
  currentTab: 'new',
  discountMode: 'percent',

  async render() {
    this.items = [];
    this.customer = null;
    this.currentTab = 'new';
    this.discountMode = 'percent';
    this._renderShell();
    await this._renderNewSale();
  },

  _renderShell() {
    document.getElementById('content').innerHTML = `
      <div style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid #eee">
        <div class="sl-tab" data-tab="new" onclick="SalesPage.switchTab('new')" style="padding:12px 24px;cursor:pointer;border-bottom:2px solid #3498db;font-weight:bold;margin-bottom:-2px">销售开单</div>
        <div class="sl-tab" data-tab="history" onclick="SalesPage.switchTab('history')" style="padding:12px 24px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px">销售历史</div>
      </div>
      <div id="sl-tab-content"></div>`;
  },

  switchTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.sl-tab').forEach(t => {
      const active = t.dataset.tab === tab;
      t.style.fontWeight = active ? 'bold' : 'normal';
      t.style.borderBottom = active ? '2px solid #3498db' : '2px solid transparent';
    });
    if (tab === 'new') this._renderNewSale();
    else this._renderHistory();
  },

  async _renderNewSale() {
    const locId = App.currentLocation || '';
    const locRes = await API.getLocations();
    const stores = locRes.success ? locRes.data.filter(l => l.type === 'store') : [];
    document.getElementById('sl-tab-content').innerHTML = `
      <div class="card" style="background:#f8f9fa;padding:12px 16px">
        <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>门店</label><select id="sl-location">${stores.map(s => `<option value="${s.id}" ${s.id == locId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
          <div class="form-group" style="flex:1;min-width:200px;margin-bottom:0"><label>客户</label>
            <div style="display:flex;gap:8px">
              <input type="text" id="sl-customer-search" placeholder="搜索微信名/手机号" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;max-width:250px">
              <button class="btn btn-primary btn-sm" onclick="SalesPage.showAddCustomer()">+ 新增</button>
              <button class="btn btn-sm" onclick="SalesPage.setCustomer(null)">散客</button>
            </div>
          </div>
          <div class="form-group" style="flex:1;min-width:200px;margin-bottom:0"><label>添加商品</label>
            <div style="display:flex;gap:8px">
              <input type="text" id="sl-search" placeholder="扫码或搜索商品" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;max-width:250px">
              <button class="btn btn-success btn-sm" onclick="Scanner.usbScan(code => SalesPage.onBarcodeScan(code))">扫码枪</button><button class="btn btn-info btn-sm" onclick="Scanner.cameraScan(code => SalesPage.onBarcodeScan(code))">相机</button>
            </div>
          </div>
        </div>
        <div id="sl-customer-info" style="margin-top:8px"></div>
        <div id="sl-search-results" style="margin-top:8px"></div>
      </div>
      <div class="card">
        <h2>销售明细</h2>
        <div class="table-wrapper">
          <table><thead><tr><th>商品</th><th>规格</th><th>数量</th><th>单价</th><th>小计</th><th>操作</th></tr></thead><tbody id="sl-items-body"></tbody></table>
        </div>
      </div>
      <div class="card">
        <h2>结算</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px">
          <div class="form-group" style="margin-bottom:0"><label>商品小计</label><input type="text" id="sl-subtotal" readonly value="${Formatter.money(0)}"></div>
          <div class="form-group" style="margin-bottom:0"><label>折扣</label>
            <div style="display:flex;gap:0">
              <input type="number" id="sl-discount" value="0" min="0" step="0.01" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px 0 0 4px" oninput="SalesPage.calcAmount()">
              <button id="sl-discount-mode" class="btn btn-sm" style="border-radius:0 4px 4px 0;border:1px solid #ddd;border-left:none" onclick="SalesPage.toggleDiscountMode()">%</button>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0"><label>本次积分</label><input type="text" id="sl-points-earned" readonly value="0" style="color:#27ae60;font-weight:bold"><small id="sl-points-hint">10元=1分</small></div>
          <div class="form-group" style="margin-bottom:0"><label>累计积分</label><input type="text" id="sl-points-total" readonly value="0" style="color:#999"></div>
        </div>
        <div style="display:flex;gap:16px;align-items:center;margin-top:16px;flex-wrap:wrap">
          <div class="form-group" style="flex:0 0 180px;margin-bottom:0"><label>支付方式</label>
            <select id="sl-pay-method"><option value="wechat">微信</option><option value="alipay">支付宝</option><option value="cash">现金</option><option value="card">银行卡</option></select>
          </div>
          <div class="form-group" style="flex:1;margin-bottom:0"><label>应付金额</label><input type="text" id="sl-final" readonly value="${Formatter.money(0)}" style="font-weight:bold;font-size:18px;color:#e74c3c"></div>
          <button class="btn btn-success" style="flex:0 0 auto;padding:12px 32px;font-size:16px" onclick="SalesPage.submit()">确认收款</button>
        </div>
      </div>`;
    this.renderItems();
    this.calcAmount();
    SearchSuggest.attach({
      inputId: 'sl-search', resultsId: 'sl-search-results', minLength: 1,
      searchFn: async (kw) => {
        const barcodeRes = await API.getSkuByBarcode(kw);
        if (barcodeRes.success) return [barcodeRes.data];
        const res = await API.getProducts();
        if (!res.success) return [];
        const items = [];
        for (const p of res.data) {
          if (SearchSuggest.fuzzyMatch(p.name, kw) || SearchSuggest.fuzzyMatch(p.brand_name, kw)) {
            for (const s of p.skus) {
              items.push({ id: s.id, product_name: p.name, volume: s.volume, sku_code: s.sku_code, retail_price: s.retail_price });
            }
          }
        }
        return items;
      },
      renderItem: (s) => `<div style="display:flex;justify-content:space-between"><span>${esc(s.product_name)} - ${esc(s.volume)}</span><span style="color:#999">${Formatter.money(s.retail_price)}</span></div>`,
      onSelect: (s) => this.addItem(s)
    });
    SearchSuggest.attach({
      inputId: 'sl-customer-search', resultsId: 'sl-customer-info', minLength: 1,
      searchFn: async (kw) => {
        const res = await API.getCustomers({});
        if (!res.success) return [];
        const matched = res.data.filter(c =>
          SearchSuggest.fuzzyMatch(c.wechat_name, kw) || SearchSuggest.fuzzyMatch(c.phone, kw)
        );
        return matched.length > 0 ? matched : [{ is_new: true, keyword: kw }];
      },
      renderItem: (c) => c.is_new
        ? `<div style="color:#3498db">+ 新建客户「${esc(c.keyword)}」</div>`
        : `<div style="display:flex;justify-content:space-between"><span>${esc(c.wechat_name || '')} ${esc(c.phone || '')}</span><span style="color:#999">积分:${c.points}</span></div>`,
      onSelect: (c) => {
        if (c.is_new) { this.showQuickAddCustomer(c.keyword); }
        else { this.setCustomer(c); }
      }
    });
  },

  async _renderHistory() {
    const container = document.getElementById('sl-tab-content');
    container.innerHTML = '<p>加载中...</p>';
    const params = {};
    if (App.currentLocation) params.location_id = App.currentLocation;
    const res = await API.getSales(params);
    if (!res.success) { container.innerHTML = '<p>加载失败</p>'; return; }
    const sales = res.data || [];
    container.innerHTML = `
      <div class="card">
        <h2>销售历史 (${sales.length} 条)</h2>
        <div class="table-wrapper">
          <table>
            <thead><tr><th>时间</th><th>门店</th><th>客户</th><th>商品总额</th><th>折扣</th><th>实付</th><th>积分</th><th>操作人</th><th>操作</th></tr></thead>
            <tbody>
              ${sales.length === 0 ? '<tr><td colspan="9" style="text-align:center;color:#999;padding:16px">暂无销售记录</td></tr>' :
              sales.map(s => `<tr>
                <td>${Formatter.date(s.created_at)}</td>
                <td>${esc(s.location_name)}</td>
                <td>${esc(s.customer_name || '散客')}</td>
                <td>${Formatter.money(s.total_amount)}</td>
                <td>${Formatter.money(s.discount)}</td>
                <td style="font-weight:bold;color:#e74c3c">${Formatter.money(s.final_amount)}</td>
                <td>+${s.points_earned}</td>
                <td>${esc(s.operator || '')}</td>
                <td>
                  <button class="btn btn-sm" onclick="SalesPage.showSaleDetail(${s.id})">详情</button>
                  <button class="btn btn-sm btn-info" onclick="SalesPage.printReceipt(${s.id})">小票</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  },

  showSaleDetail(id) {
    API.getSale(id).then(res => {
      if (!res.success) return App.toast('获取详情失败', 'error');
      const s = res.data;
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      const itemsHtml = s.items.map(i => `<tr><td>${esc(i.product_name)}</td><td>${esc(i.volume)}</td><td>${i.quantity}</td><td>${Formatter.money(i.unit_price)}</td><td>${Formatter.money(i.quantity * i.unit_price)}</td></tr>`).join('');
      const payLabels = { wechat: '微信', alipay: '支付宝', cash: '现金', card: '银行卡' };
      const paymentsStr = s.payments.map(p => payLabels[p.method] || p.method).join(', ');
      overlay.innerHTML = `<div class="modal-card" style="width:500px;max-height:90vh;overflow-y:auto">
        <h2>销售单 #${s.id}</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <p>时间: ${Formatter.date(s.created_at)}</p>
          <p>门店: ${esc(s.location_name)}</p>
          <p>客户: ${esc(s.customer_name || '散客')} ${s.customer_phone ? '(' + esc(s.customer_phone) + ')' : ''}</p>
          <p>操作人: ${esc(s.operator || '')}</p>
        </div>
        <table><thead><tr><th>商品</th><th>规格</th><th>数量</th><th>单价</th><th>小计</th></tr></thead><tbody>${itemsHtml}</tbody></table>
        <div style="margin-top:12px;text-align:right">
          <p>商品总额: ${Formatter.money(s.total_amount)}</p>
          <p>折扣: -${Formatter.money(s.discount)}</p>
          <p style="font-size:18px;font-weight:bold;color:#e74c3c">实付: ${Formatter.money(s.final_amount)}</p>
          <p>支付方式: ${esc(paymentsStr)}</p>
          <p>获得积分: ${s.points_earned}</p>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="btn" onclick="this.closest('.modal-overlay').remove()">关闭</button>
          <button class="btn btn-info" onclick="SalesPage.printReceipt(${s.id})">打印小票</button>
        </div>
      </div>`;
      document.body.appendChild(overlay);
    });
  },

  printReceipt(id) {
    API.getSale(id).then(res => {
      if (!res.success) return App.toast('获取销售信息失败', 'error');
      const s = res.data;
      const itemsHtml = s.items.map(i => `<tr><td>${esc(i.product_name)} ${esc(i.volume)}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${Formatter.money(i.unit_price)}</td><td style="text-align:right">${Formatter.money(i.quantity * i.unit_price)}</td></tr>`).join('');
      const payLabels = { wechat: '微信', alipay: '支付宝', cash: '现金', card: '银行卡' };
      const paymentsStr = s.payments.map(p => payLabels[p.method] || p.method).join(', ');
      const win = window.open('', '', 'width=400,height=600');
      if (!win) { App.toast('弹窗被拦截，请允许弹窗后重试', 'error'); return; }
      win.document.write(`<html><head><title>销售小票 #${s.id}</title>
        <style>body{font-family:'Courier New',monospace;font-size:12px;padding:20px;max-width:360px;margin:0 auto}
        table{width:100%;border-collapse:collapse;margin:8px 0}td,th{padding:2px 4px}
        h2{text-align:center;margin:8px 0}hr{border:none;border-top:1px dashed #999;margin:8px 0}
        .total{font-size:14px;font-weight:bold;text-align:right}.center{text-align:center}</style>
        </head><body>
        <h2>暗香·Fleeting</h2>
        <p class="center">销售小票</p>
        <hr>
        <p>小票编号: #${s.id}</p>
        <p>时间: ${Formatter.date(s.created_at)}</p>
        <p>门店: ${esc(s.location_name)}</p>
        <p>客户: ${esc(s.customer_name || '散客')}</p>
        <hr>
        <table><thead><tr><th style="text-align:left">商品</th><th>数量</th><th style="text-align:right">单价</th><th style="text-align:right">小计</th></tr></thead><tbody>${itemsHtml}</tbody></table>
        <hr>
        <p style="text-align:right">商品总额: ${Formatter.money(s.total_amount)}</p>
        <p style="text-align:right">折扣: -${Formatter.money(s.discount)}</p>
        <p class="total">实付: ${Formatter.money(s.final_amount)}</p>
        <p>支付方式: ${esc(paymentsStr)}</p>
        <p>获得积分: ${s.points_earned}</p>
        <hr>
        <p class="center">谢谢惠顾！</p>
        </body></html>`);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 300);
    });
  },

  async onBarcodeScan(code) {
    App.handleBarcodeScan(code, (sku) => this.addItem(sku));
  },

  showAddCustomer() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card">
      <h2>新增客户</h2>
      <div class="form-group"><label>微信名</label><input type="text" id="sl-add-wechat" placeholder="微信名"></div>
      <div class="form-group"><label>手机号</label><input type="text" id="sl-add-phone" placeholder="手机号"></div>
      <div class="form-group"><label>备注</label><input type="text" id="sl-add-remark" placeholder="备注（可选）"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="SalesPage.submitAddCustomer()">确认</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitAddCustomer() {
    const data = {
      wechat_name: document.getElementById('sl-add-wechat').value.trim(),
      phone: document.getElementById('sl-add-phone').value.trim(),
      remark: document.getElementById('sl-add-remark').value.trim()
    };
    if (!data.wechat_name && !data.phone) return App.toast('微信名或手机号至少填一个', 'error');
    const res = await API.createCustomer(data);
    if (res.success) {
      App.toast('客户创建成功，已关联到本单');
      document.querySelector('.modal-overlay').remove();
      const custRes = await API.getCustomers({ search: data.wechat_name || data.phone });
      if (custRes.success && custRes.data.length > 0) {
        this.setCustomer(custRes.data[0]);
        const searchEl = document.getElementById('sl-customer-search');
        if (searchEl) searchEl.value = '';
        const infoEl = document.getElementById('sl-customer-info');
        if (infoEl) infoEl.innerHTML = `<div style="padding:8px;background:#d4edda;border-radius:4px">客户: ${esc(custRes.data[0].wechat_name || '')} ${esc(custRes.data[0].phone || '')} | 积分余额: ${custRes.data[0].points}</div>`;
      }
    } else App.toast(res.message, 'error');
  },

  showQuickAddCustomer(keyword) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card">
      <h2>新建客户</h2>
      <div class="form-group"><label>微信名</label><input type="text" id="sl-quick-wechat" value="${esc(keyword.includes('1') ? '' : keyword)}"></div>
      <div class="form-group"><label>手机号</label><input type="text" id="sl-quick-phone" value="${esc(/^1\d{10}$/.test(keyword) ? keyword : '')}"></div>
      <div class="form-group"><label>备注</label><input type="text" id="sl-quick-remark" placeholder="备注（可选）"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="SalesPage.submitQuickAddCustomer()">确认</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitQuickAddCustomer() {
    const data = {
      wechat_name: document.getElementById('sl-quick-wechat').value.trim(),
      phone: document.getElementById('sl-quick-phone').value.trim(),
      remark: document.getElementById('sl-quick-remark').value.trim()
    };
    if (!data.wechat_name && !data.phone) return App.toast('微信名或手机号至少填一个', 'error');
    const res = await API.createCustomer(data);
    if (res.success) {
      App.toast('客户创建成功');
      document.querySelector('.modal-overlay').remove();
      const custRes = await API.getCustomers({ search: data.wechat_name || data.phone });
      if (custRes.success && custRes.data.length > 0) {
        this.setCustomer(custRes.data[0]);
        const searchEl = document.getElementById('sl-customer-search');
        if (searchEl) searchEl.value = data.wechat_name || data.phone;
        const infoEl = document.getElementById('sl-customer-info');
        if (infoEl) infoEl.innerHTML = `<div style="padding:8px;background:#d4edda;border-radius:4px">客户: ${esc(custRes.data[0].wechat_name || '')} ${esc(custRes.data[0].phone || '')} | 积分余额: ${custRes.data[0].points}</div>`;
      }
    } else App.toast(res.message, 'error');
  },

  setCustomer(c) {
    this.customer = c;
    const info = document.getElementById('sl-customer-info');
    if (!info) return;
    if (c) {
      info.innerHTML = `<div style="padding:8px;background:#d4edda;border-radius:4px">客户: ${esc(c.wechat_name || '')} ${esc(c.phone || '')} | 积分余额: ${c.points}</div>`;
    } else {
      info.innerHTML = '<div style="padding:8px;background:#d4edda;border-radius:4px">散客（不计积分）</div>';
    }
    this.calcAmount();
  },

  addItem(sku) {
    const existing = this.items.find(i => i.sku_id === sku.id);
    if (existing) {
      existing.quantity++;
    } else {
      this.items.push({ sku_id: sku.id, product_name: sku.product_name, volume: sku.volume, sku_code: sku.sku_code, quantity: 1, unit_price: sku.retail_price, stock_qty: sku.stock_qty || 0 });
    }
    this.renderItems();
    this.calcAmount();
    const searchEl = document.getElementById('sl-search');
    if (searchEl) searchEl.value = '';
    const resultsEl = document.getElementById('sl-search-results');
    if (resultsEl) resultsEl.innerHTML = '';
  },

  renderItems() {
    const tbody = document.getElementById('sl-items-body');
    if (!tbody) return;
    if (this.items.length === 0) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999">暂无商品</td></tr>'; return; }
    tbody.innerHTML = this.items.map((item, idx) => `<tr>
      <td>${esc(item.product_name)}</td><td>${esc(item.volume)}</td>
      <td><input type="number" value="${item.quantity}" min="1" style="width:60px" onchange="SalesPage.updateQty(${idx}, this.value)"></td>
      <td><input type="number" value="${item.unit_price}" min="0" step="0.01" style="width:80px" onchange="SalesPage.updatePrice(${idx}, this.value)"></td>
      <td>${Formatter.money(item.quantity * item.unit_price)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="SalesPage.removeItem(${idx})">删除</button></td></tr>`).join('');
  },

  async updateQty(idx, val) {
    const newQty = parseInt(val) || 1;
    const item = this.items[idx];
    const locId = document.getElementById('sl-location')?.value;
    if (locId) {
      try {
        const balRes = await API.getBalances({ location_id: locId, sku_id: item.sku_id });
        if (balRes.success && balRes.data.length > 0) {
          const stock = balRes.data[0].quantity;
          if (newQty > stock) {
            App.toast('库存不足：当前剩余 ' + stock + '，需要 ' + newQty, 'error');
            item.quantity = stock > 0 ? stock : 1;
            this.renderItems();
            this.calcAmount();
            return;
          }
        }
      } catch (e) { console.error('库存查询失败:', e); }
    }
    item.quantity = newQty;
    this.renderItems();
    this.calcAmount();
  },
  updatePrice(idx, val) { this.items[idx].unit_price = parseFloat(val) || 0; this.renderItems(); this.calcAmount(); },
  removeItem(idx) { this.items.splice(idx, 1); this.renderItems(); this.calcAmount(); },

  toggleDiscountMode() {
    this.discountMode = this.discountMode === 'amount' ? 'percent' : 'amount';
    const btn = document.getElementById('sl-discount-mode');
    if (btn) btn.textContent = this.discountMode === 'amount' ? '¥' : '%';
    const input = document.getElementById('sl-discount');
    if (input) { input.value = 0; }
    this.calcAmount();
  },

  calcAmount() {
    const subtotal = this.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    const discountInput = parseFloat(document.getElementById('sl-discount')?.value || 0);
    let discount = 0;
    if (this.discountMode === 'percent') {
      discount = subtotal * Math.min(discountInput, 100) / 100;
    } else {
      discount = Math.min(discountInput, subtotal);
    }
    const final = Math.max(0, subtotal - discount);
    const subEl = document.getElementById('sl-subtotal');
    const finalEl = document.getElementById('sl-final');
    if (subEl) subEl.value = Formatter.money(subtotal);
    if (finalEl) finalEl.value = Formatter.money(final);
    const pointsEarned = Math.floor(final / 10);
    const earnedEl = document.getElementById('sl-points-earned');
    if (earnedEl) earnedEl.value = pointsEarned + ' 分';
    const currentPoints = this.customer ? (this.customer.points || 0) : 0;
    const totalEl = document.getElementById('sl-points-total');
    if (totalEl) totalEl.value = (currentPoints + pointsEarned) + ' 分';
  },

  async submit() {
    if (this.items.length === 0) return App.toast('请添加商品', 'error');
    const subtotal = this.items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
    const discountInput = parseFloat(document.getElementById('sl-discount').value) || 0;
    let discount = 0;
    if (this.discountMode === 'percent') {
      discount = subtotal * Math.min(discountInput, 100) / 100;
    } else {
      discount = Math.min(discountInput, subtotal);
    }
    const final = Math.max(0, subtotal - discount);
    const payMethod = document.getElementById('sl-pay-method').value;
    const data = {
      location_id: parseInt(document.getElementById('sl-location').value),
      customer_id: this.customer ? this.customer.id : null,
      items: this.items.map(i => ({ sku_id: i.sku_id, quantity: i.quantity, unit_price: i.unit_price })),
      discount: discount,
      points_used: 0,
      payments: [{ method: payMethod, amount: final }],
      operator: App.currentUser.name
    };
    const res = await API.createSale(data);
    if (res.success) {
      const saleId = res.data.id;
      App.toast('销售成功');
      this._showSuccessModal(saleId);
    } else App.toast(res.message, 'error');
  },

  _showSuccessModal(saleId) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card" style="width:400px;text-align:center">
      <div style="font-size:48px;color:#27ae60;margin-bottom:12px">✓</div>
      <h2>销售成功</h2>
      <p style="color:#666;margin:8px 0">销售单号: #${saleId}</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:20px">
        <button class="btn btn-info" onclick="SalesPage.printReceipt(${saleId})">打印小票</button>
        <button class="btn" onclick="SalesPage.switchTab('history')">查看历史</button>
        <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();SalesPage.render()">继续开单</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  }
};
