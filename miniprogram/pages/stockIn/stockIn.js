// pages/stockIn/stockIn.js
const { get, post } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    locations: [],
    locationIndex: 0,
    stockInDate: '',
    supplier: '',
    remark: '',
    items: [],
    totalQty: 0,
    totalCost: 0,
    submitting: false
  },

  onLoad(options) {
    if (!checkLogin()) return;

    const today = new Date().toISOString().substring(0, 10);
    this.setData({ stockInDate: today });

    this.loadLocations().then(() => {
      // 如果从扫码跳转过来，自动添加商品
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

  onDateChange(e) {
    this.setData({ stockInDate: e.detail.value });
  },

  onSupplierInput(e) {
    this.setData({ supplier: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 跳转到历史记录
  goToHistory() {
    wx.navigateTo({ url: '/pages/stockInHistory/stockInHistory' });
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
        wx.showModal({
          title: '未找到商品',
          content: '条码：' + barcode + '\n未找到对应商品，请到网页版先创建商品',
          showCancel: false
        });
        return;
      }

      // 检查是否已存在
      const existIdx = this.data.items.findIndex(it => it.sku_id === sku.id);
      if (existIdx >= 0) {
        const items = [...this.data.items];
        items[existIdx].quantity += 1;
        this.setData({ items });
        this.calcTotal();
        wx.showToast({ title: '已存在，数量+1', icon: 'none' });
        return;
      }

      const locationId = this.data.locations[this.data.locationIndex]?.id;
      // 查询当前库存
      let currentQty = 0;
      try {
        const balRes = await get('/stock/balances', { sku_id: sku.id, location_id: locationId });
        if (balRes.data && balRes.data[0]) {
          currentQty = balRes.data[0].quantity;
        }
      } catch (e) {}

      const newItem = {
        sku_id: sku.id,
        sku_code: sku.sku_code,
        barcode: sku.barcode,
        product_name: sku.product_name,
        brand_name: sku.brand_name,
        volume: sku.volume,
        spec_type: sku.spec_type,
        quantity: 1,
        unit_cost: sku.cost_price || 0,
        current_qty: currentQty
      };

      this.setData({ items: [...this.data.items, newItem] });
      this.calcTotal();
      wx.vibrateShort && wx.vibrateShort();
    } catch (err) {
      wx.showModal({
        title: '未找到商品',
        content: '条码：' + barcode + '\n未找到对应商品',
        showCancel: false
      });
    }
  },

  onQtyChange(e) {
    const { index } = e.currentTarget.dataset;
    let val = parseInt(e.detail.value) || 0;
    if (val < 0) val = 0;
    if (val > 9999) val = 9999;
    const items = [...this.data.items];
    items[index].quantity = val;
    this.setData({ items });
    this.calcTotal();
  },

  onCostChange(e) {
    const { index } = e.currentTarget.dataset;
    let val = parseFloat(e.detail.value) || 0;
    // ERR-02: 入库单价边界校验
    if (val < 0) val = 0;
    if (val > 999999) val = 999999;
    const items = [...this.data.items];
    items[index].unit_cost = val;
    this.setData({ items });
    this.calcTotal();
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
    let totalCost = 0;
    for (const item of this.data.items) {
      totalQty += item.quantity;
      totalCost += item.quantity * item.unit_cost;
    }
    this.setData({ totalQty, totalCost: totalCost.toFixed(2) });
  },

  async submitStockIn() {
    if (this.data.submitting) return;
    if (this.data.items.length === 0) {
      wx.showToast({ title: '请先添加商品', icon: 'none' });
      return;
    }

    const valid = this.data.items.every(it => it.quantity > 0);
    if (!valid) {
      wx.showToast({ title: '数量必须大于0', icon: 'none' });
      return;
    }

    const app = getApp();
    const user = app.globalData.userInfo;
    const location = this.data.locations[this.data.locationIndex];

    wx.showModal({
      title: '确认入库',
      content: `共 ${this.data.totalQty} 件商品，合计 ¥${this.data.totalCost}`,
      success: async (res) => {
        if (!res.confirm) return;

        this.setData({ submitting: true });
        try {
          await post('/stock-in', {
            location_id: location.id,
            supplier: this.data.supplier,
            remark: this.data.remark,
            stock_in_date: this.data.stockInDate,
            operator: user ? user.name : '',
            items: this.data.items.map(it => ({
              sku_id: it.sku_id,
              quantity: it.quantity,
              unit_cost: it.unit_cost
            }))
          });

          wx.showToast({ title: '入库成功', icon: 'success' });
          this.setData({
            items: [],
            totalQty: 0,
            totalCost: 0,
            supplier: '',
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
          wx.showToast({ title: err.message || '入库失败', icon: 'none' });
        }
        this.setData({ submitting: false });
      }
    });
  }
});
