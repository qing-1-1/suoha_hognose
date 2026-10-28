/* Daily room workflows and plan-linked incubator controls. */
(() => {
  'use strict';
  window.SuohaRoomWorkflows={create(ctx){
    const {M,D,state,config,snakes,measurements,assignments,records,copy,esc,field,select,btn,showDialog,write,cabinet,slotInfo,titleOfSlot,dateNow,days}=ctx;
    const eggs=()=>state.snapshot?.incubations||[];
    const isIncubator=c=>c?.type==='incubator';
    const isEggs=c=>isIncubator(c)&&c.purpose==='eggs';
    const eligible=()=>snakes().filter(s=>s.status==='active'&&!assignments().some(a=>a.snake_id===s.id));
    const snakeLabel=s=>`${s.id} · ${s.gene_text||'基因待填'} · ${({M:'公',F:'母',U:'未知'})[s.sex]||'未知'} · ${M.latestWeight(s.id,measurements())?.weight??'待称'}g`;
    const dayPlus=(day,n)=>new Date(Date.parse(day+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
    function attachSnakeSearch(root){
      const picker=root.querySelector('[name=snake]');if(!picker)return;
      picker.insertAdjacentHTML('beforebegin','<input type="search" aria-label="搜索可入住蛇只" placeholder="搜索编号或基因" data-snake-query>');
      const input=root.querySelector('[data-snake-query]'),items=eligible();
      const update=()=>{const selected=picker.value,q=input.value.trim().toLowerCase();picker.innerHTML='<option value="">请选择未入住蛇</option>'+items.filter(s=>s.id===selected||[s.id,s.gene_text].join(' ').toLowerCase().includes(q)).map(s=>`<option value="${esc(s.id)}">${esc(snakeLabel(s))}</option>`).join('');picker.value=selected;};
      input.oninput=update;update();
    }
    function slotNavigation(slotId){const info=slotInfo(slotId);if(!info)return '';const slots=[...info.c.levels].reverse().flatMap(l=>l.slots),index=slots.findIndex(s=>s.id===slotId);return `<div class="rw-slot-navigation">${btn('上一盒','slot',`data-slot="${esc(slots[index-1]?.id||'')}" ${index===0?'disabled':''}`)}<span>${index+1} / ${slots.length} 盒</span>${btn('下一盒','slot',`data-slot="${esc(slots[index+1]?.id||'')}" ${index===slots.length-1?'disabled':''}`)}</div>`;}
    function openBatchAssign(){
      const items=eligible(),slots=state.snapshot.config.cabinets.filter(c=>!isEggs(c)).flatMap(c=>c.levels.flatMap(l=>l.slots.filter(s=>ctx.slotReady(s.id)&&!assignments().some(a=>a.slot_id===s.id)).map(s=>[s.id,titleOfSlot(s.id)+(isIncubator(c)?' · 冬化暂停喂食':'')])));
      showDialog('批量入住',`<p>勾选蛇只并逐条指定空盒。下方会预览对应位置，所有选择一次保存；不会自动按排序填满柜子。</p><input type="search" aria-label="搜索批量入住蛇只" placeholder="编号或基因" data-batch-search><div class="rw-batch-assign">${items.map(s=>`<article class="rw-batch-assign-row" data-batch-snake="${esc(s.id)}" data-search="${esc([s.id,s.gene_text].join(' ').toLowerCase())}"><label class="rw-check"><input type="checkbox" name="pick" value="${esc(s.id)}">${esc(snakeLabel(s))}</label>${select('目标盒子 · '+s.id,'target-'+s.id,[['','请选择空盒'],...slots],'')}</article>`).join('')||'<p class="rw-empty">没有未入住蛇。</p>'}</div><h3>入住预览</h3><div data-assignment-preview role="status"></div>`,async form=>{
        const payload=read(form);if(!payload.length)throw Error('请至少选择一条蛇。');
        if(payload.some(x=>!x.slot_id))throw Error('请为每条选中的蛇指定空盒。');
        if(new Set(payload.map(x=>x.slot_id)).size!==payload.length)throw Error('同一盒子只能安排一条蛇。');
        await write(()=>D.assignBatch(payload,state.snapshot.revision));
      },'确认批量入住',root=>{
        const form=root.querySelector('form'),update=()=>{const payload=read(form);root.querySelector('[data-assignment-preview]').innerHTML=payload.map(x=>`<p>${esc(x.snake_id)} → ${esc(x.slot_id?titleOfSlot(x.slot_id):'尚未选择盒子')}</p>`).join('')||'<p>尚未选择蛇只。</p>';};
        root.querySelector('[data-batch-search]').oninput=e=>root.querySelectorAll('[data-batch-snake]').forEach(row=>row.hidden=!row.dataset.search.includes(e.target.value.trim().toLowerCase()));form.addEventListener('change',update);update();
      });
      function read(form){return [...form.querySelectorAll('[name=pick]:checked')].map(el=>({snake_id:el.value,slot_id:form.elements['target-'+el.value].value}));}
    }
    function openIncubator(id,duplicate=false){
      const original=cabinet(id),existing=duplicate?null:original;
      let c=duplicate?M.cloneCabinet(original,{name:original.name+' 副本'}):original?copy(original):M.createIncubator({name:'孵化箱',purpose:'brumation'});
      const row=(l,i)=>`<label class="rw-field" data-stack-level="${esc(l.id||'')}">第 ${i+1} 层盒数（从下往上）<input type="number" name="count${i}" min="1" max="30" value="${l.count||3}" required></label>`;
      showDialog(existing?'配置孵化箱':duplicate?'复制孵化箱':'添加孵化箱',`<div class="rw-form-grid">${field('箱名','name',c.name,'text','required maxlength="60"')}${select('用途','purpose',[['brumation','蛇只冬化'],['eggs','蛇蛋孵化']],c.purpose)}${field('层数','layers',c.levels.length,'number','min="1" max="20" required')}</div><div class="rw-form-grid" data-stack-counts>${c.levels.map(row).join('')}</div><p>盒子从下向上堆放，箱内不生成隔板。冬化箱不安排常规喂食；孵蛋箱关联已有繁育计划和窝次。</p><details><summary>尺寸设置（mm）</summary><div class="rw-form-grid">${field('箱宽','width',c.width,'number','min="100" required')}${field('箱深','depth',c.depth,'number','min="100" required')}${field('箱高','height',c.height,'number','min="100" required')}${field('盒宽','boxWidth',c.levels[0]?.boxWidth||360,'number','min="10" required')}${field('盒深','boxDepth',c.levels[0]?.boxDepth||540,'number','min="10" required')}${field('盒高','boxHeight',c.levels[0]?.boxHeight||240,'number','min="10" required')}</div></details>`,form=>{
        const v=Object.fromEntries(new FormData(form)),changed={...copy(c),name:v.name,purpose:v.purpose,width:+v.width,depth:+v.depth,height:+v.height};
        const specs=[...form.querySelectorAll('[data-stack-level]')].map((el,i)=>({id:el.dataset.stackLevel||undefined,count:+v['count'+i],height:+v.boxHeight,boxWidth:+v.boxWidth,boxDepth:+v.boxDepth,boxHeight:+v.boxHeight}));
        const built=M.resizeIncubator(changed,specs),next=copy(config());
        if(existing)next.cabinets[next.cabinets.findIndex(x=>x.id===id)]=built;else{ctx.placeNewCabinet(built,next);next.cabinets.push(built);}
        ctx.requireErrors(next);ctx.protectSlots(next);ctx.editConfig(next);state.cabinetId=built.id;
      },'保存到布局草稿',root=>{
        const input=root.querySelector('[name=layers]');input.oninput=()=>{const count=+input.value;if(!Number.isInteger(count)||count<1||count>20)return;const current=[...root.querySelectorAll('[data-stack-level]')].map(el=>({id:el.dataset.stackLevel,count:+el.querySelector('input').value}));root.querySelector('[data-stack-counts]').innerHTML=Array.from({length:count},(_,i)=>row(current[i]||{count:current.at(-1)?.count||3},i)).join('');};
      });
    }
    function openEggSlot(slotId){
      const entry=eggs().find(x=>x.slot_id===slotId),plans=state.snapshot.breeding_plans||[],clutches=state.snapshot.clutches||[];
      showDialog(titleOfSlot(slotId),`<p>蛇蛋孵化 · 父母本由已有繁育计划确定。选择对应窝次后，可将同一窝分到多个盒子。</p><div class="rw-form-grid">${select('繁育计划','plan_id',[['','选择已批准的繁育计划'],...plans.map(p=>[p.id,`${p.plan_year||p.year||''} ${p.female_snake_id} ♀ × ${p.male_snake_id} ♂`])],entry?.plan_id||'')}${select('对应窝次','clutch_id',[['','先选择繁育计划']],entry?.clutch_id||'')}${field('本盒蛋数','egg_count',entry?.egg_count||'','number','min="1" max="1000" required')}${field('入箱日期','started_on',entry?.started_on||dateNow(),'date','required')}${field('预计出壳日期（自填）','expected_on',entry?.expected_on||'','date')}${field('备注','notes',entry?.notes||'','text','maxlength="1000"')}</div><div data-egg-parents role="status"></div><p>没有可选计划或窝次时，请先在年度繁育计划、繁育记录中完成批准、配对和产蛋登记。</p>${entry?`<div class="rw-actions">${btn('转移孵化盒','egg-move',`data-slot="${esc(slotId)}"`)}${btn('结束本盒孵化','egg-clear',`data-slot="${esc(slotId)}"`)}</div>`:''}`,async form=>{
        const v=Object.fromEntries(new FormData(form));v.plan_id=form.elements.plan_id.value;v.clutch_id=form.elements.clutch_id.value;if(!v.plan_id||!v.clutch_id)throw Error('请选择计划及对应窝次。');
        await write(()=>D.saveIncubation({slot_id:slotId,plan_id:v.plan_id,clutch_id:v.clutch_id,egg_count:+v.egg_count,started_on:v.started_on,expected_on:v.expected_on||null,notes:v.notes},state.snapshot.revision));
      },entry?'保存孵化信息':'放入蛇蛋',root=>{
        const form=root.querySelector('form'),plan=form.elements.plan_id,clutch=form.elements.clutch_id;
        const update=()=>{const p=plans.find(p=>String(p.id)===plan.value),chosen=clutch.value||String(entry?.clutch_id||'');clutch.innerHTML='<option value="">选择对应窝次</option>'+clutches.filter(c=>String(c.plan_id)===plan.value&&c.status==='incubating').map(c=>`<option value="${esc(c.id)}">${esc(c.clutch_code||'窝次 '+c.id)} · 可分配 ${c.remaining_eggs==null?'—':Number(c.remaining_eggs)+(String(c.id)===String(entry?.clutch_id)?Number(entry.egg_count):0)} 枚${String(c.id)===String(entry?.clutch_id)?'（含本盒）':''}</option>`).join('');clutch.value=chosen;root.querySelector('[data-egg-parents]').innerHTML=p?`<p>母本：<b>${esc(p.female_snake_id)}</b> · 父本：<b>${esc(p.male_snake_id)}</b></p>`:'<p>父母本不支持手动输入，请先选计划。</p>';};plan.onchange=update;update();
        plan.disabled=clutch.disabled=!!entry;
        root.querySelector('.rw-form-body').insertAdjacentHTML('afterbegin',slotNavigation(slotId));
      },'detail');
    }
    function moveEgg(slotId){const entry=eggs().find(x=>x.slot_id===slotId);if(!entry)return;
      const slots=state.snapshot.config.cabinets.filter(isEggs).flatMap(c=>c.levels.flatMap(l=>l.slots.filter(s=>ctx.slotReady(s.id)&&!eggs().some(e=>e.slot_id===s.id)).map(s=>[s.id,titleOfSlot(s.id)])));
      showDialog('转移孵化盒',`<p>${esc(titleOfSlot(slotId))} · ${entry.egg_count} 枚</p>${select('目标孵化盒','target',[['','选择空盒'],...slots],'')}`,async form=>{if(!form.elements.target.value)throw Error('请选择空的孵化盒。');await write(()=>D.moveIncubation(slotId,form.elements.target.value,state.snapshot.revision));},'确认转移');
    }
    function clearEgg(slotId){const entry=eggs().find(x=>x.slot_id===slotId);if(!entry)return;
      showDialog('结束本盒孵化',`<p>${esc(titleOfSlot(slotId))} · ${entry.egg_count} 枚。此操作释放盒子，保留位置历史；不会自动登记出壳或创建幼蛇。出壳结果请在原繁育窝次中记录。</p>`,async()=>{await write(()=>D.clearIncubation(slotId,state.snapshot.revision));},'确认结束并释放盒子');
    }
    function incubationSummary(c,top){const slots=new Set(c.levels.flatMap(l=>l.slots.map(s=>s.id))),contents=eggs().filter(e=>slots.has(e.slot_id)),snakesHere=assignments().filter(a=>slots.has(a.slot_id));return `<section class="rw-summary${top?' rw-summary-top':''}" data-summary-cabinet="${esc(c.id)}"><div class="rw-summary-title"><h3>${esc(c.name)} · ${isEggs(c)?'孵蛋':'冬化'}</h3>${top?'':btn('展开 ↗','cabinet',`data-cabinet="${esc(c.id)}"`)}</div><p>${isEggs(c)?`${contents.length} 个使用中盒子 · ${contents.reduce((n,e)=>n+e.egg_count,0)} 枚蛋`:`${snakesHere.length} 条冬化蛇 · 常规喂食暂停`}</p>${top?'':ctx.mini(c)+`<div class="rw-cabinet-placement">${btn('旋转 90°','rotate-cabinet',`data-cabinet="${esc(c.id)}" aria-label="旋转 ${esc(c.name)} 90°"`)}${ctx.deleteCabinetButton(c)}</div>`}</section>`;}
    function protectIncubations(next){
      for(const e of eggs()){const prior=slotInfo(e.slot_id),after=next.cabinets.flatMap(c=>c.levels.flatMap(l=>l.slots.map(s=>({c,s})))).find(x=>x.s.id===e.slot_id);if(!after||!isEggs(after.c)||after.s.box_id!==prior?.s.box_id)throw Error(`${titleOfSlot(e.slot_id)} 仍有蛇蛋，请先转移或结束孵化。`);}
      for(const a of assignments()){const prior=slotInfo(a.slot_id),c=next.cabinets.find(c=>c.levels.some(l=>l.slots.some(s=>s.id===a.slot_id)));if(c&&(isEggs(c)||c.purpose!==prior?.c.purpose||c.type!==prior?.c.type))throw Error('有蛇的柜子不能直接变更用途，请先转移蛇只。');}
    }
    function dailyMarkup(){
      const overview=state.overview;if(!overview)return '';
      const pending=M.preparationTasks(overview.todayTasks,config(),snakes(),measurements()).filter(t=>['pending','offered'].includes(t.status)),overdue=(overview.overdueTasks||[]),unknown=pending.filter(t=>t.mouseMin==null||t.quantity==null);
      return `<div class="rw-daily" aria-label="本日待办"><span>今日 ${esc(dateNow())}</span>${btn(`待喂／确认 ${pending.length}`,'daily',`data-kind="today"`)}${btn(`逾期待处理 ${overdue.length}`,'daily',`data-kind="overdue"`)}${btn(`规格待确认 ${unknown.length}`,'daily',`data-kind="unknown"`)}${btn(`未入住 ${eligible().length}`,'unassigned')}</div>`;
    }
    function daily(kind){const ov=state.overview;if(!ov)return;const tasks=M.preparationTasks(kind==='overdue'?ov.overdueTasks||[]:ov.todayTasks,config(),snakes(),measurements()).filter(t=>['pending','offered'].includes(t.status)&&(kind!=='unknown'||t.mouseMin==null||t.quantity==null));state.dailyTasks=tasks;
      showDialog(({today:'今日喂食待办',overdue:'逾期待处理',unknown:'鼠重与数量待确认'})[kind]||'待办',`<p>按实际计划日期查询，与当前查看周无关。逾期仅展示已保存的任务，不推测未记录的历史。</p>${tasks.map(t=>`<article class="rw-task"><div><b>${esc(t.snakeId)}</b><p>${esc(t.date+' '+t.time)} · ${esc(titleOfSlot(t.slotId))}</p><p>${t.mouseMin==null?'鼠重待确认':`${t.mouseMin}–${t.mouseMax}g`} × ${t.quantity??'待确认'}</p></div>${btn('定位盒子','locate-slot',`data-slot="${esc(t.slotId)}"`)}${btn('记录结果','daily-feed',`data-task="${esc(t.id)}"`)}</article>`).join('')||'<p class="rw-empty">该项没有待处理任务。</p>'}`,null);
    }
    function attachSchedulePreview(root,cabinetId,slotId){
      const form=root.querySelector('form');root.querySelector('.rw-form-body').insertAdjacentHTML('beforeend','<h3>未来计划预览</h3><p>默认时刻用于未单独指定时间的日期；修改默认时刻时，仅同步原来与默认值相同的日期。</p><div data-schedule-preview aria-live="polite"></div>');let oldTime=form.elements.time.value;
      const update=()=>{const mode=form.elements.mode.value;form.elements.interval.closest('label').hidden=mode!=='interval';root.querySelector('.rw-week-fields').hidden=mode!=='weekly';const preview=root.querySelector('[data-schedule-preview]');try{
        const cfg=copy(config()),chosen=slotId?[cabinetId]:[...form.querySelectorAll('[name=cabinetIds]:checked')].map(x=>x.value),v=Object.fromEntries(new FormData(form)),sch=slotId&&(v.inherit||v.noPlan)?null:ctx.readSchedule(form);let retained=0,updated=0;
        for(const c of cfg.cabinets.filter(c=>chosen.includes(c.id))){if(slotId){c.slotSchedules||={};if(v.inherit)delete c.slotSchedules[slotId];else c.slotSchedules[slotId]=v.noPlan?null:sch;updated++;}else{c.schedule=sch;const overrides=Object.keys(c.slotSchedules||{}).length;retained+=v.overwrite?0:overrides;updated+=c.levels.reduce((n,l)=>n+l.slots.length,0)-(v.overwrite?0:overrides);if(v.overwrite)c.slotSchedules={};}}
        const tasks=M.generateTasks(cfg,assignments(),snakes(),measurements(),records(),{from:dateNow(),to:dayPlus(dateNow(),366),plannedTasks:state.snapshot.planned_tasks||[]}).filter(t=>chosen.includes(t.cabinetId)&&(!slotId||t.slotId===slotId)&&new Date(t.dueAt||t.plannedAt)>=new Date()&&t.status==='pending').slice(0,8);
        preview.innerHTML=`<p>更新 ${updated} 格 · 保留 ${retained} 格独立计划</p>`+(tasks.map(t=>`<p>${esc(t.snakeId)} · ${esc(t.date+' '+t.time)} · ${t.mouseMin==null?'鼠重待确认':`${t.mouseMin}–${t.mouseMax}g`} × ${t.quantity??'待确认'} 只${t.locked?' · 已确认备料保持原值':''}</p>`).join('')||'<p>未来一年内没有可预览的在住蛇喂食任务。空柜计划仍可保存，入住后按计划生成。</p>');
      }catch(e){preview.textContent=e.message;}};
      form.elements.time.addEventListener('input',()=>{for(let i=1;i<=7;i++)if(form.elements['time'+i].value===oldTime)form.elements['time'+i].value=form.elements.time.value;oldTime=form.elements.time.value;});form.addEventListener('input',update);update();
    }
    let tour=null;
    function startTour(tasks,taskId){tour={tasks:tasks.filter(t=>['pending','offered'].includes(t.status)),index:0};const index=tour.tasks.findIndex(t=>t.id===taskId);if(index>0)tour.tasks=[...tour.tasks.slice(index),...tour.tasks.slice(0,index)];}
    function tourTasks(){return state.tasks.filter(t=>(state.view!=='cabinet'||t.cabinetId===state.cabinetId)&&(!state.selected.length||state.selected.includes(t.date))&&['pending','offered'].includes(t.status)).sort((a,b)=>a.plannedAt.localeCompare(b.plannedAt)||String(a.slotId||'').localeCompare(String(b.slotId||'')));}
    function decorateFeed(task,root){if(!tour||!tour.tasks.some(t=>t.id===task.id))tour={tasks:[task],index:0};else tour.index=tour.tasks.findIndex(t=>t.id===task.id);
      root.querySelector('.rw-form-body').insertAdjacentHTML('afterbegin',`<p class="rw-tour-progress">巡柜 ${tour.index+1} / ${tour.tasks.length} · ${esc(titleOfSlot(task.slotId))}</p>`);
      root.querySelector('.rw-dialog-foot').insertAdjacentHTML('afterbegin',`${tour.index?'<button type="button" class="rw-btn" data-tour-previous>上一条</button>':''}<button type="submit" class="rw-btn rw-primary" data-feed-next>保存并下一格</button>`);
      const previous=root.querySelector('[data-tour-previous]');if(previous)previous.onclick=()=>ctx.openFeed(tour.tasks[--tour.index]);
    }
    function advanceTour(task){if(!tour)return true;const next=tour.tasks.slice(tour.index+1).find(t=>!records().some(r=>r.snake_id===t.snakeId&&new Date(r.planned_at).getTime()===new Date(t.plannedAt).getTime()&&['fed','refused','skipped'].includes(r.result)));if(next)ctx.openFeed(next);else showDialog('本轮巡柜完成','<p>本轮所选任务均已登记；“已投喂”仍需后续确认进食，可从今日待办或巡柜列表继续。</p>',null);return false;}
    return {isIncubator,isEggs,eggs,attachSnakeSearch,slotNavigation,openBatchAssign,openIncubator,openEggSlot,moveEgg,clearEgg,incubationSummary,protectIncubations,dailyMarkup,daily,attachSchedulePreview,decorateFeed,advanceTour,startTour,tourTasks};
  }};
})();
