const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {once}=require('node:events');
test('HTTP docs, API 404, health and graceful shutdown work from another working directory', {timeout:15000}, async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'fleeting-http-'));
  const entry=path.join(temp,'start.cjs');
  fs.writeFileSync(entry,`const {server}=require(${JSON.stringify(path.resolve(__dirname,'../server'))});server.once('listening',()=>process.send({port:server.address().port}));process.on('message',m=>{require(${JSON.stringify(path.resolve(__dirname,'../utils/db'))}).setMaintenance(m.maintenance);process.send({updated:true});});`);
  const child=fork(entry,[],{cwd:temp,silent:true,env:{...process.env,NODE_ENV:'test',JWT_SECRET:'disposable-http-test-secret-20260925',DB_PATH:path.join(temp,'fragrance.db'),PORT:'0',HOST:'127.0.0.1'}});
  let errors='';child.stderr.on('data',x=>errors+=x);child.stdout.resume();
  t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL')});
  const port=await new Promise((resolve,reject)=>{
    child.once('message',m=>resolve(m.port));child.once('exit',code=>reject(new Error('server exited '+code+': '+errors)));
  });
  const base='http://127.0.0.1:'+port;
  assert.equal((await fetch(base+'/api/health')).status,200);
  const docs=await fetch(base+'/api/docs');assert.equal(docs.status,200);assert.ok((await docs.json()).paths['/auth/login']);
  const missing=await fetch(base+'/api/v1/missing');assert.equal(missing.status,404);assert.equal((await missing.json()).success,false);
  for (const route of ['/api/v1/sales','/api/sales','/api/v1/customers','/api/customers/1','/api/v1/system/export-excel?type=sales','/js/pages/sales.js','/js/pages/customers.js']) {
    assert.equal((await fetch(base+route)).status,404,route);
  }
  for (const route of ['/api/v1/sales','/api/v1/customers']) assert.equal((await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,404,route);
  let ack=once(child,'message');child.send({maintenance:true});await ack;
  const unavailable=await fetch(base+'/api/health');assert.equal(unavailable.status,503);assert.equal((await unavailable.json()).success,false);
  ack=once(child,'message');child.send({maintenance:false});await ack;
  assert.equal((await fetch(base+'/api/health')).status,200);
  const exit=once(child,'exit');child.kill('SIGTERM');const [code]=await exit;assert.equal(code,0,errors);
});
