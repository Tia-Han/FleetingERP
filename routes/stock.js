const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/balances', (req, res) => {
  const db = getDb();
  const { location_id, category, brand_id, spec_type, search, sku_id } = req.query;
  let sql = `SELECT sb.*, s.sku_code, s.barcode, s.spec_type, s.volume, s.unit, s.cost_price, s.retail_price, s.low_stock_threshold, p.name as product_name, p.category, b.name as brand_name, l.name as location_name FROM stock_balances sb JOIN skus s ON sb.sku_id = s.id JOIN products p ON s.product_id = p.id JOIN brands b ON p.brand_id = b.id JOIN locations l ON sb.location_id = l.id WHERE s.is_deleted = 0 AND p.is_deleted = 0`;
  const params = [];
  if (location_id) { sql += ' AND sb.location_id = ?'; params.push(location_id); }
  if (sku_id) { sql += ' AND sb.sku_id = ?'; params.push(sku_id); }
  if (category) { sql += ' AND p.category = ?'; params.push(category); }
  if (brand_id) { sql += ' AND p.brand_id = ?'; params.push(brand_id); }
  if (spec_type) { sql += ' AND s.spec_type = ?'; params.push(spec_type); }
  if (search) {
    sql += ' AND (p.name LIKE ? OR s.barcode LIKE ? OR s.sku_code LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY sb.updated_at DESC, p.name, s.volume_ml';
  const balances = db.prepare(sql).all(...params);
  for (const b of balances) {
    b.stock_value = b.quantity * b.cost_price;
    b.is_low_stock = b.quantity <= b.low_stock_threshold && b.low_stock_threshold > 0;
  }
  res.json({ success: true, data: balances });
});

router.get('/movements', (req, res) => {
  const db = getDb();
  const { location_id, movement_type, start_date, end_date, page, limit } = req.query;
  let sql = `SELECT sm.*, s.volume, s.sku_code, p.name as product_name, l.name as location_name, sio.supplier, sio.remark as order_remark, sm.source FROM stock_movements sm JOIN skus s ON sm.sku_id = s.id JOIN products p ON s.product_id = p.id JOIN locations l ON sm.location_id = l.id LEFT JOIN stock_in_orders sio ON sm.ref_type = 'stock_in' AND sm.ref_id = sio.id WHERE 1=1`;
  const params = [];
  if (location_id) { sql += ' AND sm.location_id = ?'; params.push(location_id); }
  if (movement_type) { sql += ' AND sm.movement_type = ?'; params.push(movement_type); }
  if (start_date) { sql += ' AND sm.created_at >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND sm.created_at <= ?'; params.push(end_date); }
  const pageNum = parseInt(page) || 1;
  const pageSize = parseInt(limit) || 50;
  const offset = (pageNum - 1) * pageSize;
  let countSql = `SELECT COUNT(*) as total FROM stock_movements sm WHERE 1=1`;
  const countParams = [];
  if (location_id) { countSql += ' AND sm.location_id = ?'; countParams.push(location_id); }
  if (movement_type) { countSql += ' AND sm.movement_type = ?'; countParams.push(movement_type); }
  if (start_date) { countSql += ' AND sm.created_at >= ?'; countParams.push(start_date); }
  if (end_date) { countSql += ' AND sm.created_at <= ?'; countParams.push(end_date); }
  const total = db.prepare(countSql).get(...countParams).total;
  sql += ' ORDER BY sm.created_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, offset);
  const movements = db.prepare(sql).all(...params);
  res.json({ success: true, data: movements, total, page: pageNum, limit: pageSize });
});

router.get('/alerts', (req, res) => {
  const db = getDb();
  const { location_id } = req.query;
  let sql = `SELECT sb.quantity, s.sku_code, s.volume, s.low_stock_threshold, p.name as product_name, b.name as brand_name, l.name as location_name FROM stock_balances sb JOIN skus s ON sb.sku_id = s.id JOIN products p ON s.product_id = p.id JOIN brands b ON p.brand_id = b.id JOIN locations l ON sb.location_id = l.id WHERE s.is_deleted = 0 AND s.low_stock_threshold > 0 AND sb.quantity <= s.low_stock_threshold`;
  const params = [];
  if (location_id) { sql += ' AND sb.location_id = ?'; params.push(location_id); }
  sql += ' ORDER BY sb.quantity ASC';
  const alerts = db.prepare(sql).all(...params);
  res.json({ success: true, data: alerts });
});

router.get('/summary', (req, res) => {
  const db = getDb();
  const { location_id, start_date, end_date } = req.query;
  let whereClause = '1=1';
  const params = [];
  if (location_id) { whereClause += ' AND location_id = ?'; params.push(location_id); }
  if (start_date) { whereClause += ' AND created_at >= ?'; params.push(start_date); }
  if (end_date) { whereClause += ' AND created_at <= ?'; params.push(end_date); }
  const summary = db.prepare(`SELECT movement_type, COUNT(*) as count, SUM(ABS(quantity)) as total_quantity, SUM(CASE WHEN unit_cost IS NOT NULL THEN ABS(quantity) * unit_cost ELSE 0 END) as total_value FROM stock_movements WHERE ${whereClause} GROUP BY movement_type`).all(...params);
  res.json({ success: true, data: summary });
});

router.post('/check', (req, res) => {
  const { location_id, items, operator } = req.body;
  if (!location_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.json({ success: false, message: '场所和盘点明细不能为空' });
  }

  const db = getDb();
  const transaction = db.transaction(() => {
    const adjustments = [];
    let adjustedCount = 0;
    for (const item of items) {
      const { sku_id, actual_quantity } = item;
      if (!sku_id || actual_quantity == null) continue;
      const balance = db.prepare('SELECT quantity FROM stock_balances WHERE location_id = ? AND sku_id = ?').get(location_id, sku_id);
      const systemQty = balance ? balance.quantity : 0;
      const diff = actual_quantity - systemQty;
      if (diff === 0) continue;
      const sku = db.prepare('SELECT volume FROM skus WHERE id = ?').get(sku_id);
      const movementType = diff > 0 ? 'check_in' : 'check_out';
      db.prepare('INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, remark, operator, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(location_id, sku_id, movementType, diff, 'inventory_check', `盘点调整: 系统${systemQty}→实际${actual_quantity}`, operator || '', req.clientSource);
      db.prepare('UPDATE stock_balances SET quantity = ?, updated_at = datetime(\'now\', \'localtime\') WHERE location_id = ? AND sku_id = ?')
        .run(actual_quantity, location_id, sku_id);
      adjustments.push({ sku_id, volume: sku ? sku.volume : '', system_qty: systemQty, actual_qty: actual_quantity, diff });
      adjustedCount++;
    }
    return { adjustedCount, adjustments };
  });

  try {
    const result = transaction();
    res.json({ success: true, data: result, message: `盘点完成，调整 ${result.adjustedCount} 项` });
  } catch (err) {
    res.json({ success: false, message: '盘点失败: ' + err.message });
  }
});

module.exports = router;
