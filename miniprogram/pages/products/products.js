// pages/products/products.js
const { get, del } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    list: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    searchKey: '',
    filterBrand: '',
    brands: [],
    brandIndex: 0
  },

  onLoad() {
    if (!checkLogin()) return;
    this.loadBrands();
    this.loadList(true);
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  // PERF-04: 品牌列表本地缓存
  async loadBrands() {
    const cached = wx.getStorageSync('cache_brands');
    if (cached && Date.now() - cached.time < 300000) {
      this.setData({ brands: [{ id: '', name: '全部品牌' }].concat(cached.data) });
      return;
    }
    try {
      const res = await get('/brands');
      const brands = res.data || [];
      wx.setStorageSync('cache_brands', { data: brands, time: Date.now() });
      this.setData({ brands: [{ id: '', name: '全部品牌' }].concat(brands) });
    } catch (e) {}
  },

  async loadList(refresh = false) {
    if (this.data.loading) return;
    const page = refresh ? 1 : this.data.page;
    this.setData({ loading: true });

    try {
      const params = { page, limit: this.data.pageSize };
      if (this.data.searchKey) params.search = this.data.searchKey;
      if (this.data.filterBrand) params.brand_id = this.data.filterBrand;

      const res = await get('/products', params);
      const data = res.data || [];
      const list = refresh ? data : this.data.list.concat(data);
      const total = res.total || 0;

      this.setData({
        list,
        page: page + 1,
        hasMore: page * this.data.pageSize < total,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  onSearchInput(e) {
    const value = e.detail.value;
    this.setData({ searchKey: value });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.loadList(true), 500);
  },

  onBrandChange(e) {
    const idx = e.detail.value;
    const brand = this.data.brands[idx];
    this.setData({ brandIndex: idx, filterBrand: brand.id });
    this.loadList(true);
  },

  onItemTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/productDetail/productDetail?id=' + id });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/productForm/productForm' });
  },

  goEdit(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/productForm/productForm?id=' + id });
  }
});
