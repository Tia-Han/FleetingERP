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
test('web coalesces clicks, retains retry key after a lost response, and starts a fresh intentional write',async()=>{
 const requests=[]; const ctx=apiContext((url,options)=>new Promise((resolve,reject)=>requests.push({options,resolve,reject})));
 ctx.api.setToken('test');
 const a=ctx.api.createLocation({name:'B',type:'store'}), b=ctx.api.createLocation({name:'B',type:'store'});
 assert.equal(requests.length,1);
 const key=requests[0].options.headers['Idempotency-Key'];assert.ok(key);
 requests[0].reject(new Error('lost response'));
 assert.equal((await a).uncertain,true);await b;
 const retry=ctx.api.createLocation({name:'B',type:'store'});
 assert.equal(requests[1].options.headers['Idempotency-Key'],key);
 requests[1].resolve({status:200,ok:true,json:async()=>({success:true,data:{id:1}})});await retry;
 const next=ctx.api.createLocation({name:'B',type:'store'});
 assert.notEqual(requests[2].options.headers['Idempotency-Key'],key);
 requests[2].resolve({status:409,ok:false,json:async()=>({success:false,message:'exists'})});await next;
});
test('mini-program coalesces clicks and preserves operation key after timeout',async()=>{
 const storage=new Map(),requests=[];
 const wx={getStorageSync:k=>storage.get(k),setStorageSync:(k,v)=>storage.set(k,v),removeStorageSync:k=>storage.delete(k),request:o=>requests.push(o),showToast(){}};
 const ctx=vm.createContext({wx,getApp:()=>({globalData:{token:'test',userInfo:{id:1},apiBase:'https://test/api'}}),module:{exports:{}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/request.js'),'utf8'),ctx);
 const api=ctx.module.exports;
 const a=api.post('/stock-in',{location_id:1}),b=api.post('/stock-in',{location_id:1});
 const outcomes=Promise.allSettled([a,b]);assert.equal(requests.length,1);
 const key=requests[0].header['Idempotency-Key'];
 requests[0].fail({errMsg:'timeout'});await outcomes;
 const retry=api.post('/stock-in',{location_id:1});
 assert.equal(requests[1].header['Idempotency-Key'],key);
 requests[1].success({statusCode:200,data:{success:true}});await retry;
});
test('obsolete mini-program 401 cannot clear the replacement login',async()=>{
 let request,cleared=false;const app={globalData:{token:'old',apiBase:'https://test'},clearLogin(){cleared=true;}};
 const ctx=vm.createContext({wx:{request:r=>request=r,reLaunch(){},showToast(){}},getApp:()=>app,module:{exports:{}}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../miniprogram/utils/request.js'),'utf8'),ctx);
 const result=ctx.module.exports.get('/stock/balances');app.globalData.token='new';request.success({statusCode:401});
 await assert.rejects(result);assert.equal(cleared,false);assert.equal(app.globalData.token,'new');
});
test('slower old search cannot replace the latest suggestions',async()=>{
 const ctx=vm.createContext({window:{},document:{removeEventListener(){}},setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/utils/searchSuggest.js'),'utf8')+';globalThis.search=SearchSuggest;',ctx);
 const rendered=[];ctx.search._showDropdown=(input,items)=>rendered.push(items);
 const input={value:'old',isConnected:true};let oldDone,newDone;
 const a=ctx.search._doSearch(input,null,'old',()=>new Promise(r=>oldDone=r),()=>{},()=>{});
 input.value='new';const b=ctx.search._doSearch(input,null,'new',()=>new Promise(r=>newDone=r),()=>{},()=>{});
 newDone(['new']);await b;oldDone(['old']);await a;assert.deepEqual(rendered,[['new']]);
});

test('view requests reject responses from old navigation, tabs and superseded reads',()=>{
 const ctx=vm.createContext({window:{},document:{addEventListener(){}},App:{_viewVersion:1}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/utils/formatter.js'),'utf8')+'\nglobalThis.formatter=Formatter;',ctx);
 const owner={currentTab:'new'};
 const first=ctx.formatter.viewRequest(owner,'list');
 assert.equal(first(),true);
 const second=ctx.formatter.viewRequest(owner,'list');
 assert.equal(first(),false);assert.equal(second(),true);
 owner.currentTab='history';assert.equal(second(),false);
 const third=ctx.formatter.viewRequest(owner,'list');
 ctx.App._viewVersion++;assert.equal(third(),false);
 const fourth=ctx.formatter.viewRequest(owner,'list');
 assert.equal(fourth(),true);
});
