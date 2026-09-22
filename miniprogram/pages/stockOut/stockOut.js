// pages/stockOut/stockOut.js
const { get, post } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    locations: [],
    locationIndex: 0,
    outType: 'out', // out / loss
    remark: '',
    items: [],
    totalQty: 0,
    submitting: false
  },

  onLoad(options) {
    if (!checkLogin()) return;

    this.loadLocations().then(() => {
      if (options.barcode) {
        this.addSkuByBarcode(options.barcode);
      }
    });
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
    } catch (e) {
      wx.showToast({ title: '场所加载失败', icon: 'none' });
    }
  },

  onLocationChange(e) {
    this.setData({ locationIndex: e.detail.value });
  },

  onTypeTap(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.outType) return;
    if (this.data.items.length > 0) {
      wx.showModal({
        title: '切换类型',
        content: '切换类型将清空已添加的商品，确认切换？',
        success: (res) => {
          if (res.confirm) {
            this.setData({ outType: type, items: [], totalQty: 0 });
            wx.showToast({ title: '已切换类型', icon: 'none' });
          }
        }
      });
    } else {
      this.setData({ outType: type });
    }
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 扫码添加
  async scanAdd() {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.scanCode({ scanType: ['barCode'], success: resolve, fail: reject });
      });
      await this.addSkuByBarcode(res.result);
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
      wx.showToast({ title: '扫码失败', icon: 'none' });
    }
  },

  async addSkuByBarcode(barcode) {
    try {
      const res = await get('/skus/barcode/' + barcode);
      const sku = res.data;
      if (!sku || !sku.id) {
        wx.showModal({ title: '未找到商品', content: '条码：' + barcode, showCancel: false });
        return;
      }

      const locationId = this.data.locations[this.data.locationIndex]?.id;
      let currentQty = 0;
      try {
        const balRes = await get('/stock/balances', { sku_id: sku.id, location_id: locationId });
        if (balRes.data && balRes.data[0]) {
          currentQty = balRes.data[0].quantity;
        }
      } catch (e) {}

      if (currentQty === 0) {
        wx.showToast({ title: '该商品当前库存为0', icon: 'none' });
        return;
      }

      const existIdx = this.data.items.findIndex(it => it.sku_id === sku.id);
      if (existIdx >= 0) {
        const items = [...this.data.items];
        const newQty = items[existIdx].quantity + 1;
        if (newQty > currentQty) {
          wx.showToast({ title: `库存不足，当前仅${currentQty}件`, icon: 'none' });
          return;
        }
        items[existIdx].quantity = newQty;
        this.setData({ items });
        this.calcTotal();
        wx.showToast({ title: '已存在，数量+1', icon: 'none' });
        return;
      }

      const newItem = {
        sku_id: sku.id,
        product_name: sku.product_name,
        brand_name: sku.brand_name,
        volume: sku.volume,
        spec_type: sku.spec_type,
        quantity: 1,
        current_qty: currentQty,
        out_type: this.data.outType,
        remark: ''
      };

      this.setData({ items: [...this.data.items, newItem] });
      this.calcTotal();
      wx.vibrateShort && wx.vibrateShort();
    } catch (err) {
      wx.showModal({ title: '未找到商品', content: '条码：' + barcode, showCancel: false });
    }
  },

  onQtyChange(e) {
    const { index } = e.currentTarget.dataset;
    let val = parseInt(e.detail.value) || 0;
    if (val < 0) val = 0;
    const item = this.data.items[index];
    if (val > item.current_qty) {
      val = item.current_qty;
      wx.showToast({ title: `不能超过当前库存${item.current_qty}`, icon: 'none' });
    }
    const items = [...this.data.items];
    items[index].quantity = val;
    this.setData({ items });
    this.calcTotal();
  },

  onItemTypeChange(e) {
    const { index, type } = e.currentTarget.dataset;
    const items = [...this.data.items];
    items[index].out_type = type;
    this.setData({ items });
  },

  deleteItem(e) {
    const { index } = e.currentTarget.dataset;
    const items = [...this.data.items];
    items.splice(index, 1);
    this.setData({ items });
    this.calcTotal();
    wx.showToast({ title: '已移除', icon: 'none' });
  },

  calcTotal() {
    let totalQty = 0;
    for (const item of this.data.items) {
      totalQty += item.quantity;
    }
    this.setData({ totalQty });
  },

  async submitStockOut() {
    if (this.data.submitting) return;
    if (this.data.items.length === 0) {
      wx.showToast({ title: '请先添加商品', icon: 'none' });
      return;
    }

    const valid = this.data.items.every(it => it.quantity > 0 && it.quantity <= it.current_qty);
    if (!valid) {
      wx.showToast({ title: '数量需大于0且不超过库存', icon: 'none' });
      return;
    }

    const app = getApp();
    const user = app.globalData.userInfo;
    const location = this.data.locations[this.data.locationIndex];
    const typeLabel = this.data.outType === 'loss' ? '损耗' : '出库';

    wx.showModal({
      title: `确认${typeLabel}`,
      content: `共 ${this.data.totalQty} 件商品`,
      success: async (res) => {
        if (!res.confirm) return;

        this.setData({ submitting: true });
        try {
          await post('/stock-out/batch', {
            location_id: location.id,
            out_type: this.data.outType,
            remark: this.data.remark,
            operator: user ? user.name : '',
            items: this.data.items.map(it => ({
              sku_id: it.sku_id,
              quantity: it.quantity,
              type: it.out_type,
              remark: it.remark
            }))
          });

          wx.showToast({ title: `${typeLabel}成功`, icon: 'success' });
          this.setData({
            items: [],
            totalQty: 0,
            remark: ''
          });
          // STATE-01: 刷新上一页数据
          const pages = getCurrentPages();
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.loadList) {
            prevPage.loadList(true);
          }
          setTimeout(() => {
            wx.navigateBack();
          }, 1000);
        } catch (err) {
          wx.showToast({ title: err.message || `${typeLabel}失败`, icon: 'none' });
        }
        this.setData({ submitting: false });
      }
    });
  }
});
