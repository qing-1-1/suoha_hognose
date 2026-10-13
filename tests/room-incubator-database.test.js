const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');const {PGlite}=require('@electric-sql/pglite');
function room(){
 const cabinet=(id,x,type,purpose)=>({id,name:id,type,purpose,width:600,depth:600,height:1200,x,z:400,rotation:0,schedule:null,slotSchedules:{},ruleSetId:null,
  levels:[0,1].map(n=>({id:id+'l'+n,height:250,count:2,boxWidth:250,boxDepth:400,boxHeight:200,slots:[1,2].map(i=>({id:id+'s'+(n*2+i),box_id:id+'b'+(n*2+i)}))}))});
 return{version:1,name:'房间',width:5000,depth:4000,height:3000,timezone:'Asia/Shanghai',labels:['id','weight'],rules:[{id:'r1',min:0,max:10,mouseMin:1,mouseMax:2},{id:'r2',min:10,max:null,mouseMin:2,mouseMax:3}],cabinets:[cabinet('rack',500,'rack'),cabinet('winter',1800,'incubator','brumation'),cabinet('eggs',3000,'incubator','eggs')]};
}
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key);create table profiles(id uuid primary key,role text,active boolean);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function can_edit_app() returns boolean language sql security definer as $$select exists(select 1 from profiles where id=auth.uid() and active and role in ('admin','editor'))$$;
 create table snakes(id text primary key,status text,sex text);
 create table snake_measurements(id bigint generated always as identity primary key,snake_id text,record_kind text,measured_at date,weight_g numeric,feeding_status text,condition_note text);
 create table annual_breeding_plans(id bigint primary key,project_name text,plan_year integer,status text,review_status text,female_snake_id text,male_snake_id text,expected_hatching_date date);
 create table breeding_events(id bigint primary key,plan_id bigint,female_snake_id text,male_snake_id text,paired_at date,status text);
 create table clutches(id bigint primary key,clutch_code text,breeding_event_id bigint,female_snake_id text,male_snake_id text,laid_date date,egg_count integer,fertile_egg_count integer,hatched_count integer,status text,expected_hatch_date date);
 grant usage on schema public,auth to anon,authenticated,service_role;
 insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');insert into profiles values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);
 insert into snakes values('A','active','U'),('B','active','U'),('C','active','U'),('F','active','F'),('M','active','M'),('M2','active','M');
 insert into annual_breeding_plans values(1,'批准计划',2026,'planned','approved','F','M',current_date+45),(2,'未批准',2026,'planned','pending','F','M',null),(3,'亲本不符',2026,'planned','approved','F','M2',null);
 insert into breeding_events values(1,1,'F','M',current_date-30,'successful'),(2,2,'F','M',current_date-30,'successful'),(3,3,'F','M',current_date-30,'successful');
 insert into clutches values(1,'CL-1',1,'F','M',current_date-2,10,8,0,'incubating',current_date+45),(2,'CL-2',2,'F','M',current_date-2,10,8,0,'incubating',null),(3,'CL-3',3,'F','M',current_date-2,10,8,0,'incubating',null);
 insert into snake_measurements(snake_id,record_kind,measured_at,weight_g) values('A','measurement',current_date,23),('B','measurement',current_date,9);`);
 for(const f of ['039_room_workspace.sql','040_room_rules_and_batches.sql','041_room_label_font_size.sql','042_room_incubators.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 await db.exec("set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';set role authenticated");return db;
}
test('incubator allocations enforce approved lineage, capacity, purpose, transactions and complete history',async()=>{
 const db=await setup();try{
  let state=(await db.query('select room_snapshot() data')).rows[0].data;
  const call=async(sql,args)=>{state=(await db.query(sql,args)).rows[0].data;return state;};
  const save=c=>call('select room_save_layout($1,$2,$3) data',[state.revision,c,randomUUID()]);
  const assign=(snake,slot,carry='inherit')=>call('select room_assign($1,$2,$3,$4,$5,$6) data',[state.revision,snake,slot,false,randomUUID(),carry]);
  await save(room());assert.deepEqual(state.breeding_plans.map(p=>p.id).sort(),[1,3]);assert.deepEqual(state.clutches.map(c=>c.id),[1]);
  let invalid=structuredClone(state.config);invalid.cabinets[1].schedule={mode:'weekly',weekdays:[1],start:'2026-01-01',time:'18:00'};await assert.rejects(save(invalid),/不安排常规喂食/);
  const date=(await db.query("select (now() at time zone 'Asia/Shanghai')::date::text d")).rows[0].d;
  const payload={slot_id:'eggss1',plan_id:1,clutch_id:1,egg_count:5,notes:'原窝分配',started_on:date,expected_on:null};
  const allocate=(p,req=randomUUID(),rev=state.revision)=>call('select room_save_incubation($1,$2,$3) data',[rev,p,req]);
  const req=randomUUID(),rev=state.revision;await allocate(payload,req,rev);assert.equal(state.incubations[0].female_snake_id,'F');assert.equal(state.clutches[0].remaining_eggs,3);const savedRev=state.revision;
  await allocate(payload,req,rev);assert.equal(state.revision,savedRev);assert.equal(state.incubation_history.length,1);
  await assert.rejects(allocate({...payload,slot_id:'eggss2',egg_count:4}),/剩余可孵化蛋数/);
  await assert.rejects(allocate({...payload,slot_id:'eggss2',plan_id:2,clutch_id:2}),/已批准/);
  await assert.rejects(allocate({...payload,slot_id:'eggss2',plan_id:3,clutch_id:3}),/亲本不匹配/);
  await allocate({...payload,slot_id:'eggss2',egg_count:3});assert.equal(state.clutches[0].remaining_eggs,0);
  await assert.rejects(assign('A','eggss3'),/孵蛋格/);
  invalid=structuredClone(state.config);invalid.cabinets[2].purpose='brumation';await assert.rejects(save(invalid),/占用中的/);
  invalid=structuredClone(state.config);invalid.cabinets.pop();await assert.rejects(save(invalid),/占用中的/);
  await db.exec('reset role');await assert.rejects(db.query("update clutches set fertile_egg_count=7 where id=1"),/释放分配/);await assert.rejects(db.query("update annual_breeding_plans set review_status='returned' where id=1"),/释放/);await assert.rejects(db.query('update breeding_events set plan_id=2 where id=1'),/不能更换/);await db.exec('set role authenticated');
  await call('select room_move_incubation($1,$2,$3,$4) data',[state.revision,'eggss1','eggss3',randomUUID()]);assert.equal(state.incubations.find(a=>a.egg_count===5).slot_id,'eggss3');assert.equal(state.clutches[0].remaining_eggs,0);
  await assert.rejects(call('select room_move_incubation($1,$2,$3,$4) data',[state.revision,'eggss3','winters1',randomUUID()]),/孵蛋格/);assert.equal((await db.query('select room_snapshot() data')).rows[0].data.incubations.length,2);
  await call('select room_clear_incubation($1,$2,$3) data',[state.revision,'eggss3',randomUUID()]);assert.equal(state.clutches[0].remaining_eggs,5);assert.equal(state.incubation_history.length,4);
  const before=state.revision;
  await assert.rejects(call('select room_assign_batch($1,$2,$3) data',[before,[{snake_id:'A',slot_id:'racks1'},{snake_id:'B',slot_id:'eggss4'}],randomUUID()]),/孵蛋格/);
  state=(await db.query('select room_snapshot() data')).rows[0].data;assert.equal(state.revision,before);assert.equal(state.assignments.length,0);assert.equal(state.moves.length,0);
  const batchReq=randomUUID();await call('select room_assign_batch($1,$2,$3) data',[before,[{snake_id:'A',slot_id:'racks1'},{snake_id:'B',slot_id:'winters1'}],batchReq]);assert.equal(state.assignments.length,2);assert.equal(state.moves.length,2);
  await call('select room_assign_batch($1,$2,$3) data',[before,[{snake_id:'A',slot_id:'racks1'},{snake_id:'B',slot_id:'winters1'}],batchReq]);assert.equal(state.moves.length,2);
  await assert.rejects(assign('A','winters2','carry'),/不能携带/);await assert.rejects(assign('B','racks2','carry'),/不能携带/);
  const now=new Date().toISOString();await assert.rejects(call('select room_record_feeding($1,$2,$3) data',[state.revision,{snake_id:'B',slot_id:'winters1',cabinet_id:'winter',planned_at:now,due_at:now,occurred_at:now,result:'fed',mouse_min_g:1,mouse_max_g:2,quantity:1},randomUUID()]),/冬化期间/);
  await db.exec('reset role');assert.equal((await db.query("select count(*) n from snake_measurements where record_kind='feeding'")).rows[0].n,0);await db.exec('set role authenticated');
  await assign('B','racks2');assert.equal(state.assignments.find(a=>a.snake_id==='B').slot_id,'racks2');
  // Releasing incubator occupancy restores the existing clutch/hatching editor.
  await call('select room_clear_incubation($1,$2,$3) data',[state.revision,'eggss2',randomUUID()]);
  await db.exec('reset role');
  await db.query("update clutches set hatched_count=8,status='hatched' where id=1");
  await db.query("update annual_breeding_plans set status='completed' where id=1");
  // Unallocated breeding records remain freely editable after the new triggers.
  await db.query("update clutches set egg_count=6,fertile_egg_count=5,status='failed' where id=2");
  await db.query("update breeding_events set plan_id=3,male_snake_id='M2' where id=2");
  assert.equal((await db.query('select hatched_count from clutches where id=1')).rows[0].hatched_count,8);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select room_snapshot()'),/permission denied/);await assert.rejects(db.query('select * from room_incubation_allocations'),/permission denied/);
 }finally{await db.close();}
});

test('service-only plan generator works without a viewer, observes rules/timezones, freezes confirmed plans and excludes brumation',async()=>{
 const db=await setup();try{
  let cfg=room();const localDay=(await db.query("select (now() at time zone 'Asia/Shanghai')::date::text d")).rows[0].d;
  cfg.cabinets[0].schedule={mode:'interval',start:localDay,end:null,interval:1,time:'18:00',quantity:1,paused:false,weekdays:[],times:{}};
  let state=(await db.query('select room_save_layout($1,$2,$3) data',[0,cfg,randomUUID()])).rows[0].data;
  state=(await db.query('select room_assign_batch($1,$2,$3) data',[state.revision,[{snake_id:'A',slot_id:'racks1'},{snake_id:'B',slot_id:'winters1'}],randomUUID()])).rows[0].data;
  await assert.rejects(db.query('select room_generate_plans()'),/permission denied/);
  await db.exec('reset role;set role service_role');let generated=(await db.query('select room_generate_plans() data')).rows[0].data;assert.ok(generated.generated>=35);
  const initialRevision=generated.revision;generated=(await db.query('select room_generate_plans() data')).rows[0].data;assert.equal(generated.generated,0);assert.equal(generated.updated,0);assert.equal(generated.revision,initialRevision);
  await db.exec('reset role;set role authenticated');state=(await db.query('select room_snapshot() data')).rows[0].data;
  assert.ok(state.planned_tasks.every(p=>p.snake_id==='A'));assert.ok(state.planned_tasks.every(p=>p.mouse_min_g===2&&p.mouse_max_g===3&&p.quantity===1));
  const plan=state.planned_tasks.find(p=>Date.parse(p.due_at)>Date.now()+86400000),key={snake_id:'A',planned_at:plan.planned_at};
  state=(await db.query('select room_confirm_batch($1,$2,$3,$4) data',[state.revision,'锁定备料',[key],randomUUID()])).rows[0].data;
  await assert.rejects(db.query('select room_assign($1,$2,$3,$4,$5)',[state.revision,'A','winters2',false,randomUUID()]),/先完成或跳过/);
  cfg=structuredClone(state.config);cfg.rules[1].mouseMin=5;cfg.rules[1].mouseMax=7;
  state=(await db.query('select room_save_layout($1,$2,$3) data',[state.revision,cfg,randomUUID()])).rows[0].data;
  await db.exec('reset role;set role service_role');generated=(await db.query('select room_generate_plans() data')).rows[0].data;assert.ok(generated.updated>0);
  await db.exec('reset role;set role authenticated');state=(await db.query('select room_snapshot() data')).rows[0].data;
  assert.equal(state.planned_tasks.find(p=>p.batch_item_id).mouse_min_g,2);assert.ok(state.planned_tasks.some(p=>!p.batch_item_id&&p.mouse_min_g===5));
  const now=new Date().toISOString();state=(await db.query('select room_record_feeding($1,$2,$3) data',[state.revision,{snake_id:'A',slot_id:'racks1',cabinet_id:'rack',planned_at:plan.planned_at,due_at:plan.due_at,occurred_at:now,result:'skipped',quantity:0,mouse_min_g:null,mouse_max_g:null,notes:'准备冬化'},randomUUID()])).rows[0].data;
  const unprepared=state.planned_tasks.find(p=>!p.batch_item_id&&Date.parse(p.due_at)>Date.now());
  state=(await db.query('select room_assign($1,$2,$3,$4,$5) data',[state.revision,'A','winters2',false,randomUUID()])).rows[0].data;
  await assert.rejects(db.query('select room_confirm_batch($1,$2,$3,$4)',[state.revision,'冬化不得新备料',[{snake_id:'A',planned_at:unprepared.planned_at}],randomUUID()]),/冬化期间/);
  await db.exec('reset role;set role service_role');generated=(await db.query('select room_generate_plans() data')).rows[0].data;assert.ok(generated.removed>0);
  await db.exec('reset role;set role authenticated');state=(await db.query('select room_snapshot() data')).rows[0].data;assert.equal(state.planned_tasks.filter(p=>Date.parse(p.due_at)>Date.now()&&!p.batch_item_id).length,0);assert.equal(state.records.length,1);
  await db.exec('reset role');assert.equal((await db.query("select room_local_instant('2026-03-08','02:30','America/New_York') x")).rows[0].x,null);
  assert.equal(new Date((await db.query("select room_local_instant('2026-11-01','01:30','America/New_York') x")).rows[0].x).toISOString(),'2026-11-01T05:30:00.000Z');
 }finally{await db.close();}
});

test('server recurrence matches the browser for weekly clocks, null overrides, reschedules and unknown amounts',async()=>{
 const db=await setup();try{
  const M=require('../js/room-model.js'),cfg=room(),from=M.localDate(new Date(),cfg.timezone),to=new Date(Date.parse(from+'T00:00:00Z')+35*86400000).toISOString().slice(0,10);
  const weekly={mode:'weekly',start:from,end:null,weekdays:[1,3,6],time:'18:00',times:{'3':'07:45'},quantity:2,paused:false,interval:7};
  cfg.cabinets[0].schedule=weekly;cfg.cabinets[0].slotSchedules={racks2:null,racks3:{...weekly,mode:'interval',interval:3,time:'07:15',quantity:null}};
  let state=(await db.query('select room_save_layout($1,$2,$3) data',[0,cfg,randomUUID()])).rows[0].data;
  state=(await db.query('select room_assign_batch($1,$2,$3) data',[state.revision,[{snake_id:'A',slot_id:'racks1'},{snake_id:'B',slot_id:'racks2'},{snake_id:'C',slot_id:'racks3'}],randomUUID()])).rows[0].data;
  const snakes=['A','B','C'].map(id=>({id,status:'active'})),measurements=[{id:1,snake_id:'A',weight_g:23,measured_at:from},{id:2,snake_id:'B',weight_g:9,measured_at:from}];
  const initial=M.generateTasks(state.config,state.assignments,snakes,measurements,[],{from,to}).filter(t=>t.snakeId==='A');
  const modified=structuredClone(state.config);modified.taskOverrides=[{snakeId:'A',plannedAt:initial[0].plannedAt,overrideAt:new Date(Date.parse(initial[0].plannedAt)+3600000).toISOString(),cancelled:false},{snakeId:'A',plannedAt:initial[1].plannedAt,overrideAt:null,cancelled:true}];
  state=(await db.query('select room_save_layout($1,$2,$3) data',[state.revision,modified,randomUUID()])).rows[0].data;
  const expected=M.generateTasks(state.config,state.assignments,snakes,measurements,[],{from,to}).filter(t=>t.status==='pending').map(t=>({snake:t.snakeId,planned:Date.parse(t.plannedAt),due:Date.parse(t.dueAt),min:t.mouseMin,max:t.mouseMax,quantity:t.quantity}));
  await db.exec('reset role;set role service_role');await db.query('select room_generate_plans($1,$2)',[from,to]);await db.exec('reset role;set role authenticated');
  state=(await db.query('select room_snapshot() data')).rows[0].data;
  const actual=state.planned_tasks.map(t=>({snake:t.snake_id,planned:Date.parse(t.planned_at),due:Date.parse(t.due_at),min:t.mouse_min_g,max:t.mouse_max_g,quantity:t.quantity}));
  const order=(a,b)=>a.snake.localeCompare(b.snake)||a.planned-b.planned;
  assert.deepEqual(actual.sort(order),expected.sort(order));assert.ok(actual.some(t=>t.snake==='C'&&t.min===null&&t.quantity===null));assert.ok(actual.every(t=>t.snake!=='B'));
 }finally{await db.close();}
});
