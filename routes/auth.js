const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../utils/db');
const { authMiddleware, SECRET } = require('../middleware/auth');

const loginAttempts = {};

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, message: '请输入用户名和密码' });
  }
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  if (loginAttempts[ip]) {
    loginAttempts[ip] = loginAttempts[ip].filter(t => now - t < 300000);
    if (loginAttempts[ip].length >= 5) {
      return res.json({ success: false, message: '登录失败次数过多，请5分钟后再试' });
    }
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    if (!loginAttempts[ip]) loginAttempts[ip] = [];
    loginAttempts[ip].push(now);
    return res.json({ success: false, message: '用户名或密码错误' });
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    if (!loginAttempts[ip]) loginAttempts[ip] = [];
    loginAttempts[ip].push(now);
    return res.json({ success: false, message: '用户名或密码错误' });
  }
  if (loginAttempts[ip]) delete loginAttempts[ip];
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    SECRET,
    { expiresIn: '8h' }
  );
  res.json({
    success: true,
    data: { token, user: { id: user.id, username: user.username, role: user.role, name: user.name } }
  });
});

router.put('/change-password', authMiddleware, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    return res.json({ success: false, message: '请输入旧密码和新密码' });
  }
  if (new_password.length < 6) {
    return res.json({ success: false, message: '新密码至少6位' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(old_password, user.password_hash)) {
    return res.json({ success: false, message: '旧密码错误' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ success: true, message: '密码修改成功' });
});

router.post('/logout', authMiddleware, (req, res) => {
  res.json({ success: true, message: '已退出登录' });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ success: true, data: req.user });
});

router.get('/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.json({ success: false, message: '无权限' });
  }
  const db = getDb();
  const users = db.prepare('SELECT id, username, role, name, created_at FROM users ORDER BY id').all();
  res.json({ success: true, data: users });
});

router.post('/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.json({ success: false, message: '无权限' });
  }
  const { username, password, role, name } = req.body;
  if (!username || !password || !role || !name) {
    return res.json({ success: false, message: '用户名、密码、角色、姓名不能为空' });
  }
  if (!['admin', 'warehouse_manager', 'store_clerk'].includes(role)) {
    return res.json({ success: false, message: '角色无效' });
  }
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.json({ success: false, message: '用户名已存在' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash, role, name) VALUES (?, ?, ?, ?)').run(username, hash, role, name);
  res.json({ success: true, data: { id: result.lastInsertRowid }, message: '用户创建成功' });
});

router.delete('/users/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.json({ success: false, message: '无权限' });
  }
  const userId = parseInt(req.params.id);
  if (userId === req.user.id) {
    return res.json({ success: false, message: '不能删除当前登录用户' });
  }
  const db = getDb();
  const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.json({ success: false, message: '用户不存在' });
  }
  if (user.username === 'admin') {
    return res.json({ success: false, message: '不能删除系统管理员账号' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ success: true, message: '用户删除成功' });
});

module.exports = router;
