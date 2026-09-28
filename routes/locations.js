const {idempotent}=require('../middleware/idempotency');
const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

const { authorize } = require('../middleware/business');
const { validateCatalog } = require('../middleware/catalog');
router.use(authMiddleware, require('../middleware/scope').scope('locations'), authorize('locations'), validateCatalog('locations'));

router.get('/', (req, res) => {
  const db = getDb();
  const locations = req.user.role==='admin' ? db.prepare('SELECT * FROM locations ORDER BY type,name').all() : req.query.destinations==='1' ? db.prepare('SELECT id,name,type FROM locations ORDER BY type,name').all() : db.prepare('SELECT * FROM locations WHERE id=?').all(req.user.location_id);
  res.json({ success: true, data: locations });
});

router.post('/', idempotent((req, res) => {
  const { name, type, address } = req.body;
  if (!name || !type) return res.json({ success: false, message: '名称和类型不能为空' });
  if (!['warehouse', 'store'].includes(type)) return res.json({ success: false, message: '类型必须是 warehouse 或 store' });
  const db = getDb();
  if(db.prepare("SELECT id FROM locations WHERE lower(trim(name))=lower(?) ").get(name)) return res.status(409).json({success:false,message:'同名场所已存在，请使用已有记录'});
  const result = db.prepare('INSERT INTO locations (name, type, address) VALUES (?, ?, ?)').run(name, type, address || '');
  res.json({ success: true, data: { id: result.lastInsertRowid } });
}));

router.put('/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.json({ success: false, message: '无权限' });
  const { name, type, address } = req.body;
  if (!name || !type) return res.json({ success: false, message: '名称和类型不能为空' });
  if (!['warehouse', 'store'].includes(type)) return res.json({ success: false, message: '类型必须是 warehouse 或 store' });
  const db = getDb();
  const existing = db.prepare('SELECT id FROM locations WHERE id = ?').get(req.params.id);
  if (!existing) return res.json({ success: false, message: '场所不存在' });
  db.prepare('UPDATE locations SET name = ?, type = ?, address = ? WHERE id = ?').run(name, type, address || '', req.params.id);
  res.json({ success: true, message: '更新成功' });
});

router.delete('/:id', (req, res) => {
  if (req.user.role !== 'admin') return res.json({ success: false, message: '无权限' });
  const db = getDb();
  const locId = req.params.id;
  if(db.prepare('SELECT 1 FROM users WHERE location_id=?').get(locId)) return res.status(409).json({success:false,message:'场所有绑定用户，不能删除'});
  const hasStock = db.prepare('SELECT COUNT(*) as c FROM stock_balances WHERE location_id = ? AND quantity > 0').get(locId).c;
  if (hasStock > 0) return res.json({ success: false, message: '该场所仍有库存，无法删除' });
  const hasMovements = db.prepare('SELECT COUNT(*) as c FROM stock_movements WHERE location_id = ?').get(locId).c;
  if (hasMovements > 0) return res.json({ success: false, message: '该场所有变动记录，无法删除。建议改为修改名称' });
  db.prepare('DELETE FROM locations WHERE id = ?').run(locId);
  res.json({ success: true, message: '删除成功' });
});

module.exports = router;
