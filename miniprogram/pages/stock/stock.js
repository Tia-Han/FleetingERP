// pages/stock/stock.js
const { get } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    list: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    searchKey: '',
    filterAlert: 'all',
    filterSpec: 'all',
    filterBrand: '',
    filterCategory: '',
    brands: [],
    categories: [],
    brandIndex: 0,
    catIndex: 0
  },

  onLoad() {
    if (!checkLogin()) return;
    this.loadBrands();
    this.loadCategories();
    this.loadList(true);
  },

  onShow() {
    if (!checkLogin()) return;
  },

  onUnload() {
    // STATE-03: 清理搜索防抖定时器
    if (this._searchTimer) clearTimeout(this._searchTimer);
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadList(true).then(() => {
      wx.stopPullDownRefresh();
    }).catch(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
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

  async loadCategories() {
    const cached = wx.getStorageSync('cache_categories');
    if (cached && Date.now() - cached.time < 300000) {
      this.setData({ categories: [{ name: '全部品类' }].concat(cached.data) });
      return;
    }
    try {
      const res = await get('/products/categories');
      const cats = res.data || [];
      wx.setStorageSync('cache_categories', { data: cats, time: Date.now() });
      this.setData({ categories: [{ name: '全部品类' }].concat(cats) });
    } catch (e) {}
  },

  async loadList(refresh = false) {
    if (this.data.loading) return;
    const page = refresh ? 1 : this.data.page;
    this.setData({ loading: true });

    try {
      const app = getApp();
      const user = app.globalData.userInfo;
      const params = {
        page: page,
        limit: this.data.pageSize
      };
      if (user && user.location_id) params.location_id = user.location_id;
      if (this.data.searchKey) params.search = this.data.searchKey;
      if (this.data.filterAlert === 'low') params.alert_type = 'low';
      if (this.data.filterAlert === 'empty') params.alert_type = 'empty';
      if (this.data.filterSpec !== 'all') params.spec_type = this.data.filterSpec;
      if (this.data.filterBrand) params.brand_id = this.data.filterBrand;
      if (this.data.filterCategory) params.category = this.data.filterCategory;

      const res = await get('/stock/balances', params);
      const data = res.data || [];
      const list = refresh ? data : this.data.list.concat(data);
      const total = res.total || 0;

      this.setData({
        list: list,
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
    // STATE-03: 使用实例变量存储定时器引用
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => {
      this.loadList(true);
    }, 500);
  },

  onAlertFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterAlert: type });
    this.loadList(true);
  },

  onSpecFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterSpec: type });
    this.loadList(true);
  },

  onBrandChange(e) {
    const idx = e.detail.value;
    const brand = this.data.brands[idx];
    this.setData({ brandIndex: idx, filterBrand: brand.id });
    this.loadList(true);
  },

  onCategoryChange(e) {
    const idx = e.detail.value;
    const cat = this.data.categories[idx];
    this.setData({ catIndex: idx, filterCategory: cat.name && cat.name !== '全部品类' ? cat.name : '' });
    this.loadList(true);
  },

  onItemTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/productDetail/productDetail?id=' + id });
  },

  getStockClass(quantity, threshold) {
    if (quantity === 0) return 'empty';
    if (threshold > 0 && quantity <= threshold) return 'warn';
    return '';
  }
});
