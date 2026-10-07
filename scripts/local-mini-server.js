// Dedicated local database. No existing .env or production credentials are loaded.
const path=require('path'),fs=require('fs'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.local-dev');
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const settings=path.join(dir,'credentials.json');
if(!fs.existsSync(settings)) fs.writeFileSync(settings,JSON.stringify({password:crypto.randomBytes(18).toString('base64url'),secret:crypto.randomBytes(48).toString('hex')}),{mode:0o600});
const credentials=JSON.parse(fs.readFileSync(settings,'utf8'));
Object.assign(process.env,{LOCAL_DEV_ISOLATED:'1',NODE_ENV:'development',HOST:'127.0.0.1',PORT:'3301',DB_PATH:path.join(dir,'development.sqlite'),JWT_SECRET:credentials.secret,ADMIN_PASSWORD:credentials.password,WX_APPID:'',WX_APPSECRET:'',CORS_ORIGIN:'http://127.0.0.1:3301',ENABLE_SPLIT:'false'});
const {initDatabase}=require('../utils/db');
const db=initDatabase(),bcrypt=require('bcryptjs');
db.transaction(()=>{
 if (!db.prepare("SELECT id FROM locations WHERE id=3").get()) db.prepare("INSERT INTO locations (id,name,type) VALUES (3,'门店B','store')").run();
 for(const [username,role,location] of [['dev_store_a','store_clerk',2],['dev_store_b','store_clerk',3],['dev_warehouse','warehouse_manager',1]]) {
  if(!db.prepare('SELECT id FROM users WHERE username=?').get(username)) db.prepare('INSERT INTO users(username,password_hash,role,name,location_id) VALUES(?,?,?,?,?)').run(username,bcrypt.hashSync(credentials.password,10),role,username,location);
 }
})();
console.log('本机测试后端：http://127.0.0.1:3301；数据库：'+process.env.DB_PATH);
console.log('测试账号：admin / dev_store_a / dev_store_b / dev_warehouse；密码仅保存在 '+settings);
require('../server');
