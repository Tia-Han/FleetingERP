const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').resolve(__dirname,'..');
function page(post,navFail=false){let p;vm.runInNewContext(fs.readFileSync(root+'/miniprogram/pages/login/login.js','utf8'),{Page:x=>p=x,require:()=>({post}),getApp:()=>({globalData:{localDevelopment:true},setLogin(){}}),wx:{switchTab:o=>navFail?o.fail():o.success()}});p.setData=function(x){Object.assign(this.data,x)};Object.assign(p.data,{username:'dev',password:'test'});return p;}
test('failed login remains visible and permits retry',async()=>{let n=0;const p=page(async()=>{if(!n++)throw Error('网络失败');return {data:{token:'t',user:{id:1}}}});await p.accountLogin();assert.equal(p.data.errorMessage,'网络失败');assert.equal(p.data.loading,false);await p.accountLogin();assert.equal(p.data.errorMessage,'');assert.equal(n,2)});
test('duplicate clicks send one request',async()=>{let resolve,n=0;const p=page(()=>{n++;return new Promise(r=>resolve=r)});const a=p.accountLogin();await p.accountLogin();assert.equal(n,1);resolve({data:{token:'t',user:{id:1}}});await a;assert.equal(p.data.loading,false)});
test('navigation failure remains visible',async()=>{const p=page(async()=>({data:{token:'t',user:{id:1}}}),true);await p.accountLogin();assert.match(p.data.errorMessage,/首页打开失败/);assert.equal(p.data.loading,false)});
function requestHarness(){let opts,cleared=0,redirects=0;const app={globalData:{token:'old',apiBase:'local',localDevelopment:true},clearLogin(){cleared++;this.globalData.token=''}};const sandbox={module:{exports:{}},getApp:()=>app,wx:{request:o=>opts=o,showToast(){},reLaunch(){redirects++}}};vm.runInNewContext(fs.readFileSync(root+'/miniprogram/utils/request.js','utf8'),sandbox);return {request:sandbox.module.exports.request,response:r=>opts.success(r),fail:()=>opts.fail({errMsg:'request:fail'}),counts:()=>[cleared,redirects]};}
test('wrong password 401 preserves login form',async()=>{const h=requestHarness(),p=h.request('/auth/login','POST',{});h.response({statusCode:401,data:{message:'用户名或密码错误'}});await assert.rejects(p,/用户名或密码错误/);assert.deepEqual(h.counts(),[0,0])});
test('protected resource 401 expires session',async()=>{const h=requestHarness(),p=h.request('/stock/balances');h.response({statusCode:401});await assert.rejects(p,/过期/);assert.deepEqual(h.counts(),[1,1])});
test('offline local service provides actionable error',async()=>{const h=requestHarness(),p=h.request('/auth/login','POST');h.fail();await assert.rejects(p,/本机测试服务/)});

test('WeChat login unexpected response stays visible and releases loading', async () => {
  let p;
  vm.runInNewContext(fs.readFileSync(root + '/miniprogram/pages/login/login.js', 'utf8'), {
    Page: value => { p = value; },
    require: () => ({ post: async () => ({ data: { status: 'unexpected' } }) }),
    wx: { login: options => options.success({ code: 'test-code' }) }
  });
  p.setData = value => Object.assign(p.data, value);
  await p.wxLogin();
  assert.match(p.data.errorMessage, /返回数据异常/);
  assert.equal(p.data.loading, false);
});

test('unbound WeChat login opens binding without putting authentication code in URL', async () => {
  let p, destination;
  vm.runInNewContext(fs.readFileSync(root + '/miniprogram/pages/login/login.js', 'utf8'), {
    Page: value => { p = value; },
    require: () => ({ post: async () => ({ data: { status: 'unbound' } }) }),
    wx: {
      login: options => options.success({ code: 'test-code' }),
      navigateTo: options => { destination = options.url; options.success(); }
    }
  });
  p.setData = value => Object.assign(p.data, value);
  await p.wxLogin();
  assert.equal(destination, '/pages/login/bind/bind');
  assert.equal(p.data.loading, false);
});
