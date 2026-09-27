const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

const { authorize, validateMovement } = require('../middleware/business');
router.use(authMiddleware, authorize('transfer'));

router.get('/', (req, res) => {
  const db = getDb();
  const { from_location_id, to_location_id } = req.query;
  let sql = 'SELECT t.*, fl.name as from_name, tl.name as to_name FROM transfers t JOIN locations fl ON t.from_location_id = fl.id JOIN locations tl ON t.to_location_id = tl.id WHERE 1=1';
  const params = [];
  if (from_location_id) { sql += ' AND t.from_location_id = ?'; params.push(from_location_id); }
  if (to_location_id) { sql += ' AND t.to_location_id = ?'; params.push(to_location_id); }
  sql += ' ORDER BY t.created_at DESC';
  const transfers = db.prepare(sql).all(...params);
  for (const t of transfers) {
    t.items = db.prepare('SELECT ti.*, s.volume, s.sku_code, p.name as product_name FROM transfer_items ti JOIN skus s ON ti.sku_id = s.id JOIN products p ON s.product_id = p.id WHERE ti.transfer_id = ?').all(t.id);
  }
  res.json({ success: true, data: transfers });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const data = db.prepare('SELECT t.*, fl.name AS from_name, tl.name AS to_name FROM transfers t JOIN locations fl ON fl.id=t.from_location_id JOIN locations tl ON tl.id=t.to_location_id WHERE t.id=?').get(req.params.id);
  if (!data) return res.status(404).json({success:false,message:'调拨单不存在'});
  data.items = db.prepare('SELECT i.*, s.volume, s.sku_code, p.name AS product_name FROM transfer_items i JOIN skus s ON s.id=i.sku_id JOIN products p ON p.id=s.product_id WHERE i.transfer_id=?').all(data.id);
  res.json({success:true,data});
});

router.post('/',  validateMovement('transfer'), (req, res) => {
  const { from_location_id, to_location_id, items, operator } = req.body;
  if (!from_location_id || !to_location_id || !items || items.length === 0) {
    return res.json({ success: false, message: '调出场所、调入场所、明细不能为空' });
  }
  if (from_location_id === to_location_id) {
    return res.json({ success: false, message: '调出和调入场所不能相同' });
  }

  const db = getDb();
  const transaction = db.transaction(() => {
    const result = db.prepare('INSERT INTO transfers (from_location_id, to_location_id, status, operator) VALUES (?, ?, ?, ?)')
      .run(from_location_id, to_location_id, 'completed', operator || '');
    const transferId = result.lastInsertRowid;

    for (const item of items) {
      const { sku_id, quantity } = item;
      if (quantity <= 0) {
        throw Object.assign(new Error('调拨数量必须大于0'), { code: 'BUSINESS_ERROR' });
      }
      const balance = db.prepare('SELECT quantity FROM stock_balances WHERE location_id = ? AND sku_id = ?').get(from_location_id, sku_id);
      const currentQty = balance ? balance.quantity : 0;
      if (currentQty < quantity) {
        throw Object.assign(new Error(`库存不足：${currentQty} < ${quantity}`), { code: 'BUSINESS_ERROR' });
      }

      db.prepare('INSERT INTO transfer_items (transfer_id, sku_id, quantity) VALUES (?, ?, ?)').run(transferId, sku_id, quantity);

      db.prepare('INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, operator, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(from_location_id, sku_id, 'transfer_out', -quantity, 'transfer', transferId, operator || '', req.clientSource);
      db.prepare('UPDATE stock_balances SET quantity = quantity - ?, updated_at = datetime(\'now\', \'localtime\') WHERE location_id = ? AND sku_id = ?')
        .run(quantity, from_location_id, sku_id);

      db.prepare('INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, operator, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(to_location_id, sku_id, 'transfer_in', quantity, 'transfer', transferId, operator || '', req.clientSource);
      const toBalance = db.prepare('SELECT id FROM stock_balances WHERE location_id = ? AND sku_id = ?').get(to_location_id, sku_id);
      if (toBalance) {
        db.prepare('UPDATE stock_balances SET quantity = quantity + ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(quantity, toBalance.id);
      } else {
        db.prepare('INSERT INTO stock_balances (location_id, sku_id, quantity) VALUES (?, ?, ?)').run(to_location_id, sku_id, quantity);
      }
    }
    return transferId;
  });

  try {
    const transferId = transaction();
    res.json({ success: true, data: { id: transferId }, message: '调拨成功' });
  } catch (err) {
    if (err.code === 'BUSINESS_ERROR') return res.json({ success: false, message: err.message });
    throw err;
  }
});

module.exports = router;
