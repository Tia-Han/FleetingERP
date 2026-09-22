// OPT-1: API baseURL 可配置化
// 网页版默认同源，小程序版可改为绝对地址
const API_BASE = window.location.origin + '/api/v1';

const API = {
  token: localStorage.getItem('token'),
  _tokenExpiry: parseInt(localStorage.getItem('tokenExpiry')) || 0,
  _cache: {},
  _pending: {},

  _noCacheUrls: ['/stock/balances', '/stock/movements', '/stock/alerts', '/stock/summary', '/system/dashboard', '/sales', '/system/backups'],

  // OPT-7: 检查 Token 是否已过期或即将过期
  isTokenValid() {
    if (!this.token) return false;
    const now = Date.now();
    // 提前 5 分钟判定过期，留出续签窗口
    return now < this._tokenExpiry - 5 * 60 * 1000;
  },

  // OPT-7: 登录时保存 Token 过期时间（JWT 有效期 2 小时）
  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
    const expiry = Date.now() + 2 * 60 * 60 * 1000;
    this._tokenExpiry = expiry;
    localStorage.setItem('tokenExpiry', String(expiry));
  },

  clearToken() {
    this.token = null;
    this._tokenExpiry = 0;
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiry');
    this._cache = {};
  },

  async request(method, url, body) {
    // OPT-7: 请求前检查 Token 有效性
    if (this.token && !this.isTokenValid()) {
      this.clearToken();
      if (typeof App !== 'undefined' && App.renderLogin) {
        App.renderLogin();
        return { success: false, message: '登录已过期，请重新登录' };
      }
    }

    const cacheKey = method + url;
    const shouldCache = method === 'GET' && !this._noCacheUrls.some(u => url.startsWith(u));
    if (shouldCache) {
      if (this._cache[cacheKey] && Date.now() - this._cache[cacheKey].ts < 5000) {
        return this._cache[cacheKey].data;
      }
      if (this._pending[cacheKey]) {
        return this._pending[cacheKey];
      }
    }

    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (this.token) options.headers['Authorization'] = `Bearer ${this.token}`;
    // OPT-11: 标记请求来源为网页端
    options.headers['X-Client-Source'] = 'web';
    if (body) options.body = JSON.stringify(body);

    const promise = fetch(`${API_BASE}${url}`, options).then(async res => {
      if (res.status === 401) {
        API.clearToken();
        if (typeof App !== 'undefined' && App.renderLogin) App.renderLogin();
        return { success: false, message: '登录已过期，请重新登录' };
      }
      if (!res.ok) {
        return { success: false, message: `服务器错误 (${res.status})` };
      }
      try {
        return await res.json();
      } catch (e) {
        return { success: false, message: '服务器响应解析失败' };
      }
    }).catch(err => {
      return { success: false, message: '网络请求失败: ' + err.message };
    });
    if (method === 'GET' && shouldCache) {
      this._pending[cacheKey] = promise;
      const result = await promise;
      delete this._pending[cacheKey];
      this._cache[cacheKey] = { ts: Date.now(), data: result };
      return result;
    }
    this._cache = {};
    return promise;
  },

  login: (username, password) => API.request('POST', '/auth/login', { username, password }),
  changePassword: (oldPassword, newPassword) => API.request('PUT', '/auth/change-password', { old_password: oldPassword, new_password: newPassword }),
  getMe: () => API.request('GET', '/auth/me'),
  getUsers: () => API.request('GET', '/auth/users'),
  createUser: (data) => API.request('POST', '/auth/users', data),
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
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fragrance_backup_${new Date().toISOString().split('T')[0].replace(/-/g,'')}.db`;
    a.click();
    URL.revokeObjectURL(url);
  }
};
