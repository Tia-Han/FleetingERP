// utils/auth.js — CODE-01: 统一鉴权逻辑封装

function checkLogin() {
  const app = getApp();
  if (!app || !app.isLoggedIn()) {
    wx.reLaunch({ url: '/pages/login/login' });
    return false;
  }
  return true;
}

module.exports = { checkLogin };
