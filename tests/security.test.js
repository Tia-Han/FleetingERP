const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fleeting-regression-'));
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-do-not-use-in-production-20260924';
process.env.DB_PATH = path.join(temp, 'fragrance.db');
const dbModule = require('../utils/db');
dbModule.initDatabase();
const backups = require('../utils/backups');
let db;
const hash = bcrypt.hashSync('test-password', 4);
function token(role = 'admin') {
  const u = db.prepare('SELECT * FROM users WHERE role = ?').get(role);
  return jwt.sign({ id:u.id, role:u.role, version:u.session_version }, process.env.JWT_SECRET, {expiresIn:'2h'});
}
function call(module, method, url, body = {}, credential = token(), requestKey = require('crypto').randomUUID()) {
  return new Promise(resolve => {
    const req = { method, url, body, idempotencyResource:module, headers: { 'idempotency-key':requestKey, authorization: credential ? 'Bearer '+credential : '' }, query:Object.fromEntries(new URL(url, 'http://test').searchParams), clientSource:'web', ip:'127.0.0.1' };
    const res = { statusCode:200, status(n){this.statusCode=n;return this;}, json(data){resolve({status:this.statusCode,...data});} };
    require('../routes/'+module).handle(req,res,error=>resolve({success:false,status:error?.status || (error?.code === 'BUSINESS_ERROR' ? 400 : 500),error:error?.message}));
  });
}
function quantity(sku=1) { return db.prepare('SELECT quantity FROM stock_balances WHERE location_id=1 AND sku_id=?').get(sku)?.quantity; }
function sale(overrides={}) { return { location_id:1, items:[{sku_id:1,quantity:1,unit_price:10}], payments:[{method:'cash',amount:10}], ...overrides }; }
beforeEach(()=>{
  process.env.ENABLE_SPLIT='true';
  db = dbModule.getDb();
  db.pragma('foreign_keys=OFF');
  for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) db.exec(`DELETE FROM "${name}"`);
  db.pragma('foreign_keys=ON');
  db.exec(`INSERT INTO brands(id,name) VALUES(1,'Test');
    INSERT INTO products(id,brand_id,name,category,is_splittable) VALUES(1,1,'Test','香水',1);
    INSERT INTO skus(id,product_id,sku_code,spec_type,volume,volume_ml,unit) VALUES(1,1,'A','整装','100ml',100,'瓶'),(2,1,'B','分装','5ml',5,'瓶');
    INSERT INTO locations(id,name,type) VALUES(1,'Warehouse','warehouse'),(2,'Store','store');
    INSERT INTO stock_balances(location_id,sku_id,quantity) VALUES(1,1,10);
    INSERT INTO customers(id,wechat_name,points) VALUES(1,'Customer',100);`);
  for (const [i,role] of ['admin','warehouse_manager','store_clerk'].entries()) db.prepare('INSERT INTO users(id,username,password_hash,role,name) VALUES(?,?,?,?,?)').run(i+1,role,hash,role,role);
  db.exec("UPDATE users SET location_id=1 WHERE role='warehouse_manager'; UPDATE users SET location_id=2 WHERE role='store_clerk'");
});
after(()=>{ dbModule.closeDatabase(); });
test('store clerk denied warehouse writes; warehouse manager denied sales',async()=>{
 for (const [route,url] of [['stockIn','/'],['stock','/check'],['split','/'],['products','/'],['skus','/1'],['locations','/']]) {
  const r=await call(route,route==='skus'?'PUT':'POST',url,{},token('store_clerk')); assert.equal(r.status,403,route);
 }
 assert.equal((await call('sales','POST','/',sale(),token('warehouse_manager'))).status,403);
 assert.equal((await call('customers','GET','/',{},token('warehouse_manager'))).status,403);
});
test('authorized inbound records authenticated operator',async()=>{
 const r=await call('stockIn','POST','/',{location_id:1,operator:'forged',items:[{sku_id:1,quantity:2,unit_cost:3}]},token('warehouse_manager'));
 assert.equal(r.success,true);assert.equal(quantity(),12);assert.equal(db.prepare('SELECT operator FROM stock_movements').get().operator,'warehouse_manager');
});
test('duplicate SKU oversell rolls back all balances and documents',async()=>{
 const r=await call('sales','POST','/',sale({items:[{sku_id:1,quantity:6,unit_price:1},{sku_id:1,quantity:6,unit_price:1}],payments:[{method:'cash',amount:12}]}));
 assert.equal(r.success,false);assert.equal(quantity(),10);assert.equal(db.prepare('SELECT COUNT(*) n FROM sales').get().n,0);
});
test('duplicate SKU within stock succeeds with matching movements',async()=>{
 const r=await call('sales','POST','/',sale({items:[{sku_id:1,quantity:2,unit_price:1},{sku_id:1,quantity:3,unit_price:1}],payments:[{method:'cash',amount:5}]}));
 assert.equal(r.success,true);assert.equal(quantity(),5);assert.equal(db.prepare('SELECT SUM(quantity) n FROM stock_movements').get().n,-5);
});
test('negative, fractional, non-numeric and missing sale quantities rejected',async()=>{
 for(const q of [-2,0,0.5,'2',null,NaN,Infinity]) {
  const r=await call('sales','POST','/',sale({items:[{sku_id:1,quantity:q,unit_price:0}],payments:[{method:'cash',amount:0}]}));assert.equal(r.success,false,String(q));assert.equal(quantity(),10);
 }
});
test('negative points/discount/price, absent customer and missing payments rejected',async()=>{
 for(const b of [{points_used:-100,customer_id:1},{discount:-1},{points_used:1},{payments:[]},{payments:null},{items:[{sku_id:1,quantity:1,unit_price:-1}]}]) {
  assert.equal((await call('sales','POST','/',sale(b))).success,false);assert.equal(quantity(),10);
 }
 assert.equal(db.prepare('SELECT points FROM customers').get().points,100);
});
test('cents and 100 points per yuan are consistent',async()=>{
 const r=await call('sales','POST','/',sale({customer_id:1,points_used:100,payments:[{method:'cash',amount:9}]}));
 assert.equal(r.success,true);assert.equal(db.prepare('SELECT final_amount FROM sales').get().final_amount,9);assert.equal(db.prepare('SELECT points FROM customers').get().points,0);
 assert.equal((await call('sales','GET','/config')).data.points_exchange_rate,100);
});
test('payment mismatch rolls back early stock deduction',async()=>{
 assert.equal((await call('sales','POST','/',sale({payments:[{method:'cash',amount:9.99}]}))).success,false);assert.equal(quantity(),10);
});
test('inventory count creates missing balance, rejects negative and duplicates',async()=>{
 assert.equal((await call('stock','POST','/check',{location_id:1,items:[{sku_id:2,actual_quantity:5}]})).success,true);assert.equal(quantity(2),5);
 for (const items of [[{sku_id:2,actual_quantity:-1}],[{sku_id:2,actual_quantity:1},{sku_id:2,actual_quantity:2}]]) assert.equal((await call('stock','POST','/check',{location_id:1,items})).success,false);
 assert.equal(quantity(2),5);
});
test('database constraints reject negative and fractional stock independently',()=>{
 for(const q of [-1,0.5,'bad']) assert.throws(()=>db.prepare('UPDATE stock_balances SET quantity=?').run(q));
 assert.equal(quantity(),10);
});
test('invalid inbound/outbound/transfer/split requests leave stock unchanged',async()=>{
 const cases=[['stockIn',{location_id:1,items:[{sku_id:1,quantity:0.1,unit_cost:2}]}],['stockOut',{location_id:1,sku_id:1,quantity:'oops',type:'out'}],['transfer',{from_location_id:1,to_location_id:'1',items:[{sku_id:1,quantity:1}]}],['split',{location_id:1,source_sku_id:1,source_quantity:1,items:[{target_sku_id:2,quantity:100,unit_volume:0.1}]}]];
 for(const [route,body] of cases) assert.equal((await call(route,'POST','/',body)).success,false,route);
 assert.equal(quantity(),10);
});
test('valid transfer and split maintain stock',async()=>{
 assert.equal((await call('transfer','POST','/',{from_location_id:1,to_location_id:2,items:[{sku_id:1,quantity:2}]})).success,true);assert.equal(quantity(),8);
 assert.equal((await call('split','POST','/',{location_id:1,source_sku_id:1,source_quantity:1,bottle_consumed:true,items:[{target_sku_id:2,quantity:2,unit_volume:5}]})).success,true);assert.equal(quantity(),7);assert.equal(quantity(2),2);
});
test('failed product create and edit roll back main row and SKUs',async()=>{
 db.exec(`CREATE TEMP TRIGGER test_reject_sku_insert BEFORE INSERT ON skus WHEN NEW.volume='reject'
   BEGIN SELECT RAISE(ABORT, 'simulated SKU write failure'); END;
   CREATE TEMP TRIGGER test_reject_sku_update BEFORE UPDATE ON skus WHEN NEW.volume='reject'
   BEGIN SELECT RAISE(ABORT, 'simulated SKU write failure'); END;`);
 try {
  const r=await call('products','POST','/',{brand_id:1,name:'partial',category:'香水',skus:[{spec_type:'整装',volume:'reject'}]});assert.equal(r.success,false);assert.match(r.error,/simulated/);assert.equal(db.prepare('SELECT COUNT(*) n FROM products').get().n,1);
  const edit=await call('products','PUT','/1',{brand_id:1,name:'Changed',category:'香水',revision:require('../utils/revision').productRevision(db.prepare('SELECT * FROM products WHERE id=1').get(),db.prepare('SELECT * FROM skus WHERE product_id=1 AND is_deleted=0').all()),skus:[{id:1,spec_type:'整装',volume:'reject'}]});assert.equal(edit.success,false);assert.match(edit.error,/simulated/);assert.equal(db.prepare('SELECT name FROM products WHERE id=1').get().name,'Test');assert.equal(db.prepare('SELECT is_deleted FROM skus WHERE id=1').get().is_deleted,0);
 } finally { db.exec('DROP TRIGGER test_reject_sku_insert; DROP TRIGGER test_reject_sku_update'); }
});
test('deleted users and legacy JWTs are rejected',async()=>{
 const old=token('store_clerk');db.prepare('DELETE FROM users WHERE role=?').run('store_clerk');assert.equal((await call('auth','GET','/me',{},old)).status,401);
 const legacy=jwt.sign({id:1,role:'admin'},process.env.JWT_SECRET);assert.equal((await call('auth','GET','/me',{},legacy)).status,401);
});
test('logout revokes the old session generation',async()=>{
 const old=token();assert.equal((await call('auth','POST','/logout',{},old)).success,true);assert.equal((await call('auth','GET','/me',{},old)).status,401);
});
test('password change revokes old token and new login works',async()=>{
 const old=token();assert.equal((await call('auth','PUT','/change-password',{old_password:'test-password',new_password:'updated-password'},old)).success,true);assert.equal((await call('auth','GET','/me',{},old)).status,401);
 const login=await call('auth','POST','/login',{username:'admin',password:'updated-password'},'');assert.equal(login.success,true);assert.equal((await call('auth','GET','/me',{},login.data.token)).success,true);
});
test('prototype-key login returns normal credential error',async()=>{
 const r=await call('auth','POST','/login',{username:'__proto__',password:'anything'},'');assert.equal(r.success,false);assert.equal(r.error,undefined);
});
test('WAL backup contains committed data and restore revokes sessions',async()=>{
 db.pragma('wal_autocheckpoint=0');const before=token();
 const destination=path.join(backups.backupDir,'fragrance_20260924.db');await backups.createBackup(destination);
 const copy=new Database(destination,{readonly:true});assert.equal(copy.prepare('SELECT quantity FROM stock_balances').get().quantity,10);copy.close();
 db.prepare('UPDATE stock_balances SET quantity=20').run();
 const promise=backups.restoreBackup('fragrance_20260924.db');assert.equal(dbModule.isMaintenance(),true);assert.throws(()=>dbModule.getDb());await promise;
 db=dbModule.getDb();assert.equal(quantity(),10);assert.equal((await call('auth','GET','/me',{},before)).status,401);
 assert.ok(fs.readdirSync(backups.backupDir).some(f=>f.startsWith('before_restore_')));
});
test('invalid backups and path traversal cannot replace live database',async()=>{
 fs.writeFileSync(path.join(backups.backupDir,'fragrance_20000101.db'),'not sqlite');
 await assert.rejects(()=>backups.restoreBackup('fragrance_20000101.db'));await assert.rejects(()=>backups.restoreBackup('../fragrance.db'));
 assert.equal(quantity(),10);assert.equal(dbModule.isMaintenance(),false);
});
test('catalog rejects invalid prices and SKU ownership',async()=>{
 const negative=await call('skus','PUT','/1',{barcode:'test',cost_price:-1,retail_price:10,low_stock_threshold:0});assert.equal(negative.success,false);
 const invalid=await call('products','PUT','/1',{brand_id:1,name:'Changed',category:'香水',skus:[{id:999,volume:'1ml'}]});assert.equal(invalid.success,false);assert.equal(db.prepare('SELECT name FROM products WHERE id=1').get().name,'Test');
});
test('restore rolls back to the live snapshot if reinitialization fails',async()=>{
 const file=path.join(backups.backupDir,'fragrance_20260925.db');await backups.createBackup(file);
 db.prepare('UPDATE stock_balances SET quantity=20').run();
 const init=dbModule.initDatabase;let calls=0;
 dbModule.initDatabase=(options)=>{if(++calls===1)throw new Error('simulated migration failure');return init(options);};
 const modulePath=require.resolve('../utils/backups');delete require.cache[modulePath];const failureBackup=require('../utils/backups');dbModule.initDatabase=init;
 await assert.rejects(()=>failureBackup.restoreBackup('fragrance_20260925.db'),/simulated/);
 db=dbModule.getDb();assert.equal(quantity(),20);assert.equal(dbModule.isMaintenance(),false);
});
test('legacy schema migration preserves records and gives users session generations',()=>{
 const {spawnSync}=require('child_process');
 const oldPath=path.join(temp,'legacy.db');const old=new Database(oldPath);
 old.exec(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8').replace("  session_version TEXT NOT NULL DEFAULT '',\n",''));
 old.prepare('INSERT INTO users(username,password_hash,role,name) VALUES(?,?,?,?)').run('admin',hash,'admin','Legacy');
 old.exec("INSERT INTO brands(id,name) VALUES(1,'Legacy brand')");old.close();
 const result=spawnSync(process.execPath,['-e',`const d=require('./utils/db');const db=d.initDatabase();if(d.initDatabase()!==db)throw Error('second connection');d.closeDatabase();`],{cwd:path.join(__dirname,'..'),env:{...process.env,DB_PATH:oldPath},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const migrated=new Database(oldPath,{readonly:true});const user=migrated.prepare('SELECT * FROM users').get();assert.equal(user.password_hash,hash);assert.equal(user.name,'Legacy');assert.match(user.session_version,/^[a-f0-9]{32}$/);assert.equal(migrated.prepare('SELECT name FROM brands').get().name,'Legacy brand');migrated.close();
});
test('new production databases require an explicit password and omit sample stock',()=>{
 const {spawnSync}=require('child_process');const prodPath=path.join(temp,'production.db');
 const script="const d=require('./utils/db');try{d.initDatabase();}catch(e){console.error(e.message);process.exitCode=1;}finally{d.closeDatabase();}";
 const options={cwd:path.join(__dirname,'..'),env:{...process.env,NODE_ENV:'production',ADMIN_PASSWORD:'',DB_PATH:prodPath},encoding:'utf8'};
 const rejected=spawnSync(process.execPath,['-e',script],options);assert.equal(rejected.status,1);assert.match(rejected.stderr,/ADMIN_PASSWORD/);
 const created=spawnSync(process.execPath,['-e',script],{...options,env:{...options.env,ADMIN_PASSWORD:'test-bootstrap-password'}});assert.equal(created.status,0,created.stderr);
 const prod=new Database(prodPath,{readonly:true});assert.equal(prod.prepare('SELECT COUNT(*) n FROM brands').get().n,0);assert.equal(prod.prepare('SELECT COUNT(*) n FROM sales').get().n,0);assert.equal(prod.prepare('SELECT COUNT(*) n FROM users').get().n,1);prod.close();
});

test('customer lifetime spend uses paid amount after discounts and points', async () => {
  const result = await call('sales','POST','/',sale({customer_id:1,discount:2,points_used:100,payments:[{method:'cash',amount:7}]}));
  assert.equal(result.success,true);
  const customer = await call('customers','GET','/1');
  assert.equal(customer.data.total_spent,7);
  assert.equal(db.prepare('SELECT total_spent FROM customers WHERE id=1').get().total_spent,7);
});
test('inbound amounts accumulate in cents and reject overflow atomically', async () => {
  const valid = await call('stockIn','POST','/',{location_id:1,items:[{sku_id:1,quantity:3,unit_cost:0.1}]});
  assert.equal(valid.success,true);
  assert.equal(db.prepare('SELECT total_cost FROM stock_in_orders').get().total_cost,0.3);
  const overflow = await call('stockIn','POST','/',{location_id:1,items:[{sku_id:1,quantity:1000000000,unit_cost:1000000000}]});
  assert.equal(overflow.success,false); assert.equal(quantity(),13);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM stock_in_orders').get().n,1);
});
test('generated barcodes are unique in a same-millisecond batch; duplicate imports roll back', async () => {
  const now=Date.now; Date.now=()=>1720000000000;
  try {
    const result=await call('products','POST','/',{brand_id:1,name:'Batch',category:'香水',skus:[{volume:'1ml'},{volume:'2ml'},{volume:'3ml'}]});
    assert.equal(result.success,true); assert.equal(new Set(result.data.skus.map(s=>s.barcode)).size,3);
    const duplicate=await call('products','POST','/',{brand_id:1,name:'Duplicate',category:'香水',skus:[{volume:'1ml',barcode:'same'},{volume:'2ml',barcode:'same'}]});
    assert.equal(duplicate.success,false);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM products WHERE name='Duplicate'").get().n,0);
  } finally { Date.now=now; }
});
test('stocked products and removed stocked SKUs cannot disappear', async () => {
  assert.equal((await call('products','DELETE','/1')).success,false);
  assert.equal(db.prepare('SELECT is_deleted FROM products WHERE id=1').get().is_deleted,0);
  assert.equal((await call('products','PUT','/1',{brand_id:1,name:'Changed',category:'香水',revision:require('../utils/revision').productRevision(db.prepare('SELECT * FROM products WHERE id=1').get(),db.prepare('SELECT * FROM skus WHERE product_id=1 AND is_deleted=0').all()),skus:[]})).success,false);
  assert.equal(db.prepare('SELECT name FROM products WHERE id=1').get().name,'Test');
  db.prepare('UPDATE stock_balances SET quantity=0').run();
  assert.equal((await call('products','DELETE','/1')).success,true);
  assert.equal(db.prepare('SELECT is_deleted FROM skus WHERE id=1').get().is_deleted,1);
});
test('restart never recreates deliberately removed bootstrap records', () => {
  const {spawnSync}=require('child_process');const freshPath=path.join(temp,'restart.db');
  const code=`const d=require('./utils/db');let db=d.initDatabase();db.exec('DELETE FROM users; DELETE FROM locations; DELETE FROM categories;');d.closeDatabase();db=d.initDatabase();for(const t of ['users','locations','categories','brands'])if(db.prepare('SELECT COUNT(*) n FROM '+t).get().n!==0)throw Error('recreated '+t);d.closeDatabase();`;
  const r=spawnSync(process.execPath,['-e',code],{cwd:path.join(__dirname,'..'),env:{...process.env,NODE_ENV:'production',ADMIN_PASSWORD:'test-bootstrap-password',DB_PATH:freshPath},encoding:'utf8'});
  assert.equal(r.status,0,r.stderr);
});
test('legacy table rebuild preserves source and indexes; failed migration rolls back', () => {
  const {spawnSync}=require('child_process');
  for (const shouldFail of [false,true]) {
    const oldPath=path.join(temp,'legacy-movement-'+shouldFail+'.db');const old=new Database(oldPath);
    old.exec(fs.readFileSync(path.join(__dirname,'../db/schema.sql'),'utf8').replace(", 'check_in', 'check_out'",''));
    old.exec(`ALTER TABLE users ADD COLUMN openid TEXT;
      INSERT INTO users(username,password_hash,role,name,openid) VALUES('admin','hash','admin','Admin','same');
      INSERT INTO locations(id,name,type) VALUES(1,'Warehouse','warehouse');
      INSERT INTO brands(id,name) VALUES(1,'Brand');
      INSERT INTO products(id,brand_id,name,category) VALUES(1,1,'Product','Perfume');
      INSERT INTO skus(id,product_id,sku_code,spec_type,volume,unit) VALUES(1,1,'A','整装','1ml','瓶');
      INSERT INTO stock_movements(location_id,sku_id,movement_type,quantity,source) VALUES(1,1,'in',2,'miniprogram');`);
    if(shouldFail)old.exec("INSERT INTO users(username,password_hash,role,name,openid) VALUES('other','hash','admin','Other','same')");
    const before=old.prepare("SELECT sql FROM sqlite_master WHERE name='stock_movements'").get().sql;old.close();
    const r=spawnSync(process.execPath,['-e',"const d=require('./utils/db');try{d.initDatabase()}catch(e){process.exitCode=1}finally{d.closeDatabase()}"],{cwd:path.join(__dirname,'..'),env:{...process.env,DB_PATH:oldPath},encoding:'utf8'});
    assert.equal(r.status,shouldFail?1:0,r.stderr);
    const check=new Database(oldPath);assert.equal(check.prepare('SELECT source FROM stock_movements').get().source,'miniprogram');
    if(shouldFail)assert.equal(check.prepare("SELECT sql FROM sqlite_master WHERE name='stock_movements'").get().sql,before);
    else assert.ok(check.prepare("SELECT 1 FROM sqlite_master WHERE name='idx_stock_movements_ref'").get());
    check.close();
  }
});

test('transfer appears in both history views without duplicating inventory or inbound orders', async()=>{
 const moved=await call('transfer','POST','/',{from_location_id:1,to_location_id:2,items:[{sku_id:1,quantity:2}]});
 assert.equal(moved.success,true);
 const inbound=await call('stockIn','GET','/history?location_id=2&type=transfer_in');
 assert.equal(inbound.total,1);assert.equal(inbound.data[0].id,moved.data.id);assert.equal(inbound.data[0].from_name,'Warehouse');
 const outbound=await call('stockOut','GET','/?location_id=1&type=transfer_out&page=1');
 assert.equal(outbound.total,1);assert.equal(outbound.data[0].transfer_id,moved.data.id);assert.equal(outbound.data[0].quantity,-2);
 assert.equal((await call('stockIn','GET','/history?location_id=1&type=transfer_in')).total,0);
 const detail=await call('transfer','GET','/'+moved.data.id);assert.equal(detail.data.to_name,'Store');assert.equal(detail.data.items[0].quantity,2);
 assert.equal(quantity(),8);assert.equal(db.prepare('SELECT quantity FROM stock_balances WHERE location_id=2 AND sku_id=1').get().quantity,2);
 assert.equal(db.prepare('SELECT count(*) AS n FROM stock_in_orders').get().n,0);
 assert.equal(db.prepare('SELECT count(*) AS n FROM stock_movements').get().n,2);
});
test('inbound history filters and paginates ordinary receipts and completed transfers together',async()=>{
 await call('stockIn','POST','/',{location_id:2,supplier:'Vendor',items:[{sku_id:1,quantity:1,unit_cost:3}]});
 await call('transfer','POST','/',{from_location_id:1,to_location_id:2,items:[{sku_id:1,quantity:1}]});
 const first=await call('stockIn','GET','/history?location_id=2&product=Test&brand=Test&operator=admin&page=1&limit=1');
 const second=await call('stockIn','GET','/history?location_id=2&page=2&limit=1');
 assert.equal(first.total,2);assert.equal(first.data.length,1);assert.notEqual(first.data[0].record_type,second.data[0].record_type);
 assert.equal((await call('stockIn','GET','/history?supplier=Vendor')).total,1);
 assert.equal((await call('stockIn','GET','/history?type=in')).total,1);
 assert.equal((await call('stockIn','GET','/history?product=missing')).total,0);
 assert.equal((await call('stockIn','GET','/history?start_date=2099-01-01')).total,0);
 assert.equal((await call('stockIn','GET','/history?limit=-1')).status,400);
});
test('inventory query carries product identity and check records the adjustment reason',async()=>{
 const balances=await call('stock','GET','/balances?location_id=1&sku_id=1');assert.equal(balances.data[0].product_id,1);
 const res=await call('stock','POST','/check',{location_id:1,items:[{sku_id:1,actual_quantity:9}],remark:'破损漏登记'});
 assert.equal(res.success,true);assert.equal(quantity(),9);
 assert.match(db.prepare("SELECT remark FROM stock_movements WHERE movement_type='check_out'").get().remark,/破损漏登记/);
});

test('same operation key replays once; changed payload is rejected; independent sales remain allowed',async()=>{
 const key=require('crypto').randomUUID();
 const first=await call('sales','POST','/',sale(),token(),key);
 assert.equal(first.success,true);
 assert.deepEqual(await call('sales','POST','/',sale(),token(),key),first);
 assert.equal(quantity(),9);
 assert.equal((await call('sales','POST','/',sale({remark:'changed'}),token(),key)).status,409);
 assert.equal((await call('sales','POST','/',sale())).success,true);
 assert.equal(quantity(),8);
 assert.equal(db.prepare('SELECT count(*) n FROM sales').get().n,2);
});
test('replayed inbound and transfers do not duplicate stock movements',async()=>{
 for(const [route,body] of [['stockIn',{location_id:1,items:[{sku_id:1,quantity:2,unit_cost:1}]}],['transfer',{from_location_id:1,to_location_id:2,items:[{sku_id:1,quantity:1}]}]]) {
  const key=require('crypto').randomUUID();
  const first=await call(route,'POST','/',body,token(),key);
  assert.equal(first.success,true);
  const q=quantity(), n=db.prepare('SELECT count(*) n FROM stock_movements').get().n;
  assert.deepEqual(await call(route,'POST','/',body,token(),key),first);
  assert.equal(quantity(),q);assert.equal(db.prepare('SELECT count(*) n FROM stock_movements').get().n,n);
 }
});
test('location and brand duplicates rejected even with different operation IDs or direct SQL',async()=>{
 for(const [route,body,table] of [['locations',{name:'门店B',type:'store'},'locations'],['brands',{name:'New Brand'},'brands']]) {
  const key=require('crypto').randomUUID();
  const first=await call(route,'POST','/',body,token(),key);
  assert.equal(first.success,true);
  assert.deepEqual(await call(route,'POST','/',body,token(),key),first);
  assert.equal((await call(route,'POST','/',{...body,name:' '+body.name+' '})).success,false);
  assert.equal(db.prepare(`SELECT count(*) n FROM ${table} WHERE name=?`).get(body.name).n,1);
 }
 assert.throws(()=>db.prepare("INSERT INTO locations(name,type) VALUES('门店B','store')").run());
 assert.throws(()=>db.prepare("UPDATE locations SET name='门店B' WHERE id=1").run());
});
test('member phone identifies an existing member; blank phone and shared names are allowed',async()=>{
 const body={wechat_name:'Member',phone:'13800138000'};
 assert.equal((await call('customers','POST','/',body)).success,true);
 assert.equal((await call('customers','POST','/',body)).status,409);
 for(let i=0;i<2;i++) assert.equal((await call('customers','POST','/',{wechat_name:'Member'})).success,true);
 assert.throws(()=>db.prepare("INSERT INTO customers(wechat_name,phone) VALUES('other','13800138000')").run());
});
test('new password login revokes the previous session and invalid credentials do not',async()=>{
 const body={username:'admin',password:'test-password'};
 const first=await call('auth','POST','/login',body,'');
 const second=await call('auth','POST','/login',body,'');
 assert.equal(first.success,true);assert.equal(second.success,true);
 assert.equal((await call('auth','GET','/me',{},first.data.token)).status,401);
 assert.equal((await call('auth','GET','/me',{},second.data.token)).success,true);
 await call('auth','POST','/login',{...body,password:'wrong'},'');
 assert.equal((await call('auth','GET','/me',{},second.data.token)).success,true);
});
test('staff binding blocks other locations in lists, details, writes and transfer sources',async()=>{
 const clerk=token('store_clerk');
 const sold=await call('sales','POST','/',sale());
 assert.equal((await call('sales','GET','/'+sold.data.id,{},clerk)).status,403);
 for(const [route,url] of [['stock','/balances'],['sales','/'],['stockIn','/history'],['stockOut','/'],['system','/dashboard']]) {
  assert.equal((await call(route,'GET',url+'?location_id=1',{},clerk)).status,403,route);
 }
 const locations=await call('locations','GET','/',{},clerk);
 assert.deepEqual(locations.data.map(l=>l.id),[2]);
 assert.equal((await call('locations','GET','/?destinations=1',{},clerk)).data.length,2);
 assert.equal((await call('sales','POST','/',sale(),clerk)).status,403);
 assert.equal((await call('transfer','POST','/',{from_location_id:1,to_location_id:2,items:[{sku_id:1,quantity:1}]},clerk)).status,403);
 const balances=await call('stock','GET','/balances',{},clerk);
 assert.equal(balances.success,true);assert.equal(JSON.stringify(balances.data).includes('Warehouse'),false);
});
test('account role must match a location; permissions update revokes session; bound locations cannot be removed',async()=>{
 const body={username:'new-clerk',password:'test-password',name:'新员工',role:'store_clerk',location_id:1};
 assert.equal((await call('auth','POST','/users',body)).success,false);
 assert.equal((await call('auth','POST','/users',{...body,location_id:2})).success,true);
 const old=token('store_clerk');
 assert.equal((await call('auth','PUT','/users/3',{role:'store_clerk',location_id:2,enabled:0})).success,true);
 assert.equal((await call('auth','GET','/me',{},old)).status,401);
 assert.equal((await call('auth','POST','/login',{username:'store_clerk',password:'test-password'},'')).status,403);
 assert.equal((await call('locations','DELETE','/2')).status,409);
 assert.equal((await call('locations','PUT','/2',{name:'Store',type:'warehouse'})).success,false);
});
test('upgrade preserves historical duplicate locations and requires explicit staff binding',()=>{
 db.exec('DROP TRIGGER prevent_duplicate_locations_insert');
 db.exec("INSERT INTO locations(name,type) VALUES('门店B','store'),('门店B','store'),('门店B','store')");
 dbModule.closeDatabase();dbModule.initDatabase();db=dbModule.getDb();
 assert.equal(db.prepare("SELECT count(*) n FROM locations WHERE name='门店B'").get().n,3);
 assert.throws(()=>db.prepare("INSERT INTO locations(name,type) VALUES('门店B','store')").run());
 assert.deepEqual(db.pragma('foreign_key_check'),[]);
});
test('alternative numeric detail paths cannot bypass staff location scope',async()=>{
 const created=await call('sales','POST','/',sale());
 assert.equal((await call('sales','GET','/'+created.data.id+'.0',{},token('store_clerk'))).status,403);
});
test('staff sales summary remains a scoped aggregate, not a detail lookup',async()=>{
 db.exec('INSERT INTO stock_balances(location_id,sku_id,quantity) VALUES(2,1,5)');
 await call('sales','POST','/',sale({location_id:2}));
 await call('sales','POST','/',sale());
 const result=await call('sales','GET','/summary',{},token('store_clerk'));
 assert.equal(result.success,true);assert.equal(result.data.order_count,1);assert.equal(result.data.total_amount,10);
});
test('pre-location-permissions backups can restore through supported additive migrations',async()=>{
 fs.mkdirSync(backups.backupDir,{recursive:true});
 const file=path.join(backups.backupDir,'fragrance_20260101.db');
 await db.backup(file);
 const old=new Database(file);
 old.exec('DROP TABLE request_results; ALTER TABLE users DROP COLUMN location_id; ALTER TABLE users DROP COLUMN enabled;');old.close();
 await backups.restoreBackup('fragrance_20260101.db');db=dbModule.getDb();
 assert.ok(db.pragma('table_info(users)').some(c=>c.name==='location_id'));
 assert.equal(quantity(),10);
});

test('split is disabled by default without changing existing inventory',async()=>{
 delete process.env.ENABLE_SPLIT;
 const result=await call('split','POST','/',{location_id:1,source_sku_id:1,source_quantity:1,bottle_consumed:true,items:[{target_sku_id:2,quantity:20,unit_volume:5}]});
 assert.equal(result.status,403);assert.equal(quantity(),10);
 assert.equal(db.prepare('SELECT count(*) n FROM split_orders').get().n,0);
});
test('inbound transfer sale and histories conserve stock across roles and retries',async()=>{
 const warehouse=token('warehouse_manager'),clerk=token('store_clerk');
 assert.equal((await call('stockIn','POST','/',{location_id:1,items:[{sku_id:1,quantity:2,unit_cost:3}]},warehouse)).success,true);
 const key=require('crypto').randomUUID(), transfer={from_location_id:1,to_location_id:2,items:[{sku_id:1,quantity:3}]};
 const moved=await call('transfer','POST','/',transfer,warehouse,key);assert.equal(moved.success,true);
 assert.deepEqual(await call('transfer','POST','/',transfer,warehouse,key),moved);
 assert.equal((await call('sales','POST','/',sale({location_id:2}),clerk)).success,true);
 assert.equal(quantity(),9);assert.equal(db.prepare('SELECT quantity FROM stock_balances WHERE location_id=2 AND sku_id=1').get().quantity,2);
 assert.equal((await call('stockIn','GET','/history',{},clerk)).data[0].record_type,'transfer_in');
 assert.equal((await call('stockOut','GET','/',{},warehouse)).data[0].movement_type,'transfer_out');
 assert.equal((await call('sales','GET','/summary',{},clerk)).data.order_count,1);
 assert.equal(db.prepare('SELECT SUM(quantity) q FROM stock_movements WHERE sku_id=1').get().q,1);
});
test('batch outbound reports failed row indexes without repeating successful rows',async()=>{
 const r=await call('stockOut','POST','/batch',{location_id:1,items:[{sku_id:1,quantity:2,type:'out'},{sku_id:1,quantity:99,type:'out'}]});
 assert.equal(r.success,true);assert.equal(r.data.successCount,1);assert.equal(r.data.errors[0].item_index,1);assert.equal(quantity(),8);
});

test('restore rejects a backup with no enabled administrator without replacing live data',async()=>{
 const file=path.join(backups.backupDir,'fragrance_20260102.db');
 await backups.createBackup(file);
 const candidate=new Database(file);candidate.exec("UPDATE users SET enabled=0 WHERE role='admin'");candidate.close();
 await assert.rejects(()=>backups.restoreBackup('fragrance_20260102.db'),/没有启用的管理员/);
 assert.ok(db.prepare("SELECT 1 FROM users WHERE role='admin' AND enabled=1").get());
});

test('stale product edits reject instead of overwriting another editor',async()=>{
 const p=(await call('products','GET','/1')).data;
 const edit={brand_id:p.brand_id,name:'First edit',category:p.category,revision:p.revision};
 assert.equal((await call('products','PUT','/1',edit)).success,true);
 assert.equal((await call('products','PUT','/1',{...edit,name:'Lost edit'})).status,409);
 assert.equal(db.prepare('SELECT name FROM products WHERE id=1').get().name,'First edit');
 assert.equal((await call('products','PUT','/1',{...edit,revision:undefined})).status,409);
 const fresh=(await call('products','GET','/1')).data;
 assert.equal((await call('products','PUT','/1',{...edit,name:'Fresh edit',revision:fresh.revision})).success,true);
});
test('SKU edits persist displayed fields, preserve omitted barcode and invalidate stale product snapshots',async()=>{
 db.prepare('UPDATE skus SET barcode=? WHERE id=1').run('TEST-BARCODE');
 const p=(await call('products','GET','/1')).data;
 const sku=p.skus.find(s=>s.id===1);
 assert.equal((await call('skus','PUT','/1',{revision:sku.revision,volume:'120ml',volume_ml:120,retail_price:35})).success,true);
 const after=db.prepare('SELECT * FROM skus WHERE id=1').get();
 assert.equal(after.volume,'120ml');assert.equal(after.volume_ml,120);assert.equal(after.barcode,'TEST-BARCODE');
 assert.equal((await call('skus','PUT','/1',{revision:sku.revision,retail_price:1})).status,409);
 assert.equal((await call('products','PUT','/1',{brand_id:1,name:'Old snapshot',category:p.category,revision:p.revision,skus:p.skus})).status,409);
 assert.equal(db.prepare('SELECT retail_price FROM skus WHERE id=1').get().retail_price,35);
});
