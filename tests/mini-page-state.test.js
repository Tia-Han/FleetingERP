const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function page(name, get, user = {username: 'admin', role: 'admin'}) {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, name === 'sale' ? '../legacy/miniprogram' : '../miniprogram/pages', name, name + '.js'), 'utf8'), {
    require: name => name.includes('request') ? {get} : {checkLogin: () => true},
    Page: value => definition = value,
    getApp: () => ({globalData: {apiBase: 'local', userInfo: user}}),
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

test('stock location filter resets pagination and ignores stale cross-location results', async () => {
  const pending = [];
  const stock = page('stock', (url, params) => new Promise(resolve => pending.push({params, resolve})));
  stock.data.locations = [{id: '', name: '全部位置'}, {id: 3, name: '位置B'}];
  stock.data.list = [{id: 9, location_id: 1}];
  stock.data.page = 4;
  const old = stock.loadList(false);
  const latest = stock.onLocationChange({detail: {value: '1'}});
  assert.equal(stock.data.list.length, 0);
  assert.equal(pending[1].params.page, 1);
  assert.equal(pending[1].params.location_id, 3);
  pending[1].resolve({data: [{id: 2, location_id: 3}], total: 1});
  await latest;
  pending[0].resolve({data: [{id: 9, location_id: 1}], total: 80});
  await old;
  assert.equal(stock.data.list.length, 1);
  assert.equal(stock.data.list[0].location_id, 3);
  assert.equal(stock.data.hasMore, false);
  const all = stock.onLocationChange({detail: {value: 0}});
  assert.equal(pending[2].params.location_id, undefined);
  pending[2].resolve({data: [], total: 0});
  await all;
});
test('restricted stock account ignores injected location filter', async () => {
  const requests = [];
  const stock = page('stock', async (url, params) => {
    requests.push(params); return {data: [], total: 0};
  }, {role: 'store_clerk', location_id: 2});
  stock.data.filterLocation = 3;
  stock.data.locations = [{id: 3}];
  stock.onLocationChange({detail: {value: 0}});
  assert.equal(requests.length, 0);
  await stock.loadList(true);
  assert.equal(requests[0].location_id, 2);
});
test('failed stock refresh does not leave old location inventory visible', async () => {
  const stock = page('stock', async () => {throw new Error('offline');});
  stock.data.list = [{id: 1, location_id: 1}];
  await stock.loadList(true);
  assert.equal(stock.data.list.length, 0);
  assert.equal(stock.data.loadError, true);
  assert.equal(stock.data.loading, false);
});
