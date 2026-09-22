const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

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
