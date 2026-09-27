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

function generateAvailableBarcode(db) {
  // Allocate from the next persistent SKU sequence, then skip any imported barcode.
  let candidate = Number(db.prepare("SELECT seq FROM sqlite_sequence WHERE name='skus'").get()?.seq || 0) + 1;
  while (candidate <= 999999999) {
    const barcode = generateBarcode(candidate++);
    if (!db.prepare('SELECT 1 FROM skus WHERE barcode = ?').get(barcode)) return barcode;
  }
  throw new Error('内部条码编号已用尽');
}
module.exports = { generateBarcode, generateSkuCode, generateAvailableBarcode };
