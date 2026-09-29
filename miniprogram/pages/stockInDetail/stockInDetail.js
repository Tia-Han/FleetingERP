// pages/stockInDetail/stockInDetail.js
const { get } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    order: null,
    items: [],
    loading: true
  },

  onLoad(options) {
    if (!checkLogin()) return;
    this.orderId = options.id;
    this.transfer = options.type === 'transfer_in';
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      const res = await get((this.transfer ? '/transfer/' : '/stock-in/') + this.orderId);
      const order = {...(res.data || {}),is_transfer:this.transfer};
      if(this.transfer) order.location_name=order.from_name+' → '+order.to_name;
      const items = order.items || [];
      this.setData({ order, items, loading: false });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  }
});
