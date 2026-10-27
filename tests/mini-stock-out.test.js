const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function harness(get) {
  let page;
  const notices = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/stockOut/stockOut.js'), 'utf8'), {
    Page: value => { page = value; },
    require: () => ({ get, checkLogin: () => true }),
    wx: { showToast: value => notices.push(value), showModal: value => notices.push(value) }
  });
  page.setData = value => Object.assign(page.data, value);
  page.data.locations = [{ id: 2 }];
  return { page, notices };
}
test('manual barcode adds once while lookup is pending and enforces available stock', async () => {
  let resolve;
  let calls = 0;
  const { page } = harness(async url => {
    calls++;
    if (url.startsWith('/skus/')) return new Promise(r => { resolve = r; });
    return { data: [{ sku_id: 1, location_id: 2, quantity: 1 }] };
  });
  page.data.barcodeInput = ' abc ';
  const pending = page.addManualBarcode();
  await page.addManualBarcode();
  assert.equal(calls, 1);
  resolve({ data: { id: 1, product_name: '测试物品' } });
  await pending;
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.totalQty, 1);
  assert.equal(page.data.adding, false);
  page.onQtyChange({ currentTarget: { dataset: { index: 0 } }, detail: { value: '9' } });
  assert.equal(page.data.items[0].quantity, 1);
});
test('failed barcode lookup permits retry without adding an item', async () => {
  const { page, notices } = harness(async () => { throw Error('服务不可用'); });
  page.data.barcodeInput = 'abc';
  await page.addManualBarcode();
  assert.equal(page.data.adding, false);
  assert.equal(page.data.items.length, 0);
  assert.equal(notices[0].content, '服务不可用');
});
test('empty barcode and missing location do not send lookup requests', async () => {
  let calls = 0;
  const { page } = harness(async () => { calls++; });
  await page.addManualBarcode();
  page.data.locations = [];
  page.data.barcodeInput = 'abc';
  await page.addManualBarcode();
  assert.equal(calls, 0);
});

test('changing location discards quantities belonging to the previous location', () => {
  const { page } = harness(async () => ({}));
  page.data.items = [{ sku_id: 1, quantity: 2, current_qty: 2 }];
  page.data.totalQty = 2;
  page.onLocationChange({ detail: { value: 1 } });
  assert.equal(page.data.items.length, 0);
  assert.equal(page.data.totalQty, 0);
});
test('inventory read failure is not mislabeled as zero stock', async () => {
  const { page, notices } = harness(async url => {
    if (url.startsWith('/skus/')) return { data: { id: 1 } };
    throw Error('库存查询失败');
  });
  await page.addSkuByBarcode('abc');
  assert.equal(page.data.items.length, 0);
  assert.equal(notices[0].content, '库存查询失败');
});

test('outbound submission copies the form remark into each item unless overridden', async () => {
  let page, modal, payload;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/pages/stockOut/stockOut.js'), 'utf8'), {
    Page: value => { page = value; },
    require: () => ({ checkLogin: () => true, post: async (url, body) => { payload = body; return {data:{errors:[]}}; } }),
    getApp: () => ({globalData:{userInfo:{name:'tester'}}}),
    setTimeout: () => {},
    wx: { showModal: value => {modal=value;}, showToast: () => {} }
  });
  page.setData = value => Object.assign(page.data,value);
  Object.assign(page.data,{locations:[{id:2}],locationIndex:0,totalQty:2,remark:'验收备注',items:[{sku_id:1,quantity:1,current_qty:2,out_type:'out'},{sku_id:2,quantity:1,current_qty:2,out_type:'out',remark:'明细备注'}]});
  await page.submitStockOut();
  await modal.success({confirm:true});
  assert.equal(payload.items[0].remark,'验收备注');
  assert.equal(payload.items[1].remark,'明细备注');
});
