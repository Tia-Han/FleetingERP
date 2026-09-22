// pages/stockInHistory/stockInHistory.js
const { get } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    list: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    locations: [],
    locationIndex: 0,
    startDate: '',
    endDate: '',
    supplier: '',
    product: '',
    brand: '',
    operators: [],
    operatorIndex: 0,
    operatorNames: ['全部操作人']
  },

  onLoad() {
    if (!checkLogin()) return;
    
    const today = new Date();
    const endDate = today.toISOString().substring(0, 10);
    const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    
    this.setData({ startDate, endDate });
    this.loadOperators();
    this.loadLocations();
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  async loadOperators() {
    try {
      const res = await get('/system/operators');
      const operators = [''].concat(res.data || []);
      const operatorNames = operators.map(op => op || '全部操作人');
      this.setData({ operators, operatorNames });
    } catch (e) {
      console.warn('加载操作人列表失败', e);
    }
  },

  async loadLocations() {
    try {
      const res = await get('/locations');
      const locations = [{ id: '', name: '全部场所' }].concat(res.data || []);
      this.setData({ locations });
      this.loadList(true);
    } catch (e) {
      this.loadList(true);
    }
  },

  onLocationChange(e) {
    this.setData({ locationIndex: e.detail.value, page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  onOperatorChange(e) {
    this.setData({ operatorIndex: e.detail.value, page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value, page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value, page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  onSupplierInput(e) {
    this.setData({ supplier: e.detail.value });
  },

  onSupplierSearch() {
    this.setData({ page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  onProductInput(e) {
    this.setData({ product: e.detail.value });
  },

  onProductSearch() {
    this.setData({ page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  onBrandInput(e) {
    this.setData({ brand: e.detail.value });
  },

  onBrandSearch() {
    this.setData({ page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  async loadList(refresh = false) {
    if (this.data.loading) return;
    const page = refresh ? 1 : this.data.page;
    this.setData({ loading: true });

    try {
      const params = {
        page,
        limit: this.data.pageSize,
        start_date: this.data.startDate,
        end_date: this.data.endDate
      };
      const location = this.data.locations[this.data.locationIndex];
      if (location && location.id) {
        params.location_id = location.id;
      }
      const operator = this.data.operators[this.data.operatorIndex];
      if (operator) {
        params.operator = operator;
      }
      if (this.data.supplier) {
        params.supplier = this.data.supplier;
      }
      if (this.data.product) {
        params.product = this.data.product;
      }
      if (this.data.brand) {
        params.brand = this.data.brand;
      }

      const res = await get('/stock-in', params);
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
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onItemTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/stockInDetail/stockInDetail?id=' + id });
  }
});
