const crypto = require('crypto');
const { getDb } = require('../utils/db');
// For synchronous SQLite handlers only: commit the result and response together.
function idempotent(handler) {
  return (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !/^[\w-]{16,100}$/.test(key)) return res.status(400).json({success:false,message:'请刷新客户端后重试（缺少操作编号）'});
    const db=getDb();
    const endpoint=(req.baseUrl || req.idempotencyResource || '') + (req.path || req.url.split('?')[0]);
    const hash=crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    let payload, status=res.statusCode || 200;
    const send=res.json, setStatus=res.status;
    try {
      db.transaction(()=>{
        const prior=db.prepare('SELECT * FROM request_results WHERE user_id=? AND request_key=?').get(req.user.id,key);
        if(prior) {
          if(prior.endpoint!==endpoint || prior.body_hash!==hash) {status=409;payload={success:false,message:'操作编号已用于不同内容，请重新发起操作'};return;}
          status=prior.status;payload=JSON.parse(prior.response);return;
        }
        res.status=n=>{status=n;return res;};res.json=value=>{payload=value;return res;};
        const result=handler(req,res);
        if(result?.then || payload===undefined) throw new Error('Idempotency requires a synchronous JSON handler');
        db.prepare('INSERT INTO request_results(user_id,request_key,endpoint,body_hash,status,response) VALUES(?,?,?,?,?,?)').run(req.user.id,key,endpoint,hash,status,JSON.stringify(payload));
      }).immediate();
      res.json=send;res.status=setStatus;
      return res.status(status).json(payload);
    } catch(error) {res.json=send;res.status=setStatus;next(error);}
  };
}
module.exports={idempotent};
