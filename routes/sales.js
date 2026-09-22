const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

const POINTS_PER_YUAN = 0.1;
const POINTS_TO_YUAN = 0.01;

router.post('/', (req, res) => {
  const { location_id, customer_id, items, discount, points_used, payments, operator, remark } = req.body;
  if (!location_id || !items || items.length === 0) {
    return res.json({ success: false, message: '场所和销售明细不能为空' });
  }

  const db = getDb();
  const transaction = db.transaction(() => {
    for (const item of items) {
      const balance = db.prepare('SELECT quantity FROM stock_balances WHERE location_id = ? AND sku_id = ?').get(location_id, item.sku_id);
      const currentQty = balance ? balance.quantity : 0;
      if (currentQty < item.quantity) {
        const sku = db.prepare('SELECT volume FROM skus WHERE id = ?').get(item.sku_id);
        throw Object.assign(new Error(`库存不足：${sku ? sku.volume : ''} 当前剩余 ${currentQty}，需要 ${item.quantity}`), { code: 'BUSINESS_ERROR' });
      }
    }

    let subtotal = 0;
    for (const item of items) {
      subtotal += item.quantity * item.unit_price;
    }
    const discountAmount = discount || 0;
    const pointsUsedValue = (points_used || 0) * POINTS_TO_YUAN;
    const finalAmount = subtotal - discountAmount - pointsUsedValue;

    if (finalAmount < 0) {
      throw Object.assign(new Error('实付金额不能小于0'), { code: 'BUSINESS_ERROR' });
    }

    let pointsEarned = Math.floor(finalAmount * POINTS_PER_YUAN);
    if (customer_id && points_used > 0) {
      const customer = db.prepare('SELECT points FROM customers WHERE id = ?').get(customer_id);
      if (!customer || customer.points < points_used) {
        throw Object.assign(new Error('客户积分不足'), { code: 'BUSINESS_ERROR' });
      }
    }

    if (payments && payments.length > 0) {
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
      if (Math.abs(totalPaid - finalAmount) > 0.01) {
        throw Object.assign(new Error(`支付金额不符：应付 ${finalAmount}，实付 ${totalPaid}`), { code: 'BUSINESS_ERROR' });
      }
    }

    const saleResult = db.prepare('INSERT INTO sales (location_id, customer_id, total_amount, discount, final_amount, points_earned, points_used, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(location_id, customer_id || null, subtotal, discountAmount, finalAmount, pointsEarned, points_used || 0, operator || '', remark || '');
    const saleId = saleResult.lastInsertRowid;

    for (const item of items) {
      db.prepare('INSERT INTO sale_items (sale_id, sku_id, quantity, unit_price) VALUES (?, ?, ?, ?)').run(saleId, item.sku_id, item.quantity, item.unit_price);
      db.prepare('INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, operator, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(location_id, item.sku_id, 'sale', -item.quantity, 'sale', saleId, operator || '', req.clientSource);
      db.prepare('UPDATE stock_balances SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE location_id = ? AND sku_id = ?')
        .run(item.quantity, location_id, item.sku_id);
    }

    if (payments && payments.length > 0) {
      for (const payment of payments) {
        db.prepare('INSERT INTO payments (sale_id, method, amount) VALUES (?, ?, ?)').run(saleId, payment.method, payment.amount);
      }
    }

    if (customer_id) {
      db.prepare('UPDATE customers SET points = points - ? + ?, total_spent = total_spent + ? WHERE id = ?')
        .run(points_used || 0, pointsEarned, finalAmount, customer_id);
    }

    return saleId;
  });

  try {
    const saleId = transaction();
    res.json({ success: true, data: { id: saleId }, message: '销售成功' });
  } catch (err) {
    if (err.code === 'BUSINESS_ERROR') return res.json({ success: false, message: err.message });
    throw err;
  }
});

router.get('/', (req, res) => {
  const db = getDb();
  const { location_id, start_date, end_date } = req.query;
  let sql = 'SELECT s.*, l.name as location_name, c.wechat_name as customer_name FROM sales s JOIN locations l ON s.location_id = l.id LEFT JOIN customers c ON s.customer_id = c.id WHERE 1=1';
  const params = [];
  if (location_id) { sql += ' AND s.location_id = ?'; params.push(location_id); }
  if (start_date) { sql += ' AND s.created_at >= ?'; params.push(start_date); }
  if (end_date) { sql += ' AND s.created_at <= ?'; params.push(end_date); }
  sql += ' ORDER BY s.created_at DESC';
  const sales = db.prepare(sql).all(...params);
  res.json({ success: true, data: sales });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const sale = db.prepare('SELECT s.*, l.name as location_name, c.wechat_name as customer_name, c.phone as customer_phone FROM sales s JOIN locations l ON s.location_id = l.id LEFT JOIN customers c ON s.customer_id = c.id WHERE s.id = ?').get(req.params.id);
  if (!sale) return res.json({ success: false, message: '销售单不存在' });
  sale.items = db.prepare('SELECT si.*, s.volume, s.sku_code, p.name as product_name FROM sale_items si JOIN skus s ON si.sku_id = s.id JOIN products p ON s.product_id = p.id WHERE si.sale_id = ?').all(req.params.id);
  sale.payments = db.prepare('SELECT * FROM payments WHERE sale_id = ?').all(req.params.id);
  res.json({ success: true, data: sale });
});

module.exports = router;
