// pages/inventory/inventory.js
const { get, post } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    locations: [],
    locationIndex: 0,
    items: [],
    loading: false,
    loaded: false,
    diffCount: 0,
    gainCount: 0,
    lossCount: 0,
    submitting: false,
    page: 1,
    pageSize: 50,
    hasMore: true,
    searchKey: '',
    total: 0
  },

  onLoad() {
    if (!checkLogin()) return;
    this.loadLocations();
  },

  onPullDownRefresh() {
    if (this.data.loaded) {
      this.loadStock(true).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
    } else {
      wx.stopPullDownRefresh();
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadStock(false);
    }
  },

  async loadLocations() {
    try {
      const res = await get('/locations');
      const locations = res.data || [];
      const app = getApp();
      const user = app.globalData.userInfo;
      let locationIndex = 0;
      if (user && user.location_id) {
        const idx = locations.findIndex(l => l.id === user.location_id);
        if (idx >= 0) locationIndex = idx;
      }
      this.setData({ locations, locationIndex });
      this.loadStock(true);
    } catch (e) {
      wx.showToast({ title: '场所加载失败', icon: 'none' });
    }
  },

  onLocationChange(e) {
    this.setData({ locationIndex: e.detail.value, loaded: false, items: [], page: 1, hasMore: true });
    this.loadStock(true);
  },

  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value, page: 1, hasMore: true });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.loadStock(true), 500);
  },

  // PERF-01: 分页加载库存，避免一次性加载全部数据
  async loadStock(refresh = false) {
    const location = this.data.locations[this.data.locationIndex];
    if (!location) return;

    const page = refresh ? 1 : this.data.page;
    this.setData({ loading: true });

    try {
      const params = {
        location_id: location.id,
        page: page,
        limit: this.data.pageSize
      };
      if (this.data.searchKey) params.search = this.data.searchKey;

      const res = await get('/stock/balances', params);
      const data = res.data || [];
      const newItems = data.map(d => ({
        sku_id: d.sku_id,
        product_name: d.product_name,
        brand_name: d.brand_name,
        volume: d.volume,
        spec_type: d.spec_type,
        barcode: d.barcode,
        system_qty: d.quantity,
        actual_qty: d.quantity,
        diff: 0,
        is_low_stock: d.is_low_stock
      }));

      const items = refresh ? newItems : this.data.items.concat(newItems);
      this.setData({
        items,
        loaded: true,
        loading: false,
        page: page + 1,
        hasMore: data.length === this.data.pageSize,
        total: res.total || 0
      });
      this.calcDiff();
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '库存加载失败', icon: 'none' });
    }
  },

  // 扫码定位
  async scanLocate() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.scanCode({ scanType: ['barCode'], success: resolve, fail: reject });
      });
      const barcode = res.result;
      const idx = this.data.items.findIndex(it => it.barcode === barcode);
      if (idx >= 0) {
        // 滚动到对应位置并高亮
        wx.pageScrollTo({
          selector: '#item-' + idx,
          duration: 300
        });
        const items = [...this.data.items];
        items[idx].highlight = true;
        this.setData({ items });
        setTimeout(() => {
          items[idx].highlight = false;
          this.setData({ items });
        }, 1000);
      } else {
        wx.showToast({ title: '该条码不在当前库存中', icon: 'none' });
      }
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
      wx.showToast({ title: '扫码失败', icon: 'none' });
    }
  },

  onActualQtyInput(e) {
    const { index } = e.currentTarget.dataset;
    let val = parseInt(e.detail.value);
    if (isNaN(val) || val < 0) val = 0;
    if (val > 9999) val = 9999;

    const items = [...this.data.items];
    items[index].actual_qty = val;
    items[index].diff = val - items[index].system_qty;
    this.setData({ items });
    this.calcDiff();
  },

  // 全部填系统数
  fillAllSystem() {
    const items = this.data.items.map(it => ({
      ...it,
      actual_qty: it.system_qty,
      diff: 0
    }));
    this.setData({ items });
    this.calcDiff();
    wx.showToast({ title: '已重置为系统数量', icon: 'success' });
  },

  calcDiff() {
    let diffCount = 0;
    let gainCount = 0;
    let lossCount = 0;
    for (const item of this.data.items) {
      if (item.diff !== 0) {
        diffCount++;
        if (item.diff > 0) gainCount++;
        else lossCount++;
      }
    }
    this.setData({ diffCount, gainCount, lossCount });
  },

  async submitCheck() {
    if (this.data.submitting) return;
    if (!this.data.loaded || this.data.items.length === 0) {
      wx.showToast({ title: '请先加载库存', icon: 'none' });
      return;
    }

    const diffItems = this.data.items.filter(it => it.diff !== 0);
    if (diffItems.length === 0) {
      wx.showToast({ title: '没有差异项，无需提交', icon: 'none' });
      return;
    }

    const app = getApp();
    const user = app.globalData.userInfo;
    const location = this.data.locations[this.data.locationIndex];

    wx.showModal({
      title: '确认提交盘点',
      content: `共 ${diffItems.length} 项差异\n盘盈 ${this.data.gainCount} 项\n盘亏 ${this.data.lossCount} 项`,
      success: async (res) => {
        if (!res.confirm) return;

        this.setData({ submitting: true });
        try {
          await post('/stock/check', {
            location_id: location.id,
            operator: user ? user.name : '',
            items: diffItems.map(it => ({
              sku_id: it.sku_id,
              actual_quantity: it.actual_qty
            }))
          });

          wx.showToast({ title: '盘点完成', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 1000);
        } catch (err) {
          wx.showToast({ title: err.message || '提交失败', icon: 'none' });
        }
        this.setData({ submitting: false });
      }
    });
  }
});
