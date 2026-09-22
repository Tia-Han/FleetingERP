const fs = require('fs');
const path = require('path');

// 环境配置加载：优先 .env.{NODE_ENV}，回退到 .env
const envFile = `.env.${process.env.NODE_ENV || 'development'}`;
const envPaths = [path.join(__dirname, envFile), path.join(__dirname, '.env')];
for (const envPath of envPaths) {
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
const { initDatabase } = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Source'],
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
const API_V1 = '/api/v1';
app.use(`${API_V1}/auth`, require('./routes/auth'));
app.use(`${API_V1}/brands`, require('./routes/brands'));
app.use(`${API_V1}/products`, require('./routes/products'));
app.use(`${API_V1}/skus`, require('./routes/skus'));
app.use(`${API_V1}/locations`, require('./routes/locations'));
app.use(`${API_V1}/stock`, require('./routes/stock'));
app.use(`${API_V1}/stock-in`, require('./routes/stockIn'));
app.use(`${API_V1}/stock-out`, require('./routes/stockOut'));
app.use(`${API_V1}/split`, require('./routes/split'));
app.use(`${API_V1}/transfer`, require('./routes/transfer'));
app.use(`${API_V1}/sales`, require('./routes/sales'));
app.use(`${API_V1}/customers`, require('./routes/customers'));
app.use(`${API_V1}/system`, require('./routes/system'));

// 向后兼容：保留 /api/ 前缀重定向到 /api/v1/
app.use('/api', (req, res, next) => {
  const isVersioned = /^\/v\d+\//.test(req.url);
  if (!isVersioned) {
    return res.redirect(308, `/api/v1${req.url}`);
  }
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// OPT-8: API 文档（Swagger）
let swaggerSpec = null;
let swaggerUiAssetPath = null;
try {
  const swaggerJsdoc = require('swagger-jsdoc');
  swaggerSpec = swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'FleetingERP API',
        version: '1.0.0',
        description: '香氛零售门店 ERP 系统 API 文档',
      },
      servers: [{ url: '/api/v1' }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    apis: ['./routes/*.js'],
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

app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.json({ success: false, message: '数据冲突，请检查是否重复' });
  }
  if (err.code === 'BUSINESS_ERROR') {
    return res.json({ success: false, message: err.message });
  }
  res.json({ success: false, message: '服务器错误，请重试' });
});

initDatabase();
const systemRouter = require('./routes/system');
if (systemRouter._autoBackup) systemRouter._autoBackup();

app.listen(PORT, HOST, () => {
  console.log(`\n香氛库存管理系统运行中:\n`);
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
