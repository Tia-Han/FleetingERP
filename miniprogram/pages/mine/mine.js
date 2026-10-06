// pages/mine/mine.js
const { post } = require('../../utils/request');
Page({
  data: {
    userInfo: null,
    menuGroups: [
      {
        title: '物品操作',
        items: [
          { icon: '📋', text: '物品盘点', path: '/pages/inventory/inventory' },
          { icon: '🏷️', text: '物品资料', path: '/pages/products/products' },
          { icon: '🏆', text: '品牌管理', path: '/pages/brands/brands' },
          { icon: '📤', text: '取用/损耗', path: '/pages/stockOut/stockOut' },
          { icon: '📊', text: '变动流水', path: '/pages/movements/movements' },
        ]
      },
      {
        title: '其他',
        items: [
          { icon: '⚙️', text: '设置', path: '' },
          { icon: '🚪', text: '退出登录', path: '', action: 'logout', danger: true }
        ]
      }
    ]
  },

  onLoad() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ userInfo: app.globalData.userInfo });
  },

  onShow() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ userInfo: app.globalData.userInfo });
  },

  onMenuTap(e) {
    const { path, action, danger } = e.currentTarget.dataset;

    if (action === 'logout') {
      wx.showModal({
        title: '退出登录',
        content: '确认退出登录？',
        success: async (res) => {
          if (res.confirm) {
            const app = getApp();
            try { await post('/auth/logout'); }
            catch (e) { wx.showToast({title:'退出未完成，请重试', icon:'none'}); return; }
            app.clearLogin();
            wx.reLaunch({ url: '/pages/login/login' });
          }
        }
      });
      return;
    }

    if (path) {
      wx.navigateTo({ url: path });
    } else {
      wx.showToast({ title: '功能开发中', icon: 'none' });
    }
  },

  getInitial(name) {
    if (!name) return '?';
    return name.charAt(0);
  }
});
