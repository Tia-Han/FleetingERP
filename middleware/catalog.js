const { getDb } = require('../utils/db');
const { fail, id, number, money } = require('./business');
function text(value, label, { optional = false, max = 500 } = {}) {
  if (optional && (value === undefined || value === null || value === '')) return;
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label}格式不正确`);
}
function validateSku(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('SKU 格式不正确');
  if (value.spec_type !== undefined && !['整装','分装'].includes(value.spec_type)) fail('SKU 规格类型无效');
  for (const key of ['cost_price','retail_price']) if (value[key] !== undefined) money(value[key], key);
  if (value.volume_ml !== undefined) number(value.volume_ml, '容量');
  if (value.low_stock_threshold !== undefined) number(value.low_stock_threshold, '库存预警', {integer:true});
  for(const key of ['barcode','volume','volume_desc','unit']) if(value[key] !== undefined) text(value[key],key,{optional:true});
}
function validateCatalog(kind) {
  return (req, res, next) => {
    if (!['POST','PUT'].includes(req.method)) return next();
    try {
      const b = req.body;
      if (!b || typeof b !== 'object' || Array.isArray(b)) fail('请求格式不正确');
      if (kind === 'products') {
        if (req.url.startsWith('/categories')) {
          text(b.new_name,'品类名'); text(b.old_name,'原品类名',{optional:true});
        } else if (/^\/\d+\/skus\/?$/.test(req.url)) validateSku(b);
        else {
          b.brand_id = id(b.brand_id,'品牌');
          if (!getDb().prepare('SELECT id FROM brands WHERE id=? AND is_deleted=0').get(b.brand_id)) fail('品牌不存在');
          text(b.name,'商品名'); text(b.category,'品类');
          if (b.skus !== undefined) {
            if (!Array.isArray(b.skus) || b.skus.length > 500) fail('SKU 明细格式不正确');
            const seen=new Set();
            for(const sku of b.skus) {
              validateSku(sku);
              if (sku.id !== undefined) {
                sku.id=id(sku.id,'SKU');
                if(req.method === 'POST' || seen.has(sku.id)) fail('SKU ID 无效或重复');
                seen.add(sku.id);
                const productId=id(req.url.split('/')[1],'商品');
                if(!getDb().prepare('SELECT id FROM skus WHERE id=? AND product_id=?').get(sku.id,productId)) fail('SKU 不属于该商品');
              }
            }
          }
        }
      } else if (kind === 'skus') validateSku(b);
      else if (kind === 'brands' || kind === 'locations') {
        text(b.name,'名称'); b.name=b.name.trim();
        const db=getDb();
        const existing=db.prepare(`SELECT id FROM ${kind} WHERE lower(trim(name))=lower(?) ${kind==='brands'?'AND is_deleted=0':''} AND id<>?`).get(b.name, Number(req.params.id || req.url.split('/')[1]) || 0);
        if(existing && req.method==='PUT') fail('同名'+(kind==='locations'?'场所':'品牌')+'已存在，请使用已有记录');
        if(kind==='locations' && req.method==='PUT') {
          const linked=db.prepare('SELECT role FROM users WHERE location_id=?').all(Number(req.params.id || req.url.split('/')[1]));
          if(linked.some(u=>(u.role==='store_clerk'?'store':'warehouse')!==b.type)) fail('该场所有绑定用户，不能修改为不匹配的类型');
        }
      }
      next();
    } catch(e) { next(e); }
  };
}
module.exports = { validateCatalog };
