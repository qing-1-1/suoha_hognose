const {createHash,createHmac,randomUUID}=require('node:crypto');
const sharp=require('sharp');
const {rpc,json}=require('./lib/public-data');
const hash=b=>createHash('sha256').update(b).digest('hex');
const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v||'');
function token(event){const value=(event.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('suoha_bidder='))?.slice(13)||'';return /^[a-f0-9]{64}$/.test(value)?hash(value):'';}
async function imageBuffer(value){
 if(typeof value!=='string'||value.length>4200000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value))throw Error('请上传 JPG、PNG 或 WebP 图片（不超过 3 MB）');
 const bytes=Buffer.from(value.split(',')[1],'base64');
 try{const input=sharp(bytes,{limitInputPixels:24000000,failOn:'error'}),meta=await input.metadata();
 if(!['jpeg','png','webp'].includes(meta.format)||meta.pages>1)throw Error();
 return await input.rotate().resize({width:2200,height:2200,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).jpeg({quality:92}).toBuffer();
 }catch{throw Error('图片无法读取或尺寸过大，请换一张清晰截图');}
}
function fields(value){const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};return Object.fromEntries(['amount','transaction','time','payee','channel'].map(k=>[k,String(source[k]??'').trim().slice(0,k==='transaction'?100:200)]));}
exports.handler=async event=>{
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY,url=process.env.SUPABASE_URL?.replace(/\/$/,''),key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!secret||!url||!key)return json(503,{error:'收款服务尚未配置'});
 const call=(name,args)=>rpc(name,args,secret);
 const storageHeaders={apikey:secret,authorization:`Bearer ${secret}`};
 async function upload(path,bytes){const r=await fetch(`${url}/storage/v1/object/payment-media/${path}`,{method:'POST',headers:{...storageHeaders,'content-type':'image/jpeg','x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(20000)});if(!r.ok){const result=await r.json().catch(()=>({}));if(!['409','Duplicate'].includes(String(result.statusCode))&&result.error!=='Duplicate')throw Error('图片保存失败，请重试');}}
 async function sign(path){const r=await fetch(`${url}/storage/v1/object/sign/payment-media/${path}`,{method:'POST',headers:{...storageHeaders,'content-type':'application/json'},body:JSON.stringify({expiresIn:300}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('收款码暂时无法读取');const v=await r.json();return url+'/storage/v1'+v.signedURL;}
 try{
  if(event.httpMethod==='GET'){
   const id=event.queryStringParameters?.order;if(id&&!uuid(id))return json(400,{error:'无效订单编号'});
   const result=await call('read_payment_orders',{p_token:token(event),p_order:id||null});
   result.channels=await Promise.all((result.channels||[]).map(async c=>({id:c.id,label:c.label,payee:c.payee,instructions:c.instructions,wechat_id:c.wechat_id||null,url:c.qr_path?await sign(c.qr_path):null})));
   delete result.buyer_id;return json(200,result);
  }
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed'});
  if(!/^application\/json(?:;|$)/i.test(event.headers?.['content-type']||'')||event.headers?.['sec-fetch-site']==='cross-site')return json(403,{error:'请从本站提交'});
  if((event.body||'').length>4500000)return json(413,{error:'图片过大，请缩小后重试'});
  let b;try{b=JSON.parse(event.body||'{}');}catch{return json(400,{error:'无效请求'});}
  if(!b||typeof b!=='object'||Array.isArray(b))return json(400,{error:'无效请求'});
  if(b.action==='save_channel'){
   const authorization=event.headers?.authorization;if(!/^Bearer [\w.\-]+$/.test(authorization||''))return json(401,{error:'请登录后台'});
   async function staff(name,args){const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:key,authorization,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});const data=await r.json().catch(()=>null);if(!r.ok)throw Error('后台权限不足或配置无效');return data;}
   if(await staff('can_edit_app',{})!==true)return json(403,{error:'后台权限不足'});
   if(!['wechat_transfer','wechat','alipay','other'].includes(b.id)||!String(b.label||'').trim()||!String(b.payee||'').trim())return json(400,{error:'请填写收款方式和收款人'});
   let path=b.path;
   if(b.id!=='wechat_transfer'&&b.image){path='qr/'+randomUUID()+'.jpg';await upload(path,await imageBuffer(b.image));}
   if(b.id!=='wechat_transfer'&&!/^qr\/[a-f0-9-]+\.jpg$/.test(path||''))return json(400,{error:'请上传收款码'});
   if(b.id==='wechat_transfer'&&(!String(b.wechat_id||'').trim()||String(b.wechat_id).length>100))return json(400,{error:'请填写店铺微信号（最多 100 字）'});
   await staff('save_payment_channel',{p_id:b.id,p_label:String(b.label).trim(),p_payee:String(b.payee).trim(),p_instructions:String(b.instructions||''),p_path:b.id==='wechat_transfer'?null:path,p_enabled:b.enabled===true,p_wechat_id:b.id==='wechat_transfer'?String(b.wechat_id).trim():null});return json(200,{ok:true});
  }
  if(!token(event))return json(401,{error:'请先登录买家账号'});
  const ip=event.headers?.['x-nf-client-connection-ip'],rateSecret=process.env.INQUIRY_HASH_SECRET;
  if(!ip||!rateSecret)return json(503,{error:'请求限流尚未配置'});
  if(!await call('auction_rate',{p_key:'payment:'+createHmac('sha256',rateSecret).update(ip).digest('hex')}))return json(429,{error:'操作频繁，请稍后重试'});
  if(b.action==='purchase'){
   if(!uuid(b.listing_id)||!uuid(b.request_id))return json(400,{error:'无效购买请求'});
   return json(200,{id:await call('purchase_now',{p_token:token(event),p_listing:b.listing_id,p_request:b.request_id})});
  }
  if(b.action!=='receipt'||!uuid(b.order_id)||!uuid(b.request_id)||!['wechat_transfer','wechat','alipay','other'].includes(b.channel))return json(400,{error:'无效付款请求'});
  // Authenticate ownership BEFORE decoding or storing any image.
  const context=await call('read_payment_orders',{p_token:token(event),p_order:b.order_id});
  const order=context.orders[0];
  if(order.status!=='reserved'&&!order.receipts.some(r=>r.id===b.request_id))return json(409,{error:'订单当前不可提交付款截图'});
  if(order.receipts.some(r=>['pending','confirmed'].includes(r.status)&&r.id!==b.request_id))return json(409,{error:'已有付款截图待核实，请勿重复付款'});
  const submitted=fields(b.fields);
  if(!submitted.transaction)return json(400,{error:'请点击账单中本次支付记录并截图，上传包含订单号/转账单号的支付记录截图。'});
  const bytes=await imageBuffer(b.image),digest=hash(bytes),path=`receipts/${context.buyer_id}/${b.request_id}-${digest}.jpg`;
  await upload(path,bytes);
  const id=await call('submit_payment_receipt',{p_token:token(event),p_id:b.request_id,p_order:b.order_id,p_channel:b.channel,p_hash:digest,p_ocr:String(b.ocr_text||'').slice(0,20000),p_ocr_fields:fields(b.ocr_fields),p_confidence:Number.isFinite(b.confidence)?Math.max(0,Math.min(100,b.confidence)):null,p_fields:submitted});
  return json(200,{id,status:'submitted'});
 }catch(e){return json(400,{error:/[\u4e00-\u9fff]/.test(e.message)?e.message:'收款服务暂不可用，请稍后重试'});}
};
exports.imageBuffer=imageBuffer;
