const crypto = require('crypto');
// Only persisted fields participate; joined labels and transport metadata do not.
function rowRevision(row) {
  const ignored = new Set(['revision','brand_name','product_name','skus']);
  return crypto.createHash('sha256').update(JSON.stringify(Object.keys(row).filter(k=>!ignored.has(k)).sort().map(k=>[k,row[k]]))).digest('hex');
}
function productRevision(product, skus) {
  return crypto.createHash('sha256').update(JSON.stringify([rowRevision(product), [...skus].sort((a,b)=>a.id-b.id).map(rowRevision)])).digest('hex');
}
function checkRevision(expected, actual) {
  if (typeof expected !== 'string' || expected !== actual) {
    throw Object.assign(new Error('资料已更新或页面版本过旧，请关闭编辑窗口并重新打开后修改；本次修改未保存'), {status:409});
  }
}
module.exports = {rowRevision, productRevision, checkRevision};
