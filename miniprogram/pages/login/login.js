// pages/login/login.js
const { post } = require('../../utils/request');

Page({
  data: {
    loading: false
  },

  onLoad() {
    const app = getApp();
    if (app.isLoggedIn()) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  // 微信一键登录
  async wxLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });

      if (!loginRes.code) {
        wx.showToast({ title: '微信授权失败，请重试', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const res = await post('/auth/wx-login', { code: loginRes.code });

      if (res.data.status === 'bound') {
        const app = getApp();
        app.setLogin(res.data.token, res.data.user);
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 500);
      } else if (res.data.status === 'unbound') {
        wx.navigateTo({
          url: '/pages/login/bind/bind?openid=' + res.data.openid + '&code=' + loginRes.code
        });
      }
    } catch (err) {
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
    }
    this.setData({ loading: false });
  },

  // 跳转账号绑定
  goBind() {
    wx.navigateTo({ url: '/pages/login/bind/bind' });
  }
});
