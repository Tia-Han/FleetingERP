// OPT-1: API baseURL 可配置化
// 网页版默认同源，小程序版可改为绝对地址
const API_BASE = window.location.origin + '/api/v1';

const API = {
  token: localStorage.getItem('token'),
  _tokenExpiry: parseInt(localStorage.getItem('tokenExpiry')) || 0,
  _sessionGeneration: 0,

  // OPT-7: 检查 Token 是否已过期或即将过期
  isTokenValid() {
    if (!this.token) return false;
    const now = Date.now();
    // 提前 5 分钟判定过期，留出续签窗口
    return now < this._tokenExpiry - 5 * 60 * 1000;
  },

  // OPT-7: 登录时保存 Token 过期时间（JWT 有效期 2 小时）
  setToken(token) {
    this._sessionGeneration++;
    this.token = token;
    localStorage.setItem('token', token);
    const expiry = Date.now() + 2 * 60 * 60 * 1000;
    this._tokenExpiry = expiry;
    localStorage.setItem('tokenExpiry', String(expiry));
  },

  clearToken() {
    this._sessionGeneration++;
    this.token = null;
    this._tokenExpiry = 0;
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiry');
  },

  _pendingWrites: new Map(),
  request(method, url, body) {
    if (method !== 'POST' || url.startsWith('/auth/')) return this._request(method,url,body);
    const identity = (typeof App !== 'undefined' && App.currentUser?.id) || this.token;
    const fingerprint=JSON.stringify([identity,url,body]);
    if(this._pendingWrites.has(fingerprint)) return this._pendingWrites.get(fingerprint);
    // Only a fingerprint is persisted, not the business payload or credentials.
    let a=2166136261,b=5381;
    for(const c of fingerprint) { a=Math.imul(a^c.charCodeAt(0),16777619); b=Math.imul(b,33)^c.charCodeAt(0); }
    const storageKey='pending-write-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16);
    let key;
    try { key=localStorage.getItem(storageKey); } catch {}
    if(!key) key=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);
    try { localStorage.setItem(storageKey,key); } catch {}
    const promise=this._request(method,url,body,key).then(result=>{
      if(!result.uncertain) { try { localStorage.removeItem(storageKey); } catch {} }
      return result;
    }).finally(()=>this._pendingWrites.delete(fingerprint));
    this._pendingWrites.set(fingerprint,promise);
    return promise;
  },

  async _request(method, url, body, requestKey) {
    // OPT-7: 请求前检查 Token 有效性
    if (this.token && !this.isTokenValid()) {
      this.clearToken();
      if (typeof App !== 'undefined' && App.renderLogin) {
        App.renderLogin();
        return { success: false, message: '登录已过期，请重新登录' };
      }
    }

    const generation = this._sessionGeneration;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const options = { method, signal: controller.signal, headers: { 'Content-Type': 'application/json' } };
    if (requestKey) options.headers['Idempotency-Key']=requestKey;
    if (this.token) options.headers['Authorization'] = `Bearer ${this.token}`;
    // OPT-11: 标记请求来源为网页端
    options.headers['X-Client-Source'] = 'web';
    if (body) options.body = JSON.stringify(body);

    return fetch(`${API_BASE}${url}`, options).then(async res => {
      if (generation !== this._sessionGeneration) return { success: false, uncertain:true, message: '登录状态已变更，请重新登录后核实原操作结果' };
      if (res.status === 401) {
        API.clearToken();
        if (typeof App !== 'undefined' && App.renderLogin) App.renderLogin();
        return { success: false, message: '登录已过期，请重新登录' };
      }
      if (!res.ok) {
        try { const error = await res.json(); return { success: false, uncertain:res.status>=500, message: error.message || `请求失败 (${res.status})` }; }
        catch { return { success: false, uncertain:res.status>=500, message: `服务器错误 (${res.status})` }; }
      }
      try {
        const result = await res.json();
        if (generation !== this._sessionGeneration) return { success: false, uncertain:true, message: '登录状态已变更，请重新登录后核实原操作结果' };
        return result;
      } catch (e) {
        return { success: false, uncertain:true, message: '服务器响应解析失败，请重试核实结果' };
      }
    }).catch(err => {
      return { success: false, uncertain:true, message: err.name === 'AbortError' ? '请求超时，请先核实单据是否已保存' : '网络请求失败: ' + err.message };
    }).finally(() => clearTimeout(timer));

  },

  login: (username, password) => API.request('POST', '/auth/login', { username, password }),
  changePassword: (oldPassword, newPassword) => API.request('PUT', '/auth/change-password', { old_password: oldPassword, new_password: newPassword }),
  getMe: () => API.request('GET', '/auth/me'),
  getUsers: () => API.request('GET', '/auth/users'),
  createUser: (data) => API.request('POST', '/auth/users', data),
  updateUser: (id,data) => API.request('PUT', `/auth/users/${id}`,data),
  deleteUser: (id) => API.request('DELETE', `/auth/users/${id}`),

  getBrands: () => API.request('GET', '/brands'),
  createBrand: (name) => API.request('POST', '/brands', { name }),
  updateBrand: (id, name) => API.request('PUT', `/brands/${id}`, { name }),
  deleteBrand: (id) => API.request('DELETE', `/brands/${id}`),

  getProducts: (params) => API.request('GET', '/products' + (params ? '?' + new URLSearchParams(params) : '')),
  createProduct: (data) => API.request('POST', '/products', data),
  updateProduct: (id, data) => API.request('PUT', `/products/${id}`, data),
  deleteProduct: (id) => API.request('DELETE', `/products/${id}`),
  addSku: (productId, data) => API.request('POST', `/products/${productId}/skus`, data),

  getCategories: () => API.request('GET', '/products/categories'),
  saveCategory: (oldName, newName) => API.request('POST', '/products/categories', { old_name: oldName, new_name: newName }),
  deleteCategory: (name) => API.request('DELETE', `/products/categories/${encodeURIComponent(name)}`),

  getSkuByBarcode: (code) => API.request('GET', `/skus/barcode/${code}`),
  lookupBarcode: (code) => API.request('GET', `/skus/barcode/lookup/${code}`),
  updateSku: (id, data) => API.request('PUT', `/skus/${id}`, data),

  getLocations: () => API.request('GET', '/locations'),
  createLocation: (data) => API.request('POST', '/locations', data),
  updateLocation: (id, data) => API.request('PUT', `/locations/${id}`, data),
  deleteLocation: (id) => API.request('DELETE', `/locations/${id}`),

  getBalances: (params) => API.request('GET', '/stock/balances' + (params ? '?' + new URLSearchParams(params) : '')),
  getMovements: (params) => API.request('GET', '/stock/movements' + (params ? '?' + new URLSearchParams(params) : '')),
  getAlerts: (params) => API.request('GET', '/stock/alerts' + (params ? '?' + new URLSearchParams(params) : '')),
  getSummary: (params) => API.request('GET', '/stock/summary' + (params ? '?' + new URLSearchParams(params) : '')),

  stockIn: (data) => API.request('POST', '/stock-in', data),
  getStockInHistory: params => API.request('GET', '/stock-in/history?' + new URLSearchParams(params)),
  getTransferDetail: id => API.request('GET', '/transfer/' + id),
  getStockInList: (params) => API.request('GET', '/stock-in' + (params ? '?' + new URLSearchParams(params) : '')),
  getStockInDetail: (id) => API.request('GET', `/stock-in/${id}`),
  stockOut: (data) => API.request('POST', '/stock-out', data),
  stockOutBatch: (data) => API.request('POST', '/stock-out/batch', data),
  getStockOutList: (params) => API.request('GET', '/stock-out' + (params ? '?' + new URLSearchParams(params) : '')),

  split: (data) => API.request('POST', '/split', data),
  getSplit: (id) => API.request('GET', `/split/${id}`),

  transfer: (data) => API.request('POST', '/transfer', data),
  getTransfers: (params) => API.request('GET', '/transfer' + (params ? '?' + new URLSearchParams(params) : '')),

  createSale: (data) => API.request('POST', '/sales', data),
  getSales: (params) => API.request('GET', '/sales' + (params ? '?' + new URLSearchParams(params) : '')),
  getSale: (id) => API.request('GET', `/sales/${id}`),

  getCustomers: (params) => API.request('GET', '/customers' + (params ? '?' + new URLSearchParams(params) : '')),
  getCustomer: id => API.request('GET', `/customers/${id}`),
  createCustomer: (data) => API.request('POST', '/customers', data),
  updateCustomer: (id, data) => API.request('PUT', `/customers/${id}`, data),
  deleteCustomer: (id) => API.request('DELETE', `/customers/${id}`),
  getCustomerPurchases: (id) => API.request('GET', `/customers/${id}/purchases`),

  getDashboard: (params) => API.request('GET', '/system/dashboard' + (params ? '?' + new URLSearchParams(params) : '')),
  getOperators: () => API.request('GET', '/system/operators'),
  getBackups: () => API.request('GET', '/system/backups'),
  restoreBackup: (filename) => API.request('POST', '/system/restore', { filename }),
  inventoryCheck: (data) => API.request('POST', '/stock/check', data),
  backup: async () => {
    const res = await fetch(`${API_BASE}/system/backup`, {
      headers: {
        'Authorization': `Bearer ${API.token}`,
        'X-Client-Source': 'web'
      }
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      if (res.status === 401) API.clearToken();
      if (typeof App !== 'undefined') App.toast(error.message || '备份下载失败', 'error');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fragrance_backup_${new Date().toISOString().split('T')[0].replace(/-/g,'')}.db`;
    a.click();
    URL.revokeObjectURL(url);
  }
};
