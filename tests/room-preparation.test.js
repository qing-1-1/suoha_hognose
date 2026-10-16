const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const M=require('../js/room-model');

test('batch confirmation recalculates overdue mouse ranges, caps males and preserves locked history atomically',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key,role text,active boolean);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function public.can_edit_app() returns boolean language sql security definer as $$select exists(select 1 from profiles where id=auth.uid() and active and role in ('editor','admin'))$$;
   create table public.snakes(id text primary key,status text,sex text);
   create table public.snake_measurements(id bigint generated always as identity primary key,snake_id text references snakes(id),measured_at date,weight_g numeric,record_kind text default 'measurement',feeding_status text,condition_note text);
   insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');insert into profiles values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);
   insert into snakes values('F','active','F'),('M','active','M'),('U','active','U');grant usage on schema public,auth to anon,authenticated;`);
  for(const name of ['039_room_workspace','040_room_rules_and_batches','048_current_weight_preparation','048_current_weight_preparation'])await db.exec(fs.readFileSync('supabase/migrations/'+name+'.sql','utf8'));
  await db.exec('set role anon');await assert.rejects(db.query('select room_confirm_batch(0,$1,$2,$3)',['x',[],randomUUID()]),/permission denied/);
  await db.exec("reset role;set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';set role authenticated");
  const cfg=M.defaultConfig();cfg.cabinets=[M.createCabinet({id:'rack',levels:[{count:3,height:300,boxWidth:350,boxDepth:460,boxHeight:240}]})];
  let state=(await db.query('select room_save_layout(0,$1,$2) data',[cfg,randomUUID()])).rows[0].data;
  const slots=cfg.cabinets[0].levels[0].slots;
  for(const [i,snake] of ['F','M','U'].entries())state=(await db.query('select room_assign($1,$2,$3,false,$4) data',[state.revision,snake,slots[i].id,randomUUID()])).rows[0].data;
  await db.exec('reset role');
  await db.exec("insert into snake_measurements(snake_id,measured_at,weight_g) values('F','2020-01-01',10),('F','2020-01-02',160),('M','2020-01-02',300),('U','2099-01-01',100)");
  for(const [i,snake] of ['F','M','U'].entries())await db.query("insert into room_plan_snapshots(snake_id,slot_id,cabinet_id,planned_at,due_at,mouse_min_g,mouse_max_g,quantity) values($1,$2,'rack','2020-10-15T10:00Z','2020-10-15T10:00Z',1,2,$3)",[snake,slots[i].id,i+1]);
  await db.exec('set role authenticated');
  const key=id=>({snake_id:id,planned_at:'2020-10-15T10:00:00Z'});
  const batch=(keys,revision=state.revision,request=randomUUID())=>db.query('select room_confirm_batch($1,$2,$3,$4) data',[revision,'当前称重备料',keys,request]);
  await assert.rejects(batch([key('F'),key('U')]),/有效称重/);
  assert.equal((await db.query('select room_snapshot() data')).rows[0].data.batches.length,0);
  const revision=state.revision,request=randomUUID();state=(await batch([key('F'),key('M')],revision,request)).rows[0].data;
  const items=[...state.batches[0].items].sort((a,b)=>a.snake_id.localeCompare(b.snake_id));
  assert.deepEqual(items.map(i=>[i.snake_id,i.mouse_min_g,i.mouse_max_g,i.quantity]),[['F',16,20,1],['M',6,8,2]]);
  assert.equal((await batch([key('F'),key('M')],revision,request)).rows[0].data.revision,state.revision);
  await assert.rejects(batch([key('F')]),/已确认备料/);
  const locked=structuredClone(state.batches);
  await db.exec("reset role;insert into snake_measurements(snake_id,measured_at,weight_g) values('F','2020-01-03',5);set role authenticated");
  assert.deepEqual((await db.query('select room_snapshot() data')).rows[0].data.batches,locked);
  assert.equal(state.planned_tasks.find(t=>t.snake_id==='F').mouse_max_g,20);
 }finally{await db.close();}
});
