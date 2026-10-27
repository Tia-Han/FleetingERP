const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm'), path=require('node:path');
function load(name, api, wx={}, app={isLoggedIn:()=>true}) {
 let page;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../miniprogram/pages',name+'.js'),'utf8'),{Page:p=>page=p,require:()=>api,wx,getApp:()=>app});
 page.setData=v=>Object.assign(page.data,v); return page;
}
test('binding rejects malformed response, retains feedback, and permits retry', async()=>{
 let valid=false, saved=0;
 const p=load('login/bind/bind',{post:async()=>valid?{data:{status:'bound',token:'t',user:{id:1}}}:{data:{}}},{login:o=>o.success({code:'fresh'}),switchTab:o=>o.success()},{setLogin:()=>saved++});
 Object.assign(p.data,{username:' user ',password:'secret'});
 await p.doBind();assert.match(p.data.errorMessage,/返回数据异常/);assert.equal(p.data.loading,false);
 valid=true;await p.doBind();assert.equal(saved,1);assert.equal(p.data.errorMessage,'');
});
test('binding suppresses repeated click and reports navigation failure',async()=>{
 let resolve,calls=0;
 const p=load('login/bind/bind',{post:()=>{calls++;return new Promise(r=>resolve=r)}},{login:o=>o.success({code:'fresh'}),switchTab:o=>o.fail()},{setLogin(){}});
 Object.assign(p.data,{username:'user',password:'secret'});
 const first=p.doBind();await Promise.resolve();await p.doBind();assert.equal(calls,1);
 resolve({data:{status:'bound',token:'t',user:{id:1}}});await first;
 assert.match(p.data.errorMessage,/首页打开失败/);assert.equal(p.data.loading,false);
});
test('product list refreshes on every return with the selected filter',()=>{
 const p=load('products/products',{checkLogin:()=>true});let brands=0,reads=0;
 p.loadBrands=()=>brands++;p.loadList=refresh=>{assert.equal(refresh,true);reads++};
 p.onShow();p.onShow();assert.equal(brands,2);assert.equal(reads,2);
});
test('product detail reloads after returning from edit',async()=>{
 let version=0;
 const p=load('productDetail/productDetail',{get:async()=>({data:{name:'version'+(++version),skus:[]}})});
 p.onLoad({id:'1'});await p.onShow();assert.equal(p.data.product.name,'version1');
 await p.onShow();assert.equal(p.data.product.name,'version2');
});
