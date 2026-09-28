const {getDb}=require('../utils/db');
function scope(resource) {
 return (req,res,next)=>{
  if(req.user.role==='admin') return next();
  const location=req.user.location_id;
  const deny=()=>res.status(403).json({success:false,message:'无权访问其他场所'});
  const path=(req.path||req.url.split('?')[0]);
  if(['stock','stockIn','stockOut','sales','split','system'].includes(resource)) {
   if(['GET','HEAD'].includes(req.method)) {
    if(req.query.location_id && Number(req.query.location_id)!==location) return deny();
    req.query.location_id=String(location);
    if(/^\/[^/]+\/?$/.test(path) && !['/history','/config'].includes(path.replace(/\/$/,'')) && ['stockIn','sales','split'].includes(resource)) {
     const table={stockIn:'stock_in_orders',sales:'sales',split:'split_orders'}[resource];
     const row=getDb().prepare('SELECT location_id FROM '+table+' WHERE id=?').get(path.replaceAll('/',''));
     if(!row || row.location_id!==location) return deny();
    }
   } else if(req.body && req.body.location_id!==undefined && Number(req.body.location_id)!==location) return deny();
  }
  if(resource==='transfer') {
   if(req.method==='POST' && Number(req.body.from_location_id)!==location) return deny();
   if(/^\/[^/]+\/?$/.test(path)) {
    const t=getDb().prepare('SELECT * FROM transfers WHERE id=?').get(path.replaceAll('/',''));
    if(!t || ![t.from_location_id,t.to_location_id].includes(location)) return deny();
   }
  }
  next();
 };
}
module.exports={scope};
