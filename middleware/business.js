const { getDb } = require('../utils/db');
const { roleMiddleware } = require('./auth');

// Keep the existing web permissions for outbound stock and transfers.
const writers = {
  brands: ['admin', 'warehouse_manager'], products: ['admin', 'warehouse_manager'],
  skus: ['admin', 'warehouse_manager'], locations: ['admin'],
  stockIn: ['admin', 'warehouse_manager'], stock: ['admin', 'warehouse_manager'],
  split: ['admin', 'warehouse_manager'], stockOut: ['admin', 'warehouse_manager', 'store_clerk'],
  transfer: ['admin', 'warehouse_manager', 'store_clerk'], sales: ['admin', 'store_clerk'],
  customers: ['admin', 'store_clerk'],
};
function authorize(resource) {
  return (req, res, next) => {
    const mutate = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (resource === 'customers' || mutate) {
      return roleMiddleware(...writers[resource])(req, res, () => {
        if (mutate && req.body && typeof req.body === 'object') req.body.operator = req.user.name;
        next();
      });
    }
    next();
  };
}
function fail(message) { throw Object.assign(new Error(message), { code: 'BUSINESS_ERROR' }); }
function number(value, label, { min = 0, integer = false, max = 1000000000 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail(`${label}格式或范围不正确`);
  return value;
}
function id(value, label) {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) value = Number(value);
  return number(value, label, { min: 1, integer: true });
}
function money(value, label) {
  number(value, label);
  const cents = Math.round(value * 100);
  if (Math.abs(value * 100 - cents) > 0.00001) fail(`${label}最多保留两位小数`);
  return cents;
}
function items(value) {
  if (!Array.isArray(value) || !value.length || value.length > 500 || value.some(i => !i || typeof i !== 'object' || Array.isArray(i))) fail('明细必须为 1 至 500 项');
  return value;
}
function sku(db, value) {
  const skuId = id(value, 'SKU');
  const row = db.prepare('SELECT s.* FROM skus s JOIN products p ON p.id = s.product_id JOIN brands b ON b.id = p.brand_id WHERE s.id = ? AND s.is_deleted = 0 AND p.is_deleted = 0 AND b.is_deleted = 0').get(skuId);
  if (!row) fail('SKU 不存在或已删除');
  return row;
}
function location(db, value) {
  const locId = id(value, '场所');
  if (!db.prepare('SELECT id FROM locations WHERE id = ?').get(locId)) fail('场所不存在');
  return locId;
}
function validateMovement(kind) {
  return (req, res, next) => {
    try {
      const b = req.body;
      if (!b || typeof b !== 'object' || Array.isArray(b)) fail('请求格式不正确');
      const db = getDb();
      if (kind === 'transfer') {
        b.from_location_id = location(db, b.from_location_id);
        b.to_location_id = location(db, b.to_location_id);
        if (b.from_location_id === b.to_location_id) fail('调出和调入场所不能相同');
      } else b.location_id = location(db, b.location_id);
      const rows = kind === 'stockOut' && req.path !== '/batch' && req.url !== '/batch' ? [b] : items(b.items);
      const seen = new Set();
      for (const item of rows) {
        if (kind === 'split') {
          number(item.quantity, '分装数量', {min:1, integer:true});
          number(item.unit_volume, '分装容量', {min:0.001});
          if (item.target_sku_id) item.target_sku_id = sku(db, item.target_sku_id).id;
        } else {
          item.sku_id = sku(db, item.sku_id).id;
          if (kind === 'stock') {
            number(item.actual_quantity, '实盘数量', {integer:true});
            if (seen.has(item.sku_id)) fail('同一 SKU 不能重复盘点');
            seen.add(item.sku_id);
          } else number(item.quantity, '数量', {min:1, integer:true});
        }
        if (kind === 'stockIn') money(item.unit_cost, '成本价');
        if (kind === 'sales') money(item.unit_price, '销售单价');
        if (kind === 'stockOut' && !['out', 'loss'].includes(item.type)) fail('出库类型无效');
      }
      if (kind === 'sales') {
        b.discount = b.discount ?? 0; b.points_used = b.points_used ?? 0;
        money(b.discount, '折扣'); number(b.points_used, '使用积分', {integer:true});
        if (b.customer_id) {
          b.customer_id = id(b.customer_id, '客户');
          if (!db.prepare('SELECT id FROM customers WHERE id = ?').get(b.customer_id)) fail('客户不存在');
        } else if (b.points_used) fail('积分抵扣必须选择客户');
        items(b.payments);
        for (const p of b.payments) {
          money(p.amount, '支付金额');
          if (typeof p.method !== 'string' || !p.method.trim() || p.method.length > 50) fail('支付方式无效');
        }
      }
      if (kind === 'split') {
        const source = sku(db, b.source_sku_id); b.source_sku_id = source.id;
        number(b.source_quantity, '消耗数量', {min:1, integer:true});
        number(b.waste_volume ?? 0, '损耗容量');
        if (source.spec_type !== '整装' || !(source.volume_ml > 0) || !db.prepare('SELECT is_splittable FROM products WHERE id=?').get(source.product_id).is_splittable) fail('源商品必须是有容量的整装 SKU');
        for (const item of rows) {
          if (item.target_sku_id) {
            const target = sku(db, item.target_sku_id);
            if (target.product_id !== source.product_id || target.spec_type !== '分装' || target.volume_ml !== item.unit_volume) fail('分装目标必须属于源商品且容量匹配');
            item.unit_volume = target.volume_ml;
          }
        }
      }
      next();
    } catch (e) { next(e); }
  };
}
module.exports = { authorize, validateMovement, fail, number, id, money, items };
