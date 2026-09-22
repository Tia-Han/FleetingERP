// pages/movements/movements.js
const { get } = require('../../utils/request');

Page({
  data: {
    list: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    typeFilter: 'all',
    locations: [],
    locationIndex: 0,
    startDate: '',
    endDate: ''
  },

  onLoad() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    const today = new Date();
    const end = today.toISOString().substring(0, 10);
    const startDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);

    this.setData({ startDate, endDate: end });
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
      if (this.data.locations[this.data.locationIndex]?.id) {
        params.location_id = this.data.locations[this.data.locationIndex].id;
      }
      if (this.data.typeFilter !== 'all') {
        params.movement_type = this.data.typeFilter;
      }

      const res = await get('/stock/movements', params);
      const data = res.data || [];
      const list = refresh ? data : this.data.list.concat(data);

      this.setData({
        list,
        page: page + 1,
        hasMore: data.length === this.data.pageSize,
        loading: false
      });
    } catch (err) {
      this.setData({ loading: false });
    }
  },

  onTypeTap(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ typeFilter: type });
    this.loadList(true);
  },

  onLocationChange(e) {
    this.setData({ locationIndex: e.detail.value });
    this.loadList(true);
  },

  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
    this.loadList(true);
  },

  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    this.loadList(true);
  },

  getTypeLabel(type) {
    const map = { in: '入库', out: '出库', loss: '损耗', check: '盘点', transfer: '调拨', split: '分装' };
    return map[type] || type;
  },

  getTypeClass(type) {
    if (type === 'in') return 'type-in';
    if (type === 'out' || type === 'loss') return 'type-out';
    return 'type-other';
  }
});
