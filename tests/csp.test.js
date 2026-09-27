const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../public');
function setup() {
 const listeners={};const nodes=new Map();
 const document={addEventListener:(name,fn)=>(listeners[name]??=[]).push(fn),getElementById:id=>nodes.get(id)};
 const context=vm.createContext({document,window:{},console,localStorage:{getItem:()=>null},API:{}});
 const load=name=>vm.runInContext(fs.readFileSync(path.join(root,'js',name),'utf8'),context);
 load('utils/formatter.js');
 const fire=(type,name,args=[],value='')=>{
  const attrs={[`data-ui-${type}`]:name,[`data-ui-${type}-args`]:JSON.stringify(args)};
  const element={value,getAttribute:k=>attrs[k],closest:selector=>selector.includes('data-ui-')?element:null};
  const event={target:element,preventDefault(){this.prevented=true;}};
  for(const listener of listeners[type]||[])listener(event);
  return event;
 };
 return {context,load,nodes,fire};
}
test('public templates contain no CSP-blocked inline handlers or executable string compilation',()=>{
 function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,entry.name);if(entry.isDirectory()){scan(file);continue;}
  if(!/\.(js|html)$/.test(file))continue;
  const text=fs.readFileSync(file,'utf8');
  assert.doesNotMatch(text,/\bon\w+\s*=\s*["']/i,file);
  assert.doesNotMatch(text,/\beval\s*\(|new\s+Function\s*\(/,file);
 }}scan(root);
});
test('delegated handlers preserve input values, numeric arguments and hostile strings as data',()=>{
 const b=setup();b.load('pages/stockOut.js');
 let received;b.context.capture=(...args)=>received=args;
 vm.runInContext('StockOutPage.updateItem=(...args)=>capture(...args)',b.context);
 const code=fs.readFileSync(path.join(root,'js/pages/stockOut.js'),'utf8');
 const action=code.match(/Formatter.onEvent\("([^"]+)", function\(event, arg0\) \{ return StockOutPage.updateItem\(arg0, 'remark', this.value\)/)[1];
 const value=`O'Reilly </input><img src=x onerror=alert(1)>`;
 b.fire('change',action,[3],value);assert.deepEqual(received,[3,'remark',value]);
});
test('delegated navigation preserves preventDefault',()=>{
 const b=setup();b.load('pages/dashboard.js');let received;
 b.context.capture=v=>received=v;
 vm.runInContext('DashboardPage.jumpToMovement=value=>capture(value)',b.context);
 const code=fs.readFileSync(path.join(root,'js/pages/dashboard.js'),'utf8');
 const action=code.match(/Formatter.onEvent\("([^"]+)", function\(event, arg0\) \{ DashboardPage.jumpToMovement/)[1];
 const event=b.fire('click',action,['sale']);assert.equal(received,'sale');assert.equal(event.prevented,true);
});
test('login click sends one request, displays failure and permits retry',async()=>{
 const b=setup();b.load('app.js');
 for(const id of ['sidebar','topbar','content'])b.nodes.set(id,{innerHTML:''});
 b.nodes.set('login-username',{value:'admin'});b.nodes.set('login-password',{value:'example'});
 const button={};b.nodes.set('login-submit',button);
 let resolve,calls=0,message;
 b.context.API.login=()=>{calls++;return new Promise(r=>resolve=r);};
 b.context.capture=v=>message=v;
 vm.runInContext('App.toast=message=>capture(message);App.renderLogin()',b.context);
 const action=b.nodes.get('content').innerHTML.match(/data-ui-click="([^"]+)"/)[1];
 b.fire('click',action);b.fire('click',action);
 assert.equal(calls,1);assert.equal(button.disabled,true);assert.equal(button.textContent,'登录中…');
 resolve({success:false,message:'用户名或密码错误'});
 await new Promise(r=>setImmediate(r));
 assert.equal(message,'用户名或密码错误');assert.equal(button.disabled,false);
 b.fire('click',action);assert.equal(calls,2);resolve({success:false,message:'重试'});
 await new Promise(r=>setImmediate(r));
});
