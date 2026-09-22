const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /stock-in - 入库单列表
router.get('/', (req, res) => {
  const { location_id, start_date, end_date, supplier, operator, product, brand, page, limit } = req.query;
  const db = getDb();

  let sql = `SELECT sio.*, l.name as location_name, 
             (SELECT COUNT(*) FROM stock_in_items WHERE order_id = sio.id) as item_count
             FROM stock_in_orders sio 
             JOIN locations l ON sio.location_id = l.id 
             WHERE 1=1`;
  const params = [];

  if (location_id) { sql += ' AND sio.location_id = ?'; params.push(location_id); }
  if (supplier) { sql += ' AND sio.supplier LIKE ?'; params.push('%' + supplier + '%'); }
  if (operator) { sql += ' AND sio.operator LIKE ?'; params.push('%' + operator + '%'); }
  if (start_date) { sql += ' AND sio.created_at >= ?'; params.push(start_date + ' 00:00:00'); }
  if (end_date) { sql += ' AND sio.created_at <= ?'; params.push(end_date + ' 23:59:59'); }
  if (product) {
    sql += ` AND EXISTS (
      SELECT 1 FROM stock_in_items sii
      JOIN skus s ON sii.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      WHERE sii.order_id = sio.id AND p.name LIKE ?
    )`;
    params.push('%' + product + '%');
  }
  if (brand) {
    sql += ` AND EXISTS (
      SELECT 1 FROM stock_in_items sii
      JOIN skus s ON sii.sku_id = s.id
      JOIN products p ON s.product_id = p.id
      JOIN brands b ON p.brand_id = b.id
      WHERE sii.order_id = sio.id AND b.name LIKE ?
    )`;
    params.push('%' + brand + '%');
  }

  sql += ' ORDER BY sio.created_at DESC';

  // 分页支持
  const pageNum = parseInt(page) || 0;
  const limitNum = parseInt(limit) || 0;

  if (pageNum > 0 && limitNum > 0) {
    const offset = (pageNum - 1) * limitNum;
    // 构建 count SQL：从 FROM 开始取（跳过子查询中的 FROM）
    const fromIndex = sql.indexOf('FROM stock_in_orders');
    const countSql = 'SELECT COUNT(*) as cnt ' + sql.substring(fromIndex).replace('ORDER BY sio.created_at DESC', '');
    const total = db.prepare(countSql).get(...params).cnt;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);
    const data = db.prepare(sql).all(...params);
    res.json({ success: true, data, total, page: pageNum, limit: limitNum });
  } else {
    const data = db.prepare(sql).all(...params);
    res.json({ success: true, data });
  }
});

router.post('/', (req, res) => {
  const { location_id, supplier, remark, items, operator, stock_in_date } = req.body;
  if (!location_id || !items || items.length === 0) {
    return res.json({ success: false, message: '场所和入库明细不能为空' });
  }
  const createdAt = stock_in_date || new Date().toISOString().replace('T', ' ').substring(0, 19);

  const db = getDb();
  const transaction = db.transaction(() => {
    const orderResult = db.prepare('INSERT INTO stock_in_orders (location_id, supplier, remark, operator, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(location_id, supplier || '', remark || '', operator || '', createdAt);
    const orderId = orderResult.lastInsertRowid;
    let totalCost = 0;

    for (const item of items) {
      const { sku_id, quantity, unit_cost } = item;
      if (quantity <= 0) {
        throw Object.assign(new Error('入库数量必须大于0'), { code: 'BUSINESS_ERROR' });
      }
      db.prepare('INSERT INTO stock_in_items (order_id, sku_id, quantity, unit_cost) VALUES (?, ?, ?, ?)')
        .run(orderId, sku_id, quantity, unit_cost);
      db.prepare('INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, unit_cost, operator, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(location_id, sku_id, 'in', quantity, 'stock_in', orderId, unit_cost, operator || '', req.clientSource, createdAt);

      const existing = db.prepare('SELECT id, quantity FROM stock_balances WHERE location_id = ? AND sku_id = ?').get(location_id, sku_id);
      if (existing) {
        db.prepare('UPDATE stock_balances SET quantity = quantity + ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(quantity, existing.id);
      } else {
        db.prepare('INSERT INTO stock_balances (location_id, sku_id, quantity) VALUES (?, ?, ?)').run(location_id, sku_id, quantity);
      }
      totalCost += quantity * unit_cost;
    }
    db.prepare('UPDATE stock_in_orders SET total_cost = ? WHERE id = ?').run(totalCost, orderId);
    return orderId;
  });

  try {
    const orderId = transaction();
    res.json({ success: true, data: { id: orderId }, message: '入库成功' });
  } catch (err) {
    if (err.code === 'BUSINESS_ERROR') return res.json({ success: false, message: err.message });
    throw err;
  }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT sio.*, l.name as location_name FROM stock_in_orders sio JOIN locations l ON sio.location_id = l.id WHERE sio.id = ?').get(req.params.id);
  if (!order) return res.json({ success: false, message: '入库单不存在' });
  order.items = db.prepare('SELECT sii.*, s.sku_code, s.volume, s.unit, p.name as product_name FROM stock_in_items sii JOIN skus s ON sii.sku_id = s.id JOIN products p ON s.product_id = p.id WHERE sii.order_id = ?').all(req.params.id);
  res.json({ success: true, data: order });
});

module.exports = router;
