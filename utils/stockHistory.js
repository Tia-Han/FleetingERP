// Read-only projection: transfer receipts share transfer IDs, never create new orders.
function inboundHistory(db, q) {
  const branches = [];
  const params = [];
  for (const transfer of [false, true]) {
    const type = transfer ? 'transfer_in' : 'in';
    if (q.type && q.type !== type) continue;
    const alias = transfer ? 't' : 'o';
    const table = transfer ? 'transfers' : 'stock_in_orders';
    const items = transfer ? 'transfer_items' : 'stock_in_items';
    const fk = transfer ? 'transfer_id' : 'order_id';
    const loc = transfer ? 'to_location_id' : 'location_id';
    let sql = `SELECT ${alias}.id, '${type}' AS record_type, ${alias}.${loc} AS location_id,
      ${alias}.created_at, ${alias}.operator, l.name AS location_name,
      ${transfer ? "''" : 'o.supplier'} AS supplier, ${transfer ? "''" : 'o.remark'} AS remark,
      ${transfer ? 'NULL' : 'o.total_cost'} AS total_cost,
      (SELECT COUNT(*) FROM ${items} i WHERE i.${fk}=${alias}.id) AS item_count,
      ${transfer ? 'fl.name' : "''"} AS from_name, ${transfer ? 'l.name' : "''"} AS to_name
      FROM ${table} ${alias} JOIN locations l ON l.id=${alias}.${loc}
      ${transfer ? 'JOIN locations fl ON fl.id=t.from_location_id' : ''} WHERE 1=1`;
    if (transfer) sql += " AND t.status='completed'";
    for (const [key, expression, value] of [
      ['location_id',`${alias}.${loc} = ?`,q.location_id],
      ['operator',`${alias}.operator LIKE ?`,'%'+q.operator+'%'],
      ['start_date',`${alias}.created_at >= ?`,q.start_date+' 00:00:00'],
      ['end_date',`${alias}.created_at <= ?`,q.end_date+' 23:59:59']
    ]) if (q[key]) { sql += ' AND '+expression; params.push(value); }
    if (q.supplier) { sql += transfer ? ' AND 0' : ' AND o.supplier LIKE ?'; if (!transfer) params.push('%'+q.supplier+'%'); }
    for (const [key,column] of [['product','p.name'],['brand','b.name']]) {
      if (q[key]) {
        sql += ` AND EXISTS (SELECT 1 FROM ${items} i JOIN skus s ON s.id=i.sku_id JOIN products p ON p.id=s.product_id JOIN brands b ON b.id=p.brand_id WHERE i.${fk}=${alias}.id AND ${column} LIKE ?)`;
        params.push('%'+q[key]+'%');
      }
    }
    branches.push(sql);
  }
  const page = Number(q.page || 1), limit = Number(q.limit || 50);
  if (!branches.length) return {success:true,data:[],total:0,page,limit};
  const union = branches.join(' UNION ALL ');
  const total = db.prepare(`SELECT COUNT(*) AS count FROM (${union})`).get(...params).count;
  const data = db.prepare(`SELECT * FROM (${union}) ORDER BY created_at DESC, record_type, id DESC LIMIT ? OFFSET ?`).all(...params,limit,(page-1)*limit);
  return {success:true,data,total,page,limit};
}
module.exports = { inboundHistory };
