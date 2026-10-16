const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash,createHmac}=require('node:crypto');
const {createTuya}=require('../netlify/functions/lib/tuya-cloud.cjs');
function fixture(options={}){
 const env={TUYA_ACCESS_ID:'test-client',TUYA_ACCESS_SECRET:'test-secret',TUYA_REGION:'cn',TUYA_DEVICE_IDS:'pad1',TUYA_CONTROL_ENABLED:'true',TUYA_CONTROL_MAP:JSON.stringify({pad1:{temperatureCode:'target',powerCode:'heat',minC:20,maxC:32}}),...options.env};
 const temp={code:'actual',type:'Integer',values:JSON.stringify({unit:'℃',scale:1,min:-400,max:1000,step:1})};
 const spec={status:[temp,{...temp,code:'humidity',values:JSON.stringify({unit:'%',scale:1,min:0,max:1000,step:1})}],functions:[{...temp,code:'target',values:JSON.stringify({unit:'℃',scale:1,min:100,max:400,step:5})},{code:'heat',type:'Boolean',values:'{}'}]};
 const calls=[];let time=Date.parse('2026-10-16T12:00:00Z');
 const fetchImpl=async(url,request)=>{
  calls.push({url,request});const path=new URL(url).pathname+new URL(url).search;
  const toSign=[request.method,createHash('sha256').update(request.body||'').digest('hex'),'',path].join('\n');
  const expected=createHmac('sha256',env.TUYA_ACCESS_SECRET).update(env.TUYA_ACCESS_ID+(request.headers.access_token||'')+request.headers.t+toSign).digest('hex').toUpperCase();assert.equal(request.headers.sign,expected);
  if(options.transportFailure&&request.method==='POST')throw Error('secret must not be exposed');
  if(options.cloudError)return {ok:true,json:async()=>({success:false,code:1106,msg:'secret must not be exposed'})};
  let result=path.startsWith('/v1.0/token')?{access_token:'token',expire_time:7200}:path.endsWith('/specification')?spec:path.endsWith('/status')?[{code:'actual',value:options.value??285},{code:'humidity',value:600}]:path.endsWith('/commands')?true:path.endsWith('/properties')?{properties:[{code:'actual',value:285,time:time-600000}]}:{name:'A1',online:options.offline?false:true,local_key:'never expose'};
  return {ok:true,json:async()=>({success:true,result})};
 };
 const cloud=createTuya({env,fetchImpl,now:()=>time});const config={cabinets:[{id:'c',name:'A柜',levels:[{id:'l',environment:{temperature:{provider:'tuya_cloud',deviceId:'pad1',channel:'actual',staleAfterSeconds:300},humidity:{provider:'tuya_cloud',deviceId:'pad1',channel:'humidity',staleAfterSeconds:300}}}]}]};
 return {cloud,calls,config,spec,env,advance:()=>time+=16000};
}
test('cloud signs requests, caches/coalesces tokens and devices, scales readings without inventing sample time',async()=>{
 const f=fixture();const [a,b]=await Promise.all([f.cloud.snapshot(f.config),f.cloud.snapshot(f.config)]);
 assert.equal(a.levels[0].temperature.value,28.5);assert.equal(a.levels[0].humidity.value,60);assert.equal(a.levels[0].temperature.status,'cloud_cached');assert.equal(a.levels[0].temperature.observedAt,null);
 assert.deepEqual(a,b);assert.equal(f.calls.filter(x=>x.url.includes('/token?')).length,1);assert.equal(f.calls.filter(x=>x.url.endsWith('/status')).length,1);
 assert.ok(!JSON.stringify(await f.cloud.device('pad1')).includes('never expose'));
 await assert.rejects(f.cloud.device('../evil'),/授权清单/);await assert.rejects(f.cloud.device('other'),/授权清单/);
});
test('cloud reports stale, offline, malformed, unconfigured and permission failures honestly',async()=>{
 let f=fixture({env:{TUYA_SHADOW_ENABLED:'true'}});assert.equal((await f.cloud.snapshot(f.config)).levels[0].temperature.status,'stale');
 f=fixture({offline:true});assert.equal((await f.cloud.snapshot(f.config)).levels[0].temperature.status,'offline');
 f=fixture({value:'285'});assert.equal((await f.cloud.snapshot(f.config)).levels[0].temperature.status,'invalid');
 f=fixture({env:{TUYA_ACCESS_SECRET:''}});assert.equal((await f.cloud.snapshot(f.config)).levels[0].temperature.status,'not_connected');assert.equal(f.calls.length,0);
 f=fixture({cloudError:true});const s=await f.cloud.snapshot(f.config);assert.equal(s.levels[0].temperature.error,'TUYA_1106');assert.ok(!JSON.stringify(s).includes('secret must'));
});
test('commands require a bound device, explicit policy, schema type/range/step and are never retried after ambiguity',async()=>{
 const f=fixture(),body={requestId:randomUUID(),revision:1,deviceId:'pad1',action:'temperature',value:28.5};
 const prepared=await f.cloud.prepare(f.config,body);assert.deepEqual(prepared.command,{code:'target',value:285});assert.equal(prepared.affected.length,1);
 assert.equal((await f.cloud.send('pad1',prepared.command)).status,'accepted');
 for(const value of [28.3,33,'28',null])await assert.rejects(f.cloud.prepare(f.config,{...body,value}));
 await assert.rejects(f.cloud.prepare({cabinets:[]},body),/绑定/);
 await assert.rejects(f.cloud.prepare(f.config,{...body,action:'raw',code:'reset'}));
 const disabled=fixture({env:{TUYA_CONTROL_ENABLED:'false'}});await assert.rejects(disabled.cloud.prepare(disabled.config,body),/尚未配置/);
 const failed=fixture({transportFailure:true});const p=await failed.cloud.prepare(failed.config,body);await assert.rejects(failed.cloud.send('pad1',p.command),e=>e.code==='TUYA_TRANSPORT'&&!e.message.includes('secret'));
 assert.equal(failed.calls.filter(x=>x.request.method==='POST').length,1);
});
