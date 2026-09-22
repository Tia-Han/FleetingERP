// app.js — 全局逻辑：登录态管理、request 封装入口
const { request } = require('./utils/request');

// SEC-03: Token 简单混淆存储
function encodeToken(token) {
  try {
    return wx.arrayBufferToBase64(stringToBuffer(token)).split('').reverse().join('');
  } catch (e) { return token; }
}

function decodeToken(stored) {
  try {
    return bufferToString(wx.base64ToArrayBuffer(stored.split('').reverse().join('')));
  } catch (e) { return stored; }
}

function stringToBuffer(str) {
  const buf = new ArrayBuffer(str.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i);
  return buf;
}

function bufferToString(buf) {
  const view = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < view.length; i++) str += String.fromCharCode(view[i]);
  return str;
}

// MNT-04: 环境配置统一管理
const ENV_CONFIG = {
  development: { apiBase: 'http://localhost:3000/api/v1' },
  production: { apiBase: 'http://39.96.218.204:3000/api/v1' }
};
const currentEnv = 'production';

App({
  globalData: {
    token: '',
    userInfo: null,
    apiBase: ENV_CONFIG[currentEnv].apiBase
  },

  onLaunch() {
    // MNT-03: 检测小程序更新
    const updateManager = wx.getUpdateManager && wx.getUpdateManager();
    if (updateManager) {
      updateManager.onCheckForUpdate(() => {});
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已就绪，是否重启应用？',
          success(res) {
            if (res.confirm) updateManager.applyUpdate();
          }
        });
      });
    }

    const stored = wx.getStorageSync('t');
    const userInfo = wx.getStorageSync('userInfo');
    if (stored) {
      this.globalData.token = decodeToken(stored);
      this.globalData.userInfo = userInfo;
    }
  },

  isLoggedIn() {
    return !!this.globalData.token;
  },

  setLogin(token, user) {
    this.globalData.token = token;
    this.globalData.userInfo = user;
    wx.setStorageSync('t', encodeToken(token));
    wx.setStorageSync('userInfo', user);
  },

  clearLogin() {
    this.globalData.token = '';
    this.globalData.userInfo = null;
    wx.removeStorageSync('t');
    wx.removeStorageSync('userInfo');
  }
});
