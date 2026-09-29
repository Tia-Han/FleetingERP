const SettingsPage = {
  async render() {
    document.getElementById('content').innerHTML = `
      <div class="card">
        <h2>场所管理</h2>
        <div id="se-locations">加载中...</div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <input type="text" id="se-loc-name" placeholder="场所名称" style="flex:1;min-width:120px;padding:8px;border:1px solid #ddd;border-radius:4px">
          <select id="se-loc-type" style="padding:8px;border:1px solid #ddd;border-radius:4px"><option value="warehouse">仓库</option><option value="store">门店</option></select>
          <input type="text" id="se-loc-address" placeholder="地址（可选）" style="flex:1;min-width:120px;padding:8px;border:1px solid #ddd;border-radius:4px">
          <button class="btn btn-success" ${Formatter.event('click', 'settings-1')} >添加</button>
        </div>
      </div>
      <div class="card">
        <h2>用户管理 <button class="btn btn-primary" style="float:right" ${Formatter.event('click', 'settings-2')} >+ 新增用户</button></h2>
        <div id="se-users">加载中...</div>
        <button class="btn btn-primary" style="margin-top:12px" ${Formatter.event('click', 'settings-3')} >修改密码</button>
      </div>
      <div class="card">
        <h2>数据备份</h2>
        <p style="margin-bottom:8px;color:#7f8c8d">系统每日自动备份数据，也可手动导出。</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-primary" ${Formatter.event('click', 'settings-4')} >导出数据库备份(.db)</button>
          <button class="btn btn-success" ${Formatter.event('click', 'settings-5')} >导出库存数据(.csv)</button>
          <button class="btn btn-success" ${Formatter.event('click', 'settings-6')} >导出变动流水(.csv)</button>
          <button class="btn btn-success" ${Formatter.event('click', 'settings-7')} >导出销售记录(.csv)</button>
        </div>
        <p style="margin-top:12px;font-size:13px;color:#7f8c8d">每日自动备份已启用，服务器启动时自动执行。</p>
      </div>
      <div class="card">
        <h2>数据恢复</h2>
        <p style="margin-bottom:8px;color:#7f8c8d">从自动备份恢复数据。恢复前系统会自动保存当前数据。</p>
        <div id="se-backups">加载中...</div>
      </div>`;
    this.loadLocations();
    this.loadUsers();
    this.loadBackups();
  },

  async loadLocations() {
    const isCurrent=Formatter.viewRequest(this,'loadLocations');
    const res = await API.getLocations();
    if (!isCurrent()) return;
    const div = document.getElementById('se-locations');
    if (!res.success) { div.innerHTML = '<p>加载失败</p>'; return; }
    div.innerHTML = `<table><thead><tr><th>名称</th><th>类型</th><th>地址</th><th>操作</th></tr></thead><tbody>
      ${res.data.map(l => `<tr>
        <td>${esc(l.name)}</td>
        <td>${l.type === 'warehouse' ? '仓库' : '门店'}</td>
        <td>${esc(l.address) || '-'}</td>
        <td>
          <button class="btn btn-primary btn-sm" ${Formatter.action('location-edit', l.id, l.name, l.type, l.address || '')}>修改</button>
          <button class="btn btn-danger btn-sm" ${Formatter.event('click', 'settings-8', l.id)} >删除</button>
        </td>
      </tr>`).join('')}
    </tbody></table>`;
  },

  async addLocation() {
    const name = document.getElementById('se-loc-name').value.trim();
    const type = document.getElementById('se-loc-type').value;
    const address = document.getElementById('se-loc-address').value.trim();
    if (!name) return App.toast('请输入场所名称', 'error');
    const res = await API.createLocation({ name, type, address });
    if (res.success) {
      App.toast('场所添加成功');
      this.loadLocations();
      document.getElementById('se-loc-name').value = '';
      document.getElementById('se-loc-address').value = '';
    } else App.toast(res.message, 'error');
  },

  showEditLocation(id, name, type, address) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card">
      <h2>编辑场所</h2>
      <div class="form-group"><label>名称</label><input type="text" id="el-name" value="${esc(name)}"></div>
      <div class="form-group"><label>类型</label><select id="el-type"><option value="warehouse" ${type === 'warehouse' ? 'selected' : ''}>仓库</option><option value="store" ${type === 'store' ? 'selected' : ''}>门店</option></select></div>
      <div class="form-group"><label>地址</label><input type="text" id="el-address" value="${esc(address)}"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" ${Formatter.event('click', 'settings-9')} >取消</button>
        <button class="btn btn-primary" ${Formatter.event('click', 'settings-10', id)} >保存</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitEditLocation(id) {
    const name = document.getElementById('el-name').value.trim();
    const type = document.getElementById('el-type').value;
    const address = document.getElementById('el-address').value.trim();
    if (!name) return App.toast('请输入场所名称', 'error');
    const res = await API.updateLocation(id, { name, type, address });
    if (res.success) {
      App.toast('更新成功');
      document.querySelector('.modal-overlay').remove();
      this.loadLocations();
    } else App.toast(res.message, 'error');
  },

  async deleteLocation(id) {
    if (!confirm('确认删除此场所？如有库存或变动记录将无法删除。')) return;
    const res = await API.deleteLocation(id);
    if (res.success) { App.toast('删除成功'); this.loadLocations(); } else App.toast(res.message, 'error');
  },

  async loadUsers() {
    const isCurrent=Formatter.viewRequest(this,'loadUsers');
    const res = await API.getUsers();
    if (!isCurrent()) return;
    const div = document.getElementById('se-users');
    if (!res.success) { div.innerHTML = '<p>加载失败</p>'; return; }
    this._users=res.data;
    const roleLabels = { admin: '管理员', warehouse_manager: '仓库管理员', store_clerk: '门店店员' };
    div.innerHTML = `<table><thead><tr><th>用户名</th><th>姓名</th><th>角色</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
      ${res.data.map(u => `<tr><td>${esc(u.username)}</td><td>${esc(u.name)}</td><td>${u.location_name ? esc(u.location_name)+(u.role==='store_clerk'?'店员':'管理员') : roleLabels[u.role] || esc(u.role)}${u.enabled?'':'（停用）'}${u.role!=='admin'&&!u.location_id?'（待绑定）':''}</td><td>${Formatter.date(u.created_at)}</td>
        <td>${u.username !== 'admin' ? `<button class="btn btn-sm" ${Formatter.event('click', 'user-edit', u.id)}>修改权限</button><button class="btn btn-danger btn-sm" ${Formatter.event('click', 'settings-11', u.id)} >删除</button>` : '-'}</td></tr>`).join('')}
    </tbody></table>`;
  },

  showChangePassword() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card" style="width:400px">
      <h2>修改密码</h2>
      <div class="form-group"><label>旧密码</label><input type="password" id="cp-old" placeholder="当前密码"></div>
      <div class="form-group"><label>新密码</label><input type="password" id="cp-new" placeholder="至少8位"></div>
      <div class="form-group"><label>确认新密码</label><input type="password" id="cp-confirm" placeholder="再次输入新密码"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" ${Formatter.event('click', 'settings-9')} >取消</button>
        <button class="btn btn-primary" ${Formatter.event('click', 'settings-12')} >确认</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitChangePassword() {
    const oldPw = document.getElementById('cp-old').value;
    const newPw = document.getElementById('cp-new').value;
    const confirmPw = document.getElementById('cp-confirm').value;
    if (!oldPw || !newPw) return App.toast('请填写完整', 'error');
    if (newPw !== confirmPw) return App.toast('两次输入的新密码不一致', 'error');
    if (newPw.length < 8) return App.toast('新密码至少8位', 'error');
    const res = await API.changePassword(oldPw, newPw);
    if (res.success) {
      API.clearToken(); App.currentUser = null; App.renderLogin();
      App.toast('密码修改成功，请重新登录');
      document.querySelector('.modal-overlay').remove();
    } else App.toast(res.message, 'error');
  },

  async showAddUser(editId=null) {
    const locations=await API.getLocations();
    if(!locations.success) return App.toast(locations.message,'error');
    const user=editId ? this._users.find(u=>u.id===editId) : null;
    this._editingUser=editId;
    const selected=user ? user.role+(user.location_id ? ':'+user.location_id : '') : '';
    const choices=[{value:'admin',label:'管理员'},...locations.data.map(l=>({value:(l.type==='store'?'store_clerk':'warehouse_manager')+':'+l.id,label:l.name+(l.type==='store'?'店员':'管理员')+'（场所编号 '+l.id+'）'}))];
    const options='<option value="">请选择角色和场所</option>'+choices.map(c=>`<option value="${esc(c.value)}" ${selected===c.value?'selected':''}>${esc(c.label)}</option>`).join('');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-card">
      <h2>${user?'修改用户权限':'新增用户'}</h2>
      <div class="form-group"><label>用户名</label><input type="text" id="u-username" value="${esc(user?.username||'')}" ${user?'disabled':''} placeholder="登录用户名"></div>
      <div class="form-group"><label>密码</label><input type="password" id="u-password" ${user?'disabled':''} placeholder="${user?'权限修改无需密码':'登录密码'}"></div>
      <div class="form-group"><label>姓名</label><input type="text" id="u-name" value="${esc(user?.name||'')}" ${user?'disabled':''} placeholder="显示姓名"></div>
      <div class="form-group"><label>角色</label><select id="u-role">${options}</select></div>
      ${user?`<label>状态<select id="u-enabled"><option value="1" ${user.enabled?'selected':''}>启用</option><option value="0" ${!user.enabled?'selected':''}>停用</option></select></label>`:''}
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn" ${Formatter.event('click', 'settings-9')} >取消</button>
        <button class="btn btn-primary" ${Formatter.event('click', 'settings-13')} >确认</button>
      </div></div>`;
    document.body.appendChild(overlay);
  },

  async submitUser() {
    const data = {
      username: document.getElementById('u-username').value.trim(),
      password: document.getElementById('u-password').value,
      name: document.getElementById('u-name').value.trim(),
      role: document.getElementById('u-role').value
    };
    const [role,location]=data.role.split(':');
    data.role=role; data.location_id=location?Number(location):null;
    data.enabled=this._editingUser?Number(document.getElementById('u-enabled').value):1;
    if (!data.username || (!this._editingUser&&!data.password) || !data.name) return App.toast('请填写完整信息', 'error');
    const res = this._editingUser ? await API.updateUser(this._editingUser,data) : await API.createUser(data);
    if (res.success) { App.toast('用户已保存'); document.querySelector('.modal-overlay').remove(); this.loadUsers(); } else App.toast(res.message, 'error');
  },

  async deleteUser(id) {
    if (!confirm('确认删除此用户？')) return;
    const res = await API.deleteUser(id);
    if (res.success) { App.toast('删除成功'); this.loadUsers(); } else App.toast(res.message, 'error');
  },

  async backupDb() {
    App.toast('正在生成数据库备份...');
    try {
      const res = await fetch('/api/system/backup', { headers: { 'Authorization': `Bearer ${API.token}` } });
      if (!res.ok) throw new Error('备份失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fragrance_backup_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.db`;
      a.click();
      URL.revokeObjectURL(url);
      App.toast('备份下载已开始');
    } catch (e) { App.toast('备份失败：' + e.message, 'error'); }
  },

  async exportExcel(type) {
    App.toast('正在生成数据...');
    try {
      const res = await fetch(`/api/system/export-excel?type=${type}`, { headers: { 'Authorization': `Bearer ${API.token}` } });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      App.toast('导出已开始');
    } catch (e) { App.toast('导出失败：' + e.message, 'error'); }
  },

  async loadBackups() {
    const isCurrent=Formatter.viewRequest(this,'loadBackups');
    const res = await API.getBackups();
    if (!isCurrent()) return;
    const div = document.getElementById('se-backups');
    if (!div) return;
    if (!res.success) { div.innerHTML = '<p>加载失败</p>'; return; }
    const backups = res.data || [];
    if (backups.length === 0) {
      div.innerHTML = '<p style="color:#999">暂无自动备份记录</p>';
      return;
    }
    div.innerHTML = `<table><thead><tr><th>备份日期</th><th>文件大小</th><th>操作</th></tr></thead><tbody>
      ${backups.map(b => `<tr>
        <td>${b.date || b.filename}</td>
        <td>${b.size_label}</td>
        <td><button class="btn btn-warning btn-sm" ${Formatter.event('click', 'settings-14', b.filename)} >恢复</button></td>
      </tr>`).join('')}
    </tbody></table>`;
  },

  async restoreBackup(filename) {
    if (!confirm(`确认从备份 ${filename} 恢复数据？\n\n当前数据将自动保存为安全备份。\n恢复后需要刷新页面。`)) return;
    const res = await API.restoreBackup(filename);
    if (res.success) {
      API.clearToken(); App.currentUser = null;
      App.toast(res.message);
      setTimeout(() => location.reload(), 2000);
    } else App.toast(res.message, 'error');
  }
};

Formatter.onAction('location-edit', (...args) => SettingsPage.showEditLocation(...args));

// CSP-compatible event handlers; template arguments remain JSON data.
Formatter.onEvent("settings-1", function(event) { return SettingsPage.addLocation(); });
Formatter.onEvent("settings-2", function(event) { return SettingsPage.showAddUser(); });
Formatter.onEvent("settings-3", function(event) { return SettingsPage.showChangePassword(); });
Formatter.onEvent("settings-4", function(event) { return SettingsPage.backupDb(); });
Formatter.onEvent("settings-5", function(event) { return SettingsPage.exportExcel('stock'); });
Formatter.onEvent("settings-6", function(event) { return SettingsPage.exportExcel('movements'); });
Formatter.onEvent("settings-7", function(event) { return SettingsPage.exportExcel('sales'); });
Formatter.onEvent("settings-8", function(event, arg0) { return SettingsPage.deleteLocation(arg0); });
Formatter.onEvent("settings-9", function(event) { return this.closest('.modal-overlay').remove(); });
Formatter.onEvent("settings-10", function(event, arg0) { return SettingsPage.submitEditLocation(arg0); });
Formatter.onEvent("settings-11", function(event, arg0) { return SettingsPage.deleteUser(arg0); });
Formatter.onEvent("settings-12", function(event) { return SettingsPage.submitChangePassword(); });
Formatter.onEvent("settings-13", function(event) { return SettingsPage.submitUser(); });
Formatter.onEvent("settings-14", function(event, arg0) { return SettingsPage.restoreBackup(arg0); });

Formatter.onEvent('user-edit',function(event,id){ return SettingsPage.showAddUser(id); });
