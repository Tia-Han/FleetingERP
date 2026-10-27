const { localDate } = require('../../utils/date');
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
    const end = localDate(today);
    const startDate = localDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000));

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
      const locations = [{ id: '', name: '全部存放位置' }].concat(res.data || []);
      this.setData({ locations });
      this.loadList(true);
    } catch (e) {
      this.loadList(true);
    }
  },

  async loadList(refresh = false) {
    if (this.data.loading && !refresh) return;
    const requestId = this._listRequestId = (this._listRequestId || 0) + 1;
    if (refresh) this.setData({ list: [], page: 1, hasMore: true });
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
      if (requestId !== this._listRequestId) return;
      const labels = { in: '添置', out: '取用', loss: '损耗', check: '盘点', check_in: '盘盈', check_out: '盘亏', transfer_in: '移入', transfer_out: '移出' };
      const refs = { stock_in: '添置记录', stock_out: '取用记录', inventory_check: '盘点调整', transfer: '位置移动' };
      const data = (res.data || []).map(item => ({ ...item,
        typeLabel: labels[item.movement_type] || '其他变动',
        refLabel: refs[item.ref_type] || '',
        quantityText: Number(item.quantity) > 0 ? '+' + item.quantity : String(item.quantity),
        quantityClass: Number(item.quantity) > 0 ? 'in' : 'out'
      }));
      const list = refresh ? data : this.data.list.concat(data);
      const total = res.total || 0;

      this.setData({
        list,
        page: page + 1,
        hasMore: page * this.data.pageSize < total,
        loading: false
      });
    } catch (err) {
      if (requestId !== this._listRequestId) return;
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
    const map = { in: '添置', out: '取用', loss: '损耗', check: '盘点', transfer: '移动', split: '分装' };
    return map[type] || type;
  },

  getTypeClass(type) {
    if (type === 'in') return 'type-in';
    if (type === 'out' || type === 'loss') return 'type-out';
    return 'type-other';
  }
});
