// pages/login/login.js
const { post } = require('../../utils/request');

Page({
  data: {
    localDevelopment: false,
    loading: false,
    username: '',
    password: ''
  },

  onLoad() {
    const app = getApp();
    this.setData({ localDevelopment: app.globalData.localDevelopment === true });
    if (app.isLoggedIn()) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  // 账号密码登录
  async accountLogin() {
    if (!getApp().globalData.localDevelopment) return;
    const { username, password, loading } = this.data;
    if (loading) return;

    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      const res = await post('/auth/login', { username, password });

      if (res.data && res.data.token) {
        const app = getApp();
        app.setLogin(res.data.token, res.data.user);
        wx.showToast({ title: '登录成功', icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 500);
      } else {
        wx.showToast({ title: '登录失败，返回数据异常', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: err.message || '登录失败，请重试', icon: 'none' });
    }
    this.setData({ loading: false });
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
