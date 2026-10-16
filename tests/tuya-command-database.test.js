const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
test('051 reserves commands durably, rejects stale bindings/conflicts and only service role can record outcome',async()=>{
 const db=new PGlite(),actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${actor}');
   create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
   create function can_edit_app() returns boolean language sql as $$select current_setting('test.editor',true)='true'$$;
   create table room_workspace(id integer primary key,revision integer,config jsonb);
   create function room_validate_config(p jsonb) returns void language plpgsql as $$begin end$$;
   grant usage on schema auth to authenticated,service_role;`);
  const sql=n=>fs.readFileSync('supabase/migrations/'+n,'utf8');await db.exec(sql('050_room_environment.sql'));await db.exec(sql('051_room_tuya_cloud.sql'));await db.exec(sql('051_room_tuya_cloud.sql'));
  const config={cabinets:[{levels:[{environment:{temperature:{provider:'tuya_cloud',deviceId:'pad1',channel:'actual',label:'',staleAfterSeconds:300}}}]}]};
  await db.query('select room_validate_config($1)',[config]);await db.query('insert into room_workspace values(1,1,$1)',[config]);
  await db.exec("set role authenticated;set test.editor='true'");const body={requestId:randomUUID(),revision:1,deviceId:'pad1',action:'temperature',value:28};
  const reserve=async b=>(await db.query('select room_environment_begin_command($1,$2) data',[b.requestId,b])).rows[0].data;
  assert.equal((await reserve(body)).execute,true);assert.equal((await reserve(body)).status,'pending');
  await assert.rejects(reserve({...body,value:29}),/request conflict/);
  await assert.rejects(reserve({...body,requestId:randomUUID(),deviceId:'other'}),/device not bound/);
  await assert.rejects(reserve({...body,requestId:randomUUID(),revision:0}),/revision conflict/);
  await assert.rejects(reserve({...body,requestId:randomUUID()}),/device busy/);
  await assert.rejects(db.query('select room_environment_finish_command($1,$2,$3)',[actor,body.requestId,{status:'accepted'}]),/permission denied/);
  await db.exec('set role service_role');await db.query('select room_environment_finish_command($1,$2,$3)',[actor,body.requestId,{status:'unknown'}]);
  await db.exec('set role authenticated');assert.equal((await reserve(body)).status,'unknown');
  await db.exec("set test.editor='false'");await assert.rejects(reserve({...body,requestId:randomUUID()}),/editor required/);
 }finally{await db.close();}
});
