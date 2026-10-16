/* Vendor-neutral read-only telemetry boundary. No device credentials or control commands. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SuohaRoomEnvironment=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const providers=['davinci','tuya_cloud','home_assistant','mqtt','custom'];
 const metrics=['temperature','humidity'];
 const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=200;
 function validate(environment){
  if(environment===undefined)return [];
  if(!environment||typeof environment!=='object'||Array.isArray(environment)||Object.keys(environment).some(k=>!metrics.includes(k)))return ['温湿度配置字段无效'];
  const errors=[];
  for(const metric of metrics){const b=environment[metric];if(b===undefined||b===null)continue;
   if(typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['provider','deviceId','channel','label','staleAfterSeconds'].includes(k))||!providers.includes(b.provider)||!text(b.deviceId)||!text(b.channel)||typeof b.label!=='string'||b.label.length>80||!Number.isInteger(b.staleAfterSeconds)||b.staleAfterSeconds<30||b.staleAfterSeconds>86400)errors.push((metric==='temperature'?'温度':'湿度')+'来源须填写设备、通道及30–86400秒有效期');
  }return errors;
 }
 function reading(binding,metric,sample,now=Date.now()){
  const base={value:null,unit:metric==='temperature'?'°C':'%',observedAt:null,status:binding?'not_connected':'unbound'};
  if(!binding||!sample)return base;
  if(sample.provider!==binding.provider||sample.deviceId!==binding.deviceId||sample.channel!==binding.channel||sample.metric!==metric)return {...base,status:'invalid'};
  if(sample.status==='offline'||sample.status==='unavailable')return {...base,status:sample.status};
  const timestamp=Date.parse(sample.observedAt),value=sample.value;
  if(sample.unit!==base.unit||typeof value!=='number'||!Number.isFinite(value)||value<(metric==='humidity'?0:-100)||value>(metric==='humidity'?100:200)||typeof sample.observedAt!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(sample.observedAt)||!Number.isFinite(timestamp)||timestamp>now)return {...base,status:'invalid'};
  return {value,unit:base.unit,observedAt:sample.observedAt,status:now-timestamp>binding.staleAfterSeconds*1000?'stale':'ok'};
 }
 function display(r){
  const labels={unbound:'未绑定',not_connected:'等待云授权配置',unavailable:'暂不可用',invalid:'数据点或单位不匹配',offline:'设备离线',stale:'数据已过期',cloud_cached:'云端最新值，采样时间未知',ok:'已读取'};
  if(!r)return '暂不可用';return (typeof r.value==='number'?r.value+' '+r.unit+' · ':'')+(labels[r.status]||'状态未知')+(r.observedAt?' · 采样 '+new Date(r.observedAt).toLocaleString():'')+(r.message?' · '+r.message:'');
 }
 function snapshot(config){return {version:1,capabilities:{read:true,control:false,connected:false},levels:(config?.cabinets||[]).flatMap(c=>c.levels.map(l=>({cabinetId:c.id,levelId:l.id,temperature:reading(l.environment?.temperature,'temperature'),humidity:reading(l.environment?.humidity,'humidity')})))};}
 return Object.freeze({providers,metrics,validate,reading,display,snapshot});
});
