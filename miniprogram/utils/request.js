// utils/request.js — 统一请求封装
const log = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;

function logError(type, detail) {
  if (log) log.error(type, detail);
}

function send(url, method = 'GET', data = {}, requestKey) {
  const app = getApp();
  const token = app ? app.globalData.token : '';
  const apiBase = app && app.globalData.apiBase;
  if (!apiBase) return Promise.reject(new Error('接口环境未初始化，停止连接'));

  return new Promise((resolve, reject) => {
    wx.request({
      url: apiBase + url,
      method: method,
      data: data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? 'Bearer ' + token : '',
        'X-Client-Source': 'miniprogram',
        ...(requestKey ? {'Idempotency-Key':requestKey} : {})
      },
      timeout: 10000,
      success(res) {
        if(app && app.globalData.token !== token) { reject({uncertain:true,message:'登录状态已改变，请核实原操作结果'}); return; }
        if (res.statusCode === 401) {
          if (app) app.clearLogin();
          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('登录已过期'));
          return;
        }
        if (res.statusCode >= 400) {
          logError('http_error', { url, status: res.statusCode });
          const message = res.data && res.data.message || '服务异常，请稍后重试';
          wx.showToast({ title: message, icon: 'none' });
          reject(Object.assign(new Error(message),{uncertain:res.statusCode>=500}));
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
        err.uncertain=true;
        reject(err);
      }
    });
  });
}

const pending=new Map();
function request(url,method='GET',data={}) {
  if(method!=='POST'||url.startsWith('/auth/')) return send(url,method,data);
  const app=getApp();
  const fingerprint=JSON.stringify([app.globalData.userInfo?.id,url,data]);
  if(pending.has(fingerprint)) return pending.get(fingerprint);
  let a=2166136261,b=5381;
  for(const c of fingerprint){a=Math.imul(a^c.charCodeAt(0),16777619);b=Math.imul(b,33)^c.charCodeAt(0);}
  const storageKey=app.globalData.apiBase+'-pending-write-'+(a>>>0).toString(16)+'-'+(b>>>0).toString(16);
  let key=wx.getStorageSync(storageKey);
  if(!key) {key=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)+'-'+Math.random().toString(36).slice(2);wx.setStorageSync(storageKey,key);}
  const promise=send(url,method,data,key).then(result=>{wx.removeStorageSync(storageKey);return result;},error=>{if(!error.uncertain) wx.removeStorageSync(storageKey);throw error;}).finally(()=>pending.delete(fingerprint));
  pending.set(fingerprint,promise);
  return promise;
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
