const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../js/room-environment'),M=require('../js/room-model');
const binding={provider:'davinci',deviceId:'pad-01',channel:'probe-1',label:'第一层',staleAfterSeconds:300};
test('bindings survive resize; cloning never duplicates physical device bindings',()=>{
 const c=M.createCabinet();c.levels[0].environment={temperature:binding};
 const next=M.resizeLevels(c,c.levels);assert.deepEqual(next.levels[0].environment,c.levels[0].environment);
 assert.equal(M.cloneCabinet(c).levels[0].environment,undefined);
 const cfg=M.defaultConfig();cfg.cabinets=[c];assert.deepEqual(M.validateConfig(cfg),[]);
 c.levels[0].environment.temperature={...binding,token:'secret'};assert.ok(M.validateConfig(cfg).length);
});
test('temperature and humidity distinguish absent, invalid, stale, offline and actual zero readings',()=>{
 const now=Date.parse('2026-10-16T12:00:00Z');const s={...binding,metric:'temperature',value:0,unit:'°C',observedAt:'2026-10-16T11:59:00Z'};
 assert.equal(E.reading(binding,'temperature',s,now).status,'ok');
 assert.equal(E.reading(binding,'temperature',{...s,observedAt:'2026-10-16T11:00:00Z'},now).status,'stale');
 for(const patch of [{value:'0'},{value:null},{deviceId:'wrong'},{unit:'°F'},{observedAt:'2026-10-17T12:00:00Z'}])assert.equal(E.reading(binding,'temperature',{...s,...patch},now).status,'invalid');
 assert.equal(E.reading(binding,'humidity',{...s,metric:'humidity',value:101,unit:'%'},now).status,'invalid');
 assert.equal(E.reading(binding,'temperature',{...s,status:'offline'},now).status,'offline');
 assert.equal(E.reading(null,'temperature').value,null);assert.equal(E.reading(null,'temperature').status,'unbound');
 assert.equal(E.reading(binding,'temperature').status,'not_connected');
});
test('050 persists bindings, guards roles and rejects malformed requests, reruns safely',async()=>{
 const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs');const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create table room_workspace(id integer primary key,config jsonb);
   create function can_edit_app() returns boolean language sql as $$select current_setting('test.editor',true)='true'$$;
   create function room_validate_config(p jsonb) returns void language plpgsql as $$begin if p->>'version'<>'1' then raise exception 'old validator';end if;end$$;`);
  const sql=fs.readFileSync('supabase/migrations/050_room_environment.sql','utf8');await db.exec(sql);await db.exec(sql);
  const cfg=M.defaultConfig();cfg.cabinets=[M.createCabinet()];cfg.cabinets[0].levels[0].environment={temperature:binding};
  await db.query('select room_validate_config($1)',[cfg]);await db.query('insert into room_workspace values(1,$1)',[cfg]);
  await db.exec("set role authenticated;set test.editor='true'");
  assert.deepEqual((await db.query('select room_environment_snapshot() data')).rows[0].data,E.snapshot(cfg));
  await db.exec("set test.editor='false'");await assert.rejects(db.query('select room_environment_snapshot()'),/editor required/);
  await db.exec('set role anon');await assert.rejects(db.query('select room_environment_snapshot()'),/permission denied/);
  await db.exec('reset role');cfg.cabinets[0].levels[0].environment.temperature.channel='';
  await assert.rejects(db.query('select room_validate_config($1)',[cfg]),/温湿度/);
  cfg.version=2;await assert.rejects(db.query('select room_validate_config($1)',[cfg]),/old validator/);
 }finally{await db.close();}
});

test('device catalog imports legacy bindings, links multiple layers and propagates edits/removal',()=>{
 const cfg=M.defaultConfig();cfg.cabinets=[M.createCabinet()];const levels=cfg.cabinets[0].levels;
 levels[0].environment={temperature:{...binding,channel:'probe-1'}};levels[1].environment={temperature:{...binding,channel:'probe-1'}};
 const devices=E.catalog(cfg,['cloud-1','cloud-2','cloud-3']);assert.equal(devices.length,4);assert.equal(devices[1].temperatureChannel,'temp_current');
 E.applyCatalog(cfg,devices);assert.equal(levels[0].environment.temperature.sourceId,devices[0].id);assert.equal(levels[1].environment.temperature.sourceId,devices[0].id);assert.deepEqual(M.validateConfig(cfg),[]);
 const edited=structuredClone(devices);edited[0].channel='bad';assert.throws(()=>E.applyCatalog(cfg,edited),/设备参数/);delete edited[0].channel;
 edited[0].temperatureChannel='temp_current';edited[0].label='共享加热垫';E.applyCatalog(cfg,edited);
 assert.equal(levels[1].environment.temperature.channel,'temp_current');assert.equal(levels[0].environment.temperature.label,'共享加热垫');assert.deepEqual(M.validateConfig(cfg),[]);
 const invalid=structuredClone(cfg);invalid.cabinets[0].levels[0].environment.temperature.sourceId='missing';assert.ok(M.validateConfig(invalid).some(e=>e.includes('不一致')));
 E.applyCatalog(cfg,edited.slice(1));assert.equal(levels[0].environment,undefined);assert.equal(levels[1].environment,undefined);assert.equal(cfg.environmentDevices.length,3);
});
