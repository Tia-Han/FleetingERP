const express = require('express');
const router = express.Router();
const https = require('https');
const { getDb } = require('../utils/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/barcode/:code', (req, res) => {
  const db = getDb();
  const sku = db.prepare(`SELECT s.*, p.name as product_name, b.name as brand_name, p.category FROM skus s JOIN products p ON s.product_id = p.id JOIN brands b ON p.brand_id = b.id WHERE s.barcode = ? AND s.is_deleted = 0`).get(req.params.code);
  if (!sku) return res.json({ success: false, message: '未找到该条码对应的商品' });
  res.json({ success: true, data: sku });
});

router.get('/barcode/lookup/:code', async (req, res) => {
  const code = String(req.params.code).trim();
  if (!code) return res.json({ success: false, message: '条码不能为空' });

  const db = getDb();
  const local = db.prepare(`SELECT s.*, p.name as product_name, b.name as brand_name, p.category FROM skus s JOIN products p ON s.product_id = p.id JOIN brands b ON p.brand_id = b.id WHERE s.barcode = ? AND s.is_deleted = 0`).get(code);
  if (local) return res.json({ success: true, data: local, source: 'local' });

  const results = await Promise.allSettled([
    lookupOpenBeautyFacts(code),
    lookupUPCitemdb(code)
  ]);

  if (results[0].status === 'fulfilled' && results[0].value) {
    return res.json({ success: true, data: results[0].value, source: 'open_beauty_facts' });
  }
  if (results[1].status === 'fulfilled' && results[1].value) {
    return res.json({ success: true, data: results[1].value, source: 'upcitemdb' });
  }

  res.json({ success: false, message: '条码未在本地和外部数据库中找到', barcode: code });
});

function httpGet(url, headers, timeoutMs) {
  return new Promise((resolve, reject) => {
    const opts = { headers: headers || {}, timeout: timeoutMs || 8000 };
    const req = https.get(url, opts, (resp) => {
      let data = '';
      resp.on('data', d => data += d);
      resp.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

async function lookupOpenBeautyFacts(code) {
  const result = await httpGet(`https://world.openbeautyfacts.org/api/v2/product/${code}.json`, {}, 8000);
  if (!result || result.status !== 1 || !result.product) return null;

  const p = result.product;
  const name = p.product_name || p.generic_name || '';
  if (!name) return null;

  return {
    product_name: name,
    brand_name: p.brands || '',
    category: p.categories || '香水',
    volume: p.quantity || '',
    image_url: p.image_front_url || p.image_url || '',
    source: 'Open Beauty Facts'
  };
}

async function lookupUPCitemdb(code) {
  const result = await httpGet(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, {}, 8000);
  if (!result || result.code !== 'OK' || !result.items || result.items.length === 0) return null;

  const item = result.items[0];
  const name = item.title || item.description || '';
  if (!name) return null;

  return {
    product_name: name,
    brand_name: item.brand || '',
    category: item.category || '香水',
    volume: item.dimension || item.description || '',
    image_url: item.image || '',
    source: 'UPCitemdb'
  };
}

router.get('/:id', (req, res) => {
  const db = getDb();
  const sku = db.prepare(`SELECT s.*, p.name as product_name, b.name as brand_name FROM skus s JOIN products p ON s.product_id = p.id JOIN brands b ON p.brand_id = b.id WHERE s.id = ?`).get(req.params.id);
  if (!sku) return res.json({ success: false, message: 'SKU 不存在' });
  res.json({ success: true, data: sku });
});

router.put('/:id', (req, res) => {
  const { barcode, cost_price, retail_price, low_stock_threshold } = req.body;
  const db = getDb();
  db.prepare('UPDATE skus SET barcode = ?, cost_price = ?, retail_price = ?, low_stock_threshold = ? WHERE id = ?').run(barcode, cost_price, retail_price, low_stock_threshold, req.params.id);
  res.json({ success: true, message: '更新成功' });
});

module.exports = router;
