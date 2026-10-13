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
    fixture.snapshot.planned_tasks||=[];fixture.snapshot.batches||=[];
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
async function openRack(page,id='rack-a'){await room(page).locator(`[data-rw="cabinet"][data-cabinet="${id}"]`).click();await expect(room(page).locator('.rw-summary-top')).toContainText(id==='rack-a'?'银柜 A':'银柜 B');}
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
  await modal(page).getByRole('button',{name:'本格排期',exact:true}).click();
  for(const checkbox of await modal(page).locator('[name=weekdays]').all())await checkbox.uncheck();
  await modal(page).locator('[name=weekdays][value="2"]').check();
  await modal(page).getByLabel('每次老鼠只数（待确认可留空）').fill('2');
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();await expect(modal(page)).toBeHidden();
  await room(page).getByRole('button',{name:'批量排期',exact:true}).click();
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
  await room(page).locator('[data-mini-slot="slot-0-0-0"]').click();
  await modal(page).getByRole('button',{name:'记录结果',exact:true}).first().click();
  await modal(page).getByRole('combobox',{name:'结果',exact:true}).selectOption('fed');
  await modal(page).getByRole('button',{name:'保存实际记录',exact:true}).click();await expect(modal(page)).toBeHidden();
  await expect(room(page).locator('[data-summary-cabinet="rack-a"]')).toContainText('2 次待喂');
  expect(await page.evaluate(()=>roomFixture.snapshot.records[0].result)).toBe('fed');
  await page.reload();await expect(room(page).locator('[data-mini-slot="slot-1-0-1"]')).toHaveText('ROOM-C');expect(errors).toEqual([]);
});

test('layer dimensions and new cabinet save as a draft then persist through a real layout action',async({page},info)=>{
  const errors=await boot(page);
  await room(page).getByRole('button',{name:'搭建房间',exact:true}).click();
  await room(page).getByRole('button',{name:'添加爬柜',exact:true}).click();
  await modal(page).getByLabel('柜名',{exact:true}).fill('南墙育成柜');
  await modal(page).getByLabel('中心 X mm').fill('2000');await modal(page).getByLabel('中心 Z mm').fill('1900');
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
  await modal(page).getByLabel('中心 X mm').fill('1800');await modal(page).getByLabel('中心 Z mm').fill('1800');
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
  expect(data.assignments).toHaveLength(2);expect(errors).toEqual([]);
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
  await tabTo(page,modal(page).getByRole('button',{name:'本格排期',exact:true}));await page.keyboard.press('Enter');
  await tabTo(page,modal(page).locator('[name=noPlan]'));await page.keyboard.press('Space');
  await tabTo(page,modal(page).getByRole('button',{name:'保存喂食计划',exact:true}));await page.keyboard.press('Enter');await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].slotSchedules['slot-0-0-0'])).toBeNull();await expect(first).toBeFocused();
  await page.keyboard.press('Enter');await tabTo(page,modal(page).getByRole('button',{name:'本格排期',exact:true}));await page.keyboard.press('Enter');
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
  await slot().click();await modal(page).getByRole('button',{name:'本格排期',exact:true}).click();
  await modal(page).getByLabel('本格不安排喂食',{exact:true}).check();
  await modal(page).getByRole('button',{name:'保存喂食计划',exact:true}).click();await expect(modal(page)).toBeHidden();
  expect(await page.evaluate(()=>roomFixture.snapshot.config.cabinets[0].slotSchedules['slot-0-0-0'])).toBeNull();
  await page.reload();await slot().click();await expect(modal(page)).toContainText('本格未安排喂食');
  await modal(page).getByRole('button',{name:'本格排期',exact:true}).click();
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
