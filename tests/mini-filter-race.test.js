const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
for (const name of ['products', 'stockInHistory', 'stockOutHistory', 'movements', 'inventory']) {
  test(`${name}: latest refresh wins over a delayed response`, async () => {
    let page;
    const requests = [];
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, `../miniprogram/pages/${name}/${name}.js`), 'utf8'), {
      Page: value => { page = value; },
      require: () => ({ get: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) }),
      wx: { showToast() {} }
    });
    page.setData = values => Object.assign(page.data, values);
    page.data.locations = [{ id: 1 }];
    const load = name === 'inventory' ? 'loadStock' : 'loadList';
    const first = page[load](true);
    const second = page[load](true);
    assert.equal(requests.length, 2);
    requests[1].resolve({ data: [{ id: 2, sku_id: 2, quantity: 3 }], total: 1 });
    await second;
    requests[0].resolve({ data: [{ id: 1, sku_id: 1, quantity: 8 }], total: 1 });
    await first;
    const rows = name === 'inventory' ? page.data.items : page.data.list;
    assert.equal(rows[0].sku_id, 2);
    const third = page[load](true);
    requests[2].reject(Error('offline'));
    await third;
    assert.equal((name === 'inventory' ? page.data.items : page.data.list).length, 0);
    if (name === 'inventory') assert.equal(page.data.loaded, false);
  });
}
