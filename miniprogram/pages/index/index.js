// pages/index/index.js
const { get } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    itemCount: 0,
    alertCount: 0,
    userName: '',
    loading: true,
    networkError: false,
    gridItems: [
      { icon: '📷', text: '添置', path: '/pages/stockIn/stockIn', tab: false, iconBg: 'bg-blue' },
      { icon: '📦', text: '物品清单', path: '/pages/stock/stock', tab: true, iconBg: 'bg-green' },
      { icon: '📋', text: '物品盘点', path: '/pages/inventory/inventory', tab: false, iconBg: 'bg-purple' },
      { icon: '🏷️', text: '物品资料', path: '/pages/products/products', tab: false, iconBg: 'bg-pink' },
      { icon: '🏆', text: '品牌管理', path: '/pages/brands/brands', tab: false, iconBg: 'bg-indigo' },
      { icon: '📤', text: '取用/损耗', path: '/pages/stockOut/stockOut', tab: false, iconBg: 'bg-orange' },
      { icon: '📊', text: '变动流水', path: '/pages/movements/movements', tab: false, iconBg: 'bg-teal' },
    ]
  },

  onLoad() {
    if (!checkLogin()) return;
  },

  onShow() {
    if (checkLogin()) {
      this.loadData();
    }
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadData() {
    const requestId = this._requestId = (this._requestId || 0) + 1;
    this.setData({ loading: true, networkError: false, itemCount: null, alertCount: null });
    try {
      const app = getApp();
      const user = app.globalData.userInfo;
      const locationId = user && user.location_id;
      this.setData({ userName: user && (user.name || user.username) || '用户' });

      let itemsFailed = false;
      let alertsFailed = false;

      const [itemsRes, alertsRes] = await Promise.all([
        get('/stock/balances', { ...(locationId ? { location_id: locationId } : {}), page: 1, limit: 1 }).catch(() => { itemsFailed = true; return null; }),
        get('/stock/alerts', locationId ? { location_id: locationId } : {}).catch(() => { alertsFailed = true; return null; })
      ]);

      if (requestId !== this._requestId) return;
      // ERR-01: 所有接口失败时显示网络异常提示
      if (itemsFailed && alertsFailed) {
        this.setData({ loading: false, networkError: true });
        return;
      }

      this.setData({
        itemCount: itemsRes && itemsRes.data ? itemsRes.total : null,
        alertCount: alertsRes && alertsRes.data ? alertsRes.data.length : null,
        networkError: itemsFailed || alertsFailed,
        loading: false
      });
    } catch (err) {
      if (requestId !== this._requestId) return;
      this.setData({ loading: false, networkError: true });
    }
  },

  onRetry() {
    this.loadData();
  },

  onGridTap(e) {
    const { path, tab } = e.currentTarget.dataset;
    if (tab) {
      wx.switchTab({ url: path });
    } else {
      wx.navigateTo({ url: path });
    }
  }
});
