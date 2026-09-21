const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/', (req, res) => {
  const db = getDb();
  const brands = db.prepare(`
    SELECT b.*, 
      (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.is_deleted = 0) as product_count
    FROM brands b WHERE b.is_deleted = 0 ORDER BY b.name
  `).all();
  res.json({ success: true, data: brands });
});

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ success: false, message: '品牌名称不能为空' });
  const db = getDb();
  const result = db.prepare('INSERT INTO brands (name) VALUES (?)').run(name);
  res.json({ success: true, data: { id: result.lastInsertRowid, name } });
});

router.put('/:id', (req, res) => {
  const { name } = req.body;
  if (!name) return res.json({ success: false, message: '品牌名称不能为空' });
  const db = getDb();
  db.prepare('UPDATE brands SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ success: true, message: '更新成功' });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const hasProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE brand_id = ? AND is_deleted = 0').get(req.params.id);
  if (hasProducts.count > 0) {
    return res.json({ success: false, message: '该品牌下还有商品，无法删除' });
  }
  db.prepare('UPDATE brands SET is_deleted = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: '删除成功' });
});

module.exports = router;
