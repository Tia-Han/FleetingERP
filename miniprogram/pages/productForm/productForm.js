// pages/productForm/productForm.js
const { get, post, put } = require('../../utils/request');

Page({
  data: {
    isEdit: false,
    productId: '',
    name: '',
    brand_id: '',
    brand_name: '',
    category: '',
    categoryIndex: 0,
    is_split: false,
    brands: [],
    brandIndex: 0,
    categories: [],
    showBrandPicker: false,
    newBrandName: '',
    skus: [{
      spec_type: '整装',
      volume_desc: '',
      volume_ml: '',
      unit: '瓶',
      cost_price: '',
      retail_price: '',
      low_stock_threshold: '',
      barcode: ''
    }],
    submitting: false
  },

  onLoad(options) {
    const app = getApp();
    if (!app.isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }

    this.loadBrands();
    this.loadCategories();

    if (options.id) {
      this.setData({ isEdit: true, productId: options.id });
      this.loadProduct(options.id);
    }
  },

  async loadBrands() {
    try {
      const res = await get('/brands');
      this.setData({ brands: res.data || [] });
    } catch (e) {}
  },

  async loadCategories() {
    try {
      const res = await get('/products/categories');
      const cats = res.data || [];
      this.setData({ categories: [{ name: '' }].concat(cats) });
    } catch (e) {}
  },

  async loadProduct(id) {
    try {
      const res = await get('/products/' + id);
      const product = res.data || {};
      const rawSkus = product.skus || [];
      // 后端返回 volume 字段，前端使用 volume_desc，做映射
      const skus = rawSkus.map(sku => ({
        ...sku,
        volume_desc: sku.volume_desc || sku.volume || ''
      }));

      const brandIdx = this.data.brands.findIndex(b => b.id === product.brand_id);
      const catIdx = this.data.categories.findIndex(c => c.name === product.category);

      this.setData({
        name: product.name,
        brand_id: product.brand_id,
        brand_name: product.brand_name,
        category: product.category || '',
        categoryIndex: catIdx >= 0 ? catIdx : 0,
        is_split: product.is_split === 1,
        brandIndex: brandIdx >= 0 ? brandIdx : 0,
        skus: skus.length > 0 ? skus : this.data.skus
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onNameInput(e) { this.setData({ name: e.detail.value }); },

  onBrandChange(e) {
    const idx = e.detail.value;
    const brand = this.data.brands[idx];
    this.setData({ brandIndex: idx, brand_id: brand.id, brand_name: brand.name });
  },

  onCategoryChange(e) {
    const idx = e.detail.value;
    const cat = this.data.categories[idx];
    this.setData({ categoryIndex: idx, category: cat ? cat.name : '' });
  },

  onSplitChange(e) { this.setData({ is_split: e.detail.value }); },

  // SKU 操作
  addSku() {
    const skus = [...this.data.skus, {
      spec_type: '整装',
      volume_desc: '',
      volume_ml: '',
      unit: '瓶',
      cost_price: '',
      retail_price: '',
      low_stock_threshold: '',
      barcode: ''
    }];
    this.setData({ skus });
  },

  removeSku(e) {
    const { index } = e.currentTarget.dataset;
    if (this.data.skus.length <= 1) {
      wx.showToast({ title: '至少保留一个规格', icon: 'none' });
      return;
    }
    const skus = [...this.data.skus];
    skus.splice(index, 1);
    this.setData({ skus });
  },

  onSkuInput(e) {
    const { index, field } = e.currentTarget.dataset;
    const skus = [...this.data.skus];
    skus[index][field] = e.detail.value;
    this.setData({ skus });
  },

  // 新建品牌
  openBrandPicker() {
    this.setData({ showBrandPicker: true, newBrandName: '' });
  },

  closeBrandPicker() {
    this.setData({ showBrandPicker: false });
  },

  onNewBrandInput(e) {
    this.setData({ newBrandName: e.detail.value });
  },

  async createBrand() {
    const name = this.data.newBrandName.trim();
    if (!name) {
      wx.showToast({ title: '请输入品牌名称', icon: 'none' });
      return;
    }
    try {
      const res = await post('/brands', { name });
      if (res.data) {
        const brands = [...this.data.brands, res.data];
        const brandIndex = brands.length - 1;
        this.setData({
          brands,
          brandIndex,
          brand_id: res.data.id,
          brand_name: res.data.name,
          showBrandPicker: false
        });
        wx.showToast({ title: '品牌已创建', icon: 'success' });
      }
    } catch (e) {
      wx.showToast({ title: e.message || '创建失败', icon: 'none' });
    }
  },

  async submit() {
    if (this.data.submitting) return;

    if (!this.data.name.trim()) {
      wx.showToast({ title: '请输入商品名称', icon: 'none' });
      return;
    }
    if (!this.data.brand_id) {
      wx.showToast({ title: '请选择品牌', icon: 'none' });
      return;
    }

    // 校验 SKU
    for (let i = 0; i < this.data.skus.length; i++) {
      const sku = this.data.skus[i];
      if (!sku.spec_type) {
        wx.showToast({ title: `第${i+1}个规格类型不能为空`, icon: 'none' });
        return;
      }
    }

    this.setData({ submitting: true });
    try {
      const productData = {
        name: this.data.name,
        brand_id: this.data.brand_id,
        category: this.data.category,
        is_split: this.data.is_split ? 1 : 0,
        skus: this.data.skus.map(s => ({
          spec_type: s.spec_type,
          volume_desc: s.volume_desc,
          volume_ml: parseFloat(s.volume_ml) || 0,
          unit: s.unit,
          cost_price: parseFloat(s.cost_price) || 0,
          retail_price: parseFloat(s.retail_price) || 0,
          low_stock_threshold: parseFloat(s.low_stock_threshold) || 0,
          barcode: s.barcode || ''
        }))
      };

      if (this.data.isEdit) {
        await put('/products/' + this.data.productId, productData);
        wx.showToast({ title: '更新成功', icon: 'success' });
      } else {
        await post('/products', productData);
        wx.showToast({ title: '创建成功', icon: 'success' });
      }

      setTimeout(() => wx.navigateBack(), 1000);
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    }
    this.setData({ submitting: false });
  }
});
