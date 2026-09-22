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
const https = require('https');
const http = require('http');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const { initDatabase } = require('./utils/db');

const app = express();
const HTTP_PORT = 80;
const HTTPS_PORT = 443;

function ensureSSLCerts() {
  const certDir = path.join(__dirname, 'ssl');
  const keyPath = path.join(certDir, 'key.pem');
  const certPath = path.join(certDir, 'cert.pem');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { keyPath, certPath };
  }
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
  console.log('生成SSL证书...');
  const subj = '/CN=fragrance-inventory/O=FragranceERP/C=CN';
  execSync(`openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 3650 -nodes -subj "${subj}" 2>/dev/null`);
  console.log('SSL证书已生成');
  return { keyPath, certPath };
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

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

app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === 'SQLITE_CONSTRAINT') return res.json({ success: false, message: '数据冲突，请检查是否重复' });
  if (err.code === 'BUSINESS_ERROR') return res.json({ success: false, message: err.message });
  res.json({ success: false, message: '服务器错误，请重试' });
});

initDatabase();
const systemRouter = require('./routes/system');
if (systemRouter._autoBackup) systemRouter._autoBackup();

// HTTP → HTTPS 重定向
http.createServer((req, res) => {
  const host = req.headers.host || '';
  const ip = host.split(':')[0];
  res.writeHead(302, { Location: `https://${ip}${req.url}` });
  res.end();
}).listen(HTTP_PORT, '0.0.0.0');

// HTTPS 主服务
const { keyPath, certPath } = ensureSSLCerts();
https.createServer({
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
}, app).listen(HTTPS_PORT, '0.0.0.0', () => {
  const lanIPs = getLanIPs();
  const ip = lanIPs.find(ip => !ip.startsWith('10.')) || lanIPs[0] || '服务器IP';
  console.log(`\n香氛库存管理系统运行中:\n`);
  console.log(`  访问地址: https://${ip}`);
  console.log(`\n  首次打开浏览器会提示"不安全"，点"高级"→"继续访问"即可`);
  console.log(`  扫码枪/相机扫码/手动输入 全部可用\n`);
});

function getLanIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
    }
  }
  return ips;
}
