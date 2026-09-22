// pages/customerDetail/customerDetail.js
const { get, put, del } = require('../../utils/request');

Page({
  data: {
    customer: null,
    purchases: [],
    loading: true,
    customerId: '',
    editing: false,
    editPhone: '',
    editWechatName: ''
  },

  onLoad(options) {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.setData({ customerId: options.id });
    this.loadData();
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const [custRes, purchRes] = await Promise.all([
        get('/customers/' + this.data.customerId),
        get('/customers/' + this.data.customerId + '/purchases').catch(() => ({ data: [] }))
      ]);

      this.setData({
        customer: custRes.data,
        purchases: purchRes.data || [],
        loading: false,
        editPhone: custRes.data ? custRes.data.phone : '',
        editWechatName: custRes.data ? custRes.data.wechat_name : ''
      });
    } catch (err) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  startEdit() {
    this.setData({ editing: true });
  },

  cancelEdit() {
    this.setData({
      editing: false,
      editPhone: this.data.customer.phone,
      editWechatName: this.data.customer.wechat_name
    });
  },

  onPhoneInput(e) { this.setData({ editPhone: e.detail.value }); },
  onWechatInput(e) { this.setData({ editWechatName: e.detail.value }); },

  async saveEdit() {
    if (!this.data.editPhone && !this.data.editWechatName) {
      wx.showToast({ title: '至少填写一项', icon: 'none' });
      return;
    }
    try {
      await put('/customers/' + this.data.customerId, {
        phone: this.data.editPhone,
        wechat_name: this.data.editWechatName
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ editing: false });
      this.loadData();
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    }
  },

  deleteCustomer() {
    wx.showModal({
      title: '确认删除',
      content: '确定删除该客户吗？删除后销售记录仍然保留。',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await del('/customers/' + this.data.customerId);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1000);
        } catch (e) {
          wx.showToast({ title: e.message || '删除失败', icon: 'none' });
        }
      }
    });
  }
});
