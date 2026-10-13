const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

function config() {
  return { version: 1, name: '爬房', width: 5000, depth: 4000, height: 3000, timezone: 'Asia/Shanghai', labels: ['id','sex','gene','weight','mouse','next'],
    rules: [{ id:'r1',min:0,max:10,mouseMin:1,mouseMax:2 },{ id:'r2',min:10,max:null,mouseMin:2,mouseMax:3 }],
    cabinets: [{ id:'c1',name:'银柜',width:1200,depth:600,height:2000,x:600,z:300,rotation:0,schedule:null,slotSchedules:{},ruleSetId:null,
      levels:[{id:'l1',height:300,count:3,boxWidth:350,boxDepth:500,boxHeight:250,slots:[{id:'s1',box_id:'b1'},{id:'s2',box_id:'b2'},{id:'s3',box_id:'b3'}]}] }]
  };
}

// Two independent HTTP clients submit real SQL transactions concurrently. PGlite
// serializes its single engine connection; this is local competing-submission
// coverage, not a claim about production PostgreSQL MVCC connection concurrency.
async function competingHttpAssignments(db,initial) {
 const http=require('node:http');let release;const rendezvous=new Promise(resolve=>release=resolve);
 let arrivals=0;const sockets=new Set(),actors=['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'];
 const server=http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  try{
   const body=JSON.parse(Buffer.concat(chunks).toString());
   if(body.race){sockets.add(req.socket);arrivals++;if(arrivals===2)release();await rendezvous;}
   const data=await db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[req.headers['x-test-user']]);await tx.exec('set local role authenticated');
    if(body.op==='snapshot')return (await tx.query('select room_snapshot() data')).rows[0].data;
    return(await tx.query('select room_assign($1,$2,$3,$4,$5) data',[body.revision,body.snake,'s3',false,body.request])).rows[0].data;
   });res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));
  }catch(error){res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({error:error.message}));}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const post=(actor,body)=>new Promise((resolve,reject)=>{
  const agent=new http.Agent({keepAlive:false}),req=http.request({host:'127.0.0.1',port:server.address().port,path:'/',method:'POST',agent,headers:{'Content-Type':'application/json','x-test-user':actor}},res=>{
   const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{agent.destroy();resolve({status:res.statusCode,data:JSON.parse(Buffer.concat(chunks).toString())});});
  });req.on('error',e=>{agent.destroy();reject(e);});req.end(JSON.stringify(body));
 });
 try{
  const requests=['A','B'].map(snake=>({snake,revision:initial.revision,request:randomUUID(),race:true}));
  const results=await Promise.all(requests.map((body,i)=>post(actors[i],body)));
  assert.equal(sockets.size,2);assert.equal(results.filter(r=>r.status===200).length,1);assert.equal(results.filter(r=>r.status===409).length,1);
  const loser=results.findIndex(r=>r.status===409),winner=1-loser;assert.match(results[loser].data.error,/revision conflict/);
  const refreshed=(await post(actors[loser],{op:'snapshot'})).data;
  assert.equal(refreshed.assignments.length,1);assert.equal(refreshed.assignments[0].snake_id,requests[winner].snake);assert.equal(refreshed.assignments[0].slot_id,'s3');
  assert.equal(refreshed.moves.length,initial.moves.length+1);assert.equal(refreshed.revision,initial.revision+1);
  const retry=await post(actors[loser],{...requests[loser],race:false,revision:refreshed.revision,request:randomUUID()});assert.equal(retry.status,409);assert.match(retry.data.error,/Target occupied/);
  const after=(await post(actors[winner],{op:'snapshot'})).data;assert.equal(after.revision,refreshed.revision);assert.equal(after.moves.length,refreshed.moves.length);
  assert.deepEqual(after.assignments,refreshed.assignments);
  const idem=await post(actors[winner],{...requests[winner],race:false});assert.equal(idem.status,200);assert.equal(idem.data.revision,after.revision);
  return after;
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

test('room transactions enforce permissions, geometry, revision, stable boxes and retry-safe feeding', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key,role text,active boolean);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function public.can_edit_app() returns boolean language sql security definer as $$select exists(select 1 from public.profiles where id=auth.uid() and active and role in ('editor','admin'))$$;
      create table public.snakes(id text primary key,status text);
      create table public.snake_measurements(id bigint generated always as identity primary key,snake_id text not null references public.snakes(id),record_kind text not null default 'measurement' check(record_kind in ('measurement','feeding','shedding','observation')),measured_at date not null default current_date,feeding_status text,condition_note text);
      grant select,insert,update,delete on public.snake_measurements to authenticated;
      insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');insert into profiles values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);
      insert into snakes values('A','active'),('B','active'),('X','sold');grant usage on schema public,auth to anon,authenticated;`);
    await db.exec(fs.readFileSync('supabase/migrations/039_room_workspace.sql','utf8'));
    await db.exec('set role anon');
    await assert.rejects(db.query('select room_snapshot()'), /permission denied/);
    await assert.rejects(db.query('select * from room_workspace'), /permission denied/);
    await db.exec("reset role;set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';set role authenticated");
    const snapshot = async () => (await db.query('select room_snapshot() as data')).rows[0].data;
    const save = async (c, rev, request=randomUUID()) => (await db.query('select room_save_layout($1,$2,$3) as data',[rev,c,request])).rows[0].data;
    const assign = async (snake, slot, rev, swap=false, request=randomUUID()) => (await db.query('select room_assign($1,$2,$3,$4,$5) as data',[rev,snake,slot,swap,request])).rows[0].data;
    assert.deepEqual(await snapshot(), {revision:0,config:null,assignments:[],records:[],moves:[],planned_tasks:[]});
    const request = randomUUID();let c=config();let state=await save(c,0,request);
    assert.equal(state.revision,1);assert.equal((await save(c,0,request)).revision,1);
    await assert.rejects(save({...c,name:'变化'},1,request),/Request conflict/);
    await assert.rejects(save(c,0),/revision conflict/);
    for (const mutate of [x=>x.cabinets[0].x=1,x=>x.cabinets[0].levels[0].count=4,x=>x.cabinets[0].levels[0].boxWidth=450,x=>x.rules[1].min=9,x=>x.cabinets[0].type='incubator',x=>x.cabinets.push({...structuredClone(x.cabinets[0]),id:'c2',levels:[{...structuredClone(x.cabinets[0].levels[0]),id:'l2',slots:[{id:'s4',box_id:'b4'},{id:'s5',box_id:'b5'},{id:'s6',box_id:'b6'}]}]})]) {
      const invalid=config();mutate(invalid);await assert.rejects(save(invalid,1));
    }
    await assert.rejects(db.query("select room_validate_config('{}')"), /permission denied/);
    await assert.rejects(assign('X','s1',1),/active/);
    state=await assign('A','s1',1);assert.ok(state.assignments[0].assigned_at);
    c=config();c.cabinets[0].levels[0].slots[0].box_id='replacement';await assert.rejects(save(c,2),/Occupied/);
    state=await assign('B','s2',2);await assert.rejects(assign('A','s2',3),/occupied/);
    state=await assign('A','s2',3,true);assert.equal(state.assignments.find(x=>x.snake_id==='B').slot_id,'s1');
    const move = async (from,to,rev,swap=false) => (await db.query('select room_move_box($1,$2,$3,$4,$5) as data',[rev,from,to,swap,randomUUID()])).rows[0].data;
    state=await move('s2','s3',4);assert.equal(state.assignments.find(x=>x.snake_id==='A').slot_id,'s3');assert.equal(state.config.cabinets[0].levels[0].slots[2].box_id,'b2');
    const payload={snake_id:'A',slot_id:'s3',cabinet_id:'c1',planned_at:'2026-01-01T10:00:00Z',occurred_at:'2026-01-01T10:05:00Z',result:'offered',mouse_min_g:2,mouse_max_g:3,quantity:1};
    const record=async(p,rev,req=randomUUID())=>(await db.query('select room_record_feeding($1,$2,$3) as data',[rev,p,req])).rows[0].data;
    const feedRequest=randomUUID();state=await record(payload,5,feedRequest);assert.equal(state.records.length,1);
    assert.equal((await record(payload,5,feedRequest)).revision,6);
    state=await record({...payload,result:'fed'},6);assert.equal(state.records.length,1);assert.equal(state.records[0].result,'fed');
    const managedMeasurement=state.records[0].measurement_id;
    assert.ok(Number.isSafeInteger(managedMeasurement));
    await assert.rejects(db.query("update snake_measurements set feeding_status='修改事实' where id=$1",[managedMeasurement]),/该喂食记录由爬房管理/);
    await assert.rejects(db.query("update snake_measurements set record_kind='measurement' where id=$1",[managedMeasurement]),/该喂食记录由爬房管理/);
    await assert.rejects(db.query('delete from snake_measurements where id=$1',[managedMeasurement]),/该喂食记录由爬房管理/);
    await assert.rejects(db.query('insert into room_measurement_write_guards values(txid_current(),pg_backend_pid(),$1)',[managedMeasurement]),/permission denied/);
    const ordinary=(await db.query("insert into snake_measurements(snake_id,record_kind,measured_at,condition_note) values('A','observation','2026-01-01','普通观察') returning id")).rows[0].id;
    await db.query("update snake_measurements set condition_note='普通观察可以正常修改' where id=$1",[ordinary]);
    await db.query('delete from snake_measurements where id=$1',[ordinary]);
    await assert.rejects(record({...payload,slot_id:'s1'},7),/location changed/);
    c=structuredClone(state.config);
    c.cabinets[0].schedule={mode:'weekly',weekdays:[1,4],time:'18:00',times:{'1':'19:00'},start:'2026-01-01',end:null,interval:7,quantity:1,paused:false};
    c.cabinets[0].slotSchedules.s3={...c.cabinets[0].schedule,weekdays:[2],quantity:2};
    state=await save(c,7);
    state=(await db.query('select room_assign($1,$2,$3,$4,$5,$6) as data',[8,'A','s2',false,randomUUID(),'carry'])).rows[0].data;
    assert.equal(state.config.cabinets[0].slotSchedules.s2.quantity,2);
    state=(await db.query('select room_move_box($1,$2,$3,$4,$5,$6) as data',[9,'s2','s1',true,randomUUID(),'carry'])).rows[0].data;
    assert.equal(state.assignments.find(x=>x.snake_id==='A').slot_id,'s1');
    assert.equal(state.config.cabinets[0].slotSchedules.s1.quantity,2);
    assert.equal(state.config.cabinets[0].slotSchedules.s2.quantity,1);
    assert.equal(state.moves.length,8);assert.ok(state.moves.some(m=>m.source_slot==='s2'&&m.target_slot==='s1'));
    await assert.rejects(record({...payload,slot_id:'s1',mouse_min_g:'NaN'},10),/Invalid mouse weight/);
    await db.exec("reset role;update room_assignments set assigned_at=now()-interval '2 days';set role authenticated");
    const past=new Date(Date.now()-3600000).toISOString(),future=new Date(Date.now()+86400000).toISOString();
    const from=new Date(Date.now()-86400000).toISOString().slice(0,10),to=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
    const plans=[past,future].map(planned_at=>({snake_id:'A',slot_id:'s1',cabinet_id:'c1',planned_at,due_at:planned_at,mouse_min_g:2,mouse_max_g:3,quantity:1,warnings:[]}));
    const sync=async(tasks,rev,req=randomUUID())=>(await db.query('select room_sync_plans($1,$2,$3,$4,$5) as data',[rev,tasks,from,to,req])).rows[0].data;
    const syncReq=randomUUID();state=await sync(plans,10,syncReq);assert.equal(state.planned_tasks.length,2);assert.equal(state.revision,11);
    assert.equal((await sync(plans,10,syncReq)).revision,11);
    state=await sync(plans.map(t=>({...t,quantity:2})),11);assert.equal(state.revision,12);
    assert.equal(state.planned_tasks.find(t=>Date.parse(t.planned_at)===Date.parse(past)).quantity,1);
    assert.equal(state.planned_tasks.find(t=>Date.parse(t.planned_at)===Date.parse(future)).quantity,2);
    state=await sync([],12);assert.equal(state.planned_tasks.length,1);assert.equal(state.revision,13);
    await assert.rejects(sync([{...plans[1],snake_id:'X'}],13),/assignment changed/);
    c=structuredClone(state.config);c.taskOverrides=[{snakeId:'A',plannedAt:future,overrideAt:new Date(Date.parse(future)+3600000).toISOString(),cancelled:false}];state=await save(c,13);assert.equal(state.revision,14);
    c.taskOverrides.push({...c.taskOverrides[0]});await assert.rejects(save(c,14),/Duplicate task override/);
    await assert.rejects(sync([],13),/revision conflict/);
    c=structuredClone(state.config);c.taskOverrides.push({snakeId:'A',plannedAt:past,overrideAt:null,cancelled:true});
    state=await save(c,14);assert.equal(state.revision,15);
    state=await sync([],15);assert.equal(state.planned_tasks.length,1);assert.equal(state.planned_tasks[0].quantity,1);
    c=structuredClone(state.config);c.taskOverrides[1]={snakeId:'A',plannedAt:past,overrideAt:future,cancelled:false};
    state=await save(c,15);assert.equal(state.revision,16);
    state=await sync([{...plans[0],due_at:future}],16);
    assert.equal(Date.parse(state.planned_tasks[0].due_at),Date.parse(past));
    assert.equal(state.config.taskOverrides[1].overrideAt,future);
    assert.equal(state.records[0].due_at,state.records[0].planned_at);
    await assert.rejects(record({...payload,due_at:future,slot_id:'s1',result:'fed'},15),/revision conflict/);
    await db.exec('reset role');assert.equal((await db.query('select count(*) n from snake_measurements')).rows[0].n,1);
    assert.equal((await db.query('select count(*) n from room_measurement_write_guards')).rows[0].n,0);
    assert.equal((await db.query('select count(*) n from room_location_history')).rows[0].n,8);
    await db.exec("update profiles set role='viewer';set role authenticated");
    await assert.rejects(snapshot(),/Not authorized/);await assert.rejects(save(config(),7),/Not authorized/);
  } finally { await db.close(); }
});

test('room adapter reports missing migration and retries ambiguous writes with the same request', async () => {
  const vm=require('node:vm');const calls=[];let fail=true;
  const context={window:{},crypto:{randomUUID},sb:{rpc:async(name,args)=>{calls.push({name,args});if(fail){fail=false;return {error:{message:'Network disconnected'}};}return {data:{revision:1,config:{},assignments:[],records:[]}};}}};
  vm.runInNewContext(fs.readFileSync('js/room-data.js','utf8'),context);
  await assert.rejects(context.window.SuohaRoomData.save({name:'房间'},0),/Network/);
  await context.window.SuohaRoomData.save({name:'房间'},0);
  assert.equal(calls[0].args.p_request,calls[1].args.p_request);
});

for(const upgradeIncubators of [false,true])test(`${upgradeIncubators?'042 upgrade preserves':'040 keeps'} immutable rule versions and confirmed preparation while validating labels and actual results`,async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key);create table profiles(id uuid primary key,role text,active boolean);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function can_edit_app() returns boolean language sql security definer as $$select exists(select 1 from profiles where id=auth.uid() and active and role in ('admin','editor'))$$;
   create table snakes(id text primary key,status text);create table snake_measurements(id bigint generated always as identity primary key,snake_id text not null references public.snakes(id),record_kind text not null default 'measurement' check(record_kind in ('measurement','feeding','shedding','observation')),measured_at date not null default current_date,feeding_status text,condition_note text);
   grant usage on schema public,auth to anon,authenticated;
   insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');insert into profiles values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);
   insert into snakes values('A','active'),('B','active');`);
  await db.exec(fs.readFileSync('supabase/migrations/039_room_workspace.sql','utf8'));
  await db.exec("set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';set role authenticated");
  await db.query('select room_save_layout($1,$2,$3)',[0,config(),randomUUID()]);
  await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/040_room_rules_and_batches.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/041_room_label_font_size.sql','utf8'));
  if(upgradeIncubators){
   await db.exec(`create role service_role;
    alter table snakes add column sex text;
    alter table snake_measurements add column weight_g numeric;
    create table annual_breeding_plans(id bigint primary key,project_name text,plan_year integer,status text,review_status text,female_snake_id text,male_snake_id text,expected_hatching_date date);
    create table breeding_events(id bigint primary key,plan_id bigint,female_snake_id text,male_snake_id text,paired_at date,status text);
    create table clutches(id bigint primary key,clutch_code text,breeding_event_id bigint,female_snake_id text,male_snake_id text,laid_date date,egg_count integer,fertile_egg_count integer,hatched_count integer,status text,expected_hatch_date date);`);
   await db.exec(fs.readFileSync('supabase/migrations/042_room_incubators.sql','utf8'));
  }
  await db.exec('set role authenticated');
  const snap=async()=>(await db.query('select room_snapshot() data')).rows[0].data;
  let state=await snap();assert.equal(state.revision,1);assert.equal(state.rule_versions.length,1);const firstRule=state.active_rule_version_id;
  const save=async(c,rev=state.revision)=>(await db.query('select room_save_layout($1,$2,$3) data',[rev,c,randomUUID()])).rows[0].data;
  const rule=async(name,rules,activate=true,rev=state.revision,req=randomUUID())=>(await db.query('select room_save_rule_version($1,$2,$3,$4,$5) data',[rev,name,rules,activate,req])).rows[0].data;
  await assert.rejects(db.query('select * from room_rule_versions'),/permission denied/);
  await assert.rejects(db.query('select room_snapshot_v039()'),/permission denied/);
  const modified=structuredClone(state.config.rules);modified[1].mouseMin=4;modified[1].mouseMax=6;
  const ruleReq=randomUUID();state=await rule('较大鼠规格',modified,false,1,ruleReq);assert.equal(state.rule_versions.length,2);assert.equal(state.active_rule_version_id,firstRule);
  const draftId=state.rule_versions[0].id;assert.equal((await rule('较大鼠规格',modified,false,1,ruleReq)).revision,2);
  await assert.rejects(rule('冲突',modified,false,2,ruleReq),/Request conflict/);
  state=(await db.query('select room_activate_rule_version($1,$2,$3) data',[state.revision,draftId,randomUUID()])).rows[0].data;
  assert.equal(state.config.rules[1].mouseMin,4);assert.equal(state.active_rule_version_id,draftId);assert.equal(state.rule_versions.length,2);
  let c=structuredClone(state.config);c.rules[1].mouseMax=7;state=await save(c);assert.equal(state.rule_versions.length,3);
  c=structuredClone(state.config);c.labelTemplate={name:'简单标签',lines:['{{id}} · {{sex}}','{{weight}} / {{mouse}}','{{note}}'],fontSize:14,align:'left'};
  c.cabinets[0].labelTemplate=null;c.slotNotes={s1:'个体观察备注'};state=await save(c);
  c.labelTemplate.fontSize=10;c.cabinets[0].labelTemplate={...c.labelTemplate,fontSize:11};state=await save(c);
  assert.equal(state.config.labelTemplate.fontSize,10);assert.equal(state.config.cabinets[0].labelTemplate.fontSize,11);
  await assert.rejects(db.query('select room_validate_label_template($1)',[c.labelTemplate]),/permission denied/);
  for(const mutation of [x=>x.labelTemplate.lines=['{{password}}'],x=>x.labelTemplate.fontSize=9,x=>x.labelTemplate.lines=['{{id}'],x=>x.slotNotes={unknown:'不存在的格子'},x=>x.slotNotes={s1:'a'.repeat(301)}]){
   const invalid=structuredClone(c);mutation(invalid);await assert.rejects(save(invalid));
  }
  state=(await db.query('select room_assign($1,$2,$3,$4,$5) data',[state.revision,'A','s1',false,randomUUID()])).rows[0].data;
  const future=new Date(Date.now()+86400000).toISOString(),from=new Date(Date.now()).toISOString().slice(0,10),to=new Date(Date.now()+4*86400000).toISOString().slice(0,10);
  const task={snake_id:'A',slot_id:'s1',cabinet_id:'c1',planned_at:future,due_at:future,mouse_min_g:4,mouse_max_g:7,quantity:2,warnings:[]};
  const sync=async(tasks,rev=state.revision)=>(await db.query('select room_sync_plans($1,$2,$3,$4,$5) data',[rev,tasks,from,to,randomUUID()])).rows[0].data;
  state=await sync([task]);
  const batch=async(items,rev=state.revision,req=randomUUID())=>(await db.query('select room_confirm_batch($1,$2,$3,$4) data',[rev,'周内备料',items,req])).rows[0].data;
  const key={snake_id:'A',planned_at:future},batchRev=state.revision,batchReq=randomUUID();state=await batch([key],batchRev,batchReq);
  assert.equal(state.batches.length,1);assert.equal(state.batches[0].items[0].quantity,2);assert.ok(state.planned_tasks[0].batch_id);assert.equal((await batch([key],batchRev,batchReq)).revision,state.revision);
  await assert.rejects(batch([key]),/已确认备料/);await assert.rejects(batch([key],batchRev),/revision conflict/);
  const locked=structuredClone(state.batches[0].items[0]),confirmedRule=state.batches[0].rule_version_id;
  assert.equal(locked.rule_version_id,confirmedRule);
  state=await sync([{...task,mouse_min_g:9,mouse_max_g:12,quantity:4}]);assert.equal(state.planned_tasks[0].quantity,2);assert.equal(state.planned_tasks[0].mouse_min_g,4);
  state=await sync([]);assert.equal(state.planned_tasks.length,1);
  const changedTime=new Date(Date.parse(future)+1800000).toISOString();state=await sync([{...task,planned_at:changedTime,due_at:changedTime}]);assert.equal(state.planned_tasks.length,1);
  state=(await db.query('select room_activate_rule_version($1,$2,$3) data',[state.revision,firstRule,randomUUID()])).rows[0].data;
  assert.equal(state.batches[0].rule_version_id,confirmedRule);assert.deepEqual(state.batches[0].items[0],locked);
  c=structuredClone(state.config);c.taskOverrides=[{snakeId:'A',plannedAt:future,overrideAt:changedTime,cancelled:false}];await assert.rejects(save(c),/已确认备料的任务已锁定/);
  state=(await db.query('select room_assign($1,$2,$3,$4,$5) data',[state.revision,'A','s2',false,randomUUID()])).rows[0].data;
  assert.equal(state.batches[0].items[0].slot_id,'s1');assert.equal(state.assignments[0].slot_id,'s2');
  const payload={...task,slot_id:'s2',occurred_at:new Date().toISOString(),result:'offered',notes:''};
  const record=async(p,rev=state.revision)=>(await db.query('select room_record_feeding($1,$2,$3) data',[rev,p,randomUUID()])).rows[0].data;
  await assert.rejects(record({...payload,quantity:3}),/人工调整原因/);
  await assert.rejects(record({...payload,due_at:changedTime}),/时刻已锁定/);
  state=await record(payload);assert.equal(state.batches[0].items[0].record.result,'offered');
  state=await record({...payload,result:'fed',quantity:3,notes:'实际补喂一只'});assert.equal(state.batches[0].items[0].quantity,2);assert.equal(state.batches[0].items[0].record.quantity,3);
  state=await sync([{...task,slot_id:'s2',planned_at:changedTime,due_at:changedTime}]);assert.equal(state.planned_tasks.length,1);
  state=(await db.query('select room_assign($1,$2,$3,$4,$5) data',[state.revision,'A',null,false,randomUUID()])).rows[0].data;
  state=await record({...payload,slot_id:null,cabinet_id:null,result:'skipped',quantity:0,notes:'暂移出爬房，本批次跳过'});
  assert.equal(state.assignments.length,0);assert.equal(state.batches[0].items[0].record.result,'skipped');
  await assert.rejects(record({...payload,snake_id:'B',slot_id:null,cabinet_id:null}),/location changed/);
  await db.exec("reset role;insert into auth.users values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');insert into profiles values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','editor',true);set role authenticated");
  state=await competingHttpAssignments(db,state);
  await db.exec('reset role');assert.equal((await db.query('select count(*) n from snake_measurements')).rows[0].n,1);
  await assert.rejects(db.query('update room_preparation_items set quantity=99'),/不可修改/);
  await assert.rejects(db.query('delete from room_rule_versions'),/不可修改/);
  await db.exec("update profiles set role='viewer';set role authenticated");await assert.rejects(rule('无权限',modified),/Not authorized/);
  await db.exec('reset role;set role anon');await assert.rejects(snap(),/permission denied/);
 }finally{await db.close();}
});
