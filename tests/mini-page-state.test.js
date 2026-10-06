const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function page(name, get) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, name === 'sale' ? '../legacy/miniprogram' : '../miniprogram/pages', name, name + '.js'), 'utf8'), {
    require: name => name.includes('request') ? {get} : {checkLogin: () => true},
    Page: value => definition = value,
    getApp: () => ({globalData: {apiBase: 'local', userInfo: {username: 'admin'}}}),
    wx: {}, setTimeout, clearTimeout
  });
  definition.setData = function(value) {Object.assign(this.data, value);};
  return definition;
}
test('stock latest filter wins even when earlier request completes last', async () => {
  const pending = [];
  const stock = page('stock', (url, params) => new Promise(resolve => pending.push({params, resolve})));
  const first = stock.loadList(true);
  stock.data.searchKey = 'new';
  const second = stock.loadList(true);
  assert.equal(pending.length, 2);
  assert.equal(pending[1].params.search, 'new');
  pending[1].resolve({data: [{id: 2}], total: 1});
  await second;
  pending[0].resolve({data: [{id: 1}], total: 1});
  await first;
  assert.equal(stock.data.list[0].id, 2);
});
test('home shows partial failure without inventing zero inventory', async () => {
  const home = page('index', url => url.includes('balances') ? Promise.reject(new Error('offline')) : Promise.resolve({data: []}));
  await home.loadData();
  assert.equal(home.data.itemCount, null);
  assert.equal(home.data.alertCount, 0);
  assert.equal(home.data.networkError, true);
  assert.equal(home.data.userName, 'admin');
});
test('sale search items stay within selected location and stock limit', () => {
  const sale = page('sale', () => Promise.resolve({data: []}));
  sale.data.locations = [{id: 2}, {id: 3}];
  sale.data.productResults = [{sku_id: 1, location_id: 3, quantity: 2, retail_price: 100}];
  sale.addSearchProduct({currentTarget: {dataset: {index: 0}}});
  assert.equal(sale.data.items.length, 0);
  sale.data.productResults[0].location_id = 2;
  sale.addSearchProduct({currentTarget: {dataset: {index: 0}}});
  assert.equal(sale.data.items[0].quantity, 1);
  assert.equal(sale.data.finalAmount, '100.00');
  sale.onLocationChange({detail: {value: 1}});
  assert.equal(sale.data.items.length, 0);
  assert.equal(sale.data.productResults.length, 0);
  assert.equal(sale.data.finalAmount, '0.00');
});
