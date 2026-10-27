// pages/login/bind/bind.js
const { post } = require('../../../utils/request');

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    errorMessage: ''
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  async doBind() {
    const { password, loading } = this.data;
    const username = this.data.username.trim();
    if (loading) return;

    if (!username || !password) {
      this.setData({ errorMessage: '请输入用户名和密码' });
      return;
    }

    this.setData({ loading: true, errorMessage: '' });

    try {
      // 提交前重新获取 code，避免 code 过期（有效期约5分钟）
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      const code = loginRes.code;
      if (!code) throw new Error('微信授权失败，请重试');

      const res = await post('/auth/wx-bind', { code, username, password });

      if (!res || !res.data || res.data.status !== 'bound' || !res.data.token || !res.data.user) {
        throw new Error('绑定返回数据异常，请重试');
      }
      getApp().setLogin(res.data.token, res.data.user);
      await new Promise((resolve, reject) => wx.switchTab({
        url: '/pages/index/index', success: resolve,
        fail: () => reject(new Error('绑定成功，但首页打开失败，请重试登录'))
      }));
    } catch (err) {
      this.setData({ errorMessage: err.message || '绑定失败，请重试' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
