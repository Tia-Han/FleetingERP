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
