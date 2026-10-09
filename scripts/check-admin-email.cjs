const fs=require('node:fs'),path=require('node:path');
const {smtpConfig}=require('../netlify/functions/lib/admin-email');
async function diagnose({env=process.env,fetcher=fetch,transportFactory=require('nodemailer').createTransport}={}){
 const checks=[];const report=(name,ok,detail)=>checks.push({name,ok,detail});
 report('邮件开关',env.ADMIN_EMAIL_ENABLED==='true',env.ADMIN_EMAIL_ENABLED==='true'?'已启用':'需要 ADMIN_EMAIL_ENABLED=true');
 const missing=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SMTP_USER','SMTP_PASS'].filter(k=>!env[k]);
 report('服务端配置',!missing.length,missing.length?'缺少 '+missing.join('、'):'所需变量齐全（不输出值）');
 if(env.SMTP_USER&&env.SMTP_PASS){let transport;
  try{transport=transportFactory(smtpConfig(env));await transport.verify();report('SMTP 连接及认证',true,'认证通过；未发送邮件');}
  catch(e){report('SMTP 连接及认证',false,['EAUTH','ECONNECTION','ETIMEDOUT','ESOCKET'].includes(e.code)?e.code:'SMTP_CHECK_FAILED');}
  finally{transport?.close();}
 }
 if(env.SUPABASE_URL&&env.SUPABASE_SERVICE_ROLE_KEY){
  const read=async route=>{
   const response=await fetcher(env.SUPABASE_URL.replace(/\/$/,'')+route,{headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw Error('HTTP_'+response.status);return response.json();
  };
  try{
   const rows=await read('/rest/v1/admin_email_outbox?select=status,attempts,last_error,created_at&order=created_at.desc&limit=100');
   const counts={};for(const row of rows)counts[row.status]=(counts[row.status]||0)+1;
   report('通知队列',true,'最近最多 100 条：'+JSON.stringify(counts));
   const stalled=rows.some(r=>r.status==='pending'&&Number(r.attempts)===0&&Date.now()-Date.parse(r.created_at)>300000);
   if(stalled)report('发送任务',false,'存在超过 5 分钟未尝试发送的通知，请检查生产定时函数及其日志');
   if(rows.some(r=>r.status==='failed'||r.last_error))report('投递失败记录',false,'存在失败或重试记录，请在受信任的数据库控制台查看 last_error');
  }catch(e){report('通知队列',false,/^HTTP_\d+$/.test(e.message)?e.message+'；检查 032–034 迁移及服务端密钥权限':'DATABASE_CHECK_FAILED');}
  try{
   const profiles=await read('/rest/v1/profiles?select=id&role=eq.admin&active=eq.true');let recipients=0;
   for(const profile of profiles){const user=await read('/auth/v1/admin/users/'+encodeURIComponent(profile.id));if(user.email?.trim())recipients++;}
   report('管理员收件人',recipients>0,`当前可用 ${recipients} 位；发件邮箱不自动作为收件人`);
  }catch(e){report('管理员收件人',false,/^HTTP_\d+$/.test(e.message)?e.message:'RECIPIENT_CHECK_FAILED');}
 }
 report('运行环境',true,'此检查不会领取队列或发送邮件。本地 npm run dev 不运行邮件定时任务；生产配置需在 Netlify 单独设置。');
 return checks;
}
module.exports={diagnose};
if(require.main===module){
 const file=path.resolve(__dirname,'../.env');if(fs.existsSync(file))process.loadEnvFile(file);
 diagnose().then(checks=>{for(const check of checks)console.log(`${check.ok?'OK':'FAIL'} ${check.name}：${check.detail}`);if(checks.some(c=>!c.ok))process.exitCode=1;}).catch(()=>{console.error('EMAIL_DIAGNOSTIC_FAILED');process.exitCode=1;});
}
