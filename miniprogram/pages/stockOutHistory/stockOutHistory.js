// pages/stockOutHistory/stockOutHistory.js
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
    typeFilter: 'all', // all / out / loss
    operator: ''
  },

  onLoad() {
    if (!checkLogin()) return;
    
    const today = new Date();
    const endDate = today.toISOString().substring(0, 10);
    const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
    
    this.setData({ startDate, endDate });
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

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value, page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value, page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  onTypeTap(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.typeFilter) return;
    this.setData({ typeFilter: type, page: 1, hasMore: true, list: [] });
    this.loadList(true);
  },

  onOperatorInput(e) {
    this.setData({ operator: e.detail.value });
  },

  onOperatorSearch() {
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
      if (this.data.typeFilter !== 'all') {
        params.type = this.data.typeFilter;
      }
      if (this.data.operator) {
        params.operator = this.data.operator;
      }

      const res = await get('/stock-out', params);
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

  getTypeLabel(type) {
    const map = { out: '出库', loss: '损耗' };
    return map[type] || type;
  }
});
