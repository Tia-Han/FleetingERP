const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const {validatePagination}=require('../middleware/pagination');
const {csvCell}=require('../utils/csv');
test('pagination rejects negative, malformed and excessive query limits',()=>{
  for(const query of [{limit:'-1'},{page:'0'},{limit:'9999999'},{page:['1','2']},{limit:'1x'},{limit:'1.5'}]){
    let status;let next=false;
    validatePagination({query},{status(n){status=n;return this},json(){}},()=>next=true);
    assert.equal(status,400);assert.equal(next,false);
  }
  const req={query:{limit:'20'}};let called=false;
  validatePagination(req,{},()=>called=true);assert.ok(called);assert.equal(req.query.page,'1');
});
test('CSV keeps embedded newlines in fields and neutralizes formula-like text',()=>{
  assert.equal(csvCell('hello\nworld'),'"hello\nworld"');
  assert.equal(csvCell('=1+2'),'"\'=1+2"');
  assert.equal(csvCell('  +SUM(A1)'),'"\'  +SUM(A1)"');
  assert.equal(csvCell(-3),'"-3"');
  assert.equal(csvCell('a,"b"'),'"a,""b"""');
});
function apiContext(fetch){
  const storage=new Map();
  const ctx=vm.createContext({window:{location:{origin:'https://test.invalid'}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch,AbortController,setTimeout,clearTimeout,App:{renderLogin(){},toast(){}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/api.js'),'utf8')+'\nglobalThis.api=API;',ctx);
  return ctx;
}
test('old responses cannot populate a new session or clear its token',async()=>{
  const pending=[];const ctx=apiContext(()=>new Promise(resolve=>pending.push(resolve)));
  ctx.api.setToken('old');const old=ctx.api.getCustomers();
  ctx.api.clearToken();ctx.api.setToken('new');const current=ctx.api.getCustomers();
  assert.equal(pending.length,2);
  pending[0]({status:401});assert.equal((await old).success,false);assert.equal(ctx.api.token,'new');
  pending[1]({status:200,ok:true,json:async()=>({success:true,data:['new']})});
  assert.equal((await current).data[0],'new');
});
test('failed backup download is not saved as a database file',async()=>{
  const ctx=apiContext(async()=>({status:403,ok:false,json:async()=>({message:'无权限'})}));
  await ctx.api.backup(); // No DOM/Blob provided: a download attempt would fail the test.
});
