const {randomBytes, scrypt: scryptCallback, timingSafeEqual, createHash, createHmac}=require('node:crypto');
const {promisify}=require('node:util');
const {rpc,json}=require('./lib/public-data');
const scrypt=promisify(scryptCallback);
const uuid=value=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value||'');
const hash=value=>createHash('sha256').update(value).digest('hex');
const cookieName='suoha_bidder';
function token(event){const raw=(event.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';return /^[a-f0-9]{64}$/.test(raw)?hash(raw):'';}
function sessionResponse(event,value,body){const result=json(200,body);const secure=process.env.CONTEXT || !/^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/.test(event.headers?.host||'');result.headers['set-cookie']=`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value?604800:0}${secure?'; Secure':''}`;return result;}
exports.handler=async event=>{
 const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!secret)return json(503,{error:'竞拍服务尚未配置'});
 const call=(name,args)=>rpc(name,args,secret);
 try{
  if(event.httpMethod==='GET'){
   const listing=event.queryStringParameters?.listing_id;
   if(listing&&!uuid(listing))return json(400,{error:'无效的个体编号'});
   return json(200,await call('read_auctions',{p_listing:listing||null,p_token:token(event)}));
  }
  if(event.httpMethod!=='POST')return json(405,{error:'Method not allowed'});
  // JSON-only POST plus SameSite cookies prevents cross-site form submissions.
  if(!/^application\/json(?:;|$)/i.test(event.headers?.['content-type']||'')||(event.headers?.['sec-fetch-site']==='cross-site'))return json(403,{error:'请从本站提交'});
  if((event.body||'').length>5000)return json(413,{error:'请求过大'});
  let b;try{b=JSON.parse(event.body||'{}');}catch{return json(400,{error:'无效请求'});}
  if(!b||typeof b!=='object'||Array.isArray(b))return json(400,{error:'无效请求'});
  if(b.action==='logout'){await call('auction_identity',{p_action:'logout',p_token:token(event)});return sessionResponse(event,'',{ok:true});}
  const ip=event.headers?.['x-nf-client-connection-ip'];
  const rateSecret=process.env.INQUIRY_HASH_SECRET;
  if(!ip||!rateSecret)return json(503,{error:'竞拍限流尚未配置'});
  const fingerprint=createHmac('sha256',rateSecret).update(ip).digest('hex');
  if(!await call('auction_rate',{p_key:'ip:'+fingerprint}))return json(429,{error:'操作过于频繁，请在 15 分钟后重试'});
  if(b.action==='bid'){
   if(!token(event))return json(401,{error:'请先登录竞拍账号'});
   if(!uuid(b.id)||!uuid(b.request_id)||typeof b.amount!=='number'||!Number.isFinite(b.amount)||b.amount<=0||b.amount>9999999999.99)return json(400,{error:'请检查出价金额'});
   return json(200,await call('place_auction_bid',{p_token:token(event),p_id:b.id,p_amount:b.amount,p_request:b.request_id}));
  }
  if(!['register','login'].includes(b.action))return json(400,{error:'未知操作'});
  const username=String(b.username||'').trim().toLowerCase(),password=b.password;
  if(!/^[a-z0-9_]{4,30}$/.test(username)||typeof password!=='string'||password.length<10||password.length>128)return json(400,{error:'账号需为 4–30 位字母、数字或下划线；密码需为 10–128 位'});
  if(!await call('auction_rate',{p_key:'account:'+hash(username)}))return json(429,{error:'此账号操作频繁，请稍后重试'});
  const raw=randomBytes(32).toString('hex');
  if(b.action==='register'){
   const contact=String(b.contact||'').trim();
   if(b.consent!==true||contact.length<3||contact.length>200)return json(400,{error:'请填写微信或手机号，并同意竞拍规则'});
   const salt=randomBytes(16).toString('hex'),derived=(await scrypt(password,salt,64)).toString('hex');
   try{return sessionResponse(event,raw,await call('auction_identity',{p_action:'register',p_username:username,p_hash:salt+':'+derived,p_contact:contact,p_token:hash(raw)}));}
   catch(error){if(/duplicate key/.test(error.message))return json(409,{error:'该账号名不可用，请换一个'});throw error;}
  }
  const credentials=await call('auction_identity',{p_action:'credentials',p_username:username});
  // Equal-cost derivation for absent accounts.
  const [salt,expected]=(credentials?.hash||'00000000000000000000000000000000:'+('00'.repeat(64))).split(':');
  const actual=await scrypt(password,salt,64),stored=Buffer.from(expected,'hex');
  if(!credentials||stored.length!==actual.length||!timingSafeEqual(actual,stored))return json(401,{error:'账号或密码错误'});
  return sessionResponse(event,raw,await call('auction_identity',{p_action:'session',p_username:username,p_token:hash(raw)}));
 }catch(error){
  const message=error.message||'';
  return json(error.status===503?503:400,{error:/[\u4e00-\u9fff]/.test(message)?message:'竞拍暂时不可用，请稍后重试'});
 }
};
