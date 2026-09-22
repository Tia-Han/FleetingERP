const jwt = require('jsonwebtoken');

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
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: '登录已过期，请重新登录' });
  }
}

// SEC-04: 角色权限校验中间件
function roleMiddleware(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: '请先登录' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.json({ success: false, message: '无权限执行此操作' });
    }
    next();
  };
}

module.exports = { authMiddleware, roleMiddleware, SECRET };
