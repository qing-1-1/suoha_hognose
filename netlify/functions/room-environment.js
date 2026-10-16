'use strict';
const {createTuya,TuyaError}=require('./lib/tuya-cloud.cjs');
const cloud=createTuya();
const result=(statusCode,body)=>({statusCode,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(body)});
exports.handler=async event=>{
 const authorization=event.headers?.authorization,url=process.env.SUPABASE_URL?.replace(/\/$/,''),key=process.env.SUPABASE_PUBLISHABLE_KEY;
 if(!/^Bearer [\w.-]+$/.test(authorization||''))return result(401,{error:{message:'请登录后台'}});
 if(!url||!key)return result(503,{error:{message:'后台数据库尚未配置'}});
 async function rpc(name,args={},service=false){
  const auth=service?'Bearer '+process.env.SUPABASE_SERVICE_ROLE_KEY:authorization;
  const r=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:service?process.env.SUPABASE_SERVICE_ROLE_KEY:key,authorization:auth,'content-type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
  const data=await r.json();if(!r.ok)throw new TuyaError('ROOM_DATABASE',r.status===403?'没有温控操作权限':'温控记录保存失败，请确认 050、051 迁移及房间版本',r.status===403?403:409);return data;
 }
 try{
  if(await rpc('can_edit_app')!==true)return result(403,{error:{message:'没有温控操作权限'}});
  if(event.httpMethod==='GET'){
   if(event.queryStringParameters?.check==='connection')return result(200,await cloud.checkConnection());
   if(event.queryStringParameters?.device)return result(200,await cloud.device(event.queryStringParameters.device));
   const snap=await rpc('room_snapshot');return result(200,{...await cloud.snapshot(snap.config),revision:snap.revision});
  }
  if(event.httpMethod!=='POST')return result(405,{error:{message:'Method not allowed'}});
  const origin=process.env.SITE_URL||process.env.URL;
  if(!origin||event.headers?.origin!==new URL(origin).origin||event.headers?.['sec-fetch-site']==='cross-site'||!/^application\/json(?:;|$)/i.test(event.headers?.['content-type']||''))return result(403,{error:{message:'请从本站发送控制指令'}});
  if(!process.env.SUPABASE_SERVICE_ROLE_KEY)return result(503,{error:{message:'控制审计服务尚未配置'}});
  if((event.body||'').length>4096)return result(413,{error:{message:'控制请求过大'}});
  let body;try{body=JSON.parse(event.body||'null');}catch{return result(400,{error:{message:'控制请求格式无效'}});}
  const snap=await rpc('room_snapshot');
  const prepared=await cloud.prepare(snap.config,body);
  const reservation=await rpc('room_environment_begin_command',{p_request:body.requestId,p_payload:body});
  if(!reservation.execute)return result(200,{status:reservation.status,message:'此请求已登记，不会重复发送；请刷新核对设备状态'});
  let outcome;
  try{outcome=await cloud.send(body.deviceId,prepared.command);}catch(e){outcome={status:e.code==='TUYA_TRANSPORT'?'unknown':'failed',message:e instanceof TuyaError?e.message:'指令结果未知，请刷新核对'};}
  await rpc('room_environment_finish_command',{p_actor:reservation.actor_id,p_request:body.requestId,p_result:outcome},true);
  return result(200,{...outcome,affected:prepared.affected});
 }catch(e){return result(e instanceof TuyaError?e.status:503,{error:{code:e instanceof TuyaError?e.code:'ENVIRONMENT_UNAVAILABLE',message:e instanceof TuyaError?e.message:'温控服务暂不可用，请刷新核对设备状态'}});}
};
