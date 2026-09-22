const CustomersPage = {
  async render() {
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>客户管理</h2>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input type="text" id="cu-search" placeholder="搜索微信名/手机号" style="flex:1;padding:8px;border:1px solid #ddd;border-radius:4px;max-width:400px">
          <button class="btn btn-primary" onclick="CustomersPage.search()">搜索</button>
          <button class="btn btn-success" onclick="CustomersPage.showAdd()">+ 新增客户</button>
        </div>
        <div id="cu-list">加载中...</div>
      </div>`;
    this.loadList();
    SearchSuggest.attach({
      inputId: 'cu-search', minLength: 1,
      searchFn: async (kw) => {
        const res = await API.getCustomers({});
        if (!res.success) return [];
        return res.data.filter(c =>
          SearchSuggest.fuzzyMatch(c.wechat_name, kw) || SearchSuggest.fuzzyMatch(c.phone, kw)
        );
      },
      renderItem: (c) => `<div style="display:flex;justify-content:space-between"><span>${c.wechat_name || ''} ${c.phone || ''}</span><span style="color:#999">积分:${c.points} | 消费:${Formatter.money(c.total_spent)}</span></div>`,
      onSelect: (c) => { document.getElementById('cu-search').value = c.wechat_name || c.phone; this.loadList(c.wechat_name || c.phone); }
    });
  },

  onSearchKey(e) { if (e.key === 'Enter') this.search(); },
  search() { this.loadList(document.getElementById('cu-search').value.trim()); },

  async loadList(search) {
    const params = search ? { search } : {};
    const res = await API.getCustomers(params);
    const div = document.getElementById('cu-list');
    if (!res.success) { div.innerHTML = '<p>加载失败</p>'; return; }
    if (res.data.length === 0) { div.innerHTML = '<p>暂无客户</p>'; return; }
    div.innerHTML = `<table><thead><tr><th>微信名</th><th>手机</th><th>积分</th><th>累计消费</th><th>备注</th><th>注册时间</th><th>操作</th></tr></thead><tbody>
      ${res.data.map(c => `<tr>
        <td>${esc(c.wechat_name) || '-'}</td><td>${esc(c.phone) || '-'}</td><td>${c.points}</td><td>${Formatter.money(c.total_spent)}</td>
        <td>${esc(c.remark) || '-'}</td><td>${Formatter.date(c.created_at)}</td>
        <td>
          <button class="btn btn-primary btn-sm" onclick="CustomersPage.viewPurchases(${c.id})">购买记录</button>
          <button class="btn btn-sm" onclick='CustomersPage.showEdit(${JSON.stringify(c).replace(/'/g,"&#39;")})'>编辑</button>
          <button class="btn btn-danger btn-sm" onclick="CustomersPage.delete(${c.id})">删除</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
  },

  showAdd() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card">
      <h2>新增客户</h2>
      <div class="form-group"><label>微信名</label><input type="text" id="cu-wechat" placeholder="微信名"></div>
      <div class="form-group"><label>手机号</label><input type="text" id="cu-phone" placeholder="手机号"></div>
      <div class="form-group"><label>备注</label><input type="text" id="cu-remark" placeholder="备注"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="CustomersPage.submitAdd()">确认</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitAdd() {
    const data = {
      wechat_name: document.getElementById('cu-wechat').value.trim(),
      phone: document.getElementById('cu-phone').value.trim(),
      remark: document.getElementById('cu-remark').value.trim()
    };
    if (!data.wechat_name && !data.phone) return App.toast('微信名或手机号至少填一个', 'error');
    const res = await API.createCustomer(data);
    if (res.success) { App.toast('客户添加成功'); document.querySelector('.modal-overlay').remove(); this.loadList(); } else App.toast(res.message, 'error');
  },

  showEdit(c) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card">
      <h2>编辑客户</h2>
      <div class="form-group"><label>微信名</label><input type="text" id="cu-edit-wechat" value="${esc(c.wechat_name) || ''}"></div>
      <div class="form-group"><label>手机号</label><input type="text" id="cu-edit-phone" value="${esc(c.phone) || ''}"></div>
      <div class="form-group"><label>备注</label><input type="text" id="cu-edit-remark" value="${esc(c.remark) || ''}"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" onclick="CustomersPage.submitEdit(${c.id})">保存</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitEdit(id) {
    const data = {
      wechat_name: document.getElementById('cu-edit-wechat').value.trim(),
      phone: document.getElementById('cu-edit-phone').value.trim(),
      remark: document.getElementById('cu-edit-remark').value.trim()
    };
    if (!data.wechat_name && !data.phone) return App.toast('微信名或手机号至少填一个', 'error');
    const res = await API.updateCustomer(id, data);
    if (res.success) { App.toast('更新成功'); document.querySelector('.modal-overlay').remove(); this.loadList(); } else App.toast(res.message, 'error');
  },

  async delete(id) {
    if (!confirm('确认删除该客户？')) return;
    const res = await API.deleteCustomer(id);
    if (res.success) { App.toast('删除成功'); this.loadList(); } else App.toast(res.message, 'error');
  },

  async viewPurchases(id) {
    const res = await API.getCustomerPurchases(id);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    if (!res.success || res.data.length === 0) {
      overlay.innerHTML = `<div class="modal-card"><h2>购买记录</h2><p>暂无购买记录</p><button class="btn" style="margin-top:12px" onclick="this.closest('.modal-overlay').remove()">关闭</button></div>`;
    } else {
      overlay.innerHTML = `<div class="modal-card" style="width:600px">
        <h2>购买记录 (${res.data.length})</h2>
        <table><thead><tr><th>时间</th><th>门店</th><th>商品</th><th>金额</th><th>积分</th></tr></thead><tbody>
          ${res.data.map(s => `<tr><td>${Formatter.date(s.created_at)}</td><td>${esc(s.location_name)}</td>
            <td>${s.items.map(i => `${esc(i.product_name)} ${esc(i.volume)} x${i.quantity}`).join(', ')}</td>
            <td>${Formatter.money(s.final_amount)}</td><td>+${s.points_earned}</td></tr>`).join('')}
        </tbody></table>
        <button class="btn" style="margin-top:12px" onclick="this.closest('.modal-overlay').remove()">关闭</button>
      </div>`;
    }
    document.body.appendChild(overlay);
  }
};
