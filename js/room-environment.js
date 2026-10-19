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
   if(typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['provider','deviceId','channel','label','staleAfterSeconds','sourceId'].includes(k))||(b.sourceId!==undefined&&!text(b.sourceId))||!providers.includes(b.provider)||!text(b.deviceId)||!text(b.channel)||typeof b.label!=='string'||b.label.length>80||!Number.isInteger(b.staleAfterSeconds)||b.staleAfterSeconds<30||b.staleAfterSeconds>86400)errors.push((metric==='temperature'?'温度':'湿度')+'来源须填写设备、通道及30–86400秒有效期');
  }return errors;
 }
 const clone=v=>JSON.parse(JSON.stringify(v));
 function deviceBinding(device,metric){if(!device||!device[metric+'Channel'])return null;return {provider:device.provider,deviceId:device.deviceId,channel:device[metric+'Channel'],label:device.label,staleAfterSeconds:device.staleAfterSeconds,sourceId:device.id};}
 function findDevice(devices,metric,b){return b&&(b.sourceId?devices.find(d=>d.id===b.sourceId):devices.find(d=>d.provider===b.provider&&d.deviceId===b.deviceId&&d[metric+'Channel']===b.channel));}
 function catalog(config,ids=[]){
  const devices=clone(config.environmentDevices||[]);let seq=1;
  const nextId=()=>{while(devices.some(d=>d.id==='device-'+seq))seq++;return 'device-'+seq++;};
  for(const c of config.cabinets||[])for(const l of c.levels||[])for(const metric of metrics){const b=l.environment?.[metric];if(!b||findDevice(devices,metric,b))continue;
   let d=devices.find(d=>d.provider===b.provider&&d.deviceId===b.deviceId&&!d[metric+'Channel']);
   if(!d){d={id:nextId(),provider:b.provider,deviceId:b.deviceId,label:b.label||'设备 '+(devices.length+1),staleAfterSeconds:b.staleAfterSeconds,temperatureChannel:'',humidityChannel:''};devices.push(d);}d[metric+'Channel']=b.channel;
  }
  for(const id of ids)if(!devices.some(d=>['tuya_cloud','davinci'].includes(d.provider)&&d.deviceId===id))devices.push({id:nextId(),provider:'tuya_cloud',deviceId:id,label:'加热垫 '+(devices.length+1),temperatureChannel:'temp_current',humidityChannel:'',staleAfterSeconds:300});
  return devices;
 }
 function validateCatalog(config){
  const errors=[],devices=config.environmentDevices;if(devices===undefined){for(const c of config.cabinets||[])for(const l of c.levels||[])for(const m of metrics)if(l.environment?.[m]?.sourceId)errors.push('绑定设备不存在');return errors;}
  if(!Array.isArray(devices)||devices.length>100)return ['设备列表最多100台'];
  const ids=new Set();for(const d of devices){
   if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!['id','provider','deviceId','label','staleAfterSeconds','temperatureChannel','humidityChannel'].includes(k))||!text(d.id)||ids.has(d.id)||!providers.includes(d.provider)||!text(d.deviceId)||typeof d.label!=='string'||!d.label.trim()||d.label.length>80||!Number.isInteger(d.staleAfterSeconds)||d.staleAfterSeconds<30||d.staleAfterSeconds>86400||metrics.some(m=>typeof d[m+'Channel']!=='string'||d[m+'Channel'].length>200||d[m+'Channel']&&!d[m+'Channel'].trim())||!metrics.some(m=>d[m+'Channel'])){errors.push('设备参数无效：名称、设备ID、至少一个数据通道及有效期必填，设备编号不可重复');continue;}ids.add(d.id);
  }
  if(errors.length)return errors;
  for(const c of config.cabinets||[])for(const l of c.levels||[])for(const m of metrics){const b=l.environment?.[m];if(!b?.sourceId)continue;const expected=deviceBinding(findDevice(devices,m,b),m);if(!expected||Object.keys(expected).some(k=>expected[k]!==b[k]))errors.push('柜层设备参数与设备配置不一致，请重新选择设备');}
  return errors;
 }
 function applyCatalog(config,devices,previous=catalog(config)){
  const errors=validateCatalog({environmentDevices:devices});if(errors.length)throw Error(errors.join('；'));
  for(const c of config.cabinets||[])for(const l of c.levels||[]){for(const m of metrics){const b=l.environment?.[m],old=findDevice(previous,m,b);if(!old)continue;const replacement=deviceBinding(devices.find(d=>d.id===old.id),m);if(replacement)l.environment[m]=replacement;else delete l.environment[m];}if(l.environment&&!Object.keys(l.environment).length)delete l.environment;}
  config.environmentDevices=clone(devices);return config;
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
 return Object.freeze({providers,metrics,validate,reading,display,snapshot,catalog,deviceBinding,findDevice,validateCatalog,applyCatalog});
});
