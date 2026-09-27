const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { getDb, initDatabase, closeDatabase, DB_PATH, setMaintenance, isMaintenance } = require('./db');
const backupDir = path.join(path.dirname(DB_PATH), 'backups');
let operation = false;
function busy() { return Object.assign(new Error('数据库正在备份或恢复，请稍后重试'), { status: 503 }); }
function validateBackup(filename, live, forRestore = false) {
  const candidate = new Database(filename, { readonly: true, fileMustExist: true });
  try {
    if (candidate.pragma('integrity_check', { simple: true }) !== 'ok' || candidate.pragma('foreign_key_check').length) throw new Error('备份完整性校验失败');
    const optional = new Set(['users.session_version', 'users.openid', 'stock_movements.source']);
    for (const {name} of live.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
      const columns = candidate.pragma(`table_info(${JSON.stringify(name)})`).map(c => c.name);
      for (const c of live.pragma(`table_info(${JSON.stringify(name)})`)) {
        if (!columns.includes(c.name) && !optional.has(`${name}.${c.name}`)) throw new Error('备份表结构不兼容');
      }
    }
    if (forRestore && candidate.prepare("SELECT 1 FROM stock_balances WHERE typeof(quantity) != 'integer' OR quantity < 0 LIMIT 1").get()) throw new Error('备份包含无效库存，请先核对数据');
    if (forRestore && !candidate.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get()) throw new Error('备份中没有管理员');
    return candidate;
  } catch (e) { candidate.close(); throw e; }
}
async function createBackup(destination) {
  if (operation || isMaintenance()) throw busy();
  operation = true;
  const temporary = destination + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const live = getDb();
    await live.backup(temporary);
    const checked = validateBackup(temporary, live); checked.close();
    fs.renameSync(temporary, destination);
    return destination;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    operation = false;
  }
}
async function autoBackup() {
  const date = new Date().toISOString().slice(0,10).replace(/-/g, '');
  const destination = path.join(backupDir, `fragrance_${date}.db`);
  if (fs.existsSync(destination) || operation || isMaintenance()) return;
  await createBackup(destination);
  const files = fs.readdirSync(backupDir).filter(f => /^fragrance_\d{8}\.db$/.test(f)).sort().reverse();
  for (const name of files.slice(30)) fs.unlinkSync(path.join(backupDir,name));
}
async function restoreBackup(filename) {
  if (typeof filename !== 'string' || !/^fragrance_\d{8}\.db$/.test(filename)) throw new Error('无效的备份文件名');
  if (operation || isMaintenance()) throw busy();
  const source = path.join(backupDir, filename);
  const live = getDb();
  const candidate = validateBackup(source, live, true);
  operation = true; setMaintenance(true);
  const stage = DB_PATH + '.' + crypto.randomUUID() + '.restore';
  const safety = path.join(backupDir, `before_restore_${Date.now()}_${crypto.randomUUID()}.db`);
  let swapped = false, closed = false, healthy = true;
  try {
    fs.mkdirSync(backupDir, {recursive:true});
    await candidate.backup(stage);
    candidate.close();
    await live.backup(safety);
    const checkpoint = live.pragma('wal_checkpoint(TRUNCATE)')[0];
    if (checkpoint.busy) throw new Error('数据库仍被其他连接占用，无法恢复');
    closeDatabase(); closed = true;
    fs.renameSync(stage, DB_PATH); swapped = true;
    const restored = initDatabase({ restoring: true });
    restored.prepare('UPDATE users SET session_version = lower(hex(randomblob(16)))').run();
    return { safetyBackup: path.basename(safety) };
  } catch (e) {
    if (closed) {
      try {
        closeDatabase();
        if (swapped) {
          fs.copyFileSync(safety, stage);
          fs.renameSync(stage, DB_PATH);
        }
        initDatabase({ restoring: true });
      } catch (rollbackError) {
        healthy = false;
        console.error('恢复回滚失败；服务保持维护状态', rollbackError);
      }
    }
    throw e;
  } finally {
    if (candidate.open) candidate.close();
    if (fs.existsSync(stage)) fs.unlinkSync(stage);
    operation = false;
    if (healthy) setMaintenance(false);
  }
}
module.exports = { createBackup, autoBackup, restoreBackup, backupDir };
