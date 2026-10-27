const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('local dates retain midnight, month and year boundaries in Shanghai', () => {
  const modulePath = path.resolve(__dirname, '../miniprogram/utils/date');
  const script = `const {localDate}=require(${JSON.stringify(modulePath)});console.log(JSON.stringify(['2026-10-20T00:01:00+08:00','2026-01-01T00:01:00+08:00','2026-03-01T00:01:00+08:00'].map(localDate)))`;
  const dates = JSON.parse(execFileSync(process.execPath, ['-e', script], { env: {...process.env, TZ: 'Asia/Shanghai'}, encoding: 'utf8' }));
  assert.deepEqual(dates, ['2026-10-20','2026-01-01','2026-03-01']);
});
