// pages/sale/sale.js
const { get, post } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    locations: [],
    locationIndex: 0,
    customer: null,
    showCustomerPicker: false,
    customerSearch: '',
    customerList: [],
    customerLoading: false,
    items: [],
    subtotal: 0,
    discountMode: 'percent', // percent / amount
    discountValue: '',
    discountAmount: 0,
    pointsUsed: 0,
    pointsValue: 0,
    finalAmount: 0,
    pointsEarned: 0,
    payMethod: 'wechat',
    submitting: false,
    pointsExchangeRate: 10 // CODE-02: 从接口获取
  },

  onLoad() {
    if (!checkLogin()) return;
    this.loadLocations();
    this.loadPointsConfig();
  },

  onShow() {
    checkLogin();
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

  // CODE-02: 从接口获取积分配置
  async loadPointsConfig() {
    try {
      const res = await get('/sales/config');
      if (res.data && res.data.points_exchange_rate) {
        this.setData({ pointsExchangeRate: res.data.points_exchange_rate });
      }
    } catch (e) {}
  },

  onLocationChange(e) {
    this.setData({ locationIndex: e.detail.value });
  },

  // 选客户
  openCustomerPicker() {
    this.setData({ showCustomerPicker: true, customerSearch: '', customerList: [] });
  },

  closeCustomerPicker() {
    this.setData({ showCustomerPicker: false });
  },

  onCustomerSearchInput(e) {
    const value = e.detail.value;
    this.setData({ customerSearch: value });
    if (value.trim().length === 0) {
      this.setData({ customerList: [] });
      return;
    }
    this.searchCustomers(value);
  },

  async searchCustomers(keyword) {
    this.setData({ customerLoading: true });
    try {
      const res = await get('/customers', { search: keyword });
      this.setData({ customerList: res.data || [], customerLoading: false });
    } catch (e) {
      this.setData({ customerList: [], customerLoading: false });
    }
  },

  selectCustomer(e) {
    const { customer } = e.currentTarget.dataset;
    this.setData({
      customer: customer,
      showCustomerPicker: false,
      pointsUsed: 0,
      pointsValue: 0
    });
    this.calcSummary();
  },

  clearCustomer() {
    this.setData({ customer: null, pointsUsed: 0, pointsValue: 0 });
    this.calcSummary();
  },

  // 扫码添加商品
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
        wx.showToast({ title: '该商品库存为0', icon: 'none' });
        return;
      }

      const existIdx = this.data.items.findIndex(it => it.sku_id === sku.id);
      if (existIdx >= 0) {
        const items = [...this.data.items];
        const newQty = items[existIdx].quantity + 1;
        if (newQty > currentQty) {
          wx.showToast({ title: `库存不足，仅剩${currentQty}件`, icon: 'none' });
          return;
        }
        items[existIdx].quantity = newQty;
        this.setData({ items });
        this.calcSummary();
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
        unit_price: sku.retail_price || 0,
        cost_price: sku.cost_price || 0,
        current_qty: currentQty
      };

      this.setData({ items: [...this.data.items, newItem] });
      this.calcSummary();
      wx.vibrateShort && wx.vibrateShort();
    } catch (err) {
      wx.showModal({ title: '未找到商品', content: '条码：' + barcode, showCancel: false });
    }
  },

  // 数量加减
  decreaseQty(e) {
    const { index } = e.currentTarget.dataset;
    const items = [...this.data.items];
    if (items[index].quantity > 1) {
      items[index].quantity--;
      this.setData({ items });
      this.calcSummary();
    }
  },

  increaseQty(e) {
    const { index } = e.currentTarget.dataset;
    const items = [...this.data.items];
    if (items[index].quantity < items[index].current_qty) {
      items[index].quantity++;
      this.setData({ items });
      this.calcSummary();
    } else {
      wx.showToast({ title: `库存不足，仅剩${items[index].current_qty}件`, icon: 'none' });
    }
  },

  onPriceChange(e) {
    const { index } = e.currentTarget.dataset;
    let val = parseFloat(e.detail.value) || 0;
    // ERR-02: 价格边界校验
    if (val < 0) val = 0;
    if (val > 999999) val = 999999;
    const items = [...this.data.items];
    items[index].unit_price = val;
    this.setData({ items });
    this.calcSummary();
  },

  deleteItem(e) {
    const { index } = e.currentTarget.dataset;
    const items = [...this.data.items];
    items.splice(index, 1);
    this.setData({ items });
    this.calcSummary();
    wx.showToast({ title: '已移除', icon: 'none' });
  },

  // 折扣
  onDiscountModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ discountMode: mode, discountValue: '', discountAmount: 0 });
    this.calcSummary();
  },

  onDiscountInput(e) {
    let val = e.detail.value;
    this.setData({ discountValue: val });
    let amount = 0;
    const num = parseFloat(val) || 0;
    if (this.data.discountMode === 'percent') {
      if (num > 100) num = 100;
      amount = this.data.subtotal * num / 100;
    } else {
      amount = num;
      if (amount > this.data.subtotal) amount = this.data.subtotal;
    }
    this.setData({ discountAmount: amount });
    this.calcSummary();
  },

  // 积分
  onPointsInput(e) {
    let val = parseInt(e.detail.value) || 0;
    if (val < 0) val = 0;
    const customer = this.data.customer;
    if (customer && val > customer.points) {
      val = customer.points;
      wx.showToast({ title: `积分不足，最多${customer.points}分`, icon: 'none' });
    }
    const pointsValue = Math.floor(val / this.data.pointsExchangeRate);
    this.setData({ pointsUsed: val, pointsValue });
    this.calcSummary();
  },

  // 支付方式
  onPayMethodChange(e) {
    this.setData({ payMethod: e.currentTarget.dataset.method });
  },

  // 计算汇总
  calcSummary() {
    let subtotal = 0;
    for (const item of this.data.items) {
      subtotal += item.quantity * item.unit_price;
    }

    let discountAmount = this.data.discountAmount;
    if (discountAmount > subtotal) discountAmount = subtotal;

    let pointsValue = this.data.pointsValue;
    let finalAmount = subtotal - discountAmount - pointsValue;
    if (finalAmount < 0) finalAmount = 0;

    const pointsEarned = Math.floor(finalAmount / 10);

    this.setData({ subtotal, finalAmount: finalAmount.toFixed(2), pointsEarned });
  },

  // 提交订单
  async submitOrder() {
    if (this.data.submitting) return;
    if (this.data.items.length === 0) {
      wx.showToast({ title: '请先添加商品', icon: 'none' });
      return;
    }

    const valid = this.data.items.every(it => it.quantity > 0 && it.unit_price >= 0);
    if (!valid) {
      wx.showToast({ title: '请检查商品数量和价格', icon: 'none' });
      return;
    }

    // F-01: 检查售价低于成本价
    const lowPriceItems = this.data.items.filter(it => it.cost_price > 0 && it.unit_price < it.cost_price);
    if (lowPriceItems.length > 0) {
      const confirmed = await new Promise(resolve => {
        wx.showModal({
          title: '售价低于成本价',
          content: '部分商品售价低于成本价，确认继续？',
          success: (res) => resolve(res.confirm)
        });
      });
      if (!confirmed) return;
    }

    const app = getApp();
    const user = app.globalData.userInfo;
    const location = this.data.locations[this.data.locationIndex];

    wx.showModal({
      title: '确认提交订单',
      content: `实付金额 ¥${this.data.finalAmount}`,
      success: async (res) => {
        if (!res.confirm) return;

        this.setData({ submitting: true });
        try {
          const saleData = {
            location_id: location.id,
            customer_id: this.data.customer ? this.data.customer.id : null,
            items: this.data.items.map(it => ({
              sku_id: it.sku_id,
              quantity: it.quantity,
              unit_price: it.unit_price
            })),
            discount: this.data.discountAmount,
            points_used: this.data.pointsUsed,
            payments: [{
              method: this.data.payMethod,
              amount: parseFloat(this.data.finalAmount)
            }],
            operator: user ? user.name : '',
            remark: ''
          };

          await post('/sales', saleData);

          wx.showToast({
            title: `销售成功 +${this.data.pointsEarned}积分`,
            icon: 'success',
            duration: 2000
          });

          // 清空订单
          this.setData({
            items: [],
            subtotal: 0,
            discountValue: '',
            discountAmount: 0,
            pointsUsed: 0,
            pointsValue: 0,
            finalAmount: 0,
            pointsEarned: 0
          });

          // 刷新客户积分
          if (this.data.customer) {
            try {
              const cusRes = await get('/customers/' + this.data.customer.id);
              if (cusRes.data) {
                this.setData({ customer: cusRes.data });
              }
            } catch (e) {}
          }

        } catch (err) {
          wx.showToast({ title: err.message || '下单失败', icon: 'none' });
        }
        this.setData({ submitting: false });
      }
    });
  }
});
