// pages/index/index.js
const { get } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    todaySales: 0,
    alertCount: 0,
    todoCount: 0,
    loading: true,
    networkError: false,
    gridItems: [
      { icon: '📷', text: '入库', path: '/pages/stockIn/stockIn', tab: false, iconBg: 'bg-blue' },
      { icon: '📦', text: '库存查询', path: '/pages/stock/stock', tab: true, iconBg: 'bg-green' },
      { icon: '📋', text: '库存盘点', path: '/pages/inventory/inventory', tab: false, iconBg: 'bg-purple' },
      { icon: '💰', text: '销售', path: '/pages/sale/sale', tab: true, iconBg: 'bg-yellow' },
      { icon: '🏷️', text: '商品管理', path: '/pages/products/products', tab: false, iconBg: 'bg-pink' },
      { icon: '🏆', text: '品牌管理', path: '/pages/brands/brands', tab: false, iconBg: 'bg-indigo' },
      { icon: '📤', text: '出库/损耗', path: '/pages/stockOut/stockOut', tab: false, iconBg: 'bg-orange' },
      { icon: '📊', text: '变动流水', path: '/pages/movements/movements', tab: false, iconBg: 'bg-teal' },
      { icon: '👥', text: '客户', path: '/pages/customer/customer', tab: false, iconBg: 'bg-purple-light' }
    ]
  },

  onLoad() {
    if (!checkLogin()) return;
    this.loadData();
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
    this.setData({ loading: true, networkError: false });
    try {
      const app = getApp();
      const user = app.globalData.userInfo;
      const locationId = user && user.location_id;

      let salesFailed = false;
      let alertsFailed = false;

      const [salesRes, alertsRes] = await Promise.all([
        get('/sales/summary', locationId ? { location_id: locationId } : {}).catch(() => { salesFailed = true; return null; }),
        get('/stock/alerts', locationId ? { location_id: locationId } : {}).catch(() => { alertsFailed = true; return null; })
      ]);

      // ERR-01: 所有接口失败时显示网络异常提示
      if (salesFailed && alertsFailed) {
        this.setData({ loading: false, networkError: true });
        return;
      }

      this.setData({
        todaySales: salesRes && salesRes.data ? salesRes.data.total_amount : 0,
        alertCount: alertsRes && alertsRes.data ? alertsRes.data.length : 0,
        todoCount: 0,
        loading: false
      });
    } catch (err) {
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
