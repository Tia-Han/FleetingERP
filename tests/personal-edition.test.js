const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
test('personal edition publishes only inventory pages and neutral visible wording',()=>{
 const app=JSON.parse(fs.readFileSync(path.join(root,'miniprogram/app.json')));
 for(const p of app.pages) assert.ok(!/^pages\/(sale|customer|customerDetail)\//.test(p));
 for(const p of app.tabBar.list) assert.ok(app.pages.includes(p.pagePath));
 const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
 assert.ok(!/pages\/(sales|customers|split)\.js/.test(html));
 function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
 for(const f of [...walk(path.join(root,'public')),...walk(path.join(root,'miniprogram'))].filter(f=>/\.(js|wxml|html|json)$/.test(f))) {
   assert.ok(!/香氛零售|销售|客户|积分|零售价|确认收款/.test(fs.readFileSync(f,'utf8')),f);
 }
});
