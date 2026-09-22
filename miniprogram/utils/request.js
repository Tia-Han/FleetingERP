// utils/request.js — 统一请求封装
const log = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;

function logError(type, detail) {
  if (log) log.error(type, detail);
}

function request(url, method = 'GET', data = {}) {
  const app = getApp();
  const token = app ? app.globalData.token : '';
  const apiBase = app ? app.globalData.apiBase : 'http://39.96.218.204:3000/api/v1';

  return new Promise((resolve, reject) => {
    wx.request({
      url: apiBase + url,
      method: method,
      data: data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? 'Bearer ' + token : '',
        'X-Client-Source': 'miniprogram'
      },
      timeout: 10000,
      success(res) {
        if (res.statusCode === 401) {
          if (app) app.clearLogin();
          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('登录已过期'));
          return;
        }
        if (res.statusCode >= 400) {
          logError('http_error', { url, status: res.statusCode });
          wx.showToast({ title: '服务异常，请稍后重试', icon: 'none' });
          reject(new Error('HTTP ' + res.statusCode));
          return;
        }
        if (res.data && res.data.success === false) {
          logError('api_error', { url, message: res.data.message });
          reject(res.data);
          return;
        }
        resolve(res.data);
      },
      fail(err) {
        logError('network_error', { url, error: err.errMsg });
        if (err.errMsg && err.errMsg.includes('timeout')) {
          wx.showToast({ title: '网络超时，请重试', icon: 'none' });
        } else {
          wx.showToast({ title: '网络不可用', icon: 'none' });
        }
        reject(err);
      }
    });
  });
}

function get(url, data) {
  return request(url, 'GET', data);
}

function post(url, data) {
  return request(url, 'POST', data);
}

function put(url, data) {
  return request(url, 'PUT', data);
}

function del(url, data) {
  return request(url, 'DELETE', data);
}

module.exports = { request, get, post, put, del };
