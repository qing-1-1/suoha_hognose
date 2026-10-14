'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/room-model.js');

test('male automatic mouse range caps at 6–8g without changing lighter animals or female rules',()=>{
 const rules=M.defaultConfig().rules;
 for(const weight of [80,120,160,200,500])assert.deepEqual([M.matchMouse(weight,rules,'M').mouseMin,M.matchMouse(weight,rules,'M').mouseMax],[6,8]);
 assert.equal(M.matchMouse(500,rules,'F').mouseMax,24);assert.equal(M.matchMouse(500,rules,'U').mouseMax,24);
 assert.equal(M.matchMouse(10,rules,'M').mouseMax,2);assert.equal(M.matchMouse(null,rules,'M'),null);
});

test('male cap updates unconfirmed old recommendations but preserves actual and locked quantities',()=>{
 const f=fixture();f.snakes[0].sex='M';const stored={id:'old',snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:'2020-10-12T10:00:00Z',due_at:'2020-10-12T10:00:00Z',mouse_min_g:20,mouse_max_g:24,quantity:1};
 f.args[5]={from:'2020-10-12',to:'2020-10-12',plannedTasks:[stored]};
 assert.equal(M.generateTasks(...f.args)[0].mouseMax,8);
 stored.batch_item_id='locked';assert.equal(M.generateTasks(...f.args)[0].mouseMax,24);
 delete stored.batch_item_id;f.args[4]=[{...stored,result:'fed'}];assert.equal(M.generateTasks(...f.args)[0].mouseMax,24);
});

test('incubator default and sparse column stacks have no floating boxes or physical shelf gaps',()=>{
  const c=M.createIncubator({levels:[{count:3},{count:1},{count:3}],purpose:'eggs'}),cfg=M.defaultConfig();cfg.cabinets=[c];
  assert.equal(c.type,'incubator');assert.equal(c.purpose,'eggs');assert.deepEqual([c.width,c.depth,c.height],[1200,600,1800]);assert.deepEqual(M.validateConfig(cfg),[]);
  const layout=M.incubatorLayout(c);assert.equal(layout.columns,3);assert.equal(layout.stackHeight,720);
  assert.deepEqual(layout.boxes.filter(b=>b.column===1).map(b=>[b.row,b.x,b.y,b.height]),[[0,360,0,240],[2,360,240,240]]);
  assert.ok(layout.boxes.every(b=>b.z===0));
});

test('incubator resizing retains stable identities by explicit level ID and normalizes shared box shape',()=>{
  const c=M.createIncubator(),before=structuredClone(c),first=c.levels[0],second=c.levels[1];
  const resized=M.resizeIncubator(c,[{id:second.id,count:2},{id:first.id,count:4}],{boxWidth:280,boxDepth:500,boxHeight:220});
  assert.deepEqual(c,before);assert.deepEqual(resized.levels[0].slots[0],second.slots[0]);assert.deepEqual(resized.levels[1].slots[0],first.slots[0]);
  assert.notEqual(resized.levels[1].slots[3].id,first.slots[0].id);assert.ok(resized.levels.every(l=>l.height===220&&l.boxWidth===280&&l.boxDepth===500));
  const copied=M.cloneCabinet(c);assert.equal(copied.type,'incubator');assert.equal(copied.purpose,'brumation');assert.equal(copied.schedule,null);assert.deepEqual(copied.slotSchedules,{});assert.notEqual(copied.levels[0].slots[0].box_id,first.slots[0].box_id);
});

test('incubator validation rejects unsupported type, purpose, nonuniform boxes, overflow and feeding schedules',()=>{
  const cfg=M.defaultConfig(),c=M.createIncubator();cfg.cabinets=[c];
  c.type='unknown';assert.ok(M.validateConfig(cfg).some(e=>e.includes('类型')));c.type='incubator';c.purpose='unknown';assert.ok(M.validateConfig(cfg).some(e=>e.includes('用途')));c.purpose='eggs';
  c.levels[1].boxWidth=300;assert.ok(M.validateConfig(cfg).some(e=>e.includes('统一盒型')));c.levels[1].boxWidth=360;
  c.height=1100;assert.ok(M.validateConfig(cfg).some(e=>e.includes('超出孵化箱')));c.height=1800;
  c.schedule=fixture().cabinet.schedule;assert.ok(M.validateConfig(cfg).some(e=>e.includes('不支持喂食')));
  c.schedule=null;c.slotSchedules[c.levels[0].slots[0].id]=null;assert.ok(M.validateConfig(cfg).some(e=>e.includes('不支持喂食')));
});

test('brumation suppresses recurrence and excludes frozen pending from feed supplies without deleting actual history',()=>{
  const f=fixture();f.cabinet.type='incubator';f.cabinet.purpose='brumation';
  const s=M.effectiveSchedule(f.config,f.slot.id);assert.equal(s.suspended,true);assert.equal(s.schedule,null);assert.equal(s.rawSchedule.mode,'weekly');
  assert.deepEqual(M.generateTasks(...f.args),[]);
  const frozen={snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:'2026-10-12T10:00:00Z',due_at:'2026-10-12T10:00:00Z',quantity:2,mouse_min_g:7,mouse_max_g:11};
  const tasks=M.generateTasks(f.config,f.assignments,f.snakes,f.measurements,[],{...f.args[5],now:'2026-10-15',plannedTasks:[frozen]});
  assert.equal(tasks[0].status,'suspended');assert.equal(M.summarize(tasks).pendingCount,0);assert.equal(M.summarize(tasks).completedCount,0);assert.equal(M.summarize(tasks).suspendedCount,1);assert.deepEqual(M.summarize(tasks).groups,[]);
  const actual=M.generateTasks(f.config,f.assignments,f.snakes,f.measurements,[{...frozen,id:'actual',result:'fed'}],{...f.args[5],now:'2026-10-15',plannedTasks:[frozen]});assert.equal(actual[0].status,'completed');
});

test('incubator move preview forbids eggs and carry, pauses winter tasks and resumes destination recurrence',()=>{
  const f=fixture(),winter=M.createIncubator({x:2600,purpose:'brumation'});f.config.cabinets.push(winter);
  const snapshot={config:f.config,assignments:f.assignments,records:[],planned_tasks:[]},target=winter.levels[0].slots[0].id,options={from:'2026-10-12',to:'2026-10-18',now:'2026-10-12T00:00:00Z'};
  const request={snakeId:'A',targetSlotId:target,scheduleMode:'inherit'};
  winter.purpose='eggs';assert.ok(M.previewMove(snapshot,request,f.snakes,f.measurements,options).errors.some(e=>e.includes('蛋盒')));winter.purpose='brumation';
  assert.ok(M.previewMove(snapshot,{...request,scheduleMode:'carry'},f.snakes,f.measurements,options).errors.some(e=>e.includes('不能携带')));
  const moved=M.previewMove(snapshot,request,f.snakes,f.measurements,options);assert.deepEqual(moved.errors,[]);assert.equal(moved.afterTasks.length,0);assert.equal(moved.affected[0].afterScheduleInfo.suspended,true);assert.ok(moved.warnings.some(w=>w.includes('暂停喂食')));
  const returned=M.previewMove({...snapshot,assignments:moved.assignments},{snakeId:'A',targetSlotId:f.slot.id},f.snakes,f.measurements,options);assert.deepEqual(returned.errors,[]);assert.equal(returned.afterTasks.length,2);assert.equal(returned.affected[0].afterScheduleInfo.suspended,false);
});

test('entering brumation requires resolving confirmed batch including already offered meals',()=>{
  const f=fixture(),winter=M.createIncubator({x:2600});f.config.cabinets.push(winter);
  const item={snake_id:'A',planned_at:'2026-10-16T10:00:00Z',batch_id:'b',batch_item_id:'i'},snapshot={config:f.config,assignments:f.assignments,records:[],planned_tasks:[item]},request={snakeId:'A',targetSlotId:winter.levels[0].slots[0].id},options={from:'2026-10-12',to:'2026-10-18',now:'2026-10-12'};
  assert.ok(M.previewMove(snapshot,request,f.snakes,f.measurements,options).errors.some(e=>e.includes('备料批次')));
  snapshot.records=[{...item,result:'offered'}];assert.ok(M.previewMove(snapshot,request,f.snakes,f.measurements,options).errors.some(e=>e.includes('备料批次')));
  snapshot.records[0].result='skipped';assert.deepEqual(M.previewMove(snapshot,request,f.snakes,f.measurements,options).errors,[]);
});

test('feeding overview searches beyond current week and respects completed meals and timezone date',()=>{
  const f=fixture();f.cabinet.schedule={mode:'interval',start:'2026-11-02',time:'18:00',interval:30,quantity:1};
  const now='2026-10-18T16:30:00Z',view=M.feedingOverview(f.config,f.assignments,f.snakes,f.measurements,[],{now});
  assert.equal(view.today,'2026-10-19');assert.equal(view.nextTask.date,'2026-11-02');assert.equal(view.nextByCabinet[f.cabinet.id].snakeId,'A');assert.equal(view.nextBySnake.A.date,'2026-11-02');assert.deepEqual(view.todayTasks,[]);assert.deepEqual(view.overdueTasks,[]);
  const record={snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:view.nextTask.plannedAt,result:'fed',mouse_min_g:7,mouse_max_g:11,quantity:1};
  assert.equal(M.feedingOverview(f.config,f.assignments,f.snakes,f.measurements,[record],{now}).nextTask.date,'2026-12-02');
  assert.equal(M.feedingOverview(f.config,f.assignments,f.snakes,f.measurements,[],{now,lookaheadDays:7}).nextTask,null);assert.throws(()=>M.feedingOverview(f.config,f.assignments,f.snakes,[],[],{now,lookaheadDays:367}),/366/);
});

test('feeding overview reports persisted overdue and today unknown counts without reconstructing past recurrence',()=>{
  const f=fixture(),now='2026-10-14T00:00:00Z';f.cabinet.schedule.quantity=null;
  const empty=M.feedingOverview(f.config,f.assignments,f.snakes,[],[],{now});assert.equal(empty.overdueTasks.length,0);assert.equal(empty.unknownTasks.length,1);assert.equal(empty.todaySummary.unknownCount,1);
  const persisted={snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:'2026-10-12T10:00:00Z',due_at:'2026-10-12T10:00:00Z',mouse_min_g:7,mouse_max_g:11,quantity:2};
  const view=M.feedingOverview(f.config,f.assignments,f.snakes,[],[],{now,plannedTasks:[persisted]});assert.equal(view.overdueTasks.length,1);assert.equal(view.overdueTasks[0].quantity,2);
  assert.equal(M.feedingOverview(f.config,f.assignments,f.snakes,[],[{...persisted,result:'fed'}],{now,plannedTasks:[persisted]}).overdueTasks.length,0);
});

test('offered meals remain overdue across dates without snapshots and are not duplicated by frozen plans',()=>{
  const f=fixture(),now='2026-10-14T12:00:00Z',base={snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,mouse_min_g:7,mouse_max_g:11,quantity:2};
  const prior={...base,id:'prior',result:'offered',planned_at:'2026-10-12T10:00:00Z',due_at:'2026-10-12T10:00:00Z',occurred_at:'2026-10-12T10:30:00Z'},today={...base,id:'today',result:'offered',planned_at:'2026-10-14T11:30:00Z',due_at:'2026-10-14T11:30:00Z',occurred_at:'2026-10-14T11:45:00Z'};
  const alone=M.feedingOverview(f.config,f.assignments,f.snakes,f.measurements,[prior,today],{now});
  assert.deepEqual(alone.overdueTasks.map(t=>t.recordId),['prior','today']);assert.ok(alone.overdueTasks.every(t=>t.status==='offered'));
  const planned=[prior,today].map(({result,id,occurred_at,...task})=>task),duplicated=M.feedingOverview(f.config,f.assignments,f.snakes,f.measurements,[prior,today],{now,plannedTasks:planned});
  assert.equal(duplicated.overdueTasks.length,2);assert.equal(new Set(duplicated.overdueTasks.map(t=>t.id)).size,2);
  const done=M.feedingOverview(f.config,f.assignments,f.snakes,f.measurements,[{...prior,result:'fed'},today],{now,plannedTasks:planned});
  assert.deepEqual(done.overdueTasks.map(t=>t.recordId),['today']);assert.equal(done.todaySummary.pendingCount,0);
});

function fixture() {
  const config=M.defaultConfig(),cabinet=M.createCabinet();
  cabinet.schedule={mode:'weekly',weekdays:[1,3],times:{'1':'18:00','3':'19:30'},time:'18:00',start:'2026-10-01',end:null,interval:7,quantity:2,paused:false};
  config.cabinets.push(cabinet);
  const slot=cabinet.levels[0].slots[0];
  const assignments=[{slot_id:slot.id,snake_id:'A'}],snakes=[{id:'A'}],measurements=[{id:'m1',snake_id:'A',weight_g:120,measured_at:'2026-10-10'}];
  const args=[config,assignments,snakes,measurements,[],{from:'2026-10-12',to:'2026-10-18'}];
  return {config,cabinet,slot,assignments,snakes,measurements,args};
}

test('empty room defaults and independent IDs never invent animals or feeding schedules',()=>{
  assert.deepEqual(M.defaultConfig().cabinets,[]);
  assert.deepEqual(M.validateConfig(M.defaultConfig()),[]);
  const a=M.createCabinet(),b=M.createCabinet();
  assert.notEqual(a.id,b.id);assert.equal(a.schedule,null);
  assert.notEqual(a.levels[0].slots[0].id,b.levels[0].slots[0].id);
  const config=M.defaultConfig();config.cabinets=[a];
  assert.deepEqual(M.validateConfig(config),[]);
});

test('all user rule boundaries use raw precision and preserve the 120g jump',()=>{
  const rules=M.defaultConfig().rules;
  for(const [weight,min,max] of [[0.01,1,2],[10,1,2],[10.01,2,3],[23,2,3],[23.01,3,4],[35,3,4],[35.01,4,6],[45,4,6],[45.01,6,8],[60,6,8],[60.01,7,11],[120,7,11],[120.01,16,20],[160,16,20],[160.01,16,20],[200,16,20],[200.01,20,24]]) {
    const rule=M.matchMouse(weight,rules);assert.equal(rule.mouseMin,min,`weight ${weight}`);assert.equal(rule.mouseMax,max);
  }
  for(const weight of [null,undefined,'',0,-1,NaN,Infinity]) assert.equal(M.matchMouse(weight,rules),null);
  assert.equal(M.matchMouse(10,[rules[0],rules[0]]),null,'overlap must not pick an arbitrary result');
});

test('editable rules reject uncovered, overlapping, unordered mouse limits and missing infinity',()=>{
  const cfg=M.defaultConfig();cfg.rules[1].min=11;
  assert.ok(M.validateConfig(cfg).some(e=>e.includes('连续覆盖')));
  cfg.rules[1].min=9;
  assert.ok(M.validateConfig(cfg).some(e=>e.includes('连续覆盖')));
  cfg.rules=M.defaultConfig().rules;cfg.rules.at(-1).max=300;
  assert.ok(M.validateConfig(cfg).some(e=>e.includes('无限')));
  cfg.rules=M.defaultConfig().rules;cfg.rules[0].mouseMin=3;
  assert.ok(M.validateConfig(cfg).some(e=>e.includes('鼠重上下限')));
  cfg.rules=[{id:'custom',min:0,max:null,mouseMin:5,mouseMax:6}];
  assert.deepEqual(M.validateConfig(cfg),[]);
  assert.equal(M.matchMouse(10,cfg.rules).mouseMin,5);
});

test('resizing uneven layers keeps existing slot and box identities without mutating original',()=>{
  const old=M.createCabinet(),first=old.levels[0].slots[0];
  old.slotSchedules[first.id]={paused:true};
  const changed=M.resizeLevels(old,[{...old.levels[0],count:2},{...old.levels[1],count:4,boxWidth:280}]);
  assert.equal(changed.levels.length,2);assert.equal(changed.levels[1].slots.length,4);
  assert.deepEqual(changed.levels[0].slots[0],first);
  assert.equal(changed.levels[1].slots[3].id.startsWith('slot-'),true);
  assert.equal(old.levels.length,5);assert.equal(old.levels[1].slots.length,3);
  assert.deepEqual(changed.slotSchedules[first.id],{paused:true});
  assert.throws(()=>M.resizeLevels(old,[{height:300,count:0}]),/盒数/);
});

test('geometry uses millimeters and center placement with rotated bounds and collision checks',()=>{
  const cfg=M.defaultConfig(),a=M.createCabinet({x:600,z:250});cfg.cabinets=[a];
  assert.deepEqual(M.validateConfig(cfg),[]);
  a.rotation=90;
  assert.ok(M.validateConfig(cfg).some(e=>e.includes('超出房间')));
  a.x=300;a.z=650;
  assert.deepEqual(M.validateConfig(cfg),[]);
  const b=M.createCabinet({x:600,z:650});cfg.cabinets.push(b);
  assert.ok(M.validateConfig(cfg).some(e=>e.includes('重叠')));
  b.x=1600;
  assert.deepEqual(M.validateConfig(cfg),[]);
  b.levels[0].boxWidth=500;
  assert.ok(M.validateConfig(cfg).some(e=>e.includes('盒子尺寸')));
});

test('latest positive actual weight ignores blank and zero and deterministically resolves same-day rows',()=>{
  const rows=[{id:'a',snake_id:'S',weight_g:23,measured_at:'2026-10-01'},{id:'b',snake_id:'S',weight_g:35,measured_at:'2026-10-01'},{id:'c',snake_id:'S',weight_g:0,measured_at:'2026-10-02'},{id:'d',snake_id:'S',weight_g:null,measured_at:'2026-10-03'},{id:'e',snake_id:'S',weight_g:99,measured_at:'bad'},{id:'f',snake_id:'OTHER',weight_g:120,measured_at:'2026-10-12'}];
  assert.deepEqual(M.latestWeight('S',rows),{weight:35,measurementId:'b',measuredAt:'2026-10-01'});
  assert.equal(M.latestWeight('MISSING',rows),null);
});

test('week boundaries follow configured local timezone and cross months correctly',()=>{
  assert.equal(M.localDate('2026-10-11T16:30:00Z','Asia/Shanghai'),'2026-10-12');
  assert.deepEqual(M.weekDates('2026-10-11T16:30:00Z','Asia/Shanghai'),['2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16','2026-10-17','2026-10-18']);
  assert.deepEqual(M.weekDates('2026-11-01'),['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
  assert.equal(M.dayColors.length,new Set(M.dayColors).size);
});

test('local wall times resolve timezone offsets and DST without silently moving invalid times',()=>{
  assert.equal(M.localDateTimeToInstant('2026-10-12','18:00','Asia/Shanghai'),'2026-10-12T10:00:00.000Z');
  assert.equal(M.localDateTimeToInstant('2026-10-12','18:00','Asia/Kathmandu'),'2026-10-12T12:15:00.000Z');
  assert.equal(M.localDateTimeToInstant('2026-03-08','02:30','America/New_York'),null);
  assert.equal(M.localDateTimeToInstant('2026-11-01','01:30','America/New_York'),'2026-11-01T05:30:00.000Z');
  assert.equal(M.localDateTimeToInstant('2026-02-30','18:00'),null);
  assert.equal(M.localDateTimeToInstant('2026-10-12','25:00'),null);
});

test('weekly tasks honor per-day times and count multiple meals for the same snake',()=>{
  const f=fixture(),tasks=M.generateTasks(...f.args);
  assert.deepEqual(tasks.map(t=>[t.date,t.time,t.quantity]),[['2026-10-12','18:00',2],['2026-10-14','19:30',2]]);
  assert.deepEqual(M.summarize(tasks).groups,[{mouseMin:7,mouseMax:11,quantity:4,taskCount:2}]);
  assert.equal(M.summarize(tasks).snakeCount,1);
  assert.equal(M.summarize(tasks,['2026-10-14'],f.cabinet.id).groups[0].quantity,2);
  assert.equal(M.summarize(tasks,[]).groups[0].quantity,4);
  assert.equal(M.summarize(tasks,null,'another').taskCount,0);
  assert.deepEqual(M.generateTasks(...f.args),tasks,'regeneration stable identity');
});

test('interval schedule is anchored to start date, not last feeding outcome',()=>{
  const f=fixture();f.cabinet.schedule={...f.cabinet.schedule,mode:'interval',start:'2026-10-01',interval:3,end:'2026-10-16'};
  assert.deepEqual(M.generateTasks(...f.args).map(t=>t.date),['2026-10-13','2026-10-16']);
  f.cabinet.schedule.end='2026-10-15';assert.deepEqual(M.generateTasks(...f.args).map(t=>t.date),['2026-10-13']);
});

test('slot overrides replace inherited dates; cabinet pause dominates independent slots',()=>{
  const f=fixture();f.cabinet.slotSchedules[f.slot.id]={...f.cabinet.schedule,weekdays:[2],quantity:3};
  assert.deepEqual(M.generateTasks(...f.args).map(t=>[t.date,t.quantity]),[['2026-10-13',3]]);
  f.cabinet.schedule.paused=true;assert.equal(M.generateTasks(...f.args).length,0);
  f.cabinet.schedule.paused=false;f.cabinet.slotSchedules[f.slot.id].paused=true;assert.equal(M.generateTasks(...f.args).length,0);
  delete f.cabinet.slotSchedules[f.slot.id];assert.equal(M.generateTasks(...f.args).length,2);
});

test('assignment timestamps prevent ghost plans before snake occupancy and empty slots produce none',()=>{
  const f=fixture();f.assignments[0].assigned_at='2026-10-13T00:00:00Z';
  assert.deepEqual(M.generateTasks(...f.args).map(t=>t.date),['2026-10-14']);
  f.snakes.length=0;assert.equal(M.generateTasks(...f.args).length,0);
});

test('missing weight or quantity are unknown items rather than invented mice',()=>{
  const f=fixture();f.measurements.length=0;f.cabinet.schedule.quantity=null;
  const tasks=M.generateTasks(...f.args),summary=M.summarize(tasks);
  assert.equal(tasks[0].mouseMin,null);assert.equal(tasks[0].quantity,null);
  assert.ok(tasks[0].warnings.includes('待称重'));assert.ok(tasks[0].warnings.includes('只数待确认'));
  assert.deepEqual(summary.groups,[]);assert.equal(summary.unknownCount,2);assert.equal(summary.pendingCount,2);
});

test('handled occurrences dedupe by snake and instant after moves, preserve stored amounts and never count as pending',()=>{
  for(const result of ['offered','fed','refused','skipped']) {
    const f=fixture();f.args[4].push({id:'r1',snake_id:'A',slot_id:'old-slot',planned_at:'2026-10-12T18:00:00+08:00',result,mouse_min_g:2,mouse_max_g:3,quantity:1,occurred_at:'2026-10-12T10:01:00Z'});
    f.args[4].push({...f.args[4][0],id:'r2',occurred_at:'2026-10-12T10:02:00Z'});
    const tasks=M.generateTasks(...f.args);assert.equal(tasks.length,2);assert.equal(tasks[0].mouseMin,2);assert.equal(tasks[0].recordId,'r2');
    const summary=M.summarize(tasks);assert.equal(summary.pendingCount,1);assert.equal(summary.completedCount,1);assert.equal(summary.groups[0].quantity,2);
  }
});

test('same-snake same-instant duplicate assignments never double inventory needs',()=>{
  const f=fixture();f.assignments.push({snake_id:'A',slot_id:f.cabinet.levels[1].slots[0].id});
  const tasks=M.generateTasks(...f.args);assert.equal(tasks.length,2);
  assert.equal(M.summarize([...tasks,...tasks]).groups[0].quantity,4);
});

test('equal mouse ranges merge while overlapping different ranges stay separate',()=>{
  const f=fixture();for(const [index,id,weight] of [[1,'B',160],[2,'C',200],[3,'D',55]]) {
    f.snakes.push({id});f.measurements.push({id:'m'+id,snake_id:id,weight_g:weight,measured_at:'2026-10-10'});
    f.assignments.push({snake_id:id,slot_id:f.cabinet.levels[Math.floor(index/3)].slots[index%3].id});
  }
  assert.deepEqual(M.summarize(M.generateTasks(...f.args)).groups,[{mouseMin:6,mouseMax:8,quantity:4,taskCount:2},{mouseMin:7,mouseMax:11,quantity:4,taskCount:2},{mouseMin:16,mouseMax:20,quantity:8,taskCount:4}]);
});

test('invalid schedules and excessively large task requests fail explicitly',()=>{
  const f=fixture();f.cabinet.schedule.quantity=0;f.cabinet.schedule.time='25:00';f.cabinet.schedule.weekdays=[1,1];
  const errors=M.validateConfig(f.config);assert.ok(errors.some(e=>e.includes('只数')));assert.ok(errors.some(e=>e.includes('时刻')));assert.ok(errors.some(e=>e.includes('星期')));
  assert.throws(()=>M.generateTasks(...f.args.slice(0,5),{from:'2026-01-01',to:'2028-01-01'}),/日期范围/);
});

test('explicit null single-grid schedule suppresses inherited feeding after a no-plan move',()=>{
  const f=fixture();f.cabinet.slotSchedules[f.slot.id]=null;
  assert.deepEqual(M.generateTasks(...f.args),[]);
});

test('offered records survive slot moves, cabinet pauses and recurrence changes with original identity',()=>{
  const f=fixture();const destination=f.cabinet.levels[1].slots[1];
  f.assignments[0]={snake_id:'A',slot_id:destination.id,assigned_at:'2026-10-15T00:00:00Z'};
  f.cabinet.schedule.paused=true;
  f.args[4].push({id:'fed1',snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:'2026-10-12T10:00:00Z',result:'offered',mouse_min_g:4,mouse_max_g:6,quantity:1});
  const tasks=M.generateTasks(...f.args);
  assert.equal(tasks.length,1);assert.equal(tasks[0].slotId,destination.id);assert.equal(tasks[0].status,'offered');assert.equal(tasks[0].plannedAt,'2026-10-12T10:00:00.000Z');
  assert.equal(M.summarize(tasks).pendingCount,0);
});

test('single occurrence rescheduling crosses week boundaries once with stable plannedAt and effective dueAt',()=>{
  const f=fixture();f.config.taskOverrides=[{snakeId:'A',plannedAt:'2026-10-12T10:00:00.000Z',overrideAt:'2026-10-20T12:00:00.000Z',cancelled:false}];
  assert.deepEqual(M.generateTasks(...f.args).map(t=>t.date),['2026-10-14']);
  f.args[5]={from:'2026-10-19',to:'2026-10-25'};
  const shifted=M.generateTasks(...f.args).find(t=>t.date==='2026-10-20');
  assert.equal(shifted.plannedAt,'2026-10-12T10:00:00.000Z');assert.equal(shifted.dueAt,'2026-10-20T12:00:00.000Z');assert.equal(shifted.time,'20:00');
  f.config.taskOverrides[0].cancelled=true;
  assert.equal(M.generateTasks(...f.args).find(t=>t.date==='2026-10-20').status,'cancelled');
});

test('elapsed frozen plans preserve quantities independently of latest rules or placement timestamp',()=>{
  const f=fixture();f.args[5]={from:'2020-10-12',to:'2020-10-18',plannedTasks:[{id:'p1',snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:'2020-10-12T10:00:00Z',due_at:'2020-10-12T10:00:00Z',mouse_min_g:1,mouse_max_g:2,quantity:3,warnings:[]}]};
  f.assignments[0].assigned_at='2026-10-13T00:00:00Z';
  const tasks=M.generateTasks(...f.args);assert.equal(tasks.length,1);assert.equal(tasks[0].frozen,true);assert.equal(tasks[0].quantity,3);assert.equal(tasks[0].mouseMin,1);
});

test('pending frozen plans honor later overrides and do not retain a former occupied slot after removal',()=>{
  const f=fixture();f.assignments.length=0;
  const stored={id:'p1',snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:'2020-10-12T10:00:00Z',due_at:'2020-10-12T10:00:00Z',mouse_min_g:1,mouse_max_g:2,quantity:3,warnings:[]};
  f.config.taskOverrides=[{snakeId:'A',plannedAt:stored.planned_at,overrideAt:'2026-10-14T10:00:00Z',cancelled:false}];
  f.args[5].plannedTasks=[stored];
  const tasks=M.generateTasks(...f.args);assert.equal(tasks.length,1);assert.equal(tasks[0].date,'2026-10-14');assert.equal(tasks[0].slotId,null);assert.equal(tasks[0].cabinetId,null);
  assert.equal(M.summarize(tasks).pendingCount,1);assert.equal(M.summarize(tasks,null,f.cabinet.id).pendingCount,0);
  f.args[4].push({...stored,result:'offered'});
  // An actual event keeps its stored due_at, so it belongs to its historical week.
  f.args[5]={from:'2020-10-12',to:'2020-10-18'};
  const offered=M.generateTasks(...f.args)[0];assert.equal(offered.status,'offered');assert.equal(offered.slotId,null);
});

function moveFixture(){
  const f=fixture(),target=f.cabinet.levels[0].slots[1];
  f.snakes.push({id:'B',status:'active'});f.snakes[0].status='active';
  f.assignments.push({snake_id:'B',slot_id:target.id,assigned_at:'2026-10-01T00:00:00Z'});
  f.measurements.push({id:'mb',snake_id:'B',weight_g:160,measured_at:'2026-10-10'});
  f.cabinet.slotSchedules[target.id]={...structuredClone(f.cabinet.schedule),weekdays:[2],quantity:3};
  const snapshot={revision:3,config:f.config,assignments:f.assignments,records:[],planned_tasks:[]};
  return {...f,target,snapshot,options:{from:'2026-10-12',to:'2026-10-18',now:'2026-10-11T00:00:00Z'}};
}

test('cabinet and level copies only duplicate geometry with fresh globally distinct structure identities',()=>{
  const f=moveFixture();f.slot.snake_id='must-not-copy';f.slot.note='must-not-copy';f.cabinet.labelTemplate={name:'标签',lines:['{{id}}'],fontSize:14,align:'left'};
  const before=structuredClone(f.cabinet),copy=M.cloneCabinet(f.cabinet,{name:'新柜',x:2500,z:500}),level=M.cloneLevel(f.cabinet.levels[0]);
  assert.deepEqual(f.cabinet,before);assert.equal(copy.name,'新柜');assert.equal(copy.x,2500);assert.equal(copy.width,f.cabinet.width);
  assert.equal(copy.schedule,null);assert.deepEqual(copy.slotSchedules,{});assert.equal(copy.ruleSetId,null);
  assert.deepEqual(copy.labelTemplate,f.cabinet.labelTemplate);assert.notEqual(copy.labelTemplate,f.cabinet.labelTemplate);assert.notEqual(copy.labelTemplate.lines,f.cabinet.labelTemplate.lines);
  const ids=c=>[c.id,...c.levels.flatMap(l=>[l.id,...l.slots.flatMap(s=>[s.id,s.box_id])])];
  assert.equal(new Set([...ids(copy),...ids(f.cabinet)]).size,ids(copy).length+ids(f.cabinet).length);
  assert.equal(copy.levels[0].slots[0].snake_id,undefined);assert.equal(copy.levels[0].slots[0].note,undefined);
  assert.notEqual(level.id,f.cabinet.levels[0].id);assert.equal(level.boxWidth,f.cabinet.levels[0].boxWidth);assert.notEqual(level.slots[0].box_id,f.slot.box_id);
});

test('inherit swap preview shows both animals changing dates and amounts without mutating persisted state',()=>{
  const f=moveFixture(),before=structuredClone(f.snapshot);
  const result=M.previewMove(f.snapshot,{snakeId:'A',sourceSlotId:f.slot.id,targetSlotId:f.target.id,swap:true,scheduleMode:'inherit'},f.snakes,f.measurements,f.options);
  assert.deepEqual(result.errors,[]);assert.deepEqual(f.snapshot,before);assert.deepEqual(result.config,f.config);
  assert.deepEqual(result.affected.map(a=>a.snakeId),['A','B']);
  assert.deepEqual(result.affected[0].afterTasks.map(t=>[t.date,t.quantity]),[['2026-10-13',3]]);
  assert.deepEqual(result.affected[1].afterTasks.map(t=>[t.date,t.quantity]),[['2026-10-12',2],['2026-10-14',2]]);
  assert.equal(result.assignments.find(a=>a.snake_id==='A').assigned_at,new Date(f.options.now).toISOString());
  assert.equal(result.addedTasks.length,3);assert.equal(result.removedTasks.length,3);
  assert.ok(result.warnings.some(w=>w.includes('同时移动 B')));
});

test('carry swap preserves both original plans as independent overrides, including explicit null',()=>{
  const f=moveFixture();
  const result=M.previewMove(f.snapshot,{snakeId:'A',targetSlotId:f.target.id,swap:true,scheduleMode:'carry'},f.snakes,f.measurements,f.options);
  assert.deepEqual(result.config.cabinets[0].slotSchedules[f.target.id],f.cabinet.schedule);
  assert.deepEqual(result.config.cabinets[0].slotSchedules[f.slot.id],f.cabinet.slotSchedules[f.target.id]);
  assert.deepEqual(result.beforeSummary,result.afterSummary);assert.equal(result.addedTasks.length,0);assert.equal(result.removedTasks.length,0);assert.equal(result.changedTasks.length,3);
  f.cabinet.slotSchedules[f.slot.id]=null;
  const blank=M.previewMove(f.snapshot,{snakeId:'A',targetSlotId:f.target.id,swap:true,scheduleMode:'carry'},f.snakes,f.measurements,f.options);
  assert.equal(blank.config.cabinets[0].slotSchedules[f.target.id],null);assert.equal(blank.affected[0].afterTasks.length,0);
});

test('move preview reports occupied target, stale source, absent carry endpoints, and incompatible whole boxes',()=>{
  const f=moveFixture();
  assert.ok(M.previewMove(f.snapshot,{snakeId:'A',targetSlotId:f.target.id},f.snakes,f.measurements,f.options).errors.some(e=>e.includes('目标已有')));
  assert.ok(M.previewMove(f.snapshot,{snakeId:'A',sourceSlotId:'stale',targetSlotId:null},f.snakes,f.measurements,f.options).errors.some(e=>e.includes('来源格位')));
  assert.ok(M.previewMove(f.snapshot,{wholeBox:true,snakeId:'A',sourceSlotId:f.target.id,targetSlotId:f.slot.id,swap:true},f.snakes,f.measurements,f.options).errors.some(e=>e.includes('来源蛇只')));
  assert.ok(M.previewMove(f.snapshot,{snakeId:'A',targetSlotId:null,scheduleMode:'carry'},f.snakes,f.measurements,f.options).errors.some(e=>e.includes('两个实际格位')));
  f.cabinet.levels[1].boxDepth=400;
  assert.ok(M.previewMove(f.snapshot,{wholeBox:true,sourceSlotId:f.slot.id,targetSlotId:f.cabinet.levels[1].slots[0].id},f.snakes,f.measurements,f.options).errors.some(e=>e.includes('长宽高一致')));
});

test('whole-box preview swaps physical box identity and occupants; carry follows SQL swap semantics even for empty destination',()=>{
  const f=moveFixture();f.snapshot.assignments=f.assignments.filter(a=>a.snake_id==='A');
  const result=M.previewMove(f.snapshot,{wholeBox:true,sourceSlotId:f.slot.id,targetSlotId:f.target.id,swap:true,scheduleMode:'carry'},f.snakes,f.measurements,f.options);
  assert.deepEqual(result.errors,[]);
  assert.equal(result.config.cabinets[0].levels[0].slots[0].box_id,f.target.box_id);
  assert.equal(result.config.cabinets[0].levels[0].slots[1].box_id,f.slot.box_id);
  assert.deepEqual(result.config.cabinets[0].slotSchedules[f.slot.id],f.cabinet.slotSchedules[f.target.id]);
  assert.equal(result.assignments[0].slot_id,f.target.id);
});

test('move preview keeps completed actual history at original location while pending work navigates the animal',()=>{
  const f=moveFixture();f.snapshot.records=[{id:'actual',snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:'2026-10-12T10:00:00Z',due_at:'2026-10-12T10:00:00Z',mouse_min_g:7,mouse_max_g:11,quantity:2,result:'fed'}];
  const result=M.previewMove(f.snapshot,{snakeId:'A',targetSlotId:f.target.id,swap:true,scheduleMode:'carry'},f.snakes,f.measurements,f.options);
  assert.deepEqual(result.records,f.snapshot.records);
  assert.equal(result.afterTasks.find(t=>t.recordId==='actual').slotId,f.slot.id);
  assert.equal(result.afterTasks.find(t=>t.snakeId==='A'&&t.status==='pending').slotId,f.target.id);
});

test('future locked batch freezes mouse amounts and due time, flags change and suppresses same-day replacement',()=>{
  const f=fixture(),locked={id:'p',snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:'2026-10-12T10:00:00Z',due_at:'2026-10-12T10:00:00Z',mouse_min_g:7,mouse_max_g:11,quantity:2,batch_id:'batch1',batch_item_id:'item1'};
  f.args[5]={...f.args[5],now:'2026-10-11T00:00:00Z',plannedTasks:[locked]};
  let tasks=M.generateTasks(...f.args);assert.equal(tasks[0].locked,true);assert.equal(tasks[0].needsReview,false);
  f.measurements[0].weight_g=45;f.cabinet.schedule.quantity=9;f.cabinet.schedule.times['1']='20:00';
  f.config.taskOverrides=[{snakeId:'A',plannedAt:locked.planned_at,overrideAt:'2026-10-15T10:00:00Z',cancelled:true}];
  tasks=M.generateTasks(...f.args);const frozen=tasks.find(t=>t.batchId==='batch1');
  assert.equal(tasks.length,2);assert.equal(frozen.date,'2026-10-12');assert.equal(frozen.time,'18:00');assert.equal(frozen.quantity,2);assert.equal(frozen.mouseMin,7);assert.equal(frozen.status,'pending');assert.equal(frozen.needsReview,true);
  assert.ok(frozen.warnings.some(w=>w.includes('同日变更新计划未追加')));assert.equal(locked.warnings,undefined);
});

test('completed locked occurrence never regenerates an automatic second meal after same-day schedule edits',()=>{
  const f=fixture(),stored={id:'p',snake_id:'A',slot_id:f.slot.id,cabinet_id:f.cabinet.id,planned_at:'2026-10-12T10:00:00Z',due_at:'2026-10-12T10:00:00Z',mouse_min_g:7,mouse_max_g:11,quantity:2,batch_id:'batch1',batch_item_id:'item1'};
  f.args[5].plannedTasks=[stored];f.args[4]=[{...stored,id:'actual',result:'fed'}];f.cabinet.schedule.times['1']='20:00';
  const tasks=M.generateTasks(...f.args);assert.equal(tasks.filter(t=>t.date==='2026-10-12').length,1);assert.equal(tasks[0].status,'completed');assert.equal(tasks[0].locked,true);assert.equal(M.summarize(tasks).pendingCount,1);
});
