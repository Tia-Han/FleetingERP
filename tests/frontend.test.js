const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
function browserContext() {
 const nodes = new Map();const listeners={};
 const document={addEventListener:(n,f)=>{const previous=listeners[n];listeners[n]=event=>{previous?.(event);f(event);};},getElementById:id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',value:''});return nodes.get(id);}};
 const context=vm.createContext({document,window:{},console,App:{toast(){}},API:{}});
 const load=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..','public/js',file),'utf8'),context);
 load('utils/formatter.js');vm.runInContext('const esc = Formatter.escape;',context);
 return {context,load,nodes,listeners};
}
test('dynamic event arguments stay data even with quotes, entities and markup',()=>{
 const b=browserContext();const payload=`O'Reilly &quot; </button><img src=x onerror=alert(1)>`;
 b.context.payload=payload;
 const markup=vm.runInContext("Formatter.action('test', payload)",b.context);
 assert.ok(!markup.includes('<img'));assert.ok(!markup.includes('onclick='));assert.ok(markup.includes('&amp;quot;'));
 let received;vm.runInContext("Formatter.onAction('test', value => window.received(value))",b.context);b.context.window.received=value=>received=value;
 b.listeners.click({target:{closest:selector=>selector==='[data-action]'?({dataset:{action:'test',args:JSON.stringify([payload])}}):null},preventDefault(){}});
 assert.equal(received,payload);
});
test('location edit button has no interpolated executable handler',async()=>{
 const b=browserContext();b.load('pages/settings.js');
 b.context.API.getLocations=async()=>({success:true,data:[{id:1,name:`O'Reilly <img src=x onerror=alert(1)>`,type:'store',address:'&quot;'}]});
 await vm.runInContext('SettingsPage.loadLocations()',b.context);
 const html=b.nodes.get('se-locations').innerHTML;assert.ok(!html.includes('<img'));assert.ok(html.includes('data-action="location-edit"'));assert.ok(!html.includes('onclick="SettingsPage.showEditLocation'));
});
test('web percentage discounts submit valid cents',async()=>{
 const b=browserContext();b.load('pages/sales.js');
 b.nodes.set('sl-discount',{value:'3'});b.nodes.set('sl-pay-method',{value:'cash'});b.nodes.set('sl-location',{value:'1'});
 b.context.App.currentUser={name:'tester'};let sent;
 b.context.API.createSale=async data=>{sent=data;return {success:false,message:'test capture'};};
 await vm.runInContext("SalesPage.items=[{sku_id:1,quantity:1,unit_price:19.99}]; SalesPage.discountMode='percent'; SalesPage.submit()",b.context);
 assert.equal(sent.discount,0.6);assert.equal(sent.payments[0].amount,19.39);
});

 test('settings downloads report HTTP failures and only expire the requesting session', async()=>{
   const b=browserContext();b.load('pages/settings.js');
   b.context.API_BASE='/api/v1';b.context.API.token='old';
   let cleared=0,login=0,request;
   b.context.API.clearToken=()=>{cleared++;b.context.API.token=null;};
   b.context.App.renderLogin=()=>login++;
   b.context.fetch=async(url)=>{request=url;return {ok:false,status:403,json:async()=>({message:'无权限'})};};
   await assert.rejects(vm.runInContext("SettingsPage.downloadResponse('/system/backup')",b.context),/无权限.*403/);
   assert.equal(request,'/api/v1/system/backup');assert.equal(cleared,0);
   b.context.fetch=async()=>({ok:false,status:401,json:async()=>({})});
   await assert.rejects(vm.runInContext("SettingsPage.downloadResponse('/system/backup')",b.context),/重新登录/);
   assert.equal(cleared,1);assert.equal(login,1);
   b.context.API.token='old';
   b.context.fetch=async()=>{b.context.API.token='new';return {ok:false,status:401};};
   await assert.rejects(vm.runInContext("SettingsPage.downloadResponse('/system/backup')",b.context),/登录状态已变更/);
   assert.equal(b.context.API.token,'new');assert.equal(cleared,1);
 });
 test('settings downloads preserve successful response and handle non-JSON errors', async()=>{
   const b=browserContext();b.load('pages/settings.js');b.context.API_BASE='/api/v1';
   const response={ok:true};b.context.fetch=async()=>response;
   assert.equal(await vm.runInContext("SettingsPage.downloadResponse('/system/backup')",b.context),response);
   b.context.fetch=async()=>({ok:false,status:502,json:async()=>{throw new Error('HTML');}});
   await assert.rejects(vm.runInContext("SettingsPage.downloadResponse('/system/backup')",b.context),/服务器未能完成请求.*502/);
 });
