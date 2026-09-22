// pages/customer/customer.js
const { get, post, del } = require('../../utils/request');
const { checkLogin } = require('../../utils/auth');

Page({
  data: {
    list: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 20,
    searchKey: '',
    showAdd: false,
    newCustomer: { phone: '', wechat_name: '' }
  },

  onLoad() {
    if (!checkLogin()) return;
    this.loadList(true);
  },

  onUnload() {
    if (this._searchTimer) clearTimeout(this._searchTimer);
  },

  onPullDownRefresh() {
    this.loadList(true).then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  async loadList(refresh = false) {
    if (this.data.loading) return;
    const page = refresh ? 1 : this.data.page;
    this.setData({ loading: true });

    try {
      const params = { page, limit: this.data.pageSize };
      if (this.data.searchKey) params.search = this.data.searchKey;

      const res = await get('/customers', params);
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

  onSearchInput(e) {
    const value = e.detail.value;
    this.setData({ searchKey: value });
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.loadList(true), 500);
  },

  onItemTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/customerDetail/customerDetail?id=' + id });
  },

  openAdd() {
    this.setData({ showAdd: true, newCustomer: { phone: '', wechat_name: '' } });
  },

  closeAdd() {
    this.setData({ showAdd: false });
  },

  onPhoneInput(e) {
    this.setData({ 'newCustomer.phone': e.detail.value });
  },

  onWechatInput(e) {
    this.setData({ 'newCustomer.wechat_name': e.detail.value });
  },

  async addCustomer() {
    const { phone, wechat_name } = this.data.newCustomer;
    if (!phone && !wechat_name) {
      wx.showToast({ title: '请输入手机号或微信名', icon: 'none' });
      return;
    }
    if (phone && !/^1\d{10}$/.test(phone)) {
      wx.showToast({ title: '手机号格式不正确', icon: 'none' });
      return;
    }
    try {
      await post('/customers', { phone, wechat_name });
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ showAdd: false });
      this.loadList(true);
    } catch (e) {
      wx.showToast({ title: e.message || '创建失败', icon: 'none' });
    }
  }
});
