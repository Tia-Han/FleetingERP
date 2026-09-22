// pages/scan/scan.js
const { get } = require('../../utils/request');

Page({
  data: {
    lastScan: null,
    history: []
  },

  onLoad() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
  },

  onShow() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
    }
  },

  // 扫码入库
  async scanStockIn() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.scanCode({ scanType: ['barCode'], success: resolve, fail: reject });
      });
      const barcode = res.result;
      this.navigateWithBarcode('/pages/stockIn/stockIn', barcode);
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
      wx.showToast({ title: '扫码失败', icon: 'none' });
    }
  },

  // 扫码出库
  async scanStockOut() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.scanCode({ scanType: ['barCode'], success: resolve, fail: reject });
      });
      const barcode = res.result;
      this.navigateWithBarcode('/pages/stockOut/stockOut', barcode);
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
      wx.showToast({ title: '扫码失败', icon: 'none' });
    }
  },

  // 扫码查询
  async scanQuery() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.scanCode({ scanType: ['barCode'], success: resolve, fail: reject });
      });
      const barcode = res.result;
      try {
        const skuRes = await get('/skus/barcode/' + barcode);
        if (skuRes.data && skuRes.data.id) {
          wx.navigateTo({
            url: '/pages/productDetail/productDetail?id=' + skuRes.data.product_id
          });
        }
      } catch (err) {
        wx.showModal({
          title: '未找到商品',
          content: '条码：' + barcode + '\n未找到对应商品，请到网页版先创建商品',
          showCancel: false
        });
      }
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
      wx.showToast({ title: '扫码失败', icon: 'none' });
    }
  },

  navigateWithBarcode(path, barcode) {
    wx.navigateTo({
      url: path + '?barcode=' + encodeURIComponent(barcode)
    });
  }
});
