const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');
const { generateSkuCode, generateBarcode } = require('../utils/barcode');

router.use(authMiddleware);

// API-01/PERF-02: 商品列表加分页 + 优化 N+1 查询
// 向后兼容：不传 page 参数时返回全部数据（网页端依赖全量加载）
router.get('/', (req, res) => {
  const db = getDb();
  const { category, brand_id, search, page, limit } = req.query;
  const hasPagination = page !== undefined;
  const pageNum = parseInt(page) || 1;
  const pageSize = Math.min(parseInt(limit) || 20, 100);
  const offset = (pageNum - 1) * pageSize;

  let whereSql = `FROM products p JOIN brands b ON p.brand_id = b.id WHERE p.is_deleted = 0`;
  const params = [];
  if (category) { whereSql += ' AND p.category = ?'; params.push(category); }
  if (brand_id) { whereSql += ' AND p.brand_id = ?'; params.push(brand_id); }
  if (search) { whereSql += ' AND p.name LIKE ?'; params.push(`%${search}%`); }

  let total = null;
  let products;

  if (hasPagination) {
    const countSql = `SELECT COUNT(*) as total ${whereSql}`;
    total = db.prepare(countSql).get(...params).total;
    products = db.prepare(`SELECT p.*, b.name as brand_name ${whereSql} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);
  } else {
    products = db.prepare(`SELECT p.*, b.name as brand_name ${whereSql} ORDER BY p.created_at DESC`)
      .all(...params);
  }

  if (products.length > 0) {
    const productIds = products.map(p => p.id);
    const placeholders = productIds.map(() => '?').join(',');
    const allSkus = db.prepare(`SELECT * FROM skus WHERE product_id IN (${placeholders}) AND is_deleted = 0 ORDER BY volume_ml`)
      .all(...productIds);
    const skuMap = {};
    for (const sku of allSkus) {
      if (!skuMap[sku.product_id]) skuMap[sku.product_id] = [];
      skuMap[sku.product_id].push(sku);
    }
    for (const product of products) {
      product.skus = skuMap[product.id] || [];
    }
  }

  if (hasPagination) {
    res.json({ success: true, data: products, total, page: pageNum, limit: pageSize });
  } else {
    res.json({ success: true, data: products });
  }
});

// 品类管理（注意：必须在 /:id 动态路由之前定义，否则 "categories" 会被当作 id 匹配）
router.get('/categories', (req, res) => {
  const db = getDb();
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
  res.json({ success: true, data: cats });
});

router.post('/categories', roleMiddleware('admin'), (req, res) => {
  const { old_name, new_name } = req.body;
  if (!new_name) return res.json({ success: false, message: '品类名不能为空' });
  const db = getDb();
  if (old_name) {
    const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(old_name);
    if (!cat) return res.json({ success: false, message: '原品类不存在' });
    const dup = db.prepare('SELECT id FROM categories WHERE name = ? AND id != ?').get(new_name, cat.id);
    if (dup) return res.json({ success: false, message: '品类名已存在' });
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(new_name, cat.id);
    db.prepare('UPDATE products SET category = ? WHERE category = ? AND is_deleted = 0').run(new_name, old_name);
    res.json({ success: true, message: '品类重命名成功' });
  } else {
    const dup = db.prepare('SELECT id FROM categories WHERE name = ?').get(new_name);
    if (dup) return res.json({ success: false, message: '品类名已存在' });
    const maxOrder = db.prepare('SELECT MAX(sort_order) as m FROM categories').get();
    db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)').run(new_name, (maxOrder.m || 0) + 1);
    res.json({ success: true, message: '品类添加成功' });
  }
});

router.delete('/categories/:name', roleMiddleware('admin'), (req, res) => {
  const db = getDb();
  const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(req.params.name);
  if (!cat) return res.json({ success: false, message: '品类不存在' });
  const count = db.prepare('SELECT COUNT(*) as c FROM products WHERE category = ? AND is_deleted = 0').get(req.params.name).c;
  if (count > 0) return res.json({ success: false, message: `该品类下有 ${count} 个商品，无法删除` });
  db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
  res.json({ success: true, message: '品类已删除' });
});

// 获取单个商品详情（含 SKU）
router.get('/:id', (req, res) => {
  const db = getDb();
  const product = db.prepare(`SELECT p.*, b.name as brand_name FROM products p JOIN brands b ON p.brand_id = b.id WHERE p.id = ? AND p.is_deleted = 0`).get(req.params.id);
  if (!product) {
    return res.json({ success: false, message: '商品不存在' });
  }
  const skus = db.prepare('SELECT * FROM skus WHERE product_id = ? AND is_deleted = 0 ORDER BY volume_ml').all(product.id);
  product.skus = skus;
  res.json({ success: true, data: product });
});

router.post('/', (req, res) => {
  const { brand_id, name, category, skus } = req.body;
  // 兼容 is_split 和 is_splittable 两种字段名
  const isSplittable = req.body.is_split !== undefined ? req.body.is_split : req.body.is_splittable;
  if (!brand_id || !name || !category) return res.json({ success: false, message: '品牌、商品名、品类不能为空' });
  const db = getDb();
  const result = db.prepare('INSERT INTO products (brand_id, name, category, is_splittable) VALUES (?, ?, ?, ?)').run(brand_id, name, category, isSplittable ? 1 : 0);
  const productId = result.lastInsertRowid;

  if (skus && Array.isArray(skus) && skus.length > 0) {
    for (const sku of skus) {
      const count = db.prepare('SELECT COUNT(*) as c FROM skus WHERE product_id = ?').get(productId).c;
      const skuCode = generateSkuCode(brand_id, productId, count + 1);
      const finalBarcode = sku.barcode || generateBarcode(Date.now() % 1000000000);
      db.prepare(`INSERT INTO skus (product_id, sku_code, barcode, spec_type, volume, volume_ml, unit, cost_price, retail_price, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(productId, skuCode, finalBarcode, sku.spec_type || '整装', sku.volume_desc || sku.volume || '', sku.volume_ml || 0, sku.unit || '瓶', sku.cost_price || 0, sku.retail_price || 0, sku.low_stock_threshold || 0);
    }
  }

  // 查询刚创建的商品及SKU，返回给前端
  const createdProduct = db.prepare(`SELECT p.*, b.name as brand_name FROM products p JOIN brands b ON p.brand_id = b.id WHERE p.id = ?`).get(productId);
  const createdSkus = db.prepare('SELECT * FROM skus WHERE product_id = ? AND is_deleted = 0 ORDER BY volume_ml').all(productId);
  createdProduct.skus = createdSkus;
  res.json({ success: true, data: createdProduct });
});

router.put('/:id', (req, res) => {
  const { brand_id, name, category, skus } = req.body;
  const isSplittable = req.body.is_split !== undefined ? req.body.is_split : req.body.is_splittable;
  const db = getDb();

  const updParams = [brand_id, name, category];
  let updSql = 'UPDATE products SET brand_id = ?, name = ?, category = ?';
  if (isSplittable !== undefined) {
    updSql += ', is_splittable = ?';
    updParams.push(isSplittable ? 1 : 0);
  }
  updSql += ' WHERE id = ?';
  updParams.push(req.params.id);
  db.prepare(updSql).run(...updParams);

  // 如果传了 skus，全量替换该商品的 SKU
  if (skus && Array.isArray(skus)) {
    const transaction = db.transaction(() => {
      db.prepare('UPDATE skus SET is_deleted = 1 WHERE product_id = ?').run(req.params.id);
      for (const sku of skus) {
        if (sku.id) {
          // 已存在的 SKU：恢复并更新
          const existing = db.prepare('SELECT * FROM skus WHERE id = ? AND product_id = ?').get(sku.id, req.params.id);
          if (existing) {
            db.prepare(`UPDATE skus SET is_deleted = 0, spec_type = ?, volume = ?, volume_ml = ?, unit = ?, cost_price = ?, retail_price = ?, low_stock_threshold = ?, barcode = ? WHERE id = ?`)
              .run(sku.spec_type || '整装', sku.volume_desc || sku.volume || '', sku.volume_ml || 0, sku.unit || '瓶', sku.cost_price || 0, sku.retail_price || 0, sku.low_stock_threshold || 0, sku.barcode || existing.barcode, sku.id);
          }
        } else {
          // 新 SKU：插入
          const count = db.prepare('SELECT COUNT(*) as c FROM skus WHERE product_id = ?').get(req.params.id).c;
          const { generateSkuCode, generateBarcode } = require('../utils/barcode');
          const product = db.prepare('SELECT brand_id FROM products WHERE id = ?').get(req.params.id);
          const skuCode = generateSkuCode(product.brand_id, req.params.id, count + 1);
          const finalBarcode = sku.barcode || generateBarcode(Date.now() % 1000000000);
          db.prepare(`INSERT INTO skus (product_id, sku_code, barcode, spec_type, volume, volume_ml, unit, cost_price, retail_price, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
            .run(req.params.id, skuCode, finalBarcode, sku.spec_type || '整装', sku.volume_desc || sku.volume || '', sku.volume_ml || 0, sku.unit || '瓶', sku.cost_price || 0, sku.retail_price || 0, sku.low_stock_threshold || 0);
        }
      }
    });
    transaction();
  }

  res.json({ success: true, message: '更新成功' });
});

router.delete('/:id', roleMiddleware('admin'), (req, res) => {
  const db = getDb();
  db.prepare('UPDATE products SET is_deleted = 1 WHERE id = ?').run(req.params.id);
  db.prepare('UPDATE skus SET is_deleted = 1 WHERE product_id = ?').run(req.params.id);
  res.json({ success: true, message: '删除成功' });
});

router.post('/:id/skus', (req, res) => {
  const productId = req.params.id;
  const { barcode, spec_type, volume, volume_ml, unit, cost_price, retail_price, low_stock_threshold } = req.body;
  if (!spec_type || !volume || !unit) return res.json({ success: false, message: '规格类型、容量、单位不能为空' });
  const db = getDb();
  const product = db.prepare('SELECT brand_id FROM products WHERE id = ?').get(productId);
  if (!product) return res.json({ success: false, message: '商品不存在' });
  const count = db.prepare('SELECT COUNT(*) as c FROM skus WHERE product_id = ?').get(productId).c;
  const skuCode = generateSkuCode(product.brand_id, productId, count + 1);
  const finalBarcode = barcode || generateBarcode(Date.now() % 1000000000);
  const result = db.prepare(`INSERT INTO skus (product_id, sku_code, barcode, spec_type, volume, volume_ml, unit, cost_price, retail_price, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(productId, skuCode, finalBarcode, spec_type, volume, volume_ml || 0, unit, cost_price || 0, retail_price || 0, low_stock_threshold || 0);
  res.json({ success: true, data: { id: result.lastInsertRowid, sku_code: skuCode, barcode: finalBarcode } });
});

module.exports = router;
