const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

function autoBackup() {
  const dbPath = path.join(__dirname, '..', 'db', 'fragrance.db');
  if (!fs.existsSync(dbPath)) return;
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const backupDir = path.join(__dirname, '..', 'db', 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `fragrance_${dateStr}.db`);
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(dbPath, backupPath);
    const files = fs.readdirSync(backupDir).filter(f => f.startsWith('fragrance_') && f.endsWith('.db'));
    files.sort().reverse();
    for (const file of files.slice(30)) {
      try { fs.unlinkSync(path.join(backupDir, file)); } catch (e) {}
    }
    console.log(`[自动备份] 已备份到 ${backupPath}`);
  }
}

router._autoBackup = autoBackup;

router.get('/dashboard', (req, res) => {
  const db = getDb();
  const { location_id } = req.query;
  const locFilter = location_id ? 'WHERE location_id = ?' : '';
  const params = location_id ? [location_id] : [];

  const data = db.transaction(() => {
    const skuCount = db.prepare('SELECT COUNT(*) as count FROM skus WHERE is_deleted = 0').get().count;
    const stockValue = db.prepare(`SELECT COALESCE(SUM(sb.quantity * s.cost_price), 0) as total FROM stock_balances sb JOIN skus s ON sb.sku_id = s.id ${locFilter}`).get(...params);

    let todaySalesSql = `SELECT COUNT(*) as count, COALESCE(SUM(final_amount), 0) as total FROM sales WHERE date(created_at) = date('now', 'localtime')`;
    const todayParams = [];
    if (location_id) { todaySalesSql += ' AND location_id = ?'; todayParams.push(location_id); }
    const todaySales = db.prepare(todaySalesSql).get(...todayParams);

    let alertSql = `SELECT sb.quantity, s.sku_code, s.volume, s.low_stock_threshold, p.name as product_name, l.name as location_name FROM stock_balances sb JOIN skus s ON sb.sku_id = s.id JOIN products p ON s.product_id = p.id JOIN locations l ON sb.location_id = l.id WHERE s.is_deleted = 0 AND s.low_stock_threshold > 0 AND sb.quantity <= s.low_stock_threshold`;
    if (location_id) { alertSql += ' AND sb.location_id = ?'; }
    alertSql += ' LIMIT 10';
    const alerts = db.prepare(alertSql).all(...params);

    let mvSql = `SELECT movement_type, COUNT(*) as count FROM stock_movements WHERE date(created_at) = date('now', 'localtime')`;
    const mvParams = [];
    if (location_id) { mvSql += ' AND location_id = ?'; mvParams.push(location_id); }
    mvSql += ' GROUP BY movement_type';
    const todayMovements = db.prepare(mvSql).all(...mvParams);

    return { skuCount, stockValue: stockValue.total, todaySales, alerts, todayMovements };
  })();

  res.json({
    success: true,
    data: {
      sku_count: data.skuCount,
      stock_value: data.stockValue,
      today_sales_count: data.todaySales.count,
      today_sales_amount: data.todaySales.total,
      alerts: data.alerts,
      today_movements: data.todayMovements
    }
  });
});

// GET /system/operators - 获取所有操作人列表
router.get('/operators', (req, res) => {
  const db = getDb();
  const operators = db.prepare(`
    SELECT DISTINCT operator FROM (
      SELECT operator FROM stock_in_orders WHERE operator IS NOT NULL AND operator != ''
      UNION
      SELECT operator FROM stock_movements WHERE operator IS NOT NULL AND operator != ''
      UNION
      SELECT operator FROM sales WHERE operator IS NOT NULL AND operator != ''
    ) ORDER BY operator
  `).all().map(row => row.operator);
  res.json({ success: true, data: operators });
});

router.get('/backup', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.json({ success: false, message: '无权限' });
  }
  const dbPath = path.join(__dirname, '..', 'db', 'fragrance.db');
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const backupPath = path.join(__dirname, '..', 'db', `fragrance_backup_${dateStr}.db`);
  fs.copyFileSync(dbPath, backupPath);
  res.download(backupPath, `fragrance_backup_${dateStr}.db`, (err) => {
    if (!err) {
      try { fs.unlinkSync(backupPath); } catch (e) {}
    }
  });
});

router.get('/export-excel', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.json({ success: false, message: '无权限' });
  }
  const { type } = req.query;
  const db = getDb();
  let headers = [], rows = [];

  if (type === 'stock') {
    headers = ['场所', '品牌', '商品', 'SKU编码', '条码', '规格类型', '容量', '库存数量', '成本价', '库存价值', '零售价', '预警阈值'];
    const data = db.prepare(`SELECT l.name as loc, b.name as brand, p.name as product, s.sku_code, s.barcode, s.spec_type, s.volume, sb.quantity, s.cost_price, sb.quantity * s.cost_price as value, s.retail_price, s.low_stock_threshold FROM stock_balances sb JOIN skus s ON sb.sku_id = s.id JOIN products p ON s.product_id = p.id JOIN brands b ON p.brand_id = b.id JOIN locations l ON sb.location_id = l.id WHERE s.is_deleted = 0 AND p.is_deleted = 0 ORDER BY l.name, p.name`).all();
    rows = data.map(r => [r.loc, r.brand, r.product, r.sku_code, r.barcode || '', r.spec_type, r.volume, r.quantity, r.cost_price, r.value, r.retail_price, r.low_stock_threshold]);
  } else if (type === 'movements') {
    headers = ['时间', '场所', '商品', 'SKU编码', '操作类型', '数量', '单位成本', '金额', '操作人', '备注'];
    const data = db.prepare(`SELECT sm.created_at, l.name as loc, p.name as product, s.sku_code, sm.movement_type, sm.quantity, sm.unit_cost, sm.remark, sm.operator FROM stock_movements sm JOIN skus s ON sm.sku_id = s.id JOIN products p ON s.product_id = p.id JOIN locations l ON sm.location_id = l.id ORDER BY sm.created_at DESC LIMIT 5000`).all();
    rows = data.map(r => [r.created_at, r.loc, r.product, r.sku_code, r.movement_type, r.quantity, r.unit_cost || '', (r.unit_cost ? Math.abs(r.quantity) * r.unit_cost : ''), r.operator || '', r.remark || '']);
  } else if (type === 'sales') {
    headers = ['时间', '门店', '客户', '商品总金额', '折扣', '实付金额', '积分获取', '积分使用', '操作人'];
    const data = db.prepare(`SELECT sa.created_at, l.name as loc, c.wechat_name as customer, sa.total_amount, sa.discount, sa.final_amount, sa.points_earned, sa.points_used, sa.operator FROM sales sa JOIN locations l ON sa.location_id = l.id LEFT JOIN customers c ON sa.customer_id = c.id ORDER BY sa.created_at DESC LIMIT 5000`).all();
    rows = data.map(r => [r.created_at, r.loc, r.customer || '散客', r.total_amount, r.discount, r.final_amount, r.points_earned, r.points_used, r.operator || '']);
  } else {
    return res.json({ success: false, message: '不支持导出类型' });
  }

  const csv = [headers, ...rows].map(row => row.map(cell => {
    const s = String(cell == null ? '' : cell);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const bom = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}_${new Date().toISOString().split('T')[0].replace(/-/g, '')}.csv"`);
  res.send(bom + csv);
});

router.get('/backups', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.json({ success: false, message: '无权限' });
  }
  const backupDir = path.join(__dirname, '..', 'db', 'backups');
  const backups = [];
  if (fs.existsSync(backupDir)) {
    const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.db'));
    for (const file of files) {
      const filePath = path.join(backupDir, file);
      const stat = fs.statSync(filePath);
      const dateMatch = file.match(/fragrance_(\d{4})(\d{2})(\d{2})/);
      let dateStr = '';
      if (dateMatch) {
        dateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      }
      backups.push({
        filename: file,
        date: dateStr,
        size: stat.size,
        size_label: stat.size > 1024 * 1024 ? (stat.size / 1024 / 1024).toFixed(1) + 'MB' : (stat.size / 1024).toFixed(0) + 'KB'
      });
    }
    backups.sort((a, b) => b.filename.localeCompare(a.filename));
  }
  res.json({ success: true, data: backups });
});

router.post('/restore', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.json({ success: false, message: '无权限' });
  }
  const { filename } = req.body;
  if (!filename || !/^fragrance_\d{8}\.db$/.test(filename)) {
    return res.json({ success: false, message: '无效的备份文件名' });
  }
  const backupPath = path.join(__dirname, '..', 'db', 'backups', filename);
  if (!fs.existsSync(backupPath)) {
    return res.json({ success: false, message: '备份文件不存在' });
  }
  const dbPath = path.join(__dirname, '..', 'db', 'fragrance.db');
  const safetyPath = path.join(__dirname, '..', 'db', 'fragrance_before_restore.db');
  fs.copyFileSync(dbPath, safetyPath);
  fs.copyFileSync(backupPath, dbPath);
  console.log(`[数据恢复] 已从 ${filename} 恢复数据库，原数据备份为 fragrance_before_restore.db`);
  res.json({ success: true, message: '数据恢复成功，请刷新页面' });
});

module.exports = router;
