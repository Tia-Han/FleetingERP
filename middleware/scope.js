const { getDb } = require('../utils/db');
const scopedResources = new Set(['stock', 'stockIn', 'stockOut', 'sales', 'split', 'system']);
const detailTables = {
  stockIn: { table: 'stock_in_orders', columns: ['location_id'] },
  sales: { table: 'sales', columns: ['location_id'] },
  split: { table: 'split_orders', columns: ['location_id'] },
  transfer: { table: 'transfers', columns: ['from_location_id', 'to_location_id'] }
};
const deny = res => res.status(403).json({ success: false, message: '无权访问其他场所' });

// Collection/write scope is independent of route names such as /summary or /config.
function scope(resource) {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    const location = req.user.location_id;
    if (scopedResources.has(resource)) {
      if (['GET', 'HEAD'].includes(req.method)) {
        if (req.query.location_id && Number(req.query.location_id) !== location) return deny(res);
        req.query.location_id = String(location);
      } else if (req.body?.location_id !== undefined && Number(req.body.location_id) !== location) {
        return deny(res);
      }
    }
    if (resource === 'transfer' && req.method === 'POST' && Number(req.body?.from_location_id) !== location) return deny(res);
    next();
  };
}

// Apply directly to the detail route, after Express has resolved req.params.id.
function scopeDetail(resource) {
  const definition = detailTables[resource];
  if (!definition) throw new Error('Unknown scoped detail resource');
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    const { table, columns } = definition;
    const row = getDb().prepare(`SELECT ${columns.join(',')} FROM ${table} WHERE id=?`).get(req.params.id);
    if (!row || !columns.some(column => row[column] === req.user.location_id)) return deny(res);
    next();
  };
}
module.exports = { scope, scopeDetail };
