const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../utils/db');
const { authMiddleware, SECRET } = require('../middleware/auth');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 用户登录
 *     description: 使用用户名密码登录，返回 JWT Token
 *     tags: [认证]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 */

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: 获取当前用户信息
 *     tags: [认证]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 当前用户信息
 *       401:
 *         description: 未授权
 */

// OPT-6: 登录限流 — IP 维度 + 用户名维度双限制
const loginAttemptsByIP = {};
const loginAttemptsByUser = {};

function checkRateLimit(key, store, max, windowMs) {
  const now = Date.now();
  if (store[key]) {
    store[key] = store[key].filter(t => now - t < windowMs);
    if (store[key].length >= max) return false;
  }
  return true;
}

function recordFailedAttempt(key, store) {
  if (!store[key]) store[key] = [];
  store[key].push(Date.now());
}

function clearAttempts(key, store) {
  if (store[key]) delete store[key];
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, message: '请输入用户名和密码' });
  }

  const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';

  // IP 维度：5 分钟最多 20 次（放宽，避免 NAT 误限）
  if (!checkRateLimit(ip, loginAttemptsByIP, 20, 300000)) {
    return res.json({ success: false, message: '该 IP 登录失败次数过多，请5分钟后再试' });
  }

  // 用户名维度：5 分钟最多 5 次
  if (!checkRateLimit(username, loginAttemptsByUser, 5, 300000)) {
    return res.json({ success: false, message: '该账号登录失败次数过多，请5分钟后再试' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    recordFailedAttempt(ip, loginAttemptsByIP);
    recordFailedAttempt(username, loginAttemptsByUser);
    return res.json({ success: false, message: '用户名或密码错误' });
  }
  if (!bcrypt.compareSync(password, user.password_hash)) {
    recordFailedAttempt(ip, loginAttemptsByIP);
    recordFailedAttempt(username, loginAttemptsByUser);
    return res.json({ success: false, message: '用户名或密码错误' });
  }

  clearAttempts(ip, loginAttemptsByIP);
  clearAttempts(username, loginAttemptsByUser);

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
