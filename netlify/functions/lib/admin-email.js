const nodemailer=require('nodemailer');

function smtpConfig(env=process.env){
 if(!env.SMTP_USER||!env.SMTP_PASS)throw Error('SMTP_NOT_CONFIGURED');
 return {host:'smtp.qq.com',port:465,secure:true,auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},
  connectionTimeout:4000,greetingTimeout:4000,socketTimeout:6000,
  tls:{minVersion:'TLSv1.2'},disableFileAccess:true,disableUrlAccess:true};
}
const line=value=>String(value??'未提供').replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,200);
function message(job,env=process.env){
 const p=job.payload;
 const payment=job.event_type==='payment_receipt';
 if(!payment&&job.event_type!=='auction_won')throw Error('INVALID_EVENT');
 let link='请登录网站后台查看。';
 const site=env.SITE_URL||env.URL;
 if(site){const url=new URL(site);if(url.protocol!=='https:')throw Error('INVALID_SITE_URL');link=new URL('/admin',url).href+(payment?'#payments':'#auctions');}
 return {from:{name:'Suoha 店铺通知',address:env.SMTP_USER},to:{address:job.recipient},
  messageId:`<admin-${job.id}@${env.SMTP_USER.split('@')[1]}>`,
  subject:payment?'【Suoha】付款凭证已提交，待人工核实':'【Suoha】拍卖已成交，等待买家付款',
  text:[payment?'买家已提交付款凭证。此邮件不代表已到账，请在真实收款账户核实后审核。':'拍卖已结束并确认获胜买家，成交订单已生成，等待买家付款。此邮件不代表已到账。',
   `个体：${line(p.title)}`,`买家：${line(p.buyer)}`,
   `订单：${line(p.reference)}`,...(payment?[]:[`拍卖编号：${line(p.auction_id)}`]),
   `${payment?'订单应付':'成交金额'}：¥${line(p.amount)}`,
   ...(payment?[`申报付款金额：¥${line(p.submitted_amount)}`,`付款渠道：${line(p.channel)}`]:[]),
   `${payment?'提交时间':'成交时间'}：${line(p.created_at)}`,`后台处理：${link}`].join('\n'),
  disableFileAccess:true,disableUrlAccess:true};
}
async function notificationRpc(name,args,env){
 const response=await fetch(`${env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/${name}`,{
  method:'POST',headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json'},
  body:JSON.stringify(args),signal:AbortSignal.timeout(4000)});
 if(!response.ok)throw Error('NOTIFICATION_DATABASE_ERROR');
 return response.json();
}
async function deliver(job,env,createTransport){
 const transport=createTransport(smtpConfig(env));let timer;
 try{
  // Bound total send time as well as idle time to fit the scheduled function limit.
  const result=await Promise.race([transport.sendMail(message(job,env)),new Promise((_,reject)=>{
   timer=setTimeout(()=>{reject(Error('SMTP_TIMEOUT'));transport.close();},10000);
  })]);
  if(!result.accepted?.length)throw Error('SMTP_REJECTED');
 }finally{clearTimeout(timer);transport.close();}
}
async function processNotifications({env=process.env,call=(name,args)=>notificationRpc(name,args,env),createTransport=nodemailer.createTransport}={}){
 if(env.ADMIN_EMAIL_ENABLED!=='true')return {enabled:false};
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('NOTIFICATION_DATABASE_NOT_CONFIGURED');
 smtpConfig(env); // Do not consume attempts when SMTP credentials are absent.
 const jobs=await call('claim_admin_emails',{p_limit:5});
 const results=await Promise.allSettled(jobs.map(async job=>{
  let sent=false,error='';
  try{await deliver(job,env,createTransport);sent=true;}catch(e){
   // Never persist or log raw SMTP errors (they can contain addresses/auth data).
   error=['EAUTH','ECONNECTION','ETIMEDOUT','ESOCKET','EENVELOPE','EMESSAGE'].includes(e.code)?e.code:
    ['SMTP_TIMEOUT','SMTP_REJECTED'].includes(e.message)?e.message:'SMTP_ERROR';
  }
  const saved=await call('finish_admin_email',{p_id:job.id,p_lease:job.lease_token,p_sent:sent,p_error:error});
  if(!saved)throw Error('NOTIFICATION_LEASE_LOST');
  return sent;
 }));
 if(results.some(r=>r.status==='rejected'))throw Error('NOTIFICATION_STATE_UPDATE_FAILED');
 const outcomes=results.map(r=>r.value);
 return {enabled:true,processed:outcomes.length,sent:outcomes.filter(Boolean).length,retrying:outcomes.filter(x=>!x).length};
}
module.exports={smtpConfig,message,processNotifications};
