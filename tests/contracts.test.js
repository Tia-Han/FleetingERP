const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
function miniPage(name,api={}){
 let page;
 const context={Page:p=>page=p,require:()=>api,wx:{showToast(){},navigateBack(){},showModal(){}},getApp:()=>({globalData:{userInfo:{id:1,name:'test'},token:'t'}}),setTimeout:()=>0,clearTimeout(){},console};
 vm.runInNewContext(fs.readFileSync(path.join(root,'miniprogram/pages',name,name.split('/').at(-1)+'.js'),'utf8'),context);
 page.data=JSON.parse(JSON.stringify(page.data));page.setData=function(update){Object.assign(this.data,update);};return page;
}
test('every first-party JS file parses; JSON configurations parse; HTML assets exist',()=>{
 const sources=['middleware','routes','utils','public','miniprogram','tests'].flatMap(d=>files(path.join(root,d)));
 for(const f of sources){if(f.endsWith('.js')) new vm.Script(fs.readFileSync(f,'utf8'),{filename:f});if(f.endsWith('.json')) JSON.parse(fs.readFileSync(f,'utf8'));}
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 for(const [,src] of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(!src.startsWith('http')) assert.ok(fs.existsSync(path.join(root,'public',src.split('?')[0])),src);}
});
test('web API references and all mini-program template event handlers exist',()=>{
 const ctx={window:{location:{origin:'http://test'}},localStorage:{getItem:()=>null}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'public/js/api.js'),'utf8')+';globalThis.api=API;',ctx);
 for(const f of files(path.join(root,'public/js'))) for(const [,method] of fs.readFileSync(f,'utf8').matchAll(/\bAPI\.(\w+)\s*\(/g)) assert.equal(typeof ctx.api[method],'function',path.relative(root,f)+':'+method);
 const app=JSON.parse(fs.readFileSync(path.join(root,'miniprogram/app.json'),'utf8'));
 for(const route of app.pages){
   const name=route.replace(/^pages\//,'').replace(/\/[^/]+$/,'');
   const p=miniPage(name,{});
   const wxml=fs.readFileSync(path.join(root,'miniprogram',route+'.wxml'),'utf8');
   for(const [,handler] of wxml.matchAll(/\b(?:bind|catch):?[\w-]+\s*=\s*["']([A-Za-z_]\w*)["']/g)) assert.equal(typeof p[handler],'function',route+':'+handler);
 }
});
test('mini-program product edit retains SKU identity and splittable property',async()=>{
 let submitted;
 const page=miniPage('productForm',{get:async()=>({data:{id:1,revision:'loaded-revision',name:'x',brand_id:1,category:'香水',is_splittable:1,skus:[{id:42,spec_type:'整装',volume:'50ml',unit:'瓶'}]}}),put:async(url,data)=>{submitted=data;}});
 page.data.isEdit=true;page.data.productId=1;
 await page.loadProduct(1);assert.equal(page.data.is_split,true);
 await page.submit();assert.equal(submitted.revision,'loaded-revision');assert.equal(submitted.skus[0].id,42);assert.equal(submitted.is_split,1);
});
test('mini-program percentage discount recalculates when quantity changes',()=>{
 const p=miniPage('sale');p.data.items=[{quantity:1,unit_price:100}];p.data.discountValue='10';p.calcSummary();assert.equal(p.data.discountAmount,10);
 p.data.items[0].quantity=2;p.calcSummary();assert.equal(p.data.discountAmount,20);assert.equal(p.data.finalAmount,'180.00');assert.equal(p.data.items[0].lineTotal,'200.00');
});
test('mini-program transfer receipt opens the matching transfer detail namespace',async()=>{
 let url;
 const p=miniPage('stockInDetail',{checkLogin:()=>true,get:async u=>{url=u;return {data:{id:1,from_name:'仓库',to_name:'门店',items:[]}};}});
 p.orderId=1;p.transfer=true;await p.loadDetail();assert.equal(url,'/transfer/1');assert.equal(p.data.order.is_transfer,true);
});
