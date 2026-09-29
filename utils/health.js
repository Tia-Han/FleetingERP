function databaseHealth({getDb,isMaintenance}) {
  try {
    if (isMaintenance()) return false;
    const db = getDb();
    db.prepare('SELECT id FROM users LIMIT 1').get();
    db.prepare('SELECT location_id,sku_id,quantity FROM stock_balances LIMIT 1').get();
    return true;
  } catch { return false; }
}
module.exports = {databaseHealth};
