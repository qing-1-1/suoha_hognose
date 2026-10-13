const {test,expect}=require('@playwright/test');
const M=require('../../js/room-model.js');
test.setTimeout(90000);

const fixedNow='2026-10-15T10:00:00Z';
function initialFixture(){
  const config=M.defaultConfig();config.name='北窗爬房';
  const levels=[{height:300,count:3,boxWidth:360,boxDepth:460,boxHeight:240},{height:400,count:2,boxWidth:550,boxDepth:460,boxHeight:330}];
  const a=M.createCabinet({id:'rack-a',name:'银柜 A',x:700,z:400,height:900,levels});
  const b=M.createCabinet({id:'rack-b',name:'银柜 B',x:2300,z:400,height:900,levels});
  [a,b].forEach((c,ci)=>c.levels.forEach((l,li)=>{l.id=`level-${ci}-${li}`;l.slots.forEach((s,si)=>{s.id=`slot-${ci}-${li}-${si}`;s.box_id=`box-${ci}-${li}-${si}`;});}));
  const schedule={mode:'weekly',weekdays:[1,3,5],times:{'1':'18:00','3':'19:00','5':'18:00'},time:'18:00',start:'2026-10-01',end:null,interval:7,quantity:1,paused:false};
  a.schedule=structuredClone(schedule);b.schedule={...structuredClone(schedule),weekdays:[2,4]};config.cabinets=[a,b];
  const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'1442399241@qq.com'};
  return {user,profiles:[{...user,display_name:'suohama',role:'admin',active:true}],snakes:[['ROOM-A','F','白化',45],['ROOM-B','M','雪花',160],['ROOM-C','U','原色',10]].map(([id,sex,gene_text])=>({id,sex,gene_text,series:'测试系列',status:'active',inventory_library:'stock',birth_date:'2025-01-01'})),snake_measurements:[['ROOM-A',45],['ROOM-B',160],['ROOM-C',10]].map(([snake_id,weight_g],i)=>({id:'weight-'+i,snake_id,weight_g,record_kind:'measurement',measured_at:'2026-10-01'})),specimen_listings:[],specimen_media:[],inventory_transfers:[],calls:[],snapshot:{revision:1,config,assignments:[{slot_id:'slot-0-0-0',snake_id:'ROOM-A',assigned_at:'2026-10-01T00:00:00Z'},{slot_id:'slot-1-0-0',snake_id:'ROOM-B',assigned_at:'2026-10-01T00:00:00Z'}],records:[],moves:[]}};
}
async function boot(page,{missing=false,anonymous=false}={}){
  const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('room browser error:',e.message);});
  await page.clock.setFixedTime(new Date(fixedNow));
  await page.route('**/fonts.googleapis.com/**',r=>r.abort());
  await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
    window.roomFixture=JSON.parse(sessionStorage.getItem('room-test-db')||'null')||${JSON.stringify(initialFixture())};
    const fixture=window.roomFixture,user=fixture.user;
    fixture.snapshot.planned_tasks||=[];fixture.snapshot.batches||=[];fixture.snapshot.incubations||=[];
    fixture.snapshot.breeding_plans||=[{id:'plan-1',year:2026,female_snake_id:'ROOM-A',male_snake_id:'ROOM-B',review_status:'approved'}];
    fixture.snapshot.clutches||=[{id:'clutch-1',plan_id:'plan-1',clutch_code:'C-2026-01',status:'incubating',egg_count:8,remaining_eggs:8,female_snake_id:'ROOM-A',male_snake_id:'ROOM-B'}];
    fixture.snapshot.rule_versions||=[{id:'version-1',version:1,name:'初始鼠重',rules:structuredClone(fixture.snapshot.config.rules)}];
    fixture.snapshot.active_rule_version_id||='version-1';
    const persist=()=>sessionStorage.setItem('room-test-db',JSON.stringify(fixture));
    window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:${anonymous?'null':'{user,access_token:"test"}'}}})},
      from(table){let filters=[],mode='',values,range=null,cached;const q={select(){return this},order(){return this},limit(){return this},range(a,b){range=[a,b];return this},eq(k,v){filters.push([k,v]);return this},insert(v){mode='insert';values=v;return this},update(v){mode='update';values=v;return this},delete(){mode='delete';return this},execute(){if(cached)return cached;const list=fixture[table]||[],match=r=>filters.every(([k,v])=>r[k]===v);let selected=list.filter(match);if(mode==='insert'){selected=[{id:crypto.randomUUID(),created_at:new Date().toISOString(),...values}];(fixture[table]??=[]).push(...selected);}if(mode==='update')selected.forEach(r=>Object.assign(r,values));if(mode==='delete')fixture[table]=list.filter(r=>!match(r));const count=selected.length;if(range)selected=selected.slice(range[0],range[1]+1);return cached={data:structuredClone(selected),count,error:null};},maybeSingle(){const r=this.execute();return Promise.resolve({...r,data:r.data[0]||null});},single(){return this.maybeSingle();},then(resolve,reject){return Promise.resolve(this.execute()).then(resolve,reject)}};return q;},
      async rpc(name,args={}){
        if(name==='inventory_sale_states')return {data:fixture.snakes.map(s=>({snake_id:s.id,sale_state:'normal'})),error:null};
        if(!name.startsWith('room_'))return {data:[],error:null};
        fixture.calls.push({name,args});
        if(${missing})return {data:null,error:{code:'PGRST202',message:'Could not find the function public.room_snapshot in the schema cache'}};
        const snap=fixture.snapshot;
        if(name!=='room_snapshot'&&args.p_revision!==snap.revision)return {data:null,error:{message:'Room revision conflict'}};
        if(name==='room_save_layout')snap.config=structuredClone(args.p_config);
        if(name==='room_assign_batch'){
          const items=args.p_items;
          if(new Set(items.map(x=>x.snake_id)).size!==items.length||new Set(items.map(x=>x.slot_id)).size!==items.length||items.some(x=>snap.assignments.some(a=>a.snake_id===x.snake_id||a.slot_id===x.slot_id)))return {data:null,error:{message:'批量入住位置冲突'}};
          snap.assignments.push(...items.map(x=>({...x,assigned_at:new Date().toISOString()})));
        }
        if(name==='room_save_incubation'){
          const p=args.p_payload,clutch=snap.clutches.find(c=>String(c.id)===String(p.clutch_id)&&String(c.plan_id)===String(p.plan_id));
          const others=snap.incubations.filter(e=>e.slot_id!==p.slot_id&&String(e.clutch_id)===String(p.clutch_id)).reduce((n,e)=>n+e.egg_count,0);
          if(!clutch||p.egg_count+others>clutch.egg_count)return {data:null,error:{message:'窝次关联无效或分配蛋数超出余量'}};
          snap.incubations=snap.incubations.filter(e=>e.slot_id!==p.slot_id);snap.incubations.push({...p,female_snake_id:clutch.female_snake_id,male_snake_id:clutch.male_snake_id,clutch_code:clutch.clutch_code});
          clutch.remaining_eggs=clutch.egg_count-others-p.egg_count;
          (snap.incubation_history||=[]).push({id:crypto.randomUUID(),action:'save',target_slot:p.slot_id,payload:structuredClone(p),occurred_at:new Date().toISOString()});
        }
        if(name==='room_move_incubation'){
          const old=snap.incubations.find(e=>e.slot_id===args.p_source);if(old){old.slot_id=args.p_target;(snap.incubation_history||=[]).push({id:crypto.randomUUID(),action:'move',source_slot:args.p_source,target_slot:args.p_target,payload:structuredClone(old),occurred_at:new Date().toISOString()});}
        }
        if(name==='room_clear_incubation')snap.incubations=snap.incubations.filter(e=>e.slot_id!==args.p_slot);
        if(name==='room_sync_plans'){
          const key=t=>t.snake_id+':'+new Date(t.planned_at).toISOString(),incoming=new Map(args.p_tasks.map(t=>[key(t),t]));
          snap.planned_tasks=snap.planned_tasks.filter(t=>t.batch_id||new Date(t.due_at)<=new Date()||incoming.has(key(t)));
          for(const task of args.p_tasks){const old=snap.planned_tasks.find(t=>key(t)===key(task));if(old&&(old.batch_id||new Date(old.due_at)<=new Date()))continue;if(snap.records.some(t=>key(t)===key(task)))continue;if(old)Object.assign(old,structuredClone(task));else snap.planned_tasks.push({id:crypto.randomUUID(),...structuredClone(task)});}
        }
        if(name==='room_save_rule_version'){
          const version={id:crypto.randomUUID(),version:snap.rule_versions.length+1,name:args.p_name,rules:structuredClone(args.p_rules)};snap.rule_versions.push(version);
          if(args.p_activate){snap.config.rules=structuredClone(version.rules);snap.active_rule_version_id=version.id;}
        }
        if(name==='room_activate_rule_version'){const version=snap.rule_versions.find(v=>v.id===args.p_version);snap.config.rules=structuredClone(version.rules);snap.active_rule_version_id=version.id;}
        if(name==='room_confirm_batch'){
          const batch={id:crypto.randomUUID(),name:args.p_name,confirmed_at:new Date().toISOString(),room_revision:snap.revision,rule_version_id:snap.active_rule_version_id,items:[]};
          for(const key of args.p_items){const task=snap.planned_tasks.find(t=>t.snake_id===key.snake_id&&new Date(t.planned_at).getTime()===new Date(key.planned_at).getTime());if(!task||task.batch_id)return {data:null,error:{message:'Task already confirmed or unavailable'}};const item={...structuredClone(task),id:crypto.randomUUID(),batch_id:batch.id,record:null};task.batch_id=batch.id;task.batch_item_id=item.id;batch.items.push(item);}
          snap.batches.push(batch);
        }
        if(name==='room_assign'){
          const current=snap.assignments.find(a=>a.snake_id===args.p_snake),target=snap.assignments.find(a=>a.slot_id===args.p_target_slot);
          if(target&&target.snake_id!==args.p_snake&&!args.p_swap)return {data:null,error:{message:'Target occupied'}};
          if(args.p_schedule_mode==='carry'){
            const locate=id=>snap.config.cabinets.find(c=>c.levels.some(l=>l.slots.some(s=>s.id===id))),sourceCab=locate(current?.slot_id),targetCab=locate(args.p_target_slot);
            const sourceSchedule=structuredClone(Object.hasOwn(sourceCab.slotSchedules,current.slot_id)?sourceCab.slotSchedules[current.slot_id]:sourceCab.schedule),targetSchedule=structuredClone(Object.hasOwn(targetCab.slotSchedules,args.p_target_slot)?targetCab.slotSchedules[args.p_target_slot]:targetCab.schedule);
            targetCab.slotSchedules[args.p_target_slot]=sourceSchedule;if(target&&target!==current)sourceCab.slotSchedules[current.slot_id]=targetSchedule;
          }
          if(target&&target!==current){target.slot_id=current?.slot_id||null;target.assigned_at=new Date().toISOString();}
          snap.assignments=snap.assignments.filter(a=>a.snake_id!==args.p_snake&&a.slot_id);
          if(args.p_target_slot)snap.assignments.push({snake_id:args.p_snake,slot_id:args.p_target_slot,assigned_at:new Date().toISOString()});
        }
        if(name==='room_record_feeding'){
          const payload=args.p_payload,old=snap.records.find(r=>r.snake_id===payload.snake_id&&r.planned_at===payload.planned_at);
          if(old)Object.assign(old,payload);else snap.records.push({id:crypto.randomUUID(),...payload});
          for(const batch of snap.batches)for(const item of batch.items)if(item.snake_id===payload.snake_id&&new Date(item.planned_at).getTime()===new Date(payload.planned_at).getTime())item.record=structuredClone(payload);
        }
        if(name!=='room_snapshot')snap.revision++;
        persist();return {data:structuredClone(snap),error:null};
      },storage:{from(){return {createSignedUrl:async()=>({data:{signedUrl:''}})}}}
    })};` }));
  await page.goto('/admin#room');
  if(!anonymous){await expect(page.locator('#authGate')).toBeHidden();await expect(page.locator('#workspaceRoom')).toBeVisible();}
  if(!anonymous&&!missing)await expect(page.locator('.rw-header h1')).toHaveText('北窗爬房');
  return errors;
}
const room=p=>p.locator('#workspaceRoom');
const modal=p=>p.locator('#roomDialog');

test('daily next feeding survives week navigation and searchable slot detail switches without a modal backdrop',async({page})=>{
  const errors=await boot(page),header=room(page).locator('.rw-feed-overview');
  const next=await header.locator('span').nth(1).textContent();
  await room(page).getByRole('button',{name:'下一周',exact:true}).click();
  await expect(header.locator('span').nth(1)).toHaveText(next);
  await room(page).getByLabel('搜索蛇只或柜名').fill('ROOM-A');
  await room(page).getByRole('button',{name:'定位',exact:true}).click();
  await expect(modal(page)).toHaveAttribute('aria-modal','false');
  await expect(modal(page)).toContainText('白化');
  await modal(page).getByRole('button',{name:'下一盒',exact:true}).click();
  await expect(modal(page)).toHaveAttribute('aria-modal','false');
  await modal(page).getByLabel('搜索可入住蛇只').fill('原色');
  await expect(modal(page).locator('[name=snake] option')).toHaveCount(2);
  await expect(modal(page).locator('[name=snake]')).toContainText('10g');
  await modal(page).getByLabel('选择蛇只',{exact:true}).selectOption('ROOM-C');
  await modal(page).getByRole('button',{name:'放入蛇只',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.assignments.find(a=>a.snake_id==='ROOM-C').slot_id)).toBe('slot-0-0-1');
  expect(errors).toEqual([]);
});

test('phase one daily work supports searchable batch occupancy, live schedule preview and continuous feeding',async({page})=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'未入住蛇',exact:true}).click();
  await modal(page).getByRole('button',{name:'批量入住',exact:true}).click();
  await modal(page).getByLabel('搜索批量入住蛇只').fill('原色');
  await modal(page).locator('[name=pick][value="ROOM-C"]').check();
  await modal(page).getByLabel('目标盒子 · ROOM-C',{exact:true}).selectOption('slot-0-0-1');
  await expect(modal(page).locator('[data-assignment-preview]')).toContainText('ROOM-C → 银柜 A');
  await modal(page).getByRole('button',{name:'确认批量入住',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'喂食计划',exact:true}).click();
  await expect(modal(page).getByLabel('间隔天数',{exact:true})).toBeHidden();
  await modal(page).getByLabel('重复方式',{exact:true}).selectOption('interval');
  await expect(modal(page).getByLabel('间隔天数',{exact:true})).toBeVisible();
  await expect(modal(page).locator('.rw-week-fields')).toBeHidden();
  await modal(page).getByLabel('起始日期',{exact:true}).fill('2026-10-15');
  await modal(page).getByLabel('间隔天数',{exact:true}).fill('7');
  await modal(page).getByLabel('每次老鼠只数（待确认可留空）').fill('1');
  await expect(modal(page).locator('[data-schedule-preview]')).toContainText('ROOM-C');
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'待喂／确认 3',exact:true}).click();
  await expect(modal(page)).toContainText('ROOM-C');
  await modal(page).getByRole('button',{name:'记录结果',exact:true}).first().click();
  await modal(page).getByLabel('结果',{exact:true}).selectOption('offered');
  await modal(page).getByLabel('本次只数',{exact:true}).fill('2');
  await modal(page).getByLabel('备注／人工覆盖原因',{exact:true}).fill('本次按实际投喂登记');
  await modal(page).getByRole('button',{name:'保存并下一格',exact:true}).click();
  await expect(modal(page).locator('.rw-tour-progress')).toContainText('2 / 3');
  await modal(page).getByRole('button',{name:'上一条',exact:true}).click();
  await expect(modal(page).getByLabel('结果',{exact:true})).toHaveValue('offered');
  await expect(modal(page).getByLabel('本次只数',{exact:true})).toHaveValue('2');
  await modal(page).getByLabel('结果',{exact:true}).selectOption('fed');
  await modal(page).getByRole('button',{name:'保存并下一格',exact:true}).click();
  await modal(page).getByRole('button',{name:'保存并下一格',exact:true}).click();
  await modal(page).getByRole('button',{name:'保存并下一格',exact:true}).click();
  await expect(modal(page).getByRole('heading',{name:'本轮巡柜完成'})).toBeVisible();
  expect(await page.evaluate(()=>roomFixture.snapshot.records.length)).toBe(3);
  await modal(page).getByRole('button',{name:'关闭',exact:true}).first().click();
  await expect(room(page).getByRole('button',{name:'待喂／确认 0',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('incubator build, winter occupancy and plan-linked eggs persist through box transfer',async({page},info)=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'搭建房间',exact:true}).click();
  await room(page).getByRole('button',{name:'添加孵化箱',exact:true}).click();
  await modal(page).getByLabel('箱名',{exact:true}).fill('冬化一号');
  await modal(page).getByLabel('层数',{exact:true}).fill('2');
  await modal(page).getByLabel('第 1 层盒数（从下往上）',{exact:true}).fill('2');
  await modal(page).getByLabel('第 2 层盒数（从下往上）',{exact:true}).fill('1');
  await modal(page).getByRole('button',{name:'保存到布局草稿',exact:true}).click();
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();
  await expect(room(page).locator('[data-rw-status]')).toHaveText('已同步');
  const winter=await page.evaluate(()=>roomFixture.snapshot.config.cabinets.find(c=>c.name==='冬化一号'));
  await room(page).getByRole('button',{name:'未入住蛇',exact:true}).click();
  await modal(page).getByRole('button',{name:'选择盒子',exact:true}).click();
  await modal(page).getByLabel('目标格位',{exact:true}).selectOption(winter.levels[0].slots[0].id);
  await expect(modal(page).locator('[data-move-preview]')).toContainText('冬化');
  await modal(page).getByRole('button',{name:'保存位置',exact:true}).click();
  await room(page).locator(`[data-summary-cabinet="${winter.id}"]`).getByRole('button',{name:'展开 ↗',exact:true}).click();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await expect(room(page).getByRole('button',{name:'喂食计划',exact:true})).toHaveCount(0);
  await expect(room(page).locator('.rw-incubator-shell').first()).toBeVisible();
  await room(page).locator(`.rw-slot-hit[data-slot="${winter.levels[0].slots[0].id}"]`).click();
  await expect(modal(page)).toHaveAttribute('aria-modal','false');
  await expect(modal(page)).toContainText('冬化期间暂停常规喂食');
  await modal(page).getByRole('button',{name:'关闭',exact:true}).first().click();
  await room(page).getByRole('button',{name:'← 房间总览',exact:true}).click();
  await room(page).getByRole('button',{name:'搭建房间',exact:true}).click();
  await room(page).getByRole('button',{name:'添加孵化箱',exact:true}).click();
  await modal(page).getByLabel('箱名',{exact:true}).fill('孵蛋一号');
  await modal(page).getByLabel('用途',{exact:true}).selectOption('eggs');
  await modal(page).getByLabel('层数',{exact:true}).fill('2');
  await modal(page).getByRole('button',{name:'保存到布局草稿',exact:true}).click();
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();
  await expect(room(page).locator('[data-rw-status]')).toHaveText('已同步');
  const egg=await page.evaluate(()=>roomFixture.snapshot.config.cabinets.find(c=>c.name==='孵蛋一号'));
  await room(page).locator(`[data-summary-cabinet="${egg.id}"]`).getByRole('button',{name:'展开 ↗',exact:true}).click();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const source=egg.levels[0].slots[0].id,target=egg.levels[0].slots[1].id;
  await room(page).locator(`.rw-slot-hit[data-slot="${source}"]`).click();
  await expect(modal(page)).toHaveAttribute('aria-modal','false');
  await modal(page).getByLabel('繁育计划',{exact:true}).selectOption('plan-1');
  await expect(modal(page).locator('[data-egg-parents]')).toContainText('ROOM-A');
  await expect(modal(page).locator('[data-egg-parents]')).toContainText('ROOM-B');
  await modal(page).getByLabel('对应窝次',{exact:true}).selectOption('clutch-1');
  await modal(page).getByLabel('本盒蛋数',{exact:true}).fill('5');
  await modal(page).getByRole('button',{name:'放入蛇蛋',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  await room(page).locator(`.rw-slot-hit[data-slot="${source}"]`).click();
  await expect(modal(page).getByLabel('繁育计划',{exact:true})).toBeDisabled();
  await modal(page).getByRole('button',{name:'转移孵化盒',exact:true}).click();
  await modal(page).getByLabel('目标孵化盒',{exact:true}).selectOption(target);
  await modal(page).getByRole('button',{name:'确认转移',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.incubations[0].slot_id)).toBe(target);
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:`artifacts/room-incubator-workflow-${info.project.name}.png`,fullPage:true});
  await room(page).locator('.rw-scene-host').evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  await page.screenshot({path:`artifacts/room-incubator-viewport-${info.project.name}.png`});
  await room(page).getByRole('button',{name:'历史记录',exact:true}).click();
  await modal(page).getByLabel('记录类型',{exact:true}).selectOption('incubation');
  await expect(modal(page)).toContainText('孵蛋分配');
  await expect(modal(page)).toContainText('孵化盒转移');
  await expect(modal(page).locator('.rw-history-card')).toHaveCount(2);
  await modal(page).getByRole('button',{name:'关闭',exact:true}).first().click();
  await page.reload();
  expect(await page.evaluate(()=>roomFixture.snapshot.incubations[0].egg_count)).toBe(5);
  expect(await page.evaluate(()=>roomFixture.snapshot.assignments.find(a=>a.snake_id==='ROOM-C').slot_id)).toBe(winter.levels[0].slots[0].id);
  expect(errors).toEqual([]);
});

test('room defaults to perspective and dense cabinets open with two lines at 10px minimum',async({page})=>{
  const errors=await boot(page);
  await expect(room(page).locator('.rw-scene-host')).toHaveAttribute('data-view','perspective');
  await page.evaluate(()=>{
    const c=roomFixture.snapshot.config.cabinets[0],base=structuredClone(c.levels[0]);c.height=1700;
    c.levels=Array.from({length:8},(_,i)=>({...structuredClone(base),id:'dense-level-'+i,height:200,boxHeight:150,slots:base.slots.map((s,j)=>i===0?s:{id:`dense-${i}-${j}`,box_id:`dense-box-${i}-${j}`})}));
    sessionStorage.setItem('room-test-db',JSON.stringify(roomFixture));
  });
  await page.reload();
  await room(page).getByRole('button',{name:'标签',exact:true}).click();
  await expect(modal(page).getByLabel('字号 px')).toHaveAttribute('min','10');
  await modal(page).getByLabel('字号 px').fill('10');
  await modal(page).getByRole('button',{name:'保存标签模板',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  await page.reload();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.labelTemplate.fontSize)).toBe(10);
  await room(page).locator('[data-summary-cabinet="rack-a"]').getByRole('button',{name:'展开 ↗',exact:true}).click();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const slot=room(page).locator('.rw-model-slot').filter({has:page.locator('[data-slot="slot-0-0-0"]')});
  await expect(slot.locator('.rw-label-line')).toHaveCount(2);
  expect(await slot.locator('.rw-label-line').first().evaluate(el=>parseFloat(el.getAttribute('font-size'))*el.getScreenCTM().a)).toBeGreaterThanOrEqual(9.99);
  await room(page).getByRole('button',{name:'← 房间总览',exact:true}).click();
  await expect(room(page).locator('.rw-scene-host')).toHaveAttribute('data-view','perspective');
  await room(page).getByRole('button',{name:'俯视',exact:true}).click();
  await expect(room(page).locator('.rw-scene-host')).toHaveAttribute('data-view','plan');
  expect(errors).toEqual([]);
});

test('cabinet box ID sits above two information lines without overlapping day labels',async({page},info)=>{
  const errors=await boot(page);
  await room(page).locator('[data-summary-cabinet="rack-a"]').getByRole('button',{name:'展开 ↗',exact:true}).click();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const slot=room(page).locator('.rw-model-slot').filter({has:page.locator('[data-slot="slot-0-0-0"]')});
  await expect(slot.locator('.rw-box-id')).toHaveText('ROOM-A');
  await expect(slot.locator('.rw-label-line')).toHaveCount(2);
  await expect(slot.locator('.rw-label-line').first()).toContainText('♀');
  await expect(slot.locator('.rw-label-line').last()).toContainText('4–6g');
  expect(await slot.evaluate(el=>{
    const id=el.querySelector('.rw-box-id').getBBox(),body=[...el.querySelectorAll('.rw-label-line')].map(n=>n.getBBox()),face=el.querySelector('.rw-box-face').getBBox(),day=el.querySelector('.rw-box-days')?.getBBox();
    return {headerInside:id.y>=face.y,headerAboveBody:id.y+id.height<body[0].y,rowsSeparate:body[0].y+body[0].height<=body[1].y,bodyInside:body[1].y+body[1].height<=face.y+face.height,daysSeparate:!day||id.x+id.width<=day.x};
  })).toEqual({headerInside:true,headerAboveBody:true,rowsSeparate:true,bodyInside:true,daysSeparate:true});
  await page.screenshot({path:`artifacts/room-box-labels-${info.project.name}.png`,fullPage:true});
  await slot.locator('.rw-slot-hit').click();
  await expect(modal(page)).toContainText('ROOM-A');
  await expect(modal(page)).toContainText('白化');
  expect(errors).toEqual([]);
});

test('history dialog loads all dates, filters, paginates and preserves layout drafts',async({page})=>{
  const errors=await boot(page);
  await page.evaluate(()=>{
    roomFixture.snapshot.moves=Array.from({length:23},(_,i)=>({id:'move-'+i,snake_id:'ROOM-A',source_slot:null,target_slot:'slot-0-0-0',occurred_at:`2026-09-${String(i+1).padStart(2,'0')}T10:00:00Z`}));
    roomFixture.snapshot.records=[{id:'feed-history',snake_id:'ROOM-B',cabinet_id:'rack-b',slot_id:'slot-1-0-0',result:'fed',mouse_min_g:16,mouse_max_g:20,quantity:2,occurred_at:'2026-10-01T16:30:00Z',planned_at:'2026-10-01T10:00:00Z',notes:'历史备注 <安全文本>'},{id:'removed-history',snake_id:'ROOM-X',cabinet_id:'removed-cab',slot_id:'removed-slot',result:'refused',occurred_at:'2025-01-01T00:00:00Z'}];
  });
  const history=room(page).getByRole('button',{name:'历史记录',exact:true});
  await expect(room(page).locator('[data-rw=unassigned] + [data-rw=history]')).toHaveCount(1);
  await expect(room(page).locator('[data-rw-caption] button')).toHaveCount(0);
  await history.click();
  await expect(modal(page).locator('[data-history-status]')).toContainText('共 25 条记录');
  await expect(modal(page).locator('.rw-history-card')).toHaveCount(20);
  await modal(page).getByRole('button',{name:'下一页',exact:true}).click();
  await expect(modal(page).locator('.rw-history-card')).toHaveCount(5);
  await expect(modal(page)).toContainText('已移除格位（removed-slot）');
  await modal(page).getByLabel('记录类型',{exact:true}).selectOption('feeding');
  await expect(modal(page).locator('.rw-history-card')).toHaveCount(2);
  await modal(page).getByLabel('爬柜',{exact:true}).selectOption('rack-b');
  await expect(modal(page).locator('.rw-history-card')).toHaveCount(1);
  await expect(modal(page)).toContainText('16–20 g · 数量 2 只');
  await modal(page).getByText('查看详情',{exact:true}).click();
  await expect(modal(page)).toContainText('历史备注 <安全文本>');
  await modal(page).getByLabel('开始日期',{exact:true}).fill('2026-10-02');
  await modal(page).getByLabel('结束日期',{exact:true}).fill('2026-10-02');
  await expect(modal(page).locator('.rw-history-card')).toHaveCount(1);
  await modal(page).getByLabel('开始日期',{exact:true}).fill('2026-10-03');
  await expect(modal(page).locator('[data-history-status]')).toContainText('开始日期不能晚于结束日期');
  await modal(page).getByRole('button',{name:'重置筛选'}).click();
  await modal(page).getByLabel('搜索蛇编号／位置／备注').fill('ROOM-X');
  await expect(modal(page).locator('.rw-history-card')).toHaveCount(1);
  await modal(page).getByLabel('喂食结果',{exact:true}).selectOption('fed');
  await expect(modal(page)).toContainText('没有符合条件的历史记录');
  await modal(page).getByRole('button',{name:'重置筛选'}).click();
  await modal(page).getByLabel('时间排序').selectOption('asc');
  await expect(modal(page).locator('.rw-history-card').first()).toContainText('ROOM-X');
  await modal(page).getByRole('button',{name:'关闭',exact:true}).first().click();
  await expect(history).toBeFocused();
  await room(page).getByRole('button',{name:'旋转 银柜 A 90°',exact:true}).click();
  const before=await page.evaluate(()=>roomFixture.snapshot.revision);
  await history.click();
  await expect(modal(page).locator('[data-history-status]')).toContainText('共 25 条记录');
  await modal(page).getByRole('button',{name:'刷新记录'}).click();
  await expect(modal(page).getByRole('button',{name:'刷新记录'})).toBeEnabled();
  expect(await page.evaluate(()=>roomFixture.snapshot.revision)).toBe(before);
  expect(await modal(page).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await modal(page).getByRole('button',{name:'关闭',exact:true}).first().click();
  await expect(room(page).getByRole('button',{name:'应用布局',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('business settings and snake occupancy save independently while an unapplied layout remains intact',async({page})=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'旋转 银柜 A 90°',exact:true}).click();
  await room(page).getByRole('button',{name:'鼠重规则',exact:true}).click();
  await modal(page).getByLabel('鼠重上限',{exact:true}).first().fill('2.5');
  await modal(page).getByRole('button',{name:'验证并启用规则',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.rules[0].mouseMax)).toBe(2.5);
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].rotation)).toBe(0);
  await room(page).getByRole('button',{name:'喂食计划',exact:true}).click();
  await modal(page).locator('[name=weekdays][value="5"]').check();
  await modal(page).getByLabel('每次老鼠只数（待确认可留空）').fill('2');
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets.map(c=>c.schedule.quantity))).toEqual([2,2]);
  await room(page).getByRole('button',{name:'未入住蛇',exact:true}).click();
  await expect(modal(page).getByRole('heading',{name:'未入住蛇',exact:true})).toBeVisible();
  await modal(page).getByRole('button',{name:'选择盒子',exact:true}).click();
  await modal(page).getByLabel('目标格位').selectOption('slot-0-0-1');
  await modal(page).getByRole('button',{name:'保存位置',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'备料批次',exact:true}).click();
  await modal(page).getByRole('button',{name:'确认当前范围备料',exact:true}).click();
  await modal(page).getByRole('button',{name:'锁定并确认备料',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.batches.length)).toBe(1);
  await room(page).getByRole('button',{name:'撤销',exact:true}).click();
  await room(page).getByRole('button',{name:'重做',exact:true}).click();
  await page.reload();
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toContainText('朝向 90°');
  await expect(room(page).locator('[data-mini-slot="slot-0-0-1"]')).toHaveText('ROOM-C');
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].rotation)).toBe(0);
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();
  await expect(room(page).locator('[data-rw-status]')).toHaveText('已同步');
  const config=await page.evaluate(()=>roomFixture.snapshot.config);
  expect(config.cabinets[0].rotation).toBe(90);expect(config.rules[0].mouseMax).toBe(2.5);
  expect(config.cabinets.map(c=>c.schedule.quantity)).toEqual([2,2]);
  expect(errors).toEqual([]);
});

test('new cabinet feeding schedules can be drafted before its slots are saved',async({page})=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'搭建房间',exact:true}).click();
  await room(page).getByRole('button',{name:'添加爬柜',exact:true}).click();
  await modal(page).getByLabel('柜名',{exact:true}).fill('草稿新柜');
  await modal(page).getByRole('button',{name:'保存到布局草稿',exact:true}).click();
  const card=room(page).locator('[data-summary-cabinet]').filter({has:page.getByRole('heading',{name:'草稿新柜',exact:true})});
  await card.getByRole('button',{name:'展开 ↗',exact:true}).click();
  await room(page).getByRole('button',{name:'喂食计划',exact:true}).click();
  await modal(page).locator('[name=weekdays][value="5"]').check();
  await modal(page).getByLabel('每次老鼠只数（待确认可留空）').fill('3');
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets.length)).toBe(2);
  await room(page).locator('.rw-scene-world [data-slot]').first().click();
  await expect(modal(page).getByRole('heading',{name:'先应用布局，再操作格位'})).toBeVisible();
  await modal(page).getByRole('button',{name:'应用布局并继续',exact:true}).click();
  await expect(modal(page).getByLabel('选择蛇只')).toBeVisible();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets.find(c=>c.name==='草稿新柜').schedule.quantity)).toBe(3);
  expect(errors).toEqual([]);
});

test('perspective automatically shows grids facing the viewer for opposite cabinet directions',async({page},info)=>{
  const errors=await boot(page);
  await page.evaluate(()=>{roomFixture.snapshot.config.cabinets[1].rotation=180;sessionStorage.setItem('room-test-db',JSON.stringify(roomFixture));});
  await page.reload();
  await room(page).getByRole('button',{name:'立体',exact:true}).click();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const scene=room(page).locator('.rw-scene-host'),svg=scene.locator(':scope > .rw-scene');
  await expect(scene.locator('[data-cabinet="rack-a"] .rw-cabinet-grid')).toHaveAttribute('data-display-side','1');
  await expect(scene.locator('[data-cabinet="rack-b"] .rw-cabinet-grid')).toHaveAttribute('data-display-side','-1');
  for(let i=0;i<3;i++){
    for(const id of ['rack-a','rack-b']){
      const rack=scene.locator(`[data-cabinet="${id}"]`);
      await expect(rack.locator('.rw-box-face')).toHaveCount(5);
      await expect(rack.locator('.rw-cabinet-back')).toHaveAttribute('fill-opacity','1');
      expect(await rack.evaluate(el=>{
        const back=el.querySelector('.rw-cabinet-back'),grid=el.querySelector('.rw-cabinet-grid');
        return !!(back.compareDocumentPosition(grid)&Node.DOCUMENT_POSITION_FOLLOWING)&&getComputedStyle(back).fill!=='none'&&back.getBBox().height>0;
      })).toBe(true);
    }
    await svg.scrollIntoViewIfNeeded();const box=await svg.boundingBox(),x=box.x+box.width-30,y=box.y+25;
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-180,y,{steps:12});await page.mouse.up();
  }
  await expect(scene.locator('[data-cabinet="rack-a"] .rw-cabinet-grid')).toHaveAttribute('data-display-side','-1');
  await expect(scene.locator('[data-cabinet="rack-b"] .rw-cabinet-grid')).toHaveAttribute('data-display-side','1');
  for(const id of ['rack-a','rack-b'])await expect(scene.locator(`[data-cabinet="${id}"] .rw-box-face`)).toHaveCount(5);
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets.map(c=>c.rotation))).toEqual([0,180]);
  await expect(room(page).getByRole('button',{name:'应用布局',exact:true})).toHaveCount(0);
  await page.screenshot({path:`artifacts/room-outward-grids-${info.project.name}.png`,fullPage:true});
  await room(page).locator('[data-summary-cabinet="rack-a"]').getByRole('button',{name:'展开 ↗',exact:true}).click();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await expect(svg.locator('.rw-cabinet-back')).toHaveAttribute('fill-opacity','1');
  await expect(scene.locator('.rw-slot-hit')).toHaveCount(5);
  await page.screenshot({path:`artifacts/room-opaque-back-${info.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});

test('perspective drag orbits the room without changing layout and retains angle across cabinet navigation',async({page},info)=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'立体',exact:true}).click();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const scene=room(page).locator('.rw-scene-host'),svg=scene.locator(':scope > .rw-scene');
  await svg.scrollIntoViewIfNeeded();
  const before=await page.evaluate(()=>structuredClone(roomFixture.snapshot.config));
  const yaw=Number(await scene.getAttribute('data-orbit-yaw')),pitch=Number(await scene.getAttribute('data-orbit-pitch'));
  const box=await svg.boundingBox(),start={x:box.x+box.width*.75,y:box.y+30},end={x:start.x-130,y:start.y+50};
  if(info.project.name==='mobile'){
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});
    for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start.x+(end.x-start.x)*i/10,y:start.y+(end.y-start.y)*i/10}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:10});await page.mouse.up();}
  const rotated=Number(await scene.getAttribute('data-orbit-yaw'));
  expect(rotated).not.toBe(yaw);expect(Number(await scene.getAttribute('data-orbit-pitch'))).toBeGreaterThan(pitch);
  expect(await page.evaluate(()=>roomFixture.snapshot.config)).toEqual(before);
  await expect(room(page).getByRole('button',{name:'应用布局',exact:true})).toHaveCount(0);
  await expect(scene.locator('.rw-room-ceiling,.rw-ceiling-light,.rw-room-ac')).toHaveCount(0);
  await openRack(page);await room(page).getByRole('button',{name:'← 房间总览',exact:true}).click();
  await expect(scene).toHaveAttribute('data-view','perspective');
  expect(Number(await scene.getAttribute('data-orbit-yaw'))).toBe(rotated);
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await page.screenshot({path:`artifacts/room-orbit-${info.project.name}.png`,fullPage:true});
  await room(page).getByRole('button',{name:'适应',exact:true}).click();
  expect(Number(await scene.getAttribute('data-orbit-yaw'))).toBe(yaw);
  expect(Number(await scene.getAttribute('data-orbit-pitch'))).toBe(pitch);
  expect(errors).toEqual([]);
});

test('only empty cabinets can be deleted, with undo and durable removal from overview or detail',async({page})=>{
  const errors=await boot(page);
  const overviewDelete=()=>room(page).locator('[data-summary-cabinet="rack-a"] [data-rw="delete-cabinet"]');
  await expect(overviewDelete()).toBeDisabled();
  await expect(overviewDelete()).toHaveAttribute('title','柜内仍有 1 条蛇，请先转移');
  await openRack(page);
  await expect(room(page).getByRole('button',{name:'删除空柜',exact:true})).toBeDisabled();
  await room(page).getByRole('button',{name:'柜体配置',exact:true}).click();
  await expect(modal(page).getByRole('button',{name:'删除空柜',exact:true})).toBeDisabled();
  await closeModal(page);
  await room(page).getByRole('button',{name:'← 房间总览',exact:true}).click();
  await room(page).locator('[data-mini-slot="slot-0-0-0"]').click();
  await modal(page).getByRole('button',{name:'移动蛇只',exact:true}).click();
  await modal(page).getByLabel('目标格位').selectOption('slot-1-0-1');
  await modal(page).getByRole('button',{name:'保存位置',exact:true}).click();
  await expect(modal(page)).toBeHidden();await expect(overviewDelete()).toBeEnabled();
  await overviewDelete().click();
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toHaveCount(0);
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets.length)).toBe(2);
  await room(page).getByRole('button',{name:'撤销',exact:true}).click();
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toHaveCount(1);
  await openRack(page);
  await room(page).getByRole('button',{name:'删除空柜',exact:true}).click();
  await expect(room(page).locator('.rw-header h1')).toHaveText('北窗爬房');
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toHaveCount(0);
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();
  await expect(room(page).locator('[data-rw-status]')).toHaveText('已同步');
  await page.reload();
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toHaveCount(0);
  await expect(room(page).locator('[data-mini-slot="slot-1-0-1"]')).toHaveText('ROOM-A');
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets.map(c=>c.id))).toEqual(['rack-b']);
  expect(errors).toEqual([]);
});

test('perspective uses actual wall height without fixtures and supports manual cabinet placement',async({page},info)=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'房间设置',exact:true}).click();
  await modal(page).getByLabel('墙高／房间高度 mm').fill('3200');
  await modal(page).getByRole('button',{name:'保存到布局草稿',exact:true}).click();
  await room(page).getByRole('button',{name:'立体',exact:true}).click();
  await expect(room(page).locator('.rw-room-walls')).toHaveAttribute('data-wall-height','3200');
  await expect(room(page).locator('.rw-room-ceiling,.rw-ceiling-light,.rw-room-ac')).toHaveCount(0);
  const allVisible=await room(page).locator('.rw-scene-world').evaluate(el=>{const box=el.getBBox(),v=el.ownerSVGElement.viewBox.baseVal;return box.x>=v.x&&box.y>=v.y&&box.x+box.width<=v.x+v.width&&box.y+box.height<=v.y+v.height;});
  expect(allVisible).toBe(true);
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();
  await openRack(page);
  await room(page).getByRole('button',{name:'柜体配置',exact:true}).click();
  await expect(modal(page).locator('[name=x],[name=z],[name=rotation],[name=wall]')).toHaveCount(0);
  await modal(page).getByLabel('柜名',{exact:true}).fill('手动摆放柜');
  await modal(page).getByRole('button',{name:'保存到布局草稿',exact:true}).click();
  await room(page).getByRole('button',{name:'← 房间总览',exact:true}).click();
  const rack=room(page).locator('.rw-scene-world [data-cabinet="rack-a"]');
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const face=rack.locator('.rw-box-face').first();await face.scrollIntoViewIfNeeded();
  const point=await face.evaluate(el=>{const b=el.getBBox(),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(el.getScreenCTM());return {x:p.x,y:p.y};});
  expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('[data-cabinet]')?.dataset.cabinet,point)).toBe('rack-a');
  await page.mouse.move(point.x,point.y);
  await page.mouse.down();await page.mouse.move(point.x,point.y+45,{steps:10});await page.mouse.up();
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();
  await expect(room(page).locator('[data-rw-status]')).toHaveText('已同步');
  const saved=await page.evaluate(()=>roomFixture.snapshot.config);
  expect(saved.height).toBe(3200);expect(saved.cabinets[0].rotation).toBe(0);
  expect(saved.cabinets[0].x).toBeGreaterThan(700);expect(saved.cabinets[0].z).toBeGreaterThan(400);
  await page.screenshot({path:`artifacts/room-real-height-${info.project.name}.png`,fullPage:true});
  await page.reload();
  await room(page).getByRole('button',{name:'立体',exact:true}).click();
  await expect(room(page).locator('.rw-room-walls')).toHaveAttribute('data-wall-height','3200');
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].x)).toBe(saved.cabinets[0].x);
  await room(page).getByRole('button',{name:'房间设置',exact:true}).click();
  await modal(page).getByLabel('墙高／房间高度 mm').fill('800');
  await modal(page).getByRole('button',{name:'保存到布局草稿',exact:true}).click();
  await expect(modal(page).locator('[role=status]')).toContainText('柜体高于房间');
  await closeModal(page);
  expect(errors).toEqual([]);
});

test('all four cabinet orientations keep their names inside the room',async({page},info)=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'俯视',exact:true}).click();
  for(const rotation of [0,90,180,270]){
    if(rotation){await room(page).getByRole('button',{name:'旋转 银柜 A 90°',exact:true}).click();}
    const label=room(page).locator('.rw-scene-world [data-label-cabinet="rack-a"]');
    await expect(label).toBeVisible();
    const result=await label.evaluate(el=>({x:+el.dataset.labelX,z:+el.dataset.labelZ,box:(()=>{const b=el.getBBox();return {x:b.x,y:b.y,width:b.width,height:b.height};})()}));
    const cfg=await page.evaluate(()=>roomFixture.snapshot.config);
    expect(result.box.x).toBeGreaterThan(0);expect(result.box.y).toBeGreaterThan(0);
    expect(result.box.x+result.box.width).toBeLessThan(cfg.width);
    expect(result.box.y+result.box.height).toBeLessThan(cfg.depth);
    if(rotation%180)expect(result.x).toBeGreaterThan(cfg.cabinets[0].x);
    else expect(result.z).toBeGreaterThan(cfg.cabinets[0].z);
  }
  await page.screenshot({path:`artifacts/room-ui-rotation-${info.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});

test('building keeps slot actions, saves rotation before assignment and returns via highlighted room map',async({page},info)=>{
  const errors=await boot(page);
  const day=room(page).locator('.rw-day').first();
  await expect(day.locator('.rw-day-label .rw-day-dot')).toBeVisible();
  expect(await day.evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('1px');
  await room(page).getByRole('button',{name:'搭建房间',exact:true}).click();
  await room(page).locator('[data-mini-slot="slot-0-0-1"]').click();
  await expect(modal(page).getByLabel('选择蛇只')).toBeVisible();
  await expect(modal(page).getByLabel('选择蛇只')).toHaveValue('');
  await expect(modal(page).locator('option[value="ROOM-A"]')).toHaveCount(0);
  await closeModal(page);
  await room(page).getByRole('button',{name:'旋转 银柜 A 90°',exact:true}).click();
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toContainText('朝向 90°');
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].rotation)).toBe(0);
  await room(page).locator('[data-mini-slot="slot-0-0-1"]').click();
  await expect(modal(page).getByLabel('选择蛇只')).toBeVisible();
  await modal(page).getByLabel('选择蛇只').selectOption('ROOM-C');
  await modal(page).getByRole('button',{name:'放入蛇只',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].rotation)).toBe(0);
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].rotation)).toBe(90);
  await openRack(page);
  await room(page).getByRole('button',{name:'搭建房间',exact:true}).click();
  await room(page).locator('.rw-scene-world [data-slot="slot-0-0-1"]').click();
  await expect(modal(page).locator('.rw-specimen')).toContainText('ROOM-C');
  await expect(modal(page).getByRole('button',{name:'移动蛇只',exact:true})).toBeVisible();
  await closeModal(page);
  const minimap=room(page).getByRole('button',{name:'返回房间总览，当前柜：银柜 A',exact:true});
  await expect(minimap.locator('[data-map-cabinet="rack-a"]')).toHaveClass('is-current');
  await expect(minimap.locator('[data-map-cabinet="rack-b"]')).not.toHaveClass('is-current');
  const mapBox=await minimap.boundingBox(),sceneBox=await room(page).locator('.rw-scene-host > .rw-scene').boundingBox();
  expect(mapBox.y).toBeGreaterThanOrEqual(sceneBox.y+sceneBox.height);
  await room(page).getByRole('button',{name:'适应',exact:true}).click();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
  await page.screenshot({path:`artifacts/room-ui-map-${info.project.name}.png`,fullPage:true});
  await minimap.click();
  await expect(room(page).locator('.rw-header h1')).toHaveText('北窗爬房');
  await page.reload();
  await expect(room(page).locator('[data-mini-slot="slot-0-0-1"]')).toHaveText('ROOM-C');
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toContainText('朝向 90°');
  expect(errors).toEqual([]);
});
async function openRack(page,id='rack-a'){await room(page).locator(`[data-rw="cabinet"][data-cabinet="${id}"]`).click();await expect(room(page).locator('.rw-summary-top')).toContainText(id==='rack-a'?'银柜 A':'银柜 B');const menu=room(page).getByRole('button',{name:'柜体设置',exact:true});if(await menu.isVisible()&&!await room(page).getByRole('button',{name:'柜体配置',exact:true}).isVisible())await menu.click();}
async function closeModal(page){await modal(page).getByRole('button',{name:'关闭',exact:true}).last().click();}

test('private room renders multi-date colored surfaces and retains date scope across smooth cabinet navigation',async({page},info)=>{
  const errors=await boot(page);
  const mini=room(page).locator('[data-mini-slot="slot-0-0-0"]');
  await expect(mini).toHaveClass(/is-planned/);
  await expect(mini).toHaveCSS('background-image',/linear-gradient/);
  expect(await mini.evaluate(el=>el.style.background)).toContain('37, 99, 235');
  expect(await mini.evaluate(el=>el.style.background)).toContain('194, 65, 12');
  expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThan(info.project.name==='desktop'?5000:7000);
  await page.screenshot({path:`artifacts/room-overview-${info.project.name}.png`});
  const monday=room(page).locator('[data-rw-date="2026-10-12"]');
  if(info.project.name==='desktop'){
    await monday.hover();await expect(mini).toHaveClass(/rw-plan-pulse/);
    expect(await mini.evaluate(el=>getComputedStyle(el).animationIterationCount)).toBe('2');
    await expect.poll(()=>mini.evaluate(el=>el.getAnimations().filter(a=>a.playState==='running').length)).toBe(0);
    await expect(mini).toHaveCSS('background-color','rgba(37, 99, 235, 0.27)');
  }
  await monday.click();await expect(room(page).locator('[data-rw-date="2026-10-12"]')).toHaveAttribute('aria-pressed','true');
  await openRack(page);
  await expect(room(page).locator('[data-rw-date="2026-10-12"]')).toHaveAttribute('aria-pressed','true');
  await expect(room(page).locator('.rw-model-slot:has([data-slot="slot-0-0-0"]) .rw-box-face')).toHaveAttribute('fill',/url\(#/);
  await room(page).getByRole('button',{name:'全部日期',exact:true}).click();
  await expect(room(page).locator('.rw-model-slot:has([data-slot="slot-0-0-0"])')).toContainText(/一\s*\/?\s*三\s*\/?\s*五/);
  if(info.project.name==='mobile')await expect.poll(()=>room(page).locator('[data-rw-week]').evaluate(el=>el.getBoundingClientRect().top)).toBeLessThan(100);
  await expect.poll(()=>room(page).locator('[data-rw-canvas]').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length)).toBe(0);
  await page.screenshot({path:`artifacts/room-cabinet-${info.project.name}.png`});
  if(info.project.name==='mobile'){
    await room(page).locator('[data-rw-canvas]').evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-210,behavior:'instant'}));
    await page.screenshot({path:'artifacts/room-cabinet-detail-mobile.png'});
  }
  await room(page).getByRole('button',{name:'← 房间总览',exact:true}).click();
  await expect(room(page).locator('[data-mini-slot="slot-0-0-0"]')).toHaveCSS('background-image',/linear-gradient/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

test('rule editing and cabinet schedules persist while single-grid override remains independent',async({page})=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'鼠重规则',exact:true}).click();
  await modal(page).getByLabel('鼠重上限',{exact:true}).nth(3).fill('7');
  await modal(page).getByRole('button',{name:'验证并启用规则',exact:true}).click();await expect(modal(page)).toBeHidden();
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toContainText('4–7');
  await room(page).locator('[data-mini-slot="slot-0-0-0"]').click();
  await modal(page).getByRole('button',{name:'本格喂食计划',exact:true}).click();
  for(const checkbox of await modal(page).locator('[name=weekdays]').all())await checkbox.uncheck();
  await modal(page).locator('[name=weekdays][value="2"]').check();
  await modal(page).getByLabel('每次老鼠只数（待确认可留空）').fill('2');
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'喂食计划',exact:true}).click();
  await modal(page).locator('[name=weekdays][value="1"]').check();
  await modal(page).getByLabel('每次老鼠只数（待确认可留空）').fill('3');
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();await expect(modal(page)).toBeHidden();
  const config=await page.evaluate(()=>roomFixture.snapshot.config);
  expect(config.cabinets[0].schedule.quantity).toBe(3);expect(config.cabinets[0].slotSchedules['slot-0-0-0'].quantity).toBe(2);
  expect(config.cabinets[0].slotSchedules['slot-0-0-0'].weekdays).toEqual([2]);
  await page.reload();await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toContainText('4–7');expect(errors).toEqual([]);
});

test('a snake can be assigned and moved through boxes; feeding result removes only its completed occurrence',async({page})=>{
  const errors=await boot(page);
  await room(page).locator('[data-mini-slot="slot-0-0-1"]').click();
  await modal(page).getByLabel('选择蛇只').selectOption('ROOM-C');
  await modal(page).getByRole('button',{name:'放入蛇只',exact:true}).click();await expect(modal(page)).toBeHidden();
  await expect(room(page).locator('[data-mini-slot="slot-0-0-1"]')).toHaveText('ROOM-C');
  await room(page).locator('[data-mini-slot="slot-0-0-1"]').click();
  await modal(page).getByRole('button',{name:'移动蛇只',exact:true}).click();
  await modal(page).getByLabel('目标格位').selectOption('slot-1-0-1');
  await modal(page).getByRole('button',{name:'保存位置',exact:true}).click();await expect(modal(page)).toBeHidden();
  await expect(room(page).locator('[data-mini-slot="slot-0-0-1"]')).toHaveText('·');
  await expect(room(page).locator('[data-mini-slot="slot-1-0-1"]')).toHaveText('ROOM-C');
  await room(page).locator('[data-mini-slot="slot-1-0-1"]').click();
  await modal(page).getByRole('button',{name:'本格喂食计划',exact:true}).click();
  await modal(page).getByLabel('默认喂食时刻').fill('17:30');
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  await room(page).locator('[data-mini-slot="slot-1-0-1"]').click();
  await modal(page).getByRole('button',{name:'记录结果',exact:true}).first().click();
  await modal(page).getByRole('combobox',{name:'结果',exact:true}).selectOption('offered');
  await modal(page).getByRole('button',{name:'保存实际记录',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  await room(page).locator('[data-mini-slot="slot-1-0-1"]').click();
  await modal(page).getByRole('button',{name:'记录结果',exact:true}).first().click();
  await modal(page).getByRole('combobox',{name:'结果',exact:true}).selectOption('fed');
  await modal(page).getByRole('button',{name:'保存实际记录',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.records.filter(r=>r.snake_id==='ROOM-C').map(r=>r.result))).toEqual(['fed']);
  await room(page).locator('[data-mini-slot="slot-0-0-0"]').click();
  await modal(page).getByRole('button',{name:'记录结果',exact:true}).first().click();
  await modal(page).getByRole('combobox',{name:'结果',exact:true}).selectOption('fed');
  await modal(page).getByRole('button',{name:'保存实际记录',exact:true}).click();await expect(modal(page)).toBeHidden();
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toContainText('2 次待喂');
  expect(await page.evaluate(()=>roomFixture.snapshot.records.find(r=>r.snake_id==='ROOM-A').result)).toBe('fed');
  await page.reload();await expect(room(page).locator('[data-mini-slot="slot-1-0-1"]')).toHaveText('ROOM-C');expect(errors).toEqual([]);
});

test('layer dimensions and new cabinet save as a draft then persist through a real layout action',async({page},info)=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'搭建房间',exact:true}).click();
  await room(page).getByRole('button',{name:'添加爬柜',exact:true}).click();
  await modal(page).getByLabel('柜名',{exact:true}).fill('南墙育成柜');
  await modal(page).locator('[name=levelCount]').first().fill('2');
  await modal(page).locator('[name=boxWidth]').first().fill('540');
  await modal(page).getByRole('button',{name:/保存到布局草稿|添加到布局草稿/}).click();await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets.length)).toBe(2);
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();
  await expect(room(page).locator('[data-rw-status]')).toHaveText('已同步');
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[2].levels[0].slots.length)).toBe(2);
  await page.reload();await expect(room(page).locator('.rw-header')).toContainText('3 个爬柜');
  await page.screenshot({path:`artifacts/room-built-${info.project.name}.png`});expect(errors).toEqual([]);
});

test('missing migration is actionable and cannot show fabricated loaded or saved data',async({page})=>{
  const errors=await boot(page,{missing:true});
  await expect(room(page).getByRole('alert')).toContainText('039');
  await expect(room(page).locator('[data-summary-cabinet]')).toHaveCount(0);
  await room(page).getByRole('button',{name:'鼠重规则',exact:true}).click();await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.calls.some(c=>c.name==='room_save_layout'))).toBe(false);expect(errors).toEqual([]);
});

test('unauthenticated private route remains gated without reading room RPCs',async({page})=>{
  await boot(page,{anonymous:true});await expect(page.locator('#authGate')).toBeVisible();
  expect(await page.evaluate(()=>roomFixture.calls.filter(c=>c.name.startsWith('room_')).length)).toBe(0);
});

test('structure duplication preserves custom layer geometry while creating empty fresh boxes',async({page})=>{
  const errors=await boot(page);await openRack(page);
  await room(page).getByRole('button',{name:'复制柜体结构',exact:true}).click();
  await expect(modal(page).locator('[name=levelCount]')).toHaveCount(2);
  await expect(modal(page).locator('[name=levelCount]').nth(1)).toHaveValue('2');
  await modal(page).getByLabel('柜名',{exact:true}).fill('复制的南侧柜');
  await modal(page).getByLabel('柜高 mm').fill('1400');
  await modal(page).getByRole('button',{name:'＋ 复制上一层',exact:true}).click();
  await expect(modal(page).locator('[name=levelCount]')).toHaveCount(3);
  await expect(modal(page).locator('[name=levelCount]').nth(2)).toHaveValue('2');
  await modal(page).getByRole('button',{name:'保存到布局草稿',exact:true}).click();await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();await expect(room(page).locator('[data-rw-status]')).toHaveText('已同步');
  const data=await page.evaluate(()=>roomFixture.snapshot),original=data.config.cabinets[0],copied=data.config.cabinets[2];
  expect(copied.levels.map(l=>l.count)).toEqual([3,2,2]);expect(copied.schedule).toBeNull();expect(copied.slotSchedules).toEqual({});
  const originalIds=new Set(original.levels.flatMap(l=>l.slots.flatMap(s=>[s.id,s.box_id])));
  expect(copied.levels.flatMap(l=>l.slots).every(s=>!originalIds.has(s.id)&&!originalIds.has(s.box_id))).toBe(true);
  expect(data.assignments).toHaveLength(2);
  await room(page).getByRole('button',{name:'搭建房间',exact:true}).click();
  await room(page).getByRole('button',{name:'添加爬柜',exact:true}).click();
  await modal(page).getByRole('button',{name:'保存到布局草稿',exact:true}).click();
  await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'应用布局',exact:true}).click();
  await expect(room(page).locator('[data-rw-status]')).toHaveText('已同步');
  const added=await page.evaluate(()=>roomFixture.snapshot.config);
  expect(added.cabinets).toHaveLength(4);expect(M.validateConfig(added)).toEqual([]);
  expect([added.cabinets[3].x,added.cabinets[3].z]).not.toEqual([copied.x,copied.z]);
  expect(errors).toEqual([]);
});

test('room and cabinet label templates render literal text and persist per-slot notes',async({page},info)=>{
  const errors=await boot(page),literal='<img src=x onerror=window.roomXSS=1>';
  await room(page).getByRole('button',{name:'标签',exact:true}).click();
  await modal(page).getByLabel('模板内容（每行一条，最多 6 行）').fill('{{id}} / {{sex}}\n'+literal+'\n{{note}}');
  await expect(modal(page).locator('[data-label-preview]')).toContainText(literal);
  await expect(modal(page).locator('[data-label-preview] img')).toHaveCount(0);
  await modal(page).getByRole('button',{name:'保存标签模板',exact:true}).click();await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'标签',exact:true}).click();
  await modal(page).getByRole('combobox',{name:'模板作用范围',exact:true}).selectOption('rack-a');
  await modal(page).getByLabel('模板内容（每行一条，最多 6 行）').fill('A柜 / {{id}}\n鼠重 {{mouse}}\n{{note}}');
  await modal(page).getByRole('button',{name:'保存标签模板',exact:true}).click();await expect(modal(page)).toBeHidden();
  await room(page).locator('[data-mini-slot="slot-0-0-0"]').click();
  await modal(page).getByRole('button',{name:'标签备注',exact:true}).click();await modal(page).getByLabel('格位备注').fill('靠窗观察位');
  await modal(page).getByRole('button',{name:'保存备注',exact:true}).click();await expect(modal(page)).toBeHidden();
  await room(page).locator('[data-mini-slot="slot-0-0-0"]').click();
  await expect(modal(page).locator('[aria-label="完整盒面标签"]')).toContainText('A柜 / ROOM-A');
  await expect(modal(page).locator('[aria-label="完整盒面标签"]')).toContainText('靠窗观察位');
  await page.screenshot({path:`artifacts/room-label-template-${info.project.name}.png`});await closeModal(page);
  await room(page).locator('[data-mini-slot="slot-1-0-0"]').click();await expect(modal(page).locator('[aria-label="完整盒面标签"]')).toContainText(literal);
  expect(await page.evaluate(()=>window.roomXSS)).toBeUndefined();await closeModal(page);await page.reload();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.slotNotes['slot-0-0-0'])).toBe('靠窗观察位');expect(errors).toEqual([]);
});

test('draft rules activate only explicitly and confirmed batches retain original supplies through later activation',async({page},info)=>{
  const errors=await boot(page);
  await room(page).locator('[data-rw-date="2026-10-16"]').click();
  await room(page).getByRole('button',{name:'备料批次',exact:true}).click();
  await modal(page).getByRole('button',{name:'确认当前范围备料',exact:true}).click();
  await expect(modal(page).locator('[name=tasks]:checked')).toHaveCount(1);
  await modal(page).getByLabel('批次名称').fill('周五已备料');
  await modal(page).getByRole('button',{name:'锁定并确认备料',exact:true}).click();await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'鼠重规则',exact:true}).click();
  await modal(page).getByLabel('新版本名称').fill('鼠重规则修订');await modal(page).getByLabel('鼠重上限',{exact:true}).nth(3).fill('7');
  await modal(page).getByRole('button',{name:'保存为草稿版本',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>roomFixture.snapshot.rule_versions.length)).toBe(2);
  expect(await page.evaluate(()=>roomFixture.snapshot.config.rules[3].mouseMax)).toBe(6);
  await modal(page).getByRole('combobox',{name:'已保存的规则版本',exact:true}).selectOption({label:'V2 · 鼠重规则修订'});
  await modal(page).getByRole('button',{name:'预览此版本',exact:true}).click();
  await expect(modal(page).locator('[data-version-detail]')).toContainText('鼠重规则修订');
  await modal(page).getByRole('button',{name:'启用此版本',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>roomFixture.snapshot.config.rules[3].mouseMax)).toBe(7);
  expect(await page.evaluate(()=>roomFixture.snapshot.planned_tasks.find(t=>t.batch_id).mouse_max_g)).toBe(6);
  await closeModal(page);await page.reload();
  await room(page).getByRole('button',{name:'备料批次',exact:true}).click();
  await modal(page).getByRole('button',{name:'继续巡柜',exact:true}).click();await expect(modal(page)).toContainText('4–6g');
  await page.screenshot({path:`artifacts/room-locked-batch-${info.project.name}.png`});
  await modal(page).getByRole('button',{name:'记录结果',exact:true}).click();
  await modal(page).getByRole('button',{name:'保存实际记录',exact:true}).click();await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'备料批次',exact:true}).click();await expect(modal(page)).toContainText('1/1 已处理');
  expect(await page.evaluate(()=>roomFixture.snapshot.batches[0].items[0].mouse_max_g)).toBe(6);expect(errors).toEqual([]);
});

test('move confirmation previews both swap participants and exact inherited or carried schedules',async({page},info)=>{
  const errors=await boot(page);
  await room(page).locator('[data-mini-slot="slot-0-0-0"]').click();await modal(page).getByRole('button',{name:'移动蛇只',exact:true}).click();
  await modal(page).getByRole('combobox',{name:'目标格位',exact:true}).selectOption('slot-1-0-0');
  await expect(modal(page).locator('[data-move-preview]')).toContainText('目标已有蛇只');
  await expect(modal(page).getByRole('button',{name:'保存位置',exact:true})).toBeDisabled();
  await modal(page).getByLabel('目标有蛇时交换位置').check();
  await expect(modal(page).locator('[data-move-preview]')).toContainText('ROOM-A');await expect(modal(page).locator('[data-move-preview]')).toContainText('ROOM-B');
  await expect(modal(page).locator('[data-move-preview]')).toContainText('周四 18:00');
  await modal(page).getByRole('combobox',{name:'到达后的排期',exact:true}).selectOption('carry');
  await expect(modal(page).locator('[data-move-preview]')).toContainText('独立计划将替换');
  await page.screenshot({path:`artifacts/room-move-preview-${info.project.name}.png`});
  await modal(page).getByRole('button',{name:'保存位置',exact:true}).click();await expect(modal(page)).toBeHidden();
  await expect(room(page).locator('[data-mini-slot="slot-1-0-0"]')).toHaveText('ROOM-A');await expect(room(page).locator('[data-mini-slot="slot-0-0-0"]')).toHaveText('ROOM-B');
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[1].slotSchedules['slot-1-0-0'].weekdays)).toEqual([1,3,5]);expect(errors).toEqual([]);
});

async function tabTo(page,locator){for(let i=0;i<=90;i++){if(await locator.evaluate(el=>el===document.activeElement))return;if(i<90)await page.keyboard.press('Tab');}throw Error('Keyboard Tab could not reach target');}
test('keyboard alone enters rack, navigates uneven rows, assigns a snake and restores focus through Escape',async({page})=>{
  const errors=await boot(page);
  await room(page).locator('.rw-scene-world [data-cabinet="rack-a"]').focus();
  await page.keyboard.press('Enter');const first=room(page).locator('.rw-scene-world [data-slot="slot-0-0-0"]');await expect(first).toBeFocused();
  await page.keyboard.press('ArrowUp');await expect(room(page).locator('.rw-scene-world [data-slot="slot-0-1-0"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');await expect(room(page).locator('.rw-scene-world [data-slot="slot-0-1-1"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');const target=room(page).locator('.rw-scene-world [data-slot="slot-0-0-1"]');await expect(target).toBeFocused();
  await page.keyboard.press('Enter');await expect(modal(page)).toBeVisible();
  await tabTo(page,modal(page).getByRole('combobox',{name:'选择蛇只',exact:true}));await page.keyboard.press('End');
  await tabTo(page,modal(page).getByRole('button',{name:'放入蛇只',exact:true}));await page.keyboard.press('Enter');await expect(modal(page)).toBeHidden();
  await expect(target).toBeFocused();expect(await page.evaluate(()=>roomFixture.snapshot.assignments.find(a=>a.slot_id==='slot-0-0-1').snake_id)).toBe('ROOM-C');
  await page.keyboard.press('ArrowLeft');await expect(first).toBeFocused();await page.keyboard.press('Enter');await expect(modal(page)).toContainText('ROOM-A');
  await tabTo(page,modal(page).getByRole('button',{name:'本格喂食计划',exact:true}));await page.keyboard.press('Enter');
  await tabTo(page,modal(page).locator('[name=noPlan]'));await page.keyboard.press('Space');
  await tabTo(page,modal(page).getByRole('button',{name:'保存喂食计划',exact:true}));await page.keyboard.press('Enter');await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].slotSchedules['slot-0-0-0'])).toBeNull();await expect(first).toBeFocused();
  await page.keyboard.press('Enter');await tabTo(page,modal(page).getByRole('button',{name:'本格喂食计划',exact:true}));await page.keyboard.press('Enter');
  await tabTo(page,modal(page).locator('[name=inherit]'));await page.keyboard.press('Space');
  await tabTo(page,modal(page).getByRole('button',{name:'保存喂食计划',exact:true}));await page.keyboard.press('Enter');await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>Object.hasOwn(roomFixture.snapshot.config.cabinets[0].slotSchedules,'slot-0-0-0'))).toBe(false);await expect(first).toBeFocused();
  await page.keyboard.press('Enter');await tabTo(page,modal(page).getByRole('button',{name:'记录结果',exact:true}).first());await page.keyboard.press('Enter');
  await tabTo(page,modal(page).getByRole('combobox',{name:'结果',exact:true}));await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');
  await tabTo(page,modal(page).getByRole('button',{name:'保存实际记录',exact:true}));await page.keyboard.press('Enter');await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.records.find(r=>r.snake_id==='ROOM-A').result)).toBe('fed');await expect(first).toBeFocused();
  await page.keyboard.press('Enter');await expect(modal(page)).toContainText('ROOM-A');
  await page.keyboard.press('Escape');await expect(modal(page)).toBeHidden();await expect(first).toBeFocused();
  await page.keyboard.press('Escape');await expect(room(page).locator('.rw-header h1')).toHaveText('北窗爬房');
  await expect(room(page).locator('[data-rw="cabinet"][data-cabinet="rack-a"]')).toBeFocused();
  await tabTo(page,room(page).locator('[data-rw="view-perspective"]'));await page.keyboard.press('Enter');
  await expect(room(page).locator('[data-rw="view-perspective"]')).toHaveAttribute('aria-pressed','true');
  await tabTo(page,room(page).locator('.rw-scene-world [data-cabinet="rack-a"]'));await page.keyboard.press('Enter');await expect(first).toBeFocused();
  await page.keyboard.press('Escape');await expect(room(page).locator('[data-rw="view-perspective"]')).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>SuohaRoomWorkspace.getView().view)).toBe('perspective');expect(errors).toEqual([]);
});

test('explicit unscheduled slot persists and correcting a feeding preserves its actual time and notes',async({page})=>{
  const errors=await boot(page);
  const slot=()=>room(page).locator('[data-mini-slot="slot-0-0-0"]');
  await slot().click();await modal(page).getByRole('button',{name:'本格喂食计划',exact:true}).click();
  await modal(page).getByLabel('本格不安排喂食',{exact:true}).check();
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].slotSchedules['slot-0-0-0'])).toBeNull();
  await page.reload();await slot().click();await expect(modal(page)).toContainText('本格未安排喂食');
  await modal(page).getByRole('button',{name:'本格喂食计划',exact:true}).click();
  await expect(modal(page).getByLabel('本格不安排喂食',{exact:true})).toBeChecked();
  await modal(page).getByLabel('恢复继承柜计划',{exact:true}).check();
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();await expect(modal(page)).toBeHidden();
  await slot().click();await modal(page).getByRole('button',{name:'记录结果',exact:true}).first().click();
  await modal(page).getByLabel('实际时间',{exact:true}).fill('2026-10-12T18:30');
  await modal(page).getByLabel('备注／人工覆盖原因',{exact:true}).fill('原始观察备注');
  await modal(page).getByRole('button',{name:'保存实际记录',exact:true}).click();await expect(modal(page)).toBeHidden();
  await slot().click();await modal(page).getByRole('button',{name:'更正记录',exact:true}).click();
  await expect(modal(page).getByLabel('实际时间',{exact:true})).toHaveValue('2026-10-12T18:30');
  await expect(modal(page).getByLabel('备注／人工覆盖原因',{exact:true})).toHaveValue('原始观察备注');
  await modal(page).getByRole('combobox',{name:'结果',exact:true}).selectOption('refused');
  await modal(page).getByRole('button',{name:'保存实际记录',exact:true}).click();await expect(modal(page)).toBeHidden();
  const records=await page.evaluate(()=>roomFixture.snapshot.records);
  expect(records).toHaveLength(1);expect(records[0].result).toBe('refused');expect(records[0].occurred_at).toBe('2026-10-12T10:30:00.000Z');expect(records[0].notes).toBe('原始观察备注');expect(errors).toEqual([]);
});
