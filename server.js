// 加载 .env 文件 (轻量实现，无需 dotenv 依赖)
try {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w-]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  }
} catch(e) {}

const express = require('express');
const path = require('path');
const os = require('os');
const https = require('https');
const { execSync } = require('child_process');
const { initDatabase } = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SSL_PORT = process.env.SSL_PORT || 3443;

function ensureSSLCerts() {
  const certDir = path.join(__dirname, 'ssl');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { keyPath, certPath };
  }
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
  console.log('生成自签名SSL证书...');
  const subj = '/CN=fragrance-inventory/O=FragranceERP/C=CN';
  try {
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "${subj}" 2>/dev/null`);
  } catch(e) {
    execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "${subj}"`);
  }
  console.log('SSL证书已生成');
  return { keyPath, certPath };
}

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

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0
}));

// 路由注册
app.use('/api/auth', require('./routes/auth'));
app.use('/api/brands', require('./routes/brands'));
app.use('/api/products', require('./routes/products'));
app.use('/api/skus', require('./routes/skus'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/stock', require('./routes/stock'));
app.use('/api/stock-in', require('./routes/stockIn'));
app.use('/api/stock-out', require('./routes/stockOut'));
app.use('/api/split', require('./routes/split'));
app.use('/api/transfer', require('./routes/transfer'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/system', require('./routes/system'));

// 健康检查端点
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// 统一错误处理
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
const lanIPs = getLanIPs();

app.listen(PORT, HOST, () => {
  console.log(`\n香氛库存管理系统运行中:\n`);
  console.log(`  HTTP:  http://localhost:${PORT}`);
  if (lanIPs.length > 0) {
    for (const ip of lanIPs) {
      console.log(`  HTTP:  http://${ip}:${PORT}`);
    }
  }
  console.log(`\n  首次使用请用默认账号登录`);
  console.log('');
});

try {
  const { keyPath, certPath } = ensureSSLCerts();
  const sslOptions = {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
  https.createServer(sslOptions, app).listen(SSL_PORT, HOST, () => {
    console.log(`  HTTPS: https://localhost:${SSL_PORT}`);
    if (lanIPs.length > 0) {
      for (const ip of lanIPs) {
        console.log(`  HTTPS: https://${ip}:${SSL_PORT}`);
      }
    }
    console.log(`\n  ⚠️  自签名证书，浏览器会提示"不安全"，点"高级"→"继续访问"即可`);
    console.log(`  📷 相机扫码请使用 HTTPS 地址访问\n`);
  });
} catch(e) {
  console.log('  HTTPS 启动失败（openssl 可能未安装）:', e.message);
}
