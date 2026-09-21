const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');
const { generateSkuCode, generateBarcode } = require('../utils/barcode');

router.use(authMiddleware);

router.post('/', (req, res) => {
  const { location_id, source_sku_id, source_quantity, bottle_consumed, waste_volume, items, operator, remark } = req.body;

  if (!location_id || !source_sku_id || !source_quantity || !items || items.length === 0) {
    return res.json({ success: false, message: '场所、源SKU、消耗数量、分装明细不能为空' });
  }

  const db = getDb();
  const transaction = db.transaction(() => {
    const sourceSku = db.prepare('SELECT * FROM skus WHERE id = ? AND is_deleted = 0').get(source_sku_id);
    if (!sourceSku) {
      throw Object.assign(new Error('源 SKU 不存在'), { code: 'BUSINESS_ERROR' });
    }
    if (!sourceSku.volume_ml || sourceSku.volume_ml <= 0) {
      throw Object.assign(new Error('源 SKU 未设置容量信息，无法分装'), { code: 'BUSINESS_ERROR' });
    }

    const balance = db.prepare('SELECT quantity FROM stock_balances WHERE location_id = ? AND sku_id = ?').get(location_id, source_sku_id);
    const currentQty = balance ? balance.quantity : 0;
    if (currentQty < source_quantity) {
      throw Object.assign(new Error(`库存不足：当前剩余 ${currentQty} 瓶，需要 ${source_quantity} 瓶`), { code: 'BUSINESS_ERROR' });
    }

    const sourceTotalVolume = source_quantity * sourceSku.volume_ml;
    let allocatedVolume = 0;
    for (const item of items) {
      allocatedVolume += item.quantity * item.unit_volume;
    }

    let actualWaste = waste_volume || 0;
    const consumed = bottle_consumed ? 1 : 0;

    if (allocatedVolume > sourceTotalVolume) {
      throw Object.assign(new Error(`分装体积超出：可用 ${sourceTotalVolume}ml，已分配 ${allocatedVolume}ml`), { code: 'BUSINESS_ERROR' });
    }
    if (consumed) {
      if (actualWaste + allocatedVolume > sourceTotalVolume) {
        throw Object.assign(new Error('损耗体积超出剩余量'), { code: 'BUSINESS_ERROR' });
      }
      if (actualWaste === 0 && allocatedVolume < sourceTotalVolume) {
        actualWaste = sourceTotalVolume - allocatedVolume;
      }
    } else {
      if (actualWaste + allocatedVolume > sourceTotalVolume) {
        throw Object.assign(new Error('损耗 + 已分配超出可用总量'), { code: 'BUSINESS_ERROR' });
      }
    }

    const splitResult = db.prepare('INSERT INTO split_orders (location_id, source_sku_id, source_quantity, source_total_volume, actual_used_volume, waste_volume, bottle_consumed, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(location_id, source_sku_id, source_quantity, sourceTotalVolume, allocatedVolume, actualWaste, consumed, operator || '', remark || '');
    const splitId = splitResult.lastInsertRowid;

    for (const item of items) {
      let targetSkuId = item.target_sku_id;
      if (!targetSkuId) {
        const product = db.prepare('SELECT brand_id FROM products WHERE id = ?').get(sourceSku.product_id);
        const count = db.prepare('SELECT COUNT(*) as c FROM skus WHERE product_id = ?').get(sourceSku.product_id).c;
        const skuCode = generateSkuCode(product.brand_id, sourceSku.product_id, count + 1);
        const barcode = generateBarcode(Date.now() % 1000000000);
        const volumeText = `${item.unit_volume}ml`;
        const sourceUnitCost = sourceSku.cost_price || 0;
        const sourceVolumeMl = sourceSku.volume_ml || 1;
        const splitCostPrice = Math.round((sourceUnitCost / sourceVolumeMl) * item.unit_volume * 100) / 100;
        const newSku = db.prepare('INSERT INTO skus (product_id, sku_code, barcode, spec_type, volume, volume_ml, unit, cost_price, retail_price, split_from_sku_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(sourceSku.product_id, skuCode, barcode, '分装', volumeText, item.unit_volume, '瓶', splitCostPrice, 0, source_sku_id);
        targetSkuId = newSku.lastInsertRowid;
      }

      const subtotalVolume = item.quantity * item.unit_volume;
      db.prepare('INSERT INTO split_items (split_order_id, target_sku_id, quantity, unit_volume, subtotal_volume) VALUES (?, ?, ?, ?, ?)')
        .run(splitId, targetSkuId, item.quantity, item.unit_volume, subtotalVolume);

      db.prepare('INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, operator) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(location_id, targetSkuId, 'split', item.quantity, 'split', splitId, operator || '');

      const targetBalance = db.prepare('SELECT id, quantity FROM stock_balances WHERE location_id = ? AND sku_id = ?').get(location_id, targetSkuId);
      if (targetBalance) {
        db.prepare('UPDATE stock_balances SET quantity = quantity + ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?').run(item.quantity, targetBalance.id);
      } else {
        db.prepare('INSERT INTO stock_balances (location_id, sku_id, quantity) VALUES (?, ?, ?)').run(location_id, targetSkuId, item.quantity);
      }
    }

    db.prepare('INSERT INTO stock_movements (location_id, sku_id, movement_type, quantity, ref_type, ref_id, operator) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(location_id, source_sku_id, 'split', -source_quantity, 'split', splitId, operator || '');
    db.prepare('UPDATE stock_balances SET quantity = quantity - ?, updated_at = datetime(\'now\', \'localtime\') WHERE location_id = ? AND sku_id = ?')
      .run(source_quantity, location_id, source_sku_id);

    return splitId;
  });

  try {
    const splitId = transaction();
    res.json({ success: true, data: { id: splitId }, message: '分装成功' });
  } catch (err) {
    if (err.code === 'BUSINESS_ERROR') return res.json({ success: false, message: err.message });
    throw err;
  }
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT so.*, l.name as location_name, s.volume as source_volume, s.sku_code as source_sku_code, p.name as product_name FROM split_orders so JOIN locations l ON so.location_id = l.id JOIN skus s ON so.source_sku_id = s.id JOIN products p ON s.product_id = p.id WHERE so.id = ?').get(req.params.id);
  if (!order) return res.json({ success: false, message: '分装单不存在' });
  order.items = db.prepare('SELECT si.*, s.volume as target_volume, s.sku_code as target_sku_code FROM split_items si JOIN skus s ON si.target_sku_id = s.id WHERE si.split_order_id = ?').all(req.params.id);
  res.json({ success: true, data: order });
});

module.exports = router;
