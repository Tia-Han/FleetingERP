// pages/mine/mine.js
Page({
  data: {
    userInfo: null,
    menuGroups: [
      {
        title: '业务操作',
        items: [
          { icon: '📋', text: '库存盘点', path: '/pages/inventory/inventory' },
          { icon: '🏷️', text: '商品管理', path: '/pages/products/products' },
          { icon: '🏆', text: '品牌管理', path: '/pages/brands/brands' },
          { icon: '📤', text: '出库/损耗', path: '/pages/stockOut/stockOut' },
          { icon: '📊', text: '变动流水', path: '/pages/movements/movements' },
          { icon: '👥', text: '客户', path: '/pages/customer/customer' }
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
        success: (res) => {
          if (res.confirm) {
            const app = getApp();
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
