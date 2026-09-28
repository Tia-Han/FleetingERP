const jwt = require('jsonwebtoken');
const { getDb } = require('../utils/db');

// OPT-5: JWT 密钥安全加固 — 移除默认值，强制从环境变量读取
const SECRET = process.env.JWT_SECRET;

if (!SECRET || SECRET.length < 32) {
  if (process.env.NODE_ENV !== 'test') {
    console.error('[安全警告] JWT_SECRET 未设置或长度不足 32 字符。');
    console.error('  生成方式: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    console.error('  请在 .env.development 或 .env.production 中配置 JWT_SECRET');
    process.exit(1);
  }
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: '请先登录' });
  }
  let claims;
  try { claims = jwt.verify(token, SECRET, { algorithms: ['HS256'] }); }
  catch { return res.status(401).json({ success: false, message: '登录已过期，请重新登录' }); }
  try {
    const user = getDb().prepare('SELECT u.id,u.username,u.role,u.name,u.session_version,u.enabled,u.location_id,l.type location_type FROM users u LEFT JOIN locations l ON l.id=u.location_id WHERE u.id = ?').get(claims.id);
    if (!user || !user.enabled || !claims.version || claims.version !== user.session_version) {
      return res.status(401).json({ success: false, message: '登录已失效，请重新登录' });
    }
    if(user.role!=='admin' && (!user.location_id || user.location_type !== (user.role==='store_clerk'?'store':'warehouse'))) return res.status(403).json({success:false,message:'请管理员先绑定正确的场所'});
    req.user = { id: user.id, username: user.username, role: user.role, name: user.name, location_id:user.location_id };
    next();
  } catch (e) { next(e); }
}

// SEC-04: 角色权限校验中间件
function roleMiddleware(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '请先登录' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: '无权限执行此操作' });
    }
    next();
  };
}

module.exports = { authMiddleware, roleMiddleware, SECRET };
