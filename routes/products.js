const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');
const { generateSkuCode, generateBarcode } = require('../utils/barcode');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const db = getDb();
  const { category, brand_id } = req.query;
  let sql = `SELECT p.*, b.name as brand_name FROM products p JOIN brands b ON p.brand_id = b.id WHERE p.is_deleted = 0`;
  const params = [];
  if (category) { sql += ' AND p.category = ?'; params.push(category); }
  if (brand_id) { sql += ' AND p.brand_id = ?'; params.push(brand_id); }
  sql += ' ORDER BY p.created_at DESC';
  const products = db.prepare(sql).all(...params);
  for (const product of products) {
    product.skus = db.prepare('SELECT * FROM skus WHERE product_id = ? AND is_deleted = 0 ORDER BY volume_ml').all(product.id);
  }
  res.json({ success: true, data: products });
});

router.post('/', (req, res) => {
  const { brand_id, name, category, is_splittable, skus } = req.body;
  if (!brand_id || !name || !category) return res.json({ success: false, message: '品牌、商品名、品类不能为空' });
  const db = getDb();
  const result = db.prepare('INSERT INTO products (brand_id, name, category, is_splittable) VALUES (?, ?, ?, ?)').run(brand_id, name, category, is_splittable ? 1 : 0);
  const productId = result.lastInsertRowid;

  if (skus && Array.isArray(skus) && skus.length > 0) {
    for (const sku of skus) {
      const count = db.prepare('SELECT COUNT(*) as c FROM skus WHERE product_id = ?').get(productId).c;
      const skuCode = generateSkuCode(brand_id, productId, count + 1);
      const finalBarcode = sku.barcode || generateBarcode(Date.now() % 1000000000);
      db.prepare(`INSERT INTO skus (product_id, sku_code, barcode, spec_type, volume, volume_ml, unit, cost_price, retail_price, low_stock_threshold) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(productId, skuCode, finalBarcode, sku.spec_type || '整装', sku.volume || '', sku.volume_ml || 0, sku.unit || '瓶', sku.cost_price || 0, sku.retail_price || 0, sku.low_stock_threshold || 0);
    }
  }

  res.json({ success: true, data: { id: productId } });
});

router.put('/:id', (req, res) => {
  const { brand_id, name, category, is_splittable } = req.body;
  const db = getDb();
  db.prepare('UPDATE products SET brand_id = ?, name = ?, category = ?, is_splittable = ? WHERE id = ?').run(brand_id, name, category, is_splittable ? 1 : 0, req.params.id);
  res.json({ success: true, message: '更新成功' });
});

router.delete('/:id', (req, res) => {
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

router.get('/categories', (req, res) => {
  const db = getDb();
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
  res.json({ success: true, data: cats });
});

router.post('/categories', (req, res) => {
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

router.delete('/categories/:name', (req, res) => {
  const db = getDb();
  const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(req.params.name);
  if (!cat) return res.json({ success: false, message: '品类不存在' });
  const count = db.prepare('SELECT COUNT(*) as c FROM products WHERE category = ? AND is_deleted = 0').get(req.params.name).c;
  if (count > 0) return res.json({ success: false, message: `该品类下有 ${count} 个商品，无法删除` });
  db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
  res.json({ success: true, message: '品类已删除' });
});

module.exports = router;
