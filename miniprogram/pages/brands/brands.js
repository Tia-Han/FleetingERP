// pages/brands/brands.js
const { get, post, put, del } = require('../../utils/request');

Page({
  data: {
    list: [],
    loading: false,
    showAdd: false,
    newName: '',
    editingId: '',
    editingName: ''
  },

  onLoad() {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadList();
  },

  onPullDownRefresh() {
    this.loadList().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  async loadList() {
    this.setData({ loading: true });
    try {
      const res = await get('/brands');
      this.setData({ list: res.data || [], loading: false });
    } catch (e) {
      this.setData({ loading: false });
    }
  },

  openAdd() {
    this.setData({ showAdd: true, newName: '' });
  },

  closeAdd() {
    this.setData({ showAdd: false });
  },

  onNewNameInput(e) {
    this.setData({ newName: e.detail.value });
  },

  async addBrand() {
    const name = this.data.newName.trim();
    if (!name) {
      wx.showToast({ title: '请输入品牌名称', icon: 'none' });
      return;
    }
    try {
      await post('/brands', { name });
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ showAdd: false });
      this.loadList();
    } catch (e) {
      wx.showToast({ title: e.message || '创建失败', icon: 'none' });
    }
  },

  editBrand(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({ editingId: id, editingName: name });
  },

  onEditNameInput(e) {
    this.setData({ editingName: e.detail.value });
  },

  cancelEdit() {
    this.setData({ editingId: '', editingName: '' });
  },

  async saveEdit() {
    const name = this.data.editingName.trim();
    if (!name) {
      wx.showToast({ title: '品牌名称不能为空', icon: 'none' });
      return;
    }
    try {
      await put('/brands/' + this.data.editingId, { name });
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ editingId: '', editingName: '' });
      this.loadList();
    } catch (e) {
      wx.showToast({ title: e.message || '保存失败', icon: 'none' });
    }
  },

  deleteBrand(e) {
    const { id, name, productCount } = e.currentTarget.dataset;
    if (productCount > 0) {
      wx.showModal({
        title: '无法删除',
        content: `该品牌下有 ${productCount} 个商品，请先删除或转移商品`,
        showCancel: false
      });
      return;
    }
    wx.showModal({
      title: '确认删除',
      content: `确定删除品牌"${name}"吗？`,
      success: async (res) => {
        if (!res.confirm) return;
        try {
          await del('/brands/' + id);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadList();
        } catch (e) {
          wx.showToast({ title: e.message || '删除失败', icon: 'none' });
        }
      }
    });
  }
});
