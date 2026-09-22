const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware, roleMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// API-02: 客户列表加分页支持
router.get('/', (req, res) => {
  const db = getDb();
  const { search, page, limit } = req.query;
  const pageNum = parseInt(page) || 1;
  const pageSize = Math.min(parseInt(limit) || 20, 100);
  const offset = (pageNum - 1) * pageSize;

  let whereSql = 'FROM customers WHERE 1=1';
  const params = [];
  if (search) {
    whereSql += ' AND (wechat_name LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  const total = db.prepare(`SELECT COUNT(*) as total ${whereSql}`).get(...params).total;
  const customers = db.prepare(`SELECT * ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  res.json({ success: true, data: customers, total, page: pageNum, limit: pageSize });
});

router.post('/', (req, res) => {
  const { wechat_name, phone, remark } = req.body;
  if (!wechat_name) return res.json({ success: false, message: '微信名不能为空' });
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) return res.json({ success: false, message: '手机号格式不正确' });
  if (!wechat_name && !phone) return res.json({ success: false, message: '微信名或手机号至少填一个' });
  const db = getDb();
  const result = db.prepare('INSERT INTO customers (wechat_name, phone, remark) VALUES (?, ?, ?)').run(wechat_name || '', phone || '', remark || '');
  res.json({ success: true, data: { id: result.lastInsertRowid } });
});

router.put('/:id', (req, res) => {
  const { wechat_name, phone, remark } = req.body;
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) return res.json({ success: false, message: '手机号格式不正确' });
  const db = getDb();
  db.prepare('UPDATE customers SET wechat_name = ?, phone = ?, remark = ? WHERE id = ?').run(wechat_name, phone, remark, req.params.id);
  res.json({ success: true, message: '更新成功' });
});

router.delete('/:id', roleMiddleware('admin'), (req, res) => {
  const db = getDb();
  const sales = db.prepare('SELECT COUNT(*) as count FROM sales WHERE customer_id = ?').get(req.params.id);
  if (sales.count > 0) return res.json({ success: false, message: '该客户有销售记录，无法删除' });
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: '删除成功' });
});

router.get('/:id/purchases', (req, res) => {
  const db = getDb();
  const sales = db.prepare('SELECT s.*, l.name as location_name FROM sales s JOIN locations l ON s.location_id = l.id WHERE s.customer_id = ? ORDER BY s.created_at DESC').all(req.params.id);
  for (const sale of sales) {
    sale.items = db.prepare('SELECT si.*, s.volume, p.name as product_name FROM sale_items si JOIN skus s ON si.sku_id = s.id JOIN products p ON s.product_id = p.id WHERE si.sale_id = ?').all(sale.id);
  }
  res.json({ success: true, data: sales });
});

module.exports = router;
