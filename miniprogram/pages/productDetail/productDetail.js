// pages/productDetail/productDetail.js
const { get, del } = require('../../utils/request');

Page({
  data: {
    product: null,
    skus: [],
    loading: true,
    productId: ''
  },

  onLoad(options) {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ productId: options.id });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await get('/products/' + this.data.productId);
      const data = res.data || {};
      // 兼容两种返回格式：直接 product 对象 或 { product, skus }
      const product = data.product || data;
      const skus = data.skus || product.skus || [];
      this.setData({ product, skus, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/productForm/productForm?id=' + this.data.productId });
  },

  onSkuTap(e) {
    const { skuId } = e.currentTarget.dataset;
    wx.showToast({ title: 'SKU详情开发中', icon: 'none' });
  }
});
