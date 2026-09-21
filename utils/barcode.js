function generateBarcode(skuId) {
  const prefix = '200';
  const skuStr = String(skuId).padStart(9, '0');
  const base = prefix + skuStr;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;
  return base + checksum;
}

function generateSkuCode(brandId, productId, seq) {
  const b = String(brandId).padStart(2, '0');
  const p = String(productId).padStart(3, '0');
  const s = String(seq).padStart(3, '0');
  return `SKU${b}${p}${s}`;
}

module.exports = { generateBarcode, generateSkuCode };
