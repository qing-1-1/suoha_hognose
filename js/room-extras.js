/* Editors and previews for the private room workspace. */
(() => {
  'use strict';
  window.SuohaRoomExtras = {create(ctx) {
    const {M,D,state,config,snakes,measurements,assignments,records,cabinet,slotInfo,titleOfSlot,days,dateNow,copy,esc,field,select,btn,showDialog,saveConfig,write,syncPlans,toast}=ctx;
    const L=window.SuohaRoomLabels;
    const textArea=(label,name,value,extra='')=>`<label class="rw-field">${label}<textarea name="${name}" ${extra}>${esc(value)}</textarea></label>`;
    const slotName=id=>id?titleOfSlot(id):'待定位';
    function labelValues(slotId) {
      const snake=snakes().find(s=>s.id===assignments().find(a=>a.slot_id===slotId)?.snake_id),w=snake?M.latestWeight(snake.id,measurements()):null;
      const winter=slotInfo(slotId)?.c.type==='incubator',mouse=w&&!winter?M.matchMouse(w.weight,config().rules,snake?.sex):null;
      const task=state.tasks.filter(t=>t.snakeId===snake?.id&&t.status==='pending').sort((a,b)=>a.dueAt.localeCompare(b.dueAt))[0];
      return {id:snake?.id||'空盒',sex:({M:'公',F:'母',U:'性别待确认'})[snake?.sex]||'—',gene:snake?.gene_text||'—',weight:w?`${w.weight}g`:'待称重',mouse:winter?'冬化暂停喂食':task?task.mouseMin==null?'鼠重待确认':`${task.mouseMin}–${task.mouseMax}g`:mouse?`${mouse.mouseMin}–${mouse.mouseMax}g`:'鼠重待确认',next:winter?'移出后恢复排期':task?`${task.date} ${task.time}`:'暂无计划',note:config().slotNotes?.[slotId]||''};
    }
    function labelDetail(slotId) {
      const info=slotInfo(slotId),template=info?.c.labelTemplate||config().labelTemplate;
      const label=L.renderLabel({template,labels:config().labels,values:labelValues(slotId)});
      const active=(state.snapshot.rule_versions||[]).find(v=>v.id===state.snapshot.active_rule_version_id);
      return `<div class="rw-label-preview" style="text-align:${label.align};font-size:${label.fontSize}px" aria-label="完整盒面标签">${label.lines.map(line=>`<div>${esc(line)}</div>`).join('')}</div>${active?`<p class="rw-muted">当前规则：V${active.version} · ${esc(active.name)}。已确认备料以批次快照为准。</p>`:''}`;
    }
    function openLabels(targetId=null) {
      const cfg=config(),target=cabinet(targetId),template=copy(target?.labelTemplate||cfg.labelTemplate||L.defaultTemplate());
      const scopeOptions=[['','房间默认'],...cfg.cabinets.map(c=>[c.id,c.name])];
      showDialog('盒面标签模板',`${select('模板作用范围','scope',scopeOptions,targetId||'')}<p class="rw-muted">每行可自由排序和添加文字。可用字段：{{id}} 编号、{{sex}} 性别、{{gene}} 基因、{{weight}} 体重、{{mouse}} 鼠重、{{next}} 下次喂食、{{note}} 格位备注。内容按文字显示。</p><div class="rw-form-grid">${field('模板名称','name',template.name,'text','required maxlength="80"')}${field('字号 px','fontSize',template.fontSize,'number','min="10" max="20" step="1" required')}${select('文字对齐','align',[['left','左对齐'],['center','居中'],['right','右对齐']],template.align)}</div>${textArea('模板内容（每行一条，最多 6 行）','lines',template.lines.join('\n'),'rows="6" required')}<label class="rw-check"><input type="checkbox" name="inherit" ${target&&!target.labelTemplate?'checked':''}>当前柜恢复继承房间模板</label><h3>实时预览</h3><div data-label-preview></div>`,async form=>{
        const v=Object.fromEntries(new FormData(form)),next=copy(config());
        const template=readTemplate(form),validation=L.validateTemplate(template);
        if(!validation.valid)throw Error(validation.errors.join('；'));
        if(v.scope){const c=next.cabinets.find(x=>x.id===v.scope);if(!c)throw Error('所选柜体已不存在。');c.labelTemplate=v.inherit?null:template;}else next.labelTemplate=template;
        if(state.draft)ctx.editConfig(next);else await saveConfig(next);
      },'保存标签模板',root=>{
        const form=root.querySelector('form'),preview=root.querySelector('[data-label-preview]');
        const update=()=>{const template=readTemplate(form),validation=L.validateTemplate(template);
          const values=[['有蛇盒',{id:'示例 A01',sex:'母',gene:'白化 · 康达',weight:'45g',mouse:'4–6g',next:'周五 18:00',note:'上层观察位'}],['长基因／手机窄屏',{id:'示例 B02',sex:'公',gene:'白化 · 康达 · 可能携带其他基因（待核实）',weight:'160g',mouse:'16–20g',next:'周一 18:00',note:'自定义短备注'}],['空盒',{id:'空盒',note:'预留位置'}]];
          preview.innerHTML=validation.valid?`<div class="rw-label-samples">${values.map(([name,v],i)=>{const label=L.renderLabel({template,values:v});return `<section><p class="rw-muted">${name}</p><div class="rw-label-preview${i===1?' rw-label-narrow':''}" style="font-size:${label.fontSize}px;text-align:${label.align}">${label.lines.map(x=>`<div>${esc(x)}</div>`).join('')}</div></section>`;}).join('')}</div>`:`<p role="alert">${esc(validation.errors.join('；'))}</p>`;
          form.elements.inherit.closest('label').hidden=!form.elements.scope.value;
        };
        form.elements.scope.onchange=()=>{const selected=cabinet(form.elements.scope.value),t=selected?.labelTemplate||config().labelTemplate||L.defaultTemplate();for(const k of ['name','fontSize','align'])form.elements[k].value=t[k];form.elements.lines.value=t.lines.join('\n');form.elements.inherit.checked=!!selected&&!selected.labelTemplate;update();};
        form.addEventListener('input',e=>{if(e.target.name!=='inherit'&&e.target.name!=='scope')form.elements.inherit.checked=false;update();});update();
      });
    }
    function readTemplate(form){return {name:form.elements.name.value.trim(),lines:form.elements.lines.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),fontSize:+form.elements.fontSize.value,align:form.elements.align.value};}
    function openNote(slotId) {
      if(!slotInfo(slotId))return;
      showDialog('格位标签备注',`<p>${esc(titleOfSlot(slotId))}</p>${textArea('格位备注','note',config().slotNotes?.[slotId]||'','maxlength="300" rows="3"')}<p class="rw-muted">备注跟随格位保留。模板中的 {{note}} 会显示这段文字。</p>`,async form=>{const next=copy(state.snapshot.config),note=form.elements.note.value.trim();next.slotNotes||={};if(note)next.slotNotes[slotId]=note;else delete next.slotNotes[slotId];await ctx.saveBusinessConfig(next);},'保存备注');
    }
    function scheduleText(s) {
      if(!s)return '未安排喂食';
      const timing=s.mode==='weekly'?(s.weekdays||[]).map(d=>`周${['一','二','三','四','五','六','日'][d-1]} ${s.times?.[d]||s.time}`).join('、'):`从 ${s.start} 起每 ${s.interval} 天 ${s.time}`;
      return `${s.paused?'已暂停 · ':''}${timing} · 每次 ${s.quantity??'待确认'} 只`;
    }
    const taskText=t=>`${t.date} ${t.time} · ${t.mouseMin==null?'鼠重待确认':`${t.mouseMin}–${t.mouseMax}g`} × ${t.quantity??'待确认'}`;
    function previewMarkup(preview) {
      if(preview.errors?.length)return `<p role="alert">${esc(preview.errors.join('；'))}</p>`;
      const schedule=(a,key)=>`${a[key+'Info']?.cabinetPaused?'整柜暂停 · ':''}${scheduleText(a[key])}`;
      return `<p class="rw-muted">预览范围：${days()[0]}—${days()[6]}。已投喂及实际记录保持原身份，已确认批次保留备料快照。</p>${preview.affected.map(a=>`<section class="rw-move-person"><h3>${esc(a.snakeId)} · ${esc(slotName(a.fromSlotId))} → ${esc(slotName(a.toSlotId))}</h3><div class="rw-move-compare"><div><b>移动前</b><p>${esc(schedule(a,'beforeSchedule'))}</p>${a.beforeTasks.map(t=>`<p>${esc(taskText(t))}</p>`).join('')||'<p>本周无计划</p>'}</div><div><b>移动后</b><p>${esc(schedule(a,'afterSchedule'))}</p>${a.afterTasks.map(t=>`<p>${esc(taskText(t))}</p>`).join('')||'<p>本周无计划</p>'}</div></div></section>`).join('')}<p class="rw-muted">新增 ${preview.addedTasks.length} 次 · 移除 ${preview.removedTasks.length} 次 · 变化 ${preview.changedTasks.length} 次</p>${(preview.warnings||[]).map(w=>`<p class="rw-alert">${esc(w)}</p>`).join('')}`;
    }
    function openMove(snakeId,sourceSlot=null,wholeBox=false) {
      const a=assignments().find(a=>a.snake_id===snakeId),source=sourceSlot||a?.slot_id;
      const options=[['','移出至待定位'],...state.snapshot.config.cabinets.filter(c=>!(c.type==='incubator'&&(wholeBox||c.purpose==='eggs'))).flatMap(c=>c.levels.flatMap(l=>l.slots.filter(s=>s.id!==source&&ctx.slotReady(s.id)).map(s=>[s.id,`${titleOfSlot(s.id)} · ${assignments().find(a=>a.slot_id===s.id)?.snake_id||'空盒'}`])))];
      showDialog(wholeBox?'整盒移动':`安排 ${snakeId}`,`<p>当前位置：${esc(slotName(source))}</p><p class="rw-muted">可直接入住已有格位。新建或结构已变更的格位应用布局后才会列入。</p><div class="rw-form-grid">${select('目标格位','target',wholeBox?options.filter(x=>x[0]):options,'')}${select('到达后的排期','scheduleMode',[['inherit','采用目标格计划'],['carry','将原计划带到目标格']],'inherit')}</div><label class="rw-check"><input type="checkbox" name="swap">目标有蛇时交换位置</label><h3>排期变化预览</h3><div data-move-preview aria-live="polite"></div>`,async form=>{
        const preview=compute(form);if(preview.errors.length)throw Error(preview.errors.join('；'));
        const v=Object.fromEntries(new FormData(form));
        if(wholeBox)await write(()=>D.moveBox(source,v.target,state.snapshot.revision,!!v.swap,v.scheduleMode));else await write(()=>D.assign(snakeId,v.target||null,state.snapshot.revision,!!v.swap,v.scheduleMode));
      },'保存位置',root=>{const form=root.querySelector('form'),update=()=>{const preview=compute(form);root.querySelector('[data-move-preview]').innerHTML=previewMarkup(preview);form.querySelector('[type=submit]').disabled=preview.errors.length>0;};form.addEventListener('change',update);update();});
      function compute(form){const v=Object.fromEntries(new FormData(form));return M.previewMove(state.snapshot,{snakeId,sourceSlotId:source,targetSlotId:v.target||null,wholeBox,swap:!!v.swap,scheduleMode:v.scheduleMode},snakes(),measurements(),{from:days()[0],to:days()[6]});}
    }
    function openRules() {
      const versions=state.snapshot.rule_versions||[],active=state.snapshot.active_rule_version_id;
      const row=r=>`<div class="rw-rule-row" data-rule-id="${esc(r.id||crypto.randomUUID())}"><input aria-label="蛇重下限（不含）" name="min" type="number" min="0" step="0.01" value="${r.min}" required><span>＜蛇重≤</span><input aria-label="蛇重上限（空为不限）" name="max" type="number" min="0.01" step="0.01" value="${r.max??''}"><span>→</span><input aria-label="鼠重下限" name="mouseMin" type="number" min="0.01" step="0.01" value="${r.mouseMin}" required><span>–</span><input aria-label="鼠重上限" name="mouseMax" type="number" min="0.01" step="0.01" value="${r.mouseMax}" required><span>g</span><button type="button" class="rw-btn" data-remove-rule aria-label="删除鼠重档位">×</button></div>`;
      showDialog('体重与鼠重规则',`<p class="rw-muted">每档包含上限、不包含下限；最后一档上限留空。启用版本只更新可调整的未来计划，实际记录和已确认备料保持原值。</p>${field('新版本名称','versionName',`鼠重规则 ${versions.length+1}`,'text','required maxlength="80"')}<div class="rw-rule-list">${config().rules.map(row).join('')}</div><div class="rw-actions"><button type="button" class="rw-btn" data-add-rule>添加档位</button><button type="button" class="rw-btn" data-rule-draft>保存为草稿版本</button></div><h3>启用影响预览</h3><div data-rule-impact aria-live="polite"></div><h3>版本记录</h3>${versions.length?`${select('已保存的规则版本','versionId',versions.map(v=>[v.id,`V${v.version} · ${v.name}${v.id===active?'（当前启用）':''}`]),active)}<div class="rw-actions"><button type="button" class="rw-btn" data-rule-inspect>预览此版本</button><button type="button" class="rw-btn" data-rule-activate>启用此版本</button></div><div data-version-detail></div>`:'<p class="rw-muted">首次保存后保留版本，可随时预览并重新启用。</p>'}`,async form=>{const rules=readRules(form);validateRules(rules);if(!state.snapshot.revision)await ctx.saveBusinessConfig(copy(state.snapshot.config));await syncPlans();await write(()=>D.saveRuleVersion(form.elements.versionName.value.trim(),rules,state.snapshot.revision,true));},'验证并启用规则',root=>{
        const form=root.querySelector('form'),impact=root.querySelector('[data-rule-impact]');
        const preview=()=>{try{const rules=readRules(form);validateRules(rules);impact.innerHTML=ruleImpact(rules);}catch(e){impact.innerHTML=`<p role="alert">${esc(e.message)}</p>`;}};
        root.querySelector('[data-add-rule]').onclick=()=>{root.querySelector('.rw-rule-list').insertAdjacentHTML('beforeend',row({min:200,max:null,mouseMin:20,mouseMax:24}));preview();};
        root.querySelector('.rw-rule-list').onclick=e=>{const button=e.target.closest('[data-remove-rule]');if(button){button.closest('.rw-rule-row').remove();preview();}};
        form.addEventListener('input',preview);
        root.querySelector('[data-rule-draft]').onclick=()=>perform(async()=>{if(!form.reportValidity())return;const rules=readRules(form);validateRules(rules);if(!state.snapshot.revision)await ctx.saveBusinessConfig(copy(state.snapshot.config));await write(()=>D.saveRuleVersion(form.elements.versionName.value.trim(),rules,state.snapshot.revision,false));openRules();});
        root.querySelector('[data-rule-inspect]')?.addEventListener('click',()=>{const v=versions.find(v=>v.id===form.elements.versionId.value);if(v)root.querySelector('[data-version-detail]').innerHTML=`<h3>V${v.version} · ${esc(v.name)}</h3>${ruleTable(v.rules)}${ruleImpact(v.rules)}`;});
        root.querySelector('[data-rule-activate]')?.addEventListener('click',()=>perform(async()=>{await syncPlans();await write(()=>D.activateRuleVersion(form.elements.versionId.value,state.snapshot.revision));openRules();}));
        preview();
        async function perform(fn){if(state.busy)return;try{await fn();}catch(e){root.querySelector('.rw-form-error').textContent=e.message;}}
      });
    }
    function readRules(form){return [...form.querySelectorAll('.rw-rule-row')].map(r=>({id:r.dataset.ruleId,...Object.fromEntries(['min','max','mouseMin','mouseMax'].map(k=>[k,r.querySelector(`[name=${k}]`).value===''?null:+r.querySelector(`[name=${k}]`).value]))}));}
    function validateRules(rules){const next=copy(config());next.rules=rules;const errors=M.validateConfig(next);if(errors.length)throw Error(errors.join('；'));}
    function ruleTable(rules){return `<div class="rw-table-scroll"><table class="rw-table"><thead><tr><th>蛇重 g</th><th>鼠重 g</th></tr></thead><tbody>${rules.map(r=>`<tr><td>${r.min}＜蛇重${r.max==null?'':`≤${r.max}`}</td><td>${r.mouseMin}–${r.mouseMax}</td></tr>`).join('')}</tbody></table></div>`;}
    function ruleImpact(rules) {
      const proposed=copy(state.snapshot.config);proposed.rules=rules;
      const options={from:days()[0],to:days()[6],plannedTasks:state.snapshot.planned_tasks||[]};
      const before=M.generateTasks(state.snapshot.config,assignments(),snakes(),measurements(),records(),options),after=M.generateTasks(proposed,assignments(),snakes(),measurements(),records(),options);
      const changed=after.filter(t=>{const old=before.find(b=>b.id===t.id);return old&&t.status==='pending'&&!t.locked&&new Date(t.dueAt)>new Date()&&(old.mouseMin!==t.mouseMin||old.mouseMax!==t.mouseMax);});
      const locked=before.filter(t=>t.locked).length;
      const summary=tasks=>{const s=M.summarize(tasks.filter(t=>new Date(t.dueAt)>new Date()));return s.groups.map(g=>`${g.mouseMin}–${g.mouseMax}g × ${g.quantity}只`).join('、')+(s.unknownCount?` · ${s.unknownCount}项待确认`:'')||'暂无已确认数量';};
      return `<p class="rw-muted">当前周 ${days()[0]}—${days()[6]}：${new Set(changed.map(t=>t.snakeId)).size} 条蛇、${changed.length} 次未来计划变化；${locked} 次已确认批次任务保留快照。</p><p>当前未来备料：${esc(summary(before))}</p><p>启用后未来备料：${esc(summary(after))}</p>${changed.length?`<div class="rw-table-scroll"><table class="rw-table"><thead><tr><th>蛇只／时间</th><th>当前鼠重</th><th>启用后鼠重</th></tr></thead><tbody>${changed.map(t=>{const b=before.find(x=>x.id===t.id);return `<tr><td>${esc(t.snakeId)} · ${esc(t.date)} ${esc(t.time)}</td><td>${b.mouseMin??'—'}–${b.mouseMax??'—'}g</td><td>${t.mouseMin??'—'}–${t.mouseMax??'—'}g</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="rw-muted">当前周没有需调整鼠重的未来计划。</p>'}`;
    }
    const batchProgress=batch=>{const items=batch.items||[],handled=items.filter(i=>i.record&&i.record.result!=='offered');return `${handled.length}/${items.length} 已处理 · ${items.filter(i=>i.record?.result==='fed').length} 进食 · ${items.filter(i=>i.record?.result==='refused').length} 拒食 · ${items.filter(i=>i.record?.result==='skipped').length} 跳过`;};
    function openBatches() {
      const batches=state.snapshot.batches||[];
      showDialog('备料批次',`<p class="rw-muted">备料数量由「喂食计划」的日期与每次只数自动汇总，在这里确认批次。按已保存的柜体与计划备料，未应用的布局不会被一并保存。确认批次会锁定所选任务的日期、鼠重和只数。逐项记录结果，关闭页面后可以继续同一批次。</p><button type="button" class="rw-btn rw-primary" data-new-batch>确认当前范围备料</button><div class="rw-batch-list">${batches.map(b=>`<article class="rw-task"><div><b>${esc(b.name)}</b><p>${esc(batchProgress(b))}</p><p class="rw-muted">${esc(new Date(b.confirmed_at).toLocaleString('zh-CN',{timeZone:config().timezone}))} · 已确认快照</p></div><button type="button" class="rw-btn" data-open-batch="${esc(b.id)}">继续巡柜</button></article>`).join('')||'<p class="rw-empty">尚未确认备料批次。</p>'}</div>`,null,'',root=>{root.querySelector('[data-new-batch]').onclick=openConfirmBatch;root.querySelectorAll('[data-open-batch]').forEach(b=>b.onclick=()=>openBatch(b.dataset.openBatch));});
    }
    function openConfirmBatch() {
      const tasks=M.preparationTasks(M.generateTasks(state.snapshot.config,assignments(),snakes(),measurements(),records(),{from:days()[0],to:days()[6],plannedTasks:state.snapshot.planned_tasks||[]}),state.snapshot.config,snakes(),measurements()).filter(t=>t.status==='pending'&&!t.locked&&(state.view!=='cabinet'||t.cabinetId===state.cabinetId)&&(!state.selected.length||state.selected.includes(t.date)));
      showDialog('确认备料批次',`${field('批次名称','name',`${state.view==='cabinet'?cabinet(state.cabinetId)?.name:'全房'} ${dateNow()} 备料`,'text','required maxlength="80"')}<p class="rw-muted">鼠重按最新有效称重估算，确认时重新核对；仅锁定勾选任务。缺少体重或只数的任务需先补齐，已确认的任务不会重复加入。</p><div class="rw-batch-picks">${tasks.map(t=>`<label class="rw-check"><input type="checkbox" name="tasks" value="${esc(t.id)}" ${t.mouseMin==null||!(t.quantity>0)?'disabled':'checked'}><span>${esc(t.snakeId)} · ${esc(taskText(t))}</span></label>`).join('')||'<p>当前范围没有可确认的新任务。</p>'}</div>`,async form=>{const ids=[...form.querySelectorAll('[name=tasks]:checked')].map(el=>el.value),keys=tasks.filter(t=>ids.includes(t.id)).map(t=>({snake_id:t.snakeId,planned_at:t.plannedAt}));if(!keys.length)throw Error('请至少选择一条已确认鼠重与只数的任务。');await syncPlans();await write(()=>D.confirmBatch(form.elements.name.value.trim(),keys,state.snapshot.revision));},'锁定并确认备料');
    }
    function openBatch(id) {
      const batch=(state.snapshot.batches||[]).find(b=>b.id===id);if(!batch)return;
      const groups=new Map();for(const item of batch.items){const key=`${item.mouse_min_g}–${item.mouse_max_g}g`;groups.set(key,(groups.get(key)||0)+item.quantity);}
      showDialog(batch.name,`<p>${esc(batchProgress(batch))}</p><p class="rw-muted">已确认鼠重与数量保留当时快照。位置变化只影响导航；实际投喂与备料不同须填写原因。</p><div class="rw-summary-groups">${[...groups].map(([range,qty])=>`<div class="rw-summary-row"><span>${range}</span><b>${qty} 只</b></div>`).join('')}</div><div class="rw-task-list">${batch.items.map(item=>{const a=assignments().find(a=>a.snake_id===item.snake_id);return `<article class="rw-task"><div><b>${esc(item.snake_id)}</b><p>${esc(slotName(a?.slot_id))} · ${item.mouse_min_g}–${item.mouse_max_g}g × ${item.quantity}</p><p>${({fed:'已进食',offered:'已投喂，待确认',refused:'拒食',skipped:'跳过'})[item.record?.result]||'待处理'}</p></div><button type="button" class="rw-btn" data-batch-item="${esc(item.id)}">${item.record?'查看／更正':'记录结果'}</button></article>`;}).join('')}</div>`,null,'',root=>root.querySelectorAll('[data-batch-item]').forEach(button=>button.onclick=()=>{
        const item=batch.items.find(i=>i.id===button.dataset.batchItem),tasks=batch.items.map(i=>{const day=M.localDate(i.due_at||i.planned_at,config().timezone);return M.generateTasks(config(),assignments(),snakes(),measurements(),records(),{from:day,to:day,plannedTasks:state.snapshot.planned_tasks||[]}).find(t=>t.snakeId===i.snake_id&&new Date(t.plannedAt).getTime()===new Date(i.planned_at).getTime());}).filter(Boolean);
        const task=tasks.find(t=>t.snakeId===item.snake_id&&new Date(t.plannedAt).getTime()===new Date(item.planned_at).getTime());
        if(task){ctx.startTour(tasks,task.id);ctx.openFeed(task);}else toast('此批次任务暂无法读取，请刷新后重试。',true);
      }));
    }
    return {openLabels,openNote,labelDetail,openMove,openRules,openBatches};
  }};
})();
