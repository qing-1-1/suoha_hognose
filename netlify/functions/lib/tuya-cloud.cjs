'use strict';
const {createHash,createHmac}=require('node:crypto');
const regions={cn:'https://openapi.tuyacn.com',us:'https://openapi.tuyaus.com',eu:'https://openapi.tuyaeu.com',in:'https://openapi.tuyain.com',us_east:'https://openapi-ueaz.tuyaus.com',eu_west:'https://openapi-weaz.tuyaeu.com'};
class TuyaError extends Error {constructor(code,message,status=422){super(message);this.code=code;this.status=status;}}
const fail=(code,message,status)=>{throw new TuyaError(code,message,status);};
const idValid=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(id);
const cloudBinding=b=>b&&['davinci','tuya_cloud'].includes(b.provider);
function signature({clientId,secret,token='',time,method,path,body=''}){
 const content=createHash('sha256').update(body).digest('hex');
 return createHmac('sha256',secret).update(clientId+token+time+method+'\n'+content+'\n\n'+path).digest('hex').toUpperCase();
}
function values(dp){try{const v=typeof dp?.values==='string'?JSON.parse(dp.values):dp?.values;return v&&typeof v==='object'?v:{};}catch{return {};}}
function numeric(dp){const v=values(dp);if(dp?.type!=='Integer'||!Number.isInteger(v.scale)||v.scale<0||v.scale>6||!Number.isFinite(v.min)||!Number.isFinite(v.max)||v.min>v.max||!Number.isInteger(v.step)||v.step<1)return null;return v;}
const celsius=unit=>['℃','°C','°c','C','c'].includes(unit);
function bindingUses(config,id){return (config?.cabinets||[]).flatMap(c=>(c.levels||[]).filter(l=>cloudBinding(l.environment?.temperature)&&l.environment.temperature.deviceId===id).map((l,i)=>({cabinetId:c.id,levelId:l.id,label:c.name+' / '+l.id})));}
function createTuya({env=process.env,fetchImpl=globalThis.fetch,now=Date.now}={}){
 let token=null,tokenPromise=null;const cache=new Map(),pending=new Map();
 function settings(){
  const ids=[...new Set((env.TUYA_DEVICE_IDS||'').split(',').map(x=>x.trim()).filter(Boolean))];
  if(ids.length>100||ids.some(x=>!idValid(x)))fail('TUYA_CONFIG','涂鸦设备白名单配置无效',503);
  const ready=!!(env.TUYA_ACCESS_ID&&env.TUYA_ACCESS_SECRET&&ids.length);
  const base=regions[env.TUYA_REGION||'cn'];if(!base)fail('TUYA_CONFIG','涂鸦数据中心配置无效',503);
  let policy={};try{policy=JSON.parse(env.TUYA_CONTROL_MAP||'{}');if(!policy||Array.isArray(policy)||typeof policy!=='object')throw Error();}catch{fail('TUYA_CONFIG','涂鸦控制映射配置无效',503);}
  return {ids,ready,base,policy};
 }
 function allowed(id){const s=settings();if(!s.ready)fail('TUYA_NOT_CONFIGURED','尚未配置涂鸦云授权与设备白名单',503);if(!idValid(id)||!s.ids.includes(id))fail('TUYA_DEVICE_DENIED','设备不在服务器授权清单内',403);return s;}
 async function wire(method,path,body,access=''){
  const s=settings(),time=String(now()),payload=body===undefined?'':JSON.stringify(body);
  const headers={client_id:env.TUYA_ACCESS_ID,t:time,sign_method:'HMAC-SHA256',sign:signature({clientId:env.TUYA_ACCESS_ID,secret:env.TUYA_ACCESS_SECRET,token:access,time,method,path,body:payload}),'content-type':'application/json'};
  if(access)headers.access_token=access;
  let response,data;try{response=await fetchImpl(s.base+path,{method,headers,...(payload?{body:payload}:{}),redirect:'error',signal:AbortSignal.timeout(8000)});data=await response.json();}catch{fail('TUYA_TRANSPORT',method==='POST'?'指令结果未知，请查看设备状态，勿自动重发':'涂鸦云连接失败，请稍后重试',502);}
  if(method==='POST'&&(!response.ok||typeof data?.success!=='boolean'))fail('TUYA_TRANSPORT','指令结果未知，请查看设备状态，勿自动重发',502);
  if(!response.ok||data?.success!==true){const code=String(data?.code||response.status);if(!/^[0-9]{1,8}$/.test(code))fail('TUYA_UPSTREAM','涂鸦云拒绝请求',502);fail('TUYA_'+code,'涂鸦云返回错误 '+code+'，请核对区域、设备授权及 API 服务权限',502);}
  return data.result;
 }
 async function access(){
  if(token&&token.until>now()+60000)return token.value;
  if(!tokenPromise)tokenPromise=(async()=>{const r=await wire('GET','/v1.0/token?grant_type=1');if(typeof r?.access_token!=='string'||!Number.isFinite(r.expire_time)||r.expire_time<=0)fail('TUYA_TOKEN','涂鸦授权响应无效',502);token={value:r.access_token,until:now()+r.expire_time*1000};return token.value;})().finally(()=>tokenPromise=null);
  return tokenPromise;
 }
 async function call(method,path,body){try{return await wire(method,path,body,await access());}catch(e){if(method==='GET'&&e.code==='TUYA_1010'){token=null;return wire(method,path,body,await access());}throw e;}}
 function controlOptions(id,spec){
  const s=settings(),p=s.policy[id],out={};if(env.TUYA_CONTROL_ENABLED!=='true'||!p)return out;
  if(typeof p.temperatureCode==='string'){
   const d=(spec.functions||[]).find(x=>x.code===p.temperatureCode),v=numeric(d);
   if(v&&celsius(v.unit)&&Number.isFinite(p.minC)&&Number.isFinite(p.maxC)&&p.minC<=p.maxC){const divisor=10**v.scale,min=Math.max(v.min/divisor,p.minC),max=Math.min(v.max/divisor,p.maxC);if(min<=max)out.temperature={code:d.code,min,max,step:v.step/divisor,scale:v.scale,rawMin:v.min,rawMax:v.max,rawStep:v.step};}
  }
  if(typeof p.powerCode==='string'&&(spec.functions||[]).some(d=>d.code===p.powerCode&&d.type==='Boolean'))out.power={code:p.powerCode};
  return out;
 }
 async function device(id,{fresh=false}={}){
  allowed(id);if(!fresh&&cache.get(id)?.expires>now())return cache.get(id).data;if(pending.has(id))return pending.get(id);
  const promise=(async()=>{
   const [info,spec,status]=await Promise.all([call('GET','/v1.1/iot-03/devices/'+id),call('GET','/v1.0/iot-03/devices/'+id+'/specification'),call('GET','/v1.0/iot-03/devices/'+id+'/status')]);
   if(!Array.isArray(status)||!Array.isArray(spec?.status)||!Array.isArray(spec?.functions))fail('TUYA_RESPONSE','涂鸦设备规格响应无效',502);
   let shadow=[];if(env.TUYA_SHADOW_ENABLED==='true'){try{shadow=(await call('GET','/v2.0/cloud/thing/'+id+'/shadow/properties'))?.properties||[];}catch{/* Legacy state is explicitly marked as having unknown observation time. */}}
   const fetchedAt=new Date(now()).toISOString();
   const data={id,name:typeof info?.name==='string'?info.name.slice(0,100):id,online:typeof info?.online==='boolean'?info.online:null,fetchedAt,
    status:status.filter(x=>typeof x.code==='string'&&['number','boolean','string'].includes(typeof x.value)).map(x=>{const d=Array.isArray(shadow)?shadow.find(v=>v.code===x.code&&v.value===x.value):null;return {code:x.code,value:typeof x.value==='string'?x.value.slice(0,200):x.value,observedAt:Number.isFinite(d?.time)&&d.time>0&&d.time<=now()?new Date(d.time).toISOString():null};}),
    specification:{status:spec.status.map(x=>({code:x.code,name:x.name,type:x.type,values:values(x)})),functions:spec.functions.map(x=>({code:x.code,name:x.name,type:x.type,values:values(x)}))},controls:controlOptions(id,spec)};
   cache.set(id,{data,expires:now()+15000});return data;
  })().finally(()=>pending.delete(id));pending.set(id,promise);return promise;
 }
 function reading(binding,metric,d){
  const base={value:null,unit:metric==='temperature'?'°C':'%',observedAt:null,fetchedAt:d?.fetchedAt||null,status:'unavailable'};
  if(d?.online===false)return {...base,status:'offline'};if(d?.online!==true)return base;
  const point=d.status.find(x=>x.code===binding.channel),schema=d.specification.status.find(x=>x.code===binding.channel),v=numeric(schema);
  if(!point||!v||!Number.isSafeInteger(point.value)||point.value<v.min||point.value>v.max)return {...base,status:'invalid'};
  if(metric==='temperature'?!celsius(v.unit):v.unit!=='%')return {...base,status:'invalid'};
  const value=point.value/(10**v.scale);if(value<(metric==='temperature'?-100:0)||value>(metric==='temperature'?200:100))return {...base,status:'invalid'};
  const status=point.observedAt?(now()-Date.parse(point.observedAt)>binding.staleAfterSeconds*1000?'stale':'ok'):'cloud_cached';
  return {...base,value,observedAt:point.observedAt,status};
 }
 async function snapshot(config){
  const s=settings(),levels=(config?.cabinets||[]).flatMap(c=>(c.levels||[]).map(l=>({cabinetId:c.id,levelId:l.id,environment:l.environment||{}})));
  const ids=[...new Set(levels.flatMap(l=>Object.values(l.environment).filter(cloudBinding).map(b=>b.deviceId)))];
  if(ids.length>20)fail('TUYA_LIMIT','每次最多读取20台温湿度设备',422);
  const devices=new Map();for(let i=0;i<ids.length;i+=4)await Promise.all(ids.slice(i,i+4).map(async id=>{try{devices.set(id,await device(id));}catch(e){devices.set(id,{error:e.code||'TUYA_UNAVAILABLE',message:e.message});}}));
  return {version:1,capabilities:{read:true,control:env.TUYA_CONTROL_ENABLED==='true',connected:[...devices.values()].some(d=>d.status),configured:s.ready},deviceIds:s.ids,levels:levels.map(l=>{const row={cabinetId:l.cabinetId,levelId:l.levelId};for(const metric of ['temperature','humidity']){const b=l.environment[metric],d=b&&devices.get(b.deviceId);row[metric]=!b?{value:null,unit:metric==='temperature'?'°C':'%',observedAt:null,status:'unbound'}:cloudBinding(b)&&d?.status?reading(b,metric,d):{value:null,unit:metric==='temperature'?'°C':'%',observedAt:null,status:!s.ready||!cloudBinding(b)?'not_connected':'unavailable',...(d?.error?{error:d.error,message:d.message}:{})};}return row;})};
 }
 async function prepare(config,body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['requestId','revision','deviceId','action','value'].includes(k))||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.requestId||'')||!Number.isInteger(body.revision)||body.revision<0)fail('INVALID_COMMAND','控制请求无效');
  allowed(body.deviceId);if(!bindingUses(config,body.deviceId).length)fail('DEVICE_UNBOUND','请先将设备温度绑定到爬柜层');
  const d=await device(body.deviceId,{fresh:true});if(d.online!==true)fail('DEVICE_OFFLINE','设备离线或状态未知，不能发送控制');
  let command;
  if(body.action==='temperature'){
   const v=d.controls.temperature;if(!v)fail('CONTROL_DISABLED','尚未配置并核实目标温度控制通道');
   if(typeof body.value!=='number'||!Number.isFinite(body.value)||body.value<v.min||body.value>v.max)fail('TEMPERATURE_RANGE','目标温度超出已配置范围');
   const raw=body.value*10**v.scale,integer=Math.round(raw);if(Math.abs(raw-integer)>1e-7||(integer-v.rawMin)%v.rawStep!==0)fail('TEMPERATURE_STEP','目标温度不符合设备步进');command={code:v.code,value:integer};
  }else if(body.action==='power'){
   if(!d.controls.power)fail('CONTROL_DISABLED','尚未配置并核实加热开关通道');if(typeof body.value!=='boolean')fail('INVALID_COMMAND','开关值须为布尔值');command={code:d.controls.power.code,value:body.value};
  }else fail('INVALID_COMMAND','仅支持设置目标温度和加热开关');
  return {command,affected:bindingUses(config,body.deviceId)};
 }
 async function send(id,command){allowed(id);try{const result=await call('POST','/v1.0/iot-03/devices/'+id+'/commands',{commands:[command]});if(result!==true)fail('COMMAND_REJECTED','涂鸦云未接受控制指令',502);return {status:'accepted',message:'涂鸦云已接受指令，请刷新核对设备实际状态'};}finally{cache.delete(id);}}
 return {settings,device,snapshot,prepare,send};
}
module.exports={createTuya,TuyaError,signature,bindingUses};
