// pages/login/bind/bind.js
const { post } = require('../../../utils/request');

Page({
  data: {
    username: '',
    password: '',
    loading: false,
    openid: '',
    code: ''
  },

  onLoad(options) {
    if (options.openid) {
      this.setData({ openid: options.openid, code: options.code || '' });
    }
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  async doBind() {
    const { username, password, loading } = this.data;
    if (loading) return;

    if (!username || !password) {
      wx.showToast({ title: '请输入用户名和密码', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    try {
      // 提交前重新获取 code，避免 code 过期（有效期约5分钟）
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      const code = loginRes.code;

      const res = await post('/auth/wx-bind', { code, username, password });

      if (res.data.status === 'bound') {
        const app = getApp();
        app.setLogin(res.data.token, res.data.user);
        wx.showToast({ title: '绑定成功', icon: 'success' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/index/index' });
        }, 500);
      }
    } catch (err) {
      wx.showToast({ title: err.message || '绑定失败，请重试', icon: 'none' });
    }
    this.setData({ loading: false });
  }
});
