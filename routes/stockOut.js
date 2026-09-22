const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /stock-out - 出库/损耗记录列表
router.get('/', (req, res) => {
  const { location_id, start_date, end_date, type, operator, page, limit } = req.query;
  const db = getDb();

  let sql = `SELECT sm.*, l.name as location_name, s.sku_code, s.volume, s.unit, p.name as product_name, b.name as brand_name
             FROM stock_movements sm
             JOIN locations l ON sm.location_id = l.id
             JOIN skus s ON sm.sku_id = s.id
             JOIN products p ON s.product_id = p.id
             JOIN brands b ON p.brand_id = b.id
             WHERE sm.movement_type IN ('out', 'loss')`;
  const params = [];

  if (location_id) { sql += ' AND sm.location_id = ?'; params.push(location_id); }
  if (type && ['out', 'loss'].includes(type)) { sql += ' AND sm.movement_type = ?'; params.push(type); }
  if (operator) { sql += ' AND sm.operator LIKE ?'; params.push('%' + operator + '%'); }
  if (start_date) { sql += ' AND sm.created_at >= ?'; params.push(start_date + ' 00:00:00'); }
  if (end_date) { sql += ' AND sm.created_at <= ?'; params.push(end_date + ' 23:59:59'); }

  sql += ' ORDER BY sm.created_at DESC';

  // 分页支持
  const pageNum = parseInt(page) || 0;
  const limitNum = parseInt(limit) || 0;

  if (pageNum > 0 && limitNum > 0) {
    const offset = (pageNum - 1) * limitNum;
    // 构建 count SQL：从主表 FROM 开始取
    const fromIndex = sql.indexOf('FROM stock_movements');
    const countSql = 'SELECT COUNT(*) as cnt ' + sql.substring(fromIndex).replace('ORDER BY sm.created_at DESC', '');
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
  const { location_id, sku_id, quantity, type, remark, operator } = req.body;
  if (!location_id || !sku_id || !quantity || !type) {
    return res.json({ success: false, message: '场所、SKU、数量、类型不能为空' });
  }
  if (!['out', 'loss'].includes(type)) {
    return res.json({ success: false, message: '类型必须是 out 或 loss' });
  }
  if (quantity <= 0) {
    return res.json({ success: false, message: '数量必须大于0' });
  }

  const db = getDb();
  const transaction = db.transaction(() => {
    const balance = db.prepare('SELECT quantity FROM stock_balances WHERE location_id = ? AND sku_id = ?').get(location_id, sku_id);
    const currentQty = balance ? balance.quantity : 0;
    if (currentQty < quantity) {
      throw Object.assign(new Error(`库存不足：当前剩余 ${currentQty}，需要 ${quantity}`), { code: 'BUSINESS_ERROR' });
    }
    db.prepare('INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, remark, operator, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(location_id, sku_id, type, -quantity, 'stock_out', remark || '', operator || '', req.clientSource);
    db.prepare('UPDATE stock_balances SET quantity = quantity - ?, updated_at = datetime(\'now\', \'localtime\') WHERE location_id = ? AND sku_id = ?')
      .run(quantity, location_id, sku_id);
  });

  try {
    transaction.immediate();
    res.json({ success: true, message: type === 'loss' ? '损耗登记成功' : '出库成功' });
  } catch (err) {
    if (err.code === 'BUSINESS_ERROR') return res.json({ success: false, message: err.message });
    throw err;
  }
});

router.post('/batch', (req, res) => {
  const { location_id, items, operator } = req.body;
  if (!location_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.json({ success: false, message: '场所和出库明细不能为空' });
  }

  const db = getDb();
  const transaction = db.transaction(() => {
    const errors = [];
    let successCount = 0;
    for (const item of items) {
      const { sku_id, quantity, type, remark } = item;
      if (!sku_id || !quantity || !type) {
        errors.push({ sku_id, message: '参数不完整' });
        continue;
      }
      if (!['out', 'loss'].includes(type)) {
        errors.push({ sku_id, message: '类型无效' });
        continue;
      }
      if (quantity <= 0) {
        errors.push({ sku_id, message: '数量必须大于0' });
        continue;
      }
      const balance = db.prepare('SELECT quantity FROM stock_balances WHERE location_id = ? AND sku_id = ?').get(location_id, sku_id);
      const currentQty = balance ? balance.quantity : 0;
      if (currentQty < quantity) {
        const sku = db.prepare('SELECT volume FROM skus WHERE id = ?').get(sku_id);
        errors.push({ sku_id, message: `库存不足：${sku ? sku.volume : ''} 剩余 ${currentQty}，需要 ${quantity}` });
        continue;
      }
      db.prepare('INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, remark, operator, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(location_id, sku_id, type, -quantity, 'stock_out', remark || '', operator || '', req.clientSource);
      db.prepare('UPDATE stock_balances SET quantity = quantity - ?, updated_at = datetime(\'now\', \'localtime\') WHERE location_id = ? AND sku_id = ?')
        .run(quantity, location_id, sku_id);
      successCount++;
    }
    return { successCount, errors };
  });

  try {
    const result = transaction.immediate();
    res.json({ success: true, data: result, message: `成功 ${result.successCount} 条${result.errors.length ? '，失败 ' + result.errors.length + ' 条' : ''}` });
  } catch (err) {
    if (err.code === 'BUSINESS_ERROR') return res.json({ success: false, message: err.message });
    throw err;
  }
});

module.exports = router;
