const {test}=require('node:test'),assert=require('node:assert/strict');
const {resolveEnvironment}=require('../miniprogram/utils/environment');
function env(version,platform){return resolveEnvironment({getAccountInfoSync:()=>({miniProgram:{envVersion:version}}),getSystemInfoSync:()=>({platform})});}
test('only develop simulator connects to isolated local backend',()=>{
 assert.equal(env('develop','devtools').apiBase,'http://127.0.0.1:3301/api/v1');
 for(const [v,p] of [['trial','devtools'],['release','devtools'],['develop','ios'],['release','android']]) {assert.equal(env(v,p).local,false);assert.match(env(v,p).apiBase,/^https:/);}
 assert.throws(()=>env('unknown','devtools'));
});
