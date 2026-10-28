// pages/login/login.js
const { post } = require('../../utils/request');

Page({
  data: {
    localDevelopment: false,
    loading: false,
    errorMessage: '',
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

  // Keep failures visible and always release the submit lock.
  async accountLogin(e) {
    if (this.data.loading) return;
    this.setData({ errorMessage: '' });
    if (!getApp().globalData.localDevelopment) {
      this.setData({ errorMessage: '当前环境不支持测试账号登录，请重新编译后使用微信登录' });
      return;
    }
    // Read the submitted controls even when input events lag behind autofill/paste.
    const values = e && e.detail && e.detail.value;
    const credentials = values && typeof values === 'object' ? values : this.data;
    const username = typeof credentials.username === 'string' ? credentials.username.trim() : '';
    const password = typeof credentials.password === 'string' ? credentials.password : '';
    if (!username || !password) {
      this.setData({ errorMessage: '请输入用户名和密码' });
      return;
    }
    this.setData({ loading: true });
    try {
      const res = await post('/auth/login', { username, password });
      if (!res || !res.data || !res.data.token || !res.data.user) {
        throw new Error('登录返回数据异常，请重试');
      }
      getApp().setLogin(res.data.token, res.data.user);
      await new Promise((resolve, reject) => wx.switchTab({
        url: '/pages/index/index', success: resolve,
        fail: () => reject(new Error('登录成功，但首页打开失败，请重新编译后重试'))
      }));
    } catch (err) {
      this.setData({ errorMessage: err.message || '登录失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 微信一键登录
  async wxLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true, errorMessage: '' });
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      if (!loginRes.code) throw new Error('微信授权失败，请重试');
      const res = await post('/auth/wx-login', { code: loginRes.code });
      if (res && res.data && res.data.status === 'bound' && res.data.token && res.data.user) {
        getApp().setLogin(res.data.token, res.data.user);
        await new Promise((resolve, reject) => wx.switchTab({
          url: '/pages/index/index', success: resolve,
          fail: () => reject(new Error('登录成功，但首页打开失败，请重试'))
        }));
      } else if (res && res.data && res.data.status === 'unbound') {
        await new Promise((resolve, reject) => wx.navigateTo({
          url: '/pages/login/bind/bind', success: resolve,
          fail: () => reject(new Error('账号绑定页面打开失败，请重试'))
        }));
      } else {
        throw new Error('登录返回数据异常，请重试');
      }
    } catch (err) {
      this.setData({ errorMessage: err.message || '微信登录失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  },

  // 跳转账号绑定
  goBind() {
    wx.navigateTo({ url: '/pages/login/bind/bind' });
  }
});
