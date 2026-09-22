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
      const product = res.data || {};
      const rawSkus = product.skus || [];
      // 后端返回 volume 字段，前端模板使用 volume_desc，做映射
      const skus = rawSkus.map(sku => ({
        ...sku,
        volume_desc: sku.volume_desc || sku.volume || ''
      }));
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
