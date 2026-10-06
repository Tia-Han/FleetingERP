const fs = require('fs');
const path = require('path');

// 环境配置加载：优先 .env.{NODE_ENV}，回退到 .env
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
const envPaths = [path.join(__dirname, envFile), path.join(__dirname, '.env')];
for (const envPath of (process.env.LOCAL_DEV_ISOLATED === '1' ? [] : envPaths)) {
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w-]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
    break;
  }
}

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const os = require('os');
const { getDb, initDatabase, isMaintenance, closeDatabase } = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// OPT-2/SEC-05: CORS 配置 — 生产环境严格限制来源
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// SEC-05: 生产环境禁止通配符 origin
if (process.env.NODE_ENV === 'production' && corsOrigins.includes('*')) {
  console.error('[安全警告] 生产环境不允许 CORS_ORIGIN=*，请配置具体域名');
  process.exit(1);
}

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Source', 'Idempotency-Key'],
}));

// OPT-10: 请求日志中间件
const logFormat = process.env.NODE_ENV === 'production'
  ? 'combined'
  : ':method :url :status :res[content-length] - :response-time ms';
app.use(morgan(logFormat, {
  skip: (req) => req.path === '/api/health' && process.env.NODE_ENV !== 'production',
}));

// 解析客户端来源标记
app.use((req, res, next) => {
  req.clientSource = req.headers['x-client-source'] || 'web';
  next();
});

app.use(express.json({ limit: '10mb' }));

// Personal inventory edition: commercial modules are not published.
app.use((req, res, next) => {
  const blocked = /^\/api\/(?:v1\/)?(?:sales|customers|split)(?:\/|$)/i.test(req.path)
    || /^\/api\/(?:v1\/)?system\/export-excel\/?$/i.test(req.path) && req.query.type === 'sales'
    || /^\/js\/pages\/(sales|customers|split)\.js$/i.test(req.path);
  if (blocked) return res.status(404).json({ success: false, message: '个人物品版不提供此功能' });
  next();
});

// OPT-9: 静态文件缓存策略 — HTML 不缓存，CSS/JS/图片设置 7 天缓存
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else if (/\.html$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// OPT-3: API 版本前缀 /api/v1/
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (isMaintenance()) return res.status(503).json({ success: false, message: '数据库恢复中，请稍后重试' });
  next();
});
const API_V1 = '/api/v1';
app.use(`${API_V1}/auth`, require('./routes/auth'));
app.use(`${API_V1}/brands`, require('./routes/brands'));
app.use(`${API_V1}/products`, require('./routes/products'));
app.use(`${API_V1}/skus`, require('./routes/skus'));
app.use(`${API_V1}/locations`, require('./routes/locations'));
app.use(`${API_V1}/stock`, require('./routes/stock'));
app.use(`${API_V1}/stock-in`, require('./routes/stockIn'));
app.use(`${API_V1}/stock-out`, require('./routes/stockOut'));
app.use(`${API_V1}/transfer`, require('./routes/transfer'));
app.use(`${API_V1}/system`, require('./routes/system'));

app.get('/api/health', (req, res) => {
  const ready = require('./utils/health').databaseHealth({getDb,isMaintenance});
  res.set('Cache-Control','no-store');
  res.status(ready ? 200 : 503).json({ success: ready, status: ready ? 'ok' : 'unavailable', timestamp: new Date().toISOString() });
});

// OPT-8: API 文档（Swagger）
let swaggerSpec = null;
try {
  const swaggerJsdoc = require('swagger-jsdoc');
  swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'FleetingERP API',
        version: '1.0.0',
        description: '个人物品记录 API 文档',
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    apis: ['auth','brands','products','skus','locations','stock','stockIn','stockOut','transfer','system'].map(name => path.join(__dirname, 'routes', name + '.js')),
  });
} catch (e) {
  // swagger-jsdoc 可选依赖，不影响运行
}

app.get('/api/docs', (req, res) => {
  if (swaggerSpec) {
    return res.json(swaggerSpec);
  }
  res.status(503).json({ success: false, message: 'API 文档不可用，请确认 swagger-jsdoc 已安装' });
});

// 向后兼容：保留 /api/ 前缀重定向到 /api/v1/
app.use('/api', (req, res, next) => {
  const isVersioned = /^\/v\d+(?:\/|\?|$)/.test(req.url);
  if (!isVersioned) {
    return res.redirect(308, `/api/v1${req.url}`);
  }
  next();
});

app.use('/api', (req, res) => res.status(404).json({ success: false, message: '接口不存在' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (err.code && err.code.startsWith('SQLITE_CONSTRAINT')) {
    return res.status(409).json({ success: false, message: '数据约束冲突，请检查输入和库存' });
  }
  if (err.code === 'BUSINESS_ERROR') {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(err.status || 500).json({ success: false, message: err.status === 503 ? err.message : '服务器错误，请重试' });
});

initDatabase();
const systemRouter = require('./routes/system');
let backupTask = null;
const runBackup = () => {
  if (!backupTask) backupTask = systemRouter._autoBackup().catch(err => console.error('自动备份失败', err)).finally(() => { backupTask = null; });
  return backupTask;
};
runBackup();
// Check hourly so an uninterrupted process also creates daily snapshots.
const backupTimer = setInterval(runBackup, 60 * 60 * 1000);
backupTimer.unref();

const server = app.listen(PORT, HOST, () => {
  console.log(`\n个人物品记录运行中:\n`);
  console.log(`  环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  本机访问:   http://localhost:${PORT}`);
  const lanIPs = getLanIPs();
  if (lanIPs.length > 0) {
    for (const ip of lanIPs) {
      console.log(`  局域网访问: http://${ip}:${PORT}`);
    }
  }
  console.log(`  API 版本: /api/v1/`);
  console.log(`  API 文档: http://localhost:${PORT}/api/docs`);
  console.log(`  CORS 允许来源: ${corsOrigins.join(', ')}`);
  console.log(`\n  首次使用请用默认账号登录`);
  console.log('');
});

function getLanIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// Stop accepting traffic, drain active requests/backups, then close SQLite before PM2 restarts.
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(backupTimer);
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  server.close(async () => {
    try {
      if (backupTask) await backupTask;
      closeDatabase();
      clearTimeout(deadline);
      process.exit(0);
    } catch (error) {
      console.error('关闭数据库失败', error);
      process.exit(1);
    }
  });
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
module.exports = { app, server };
