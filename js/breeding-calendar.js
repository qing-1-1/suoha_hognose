/* Date-only reminders: no guessed biological intervals and no public data. */
(() => {
  const day=value=>Date.parse(String(value).slice(0,10)+'T00:00:00Z');
  const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  function reminders(plans,today){
    const tasks=[];
    for(const p of plans){
      if(!p.reminders_enabled||['cancelled','completed'].includes(p.status)||['pending','returned','rejected'].includes(p.review_status))continue;
      const events=(p.events||[]).filter(e=>e.status!=='cancelled'),clutches=p.clutches||[],last=(p.events||[]).at(-1);
      const add=(stage,date,clutch=null)=>{if(!date||!Number.isFinite(day(date)))return;const days=Math.round((day(date)-day(today))/86400000);if(days<=Number(p.reminder_days??3))tasks.push({key:`${p.id}:${stage}:${clutch?.id||''}:${date}`,plan:p.id,title:p.title,parents:`${p.female||'待定'} × ${p.male||'待定'}`,stage,date,days,clutch:clutch?.id||null});};
      if(!events.some(e=>e.date&&(!p.expected_pairing_date||e.date>=p.expected_pairing_date)))add('交配',p.expected_pairing_date);
      if(!clutches.some(c=>c.laid)&&!['unsuccessful','cancelled'].includes(last?.status))add('产蛋',p.expected_laying_date);
      if(clutches.length){for(const c of clutches)if(c.status==='incubating'&&!c.hatch_start)add('出壳',c.expected_hatch||p.expected_hatching_date,c);}
      else if(!['unsuccessful','cancelled'].includes(last?.status))add('出壳',p.expected_hatching_date);
    }
    return tasks.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
  }
  if(typeof module!=='undefined')module.exports={reminders};
  if(typeof document==='undefined')return;
  let plans=[],error='',epoch=0,loading=false,loaded=false,pending=[],stageFilter='',monthFilter='';
  const stageOf=p=>{const cs=p.clutches||[],es=(p.events||[]).filter(e=>e.status!=='cancelled');if(cs.some(c=>c.status==='incubating'))return 'incubating';if(cs.length&&cs.every(c=>['hatched','failed','archived'].includes(c.status)))return 'finished';if(es.at(-1)?.status==='unsuccessful')return 'unsuccessful';return es.length?'paired':'planned';};
  const labels={paired:'已配对，待确认',observed_copulation:'观察到交配',successful:'交配成功',unsuccessful:'交配未成功',cancelled:'已取消'};
  const date=value=>value||'未记录';
  const button=(label,action,id,extra='')=>`<button class="ws-action" data-calendar-action="${action}" data-id="${esc(id)}" ${extra}>${label}</button>`;
  const dialog=document.createElement('dialog');dialog.className='ws-dialog breeding-reminder-dialog';dialog.setAttribute('aria-labelledby','breedingReminderTitle');document.body.appendChild(dialog);
  let focusOrigin=null;
  const storageKey=()=>`suoha.breeding.reminders.${currentUser?.id}.${localDate()}`;
  function dismissed(){try{return JSON.parse(localStorage.getItem(storageKey())||'[]');}catch{return [];}}
  function dismiss(){try{localStorage.setItem(storageKey(),JSON.stringify([...new Set([...dismissed(),...pending.map(t=>t.key)])]));}catch{}pending=[];}
  dialog.addEventListener('close',()=>{dismiss();focusOrigin?.focus();});
  function showReminder(force=false){
    if(!loaded||!currentUser||state.page!=='overview'||dialog.open||document.querySelector('dialog[open],.modalBackdrop.open'))return;
    const hidden=new Set(dismissed()),tasks=reminders(plans,localDate()).filter(t=>force||!hidden.has(t.key));if(!tasks.length)return;
    pending=tasks;focusOrigin=document.activeElement;
    dialog.innerHTML=`<div class="ws-dialog-head"><div><p class="eyebrow">BREEDING CALENDAR</p><h2 id="breedingReminderTitle">繁育日程提醒 · ${tasks.length} 项</h2><p>这是你设置的预计日期，请核实实际情况后记录。日期到达不会自动认定成功。</p></div></div><div class="ws-list">${tasks.map(t=>`<div class="ws-list-row"><div><b>${esc(t.title)} · 预计${t.stage}</b><small>${esc(t.parents)} · ${t.date}${t.clutch?' · 窝次 #'+t.clutch:''}</small></div><span class="inventory-badge ${t.days<0?'available':''}">${t.days<0?'已过期 '+(-t.days)+' 天':t.days===0?'今天到期':'还有 '+t.days+' 天'}</span>${button('去记录','visit',t.plan,`data-stage="${t.stage}" data-clutch="${t.clutch||''}"`)}</div>`).join('')}</div><div class="ws-actions" style="margin-top:22px"><button class="ws-action primary" data-calendar-dismiss>今天不再提醒</button></div>`;
    dialog.querySelector('[data-calendar-dismiss]').onclick=()=>dialog.close();dialog.showModal();
  }
  function milestones(plan){
    const events=(plan.events||[]).filter(e=>e.status!=='cancelled'),clutches=plan.clutches||[];
    const actual=[events.map(e=>e.date),clutches.map(c=>c.laid),clutches.map(c=>c.hatch_start)];
    const due=new Set(reminders([plan],localDate()).map(t=>t.stage));
    return [['交配',plan.expected_pairing_date],['产蛋',plan.expected_laying_date],['出壳',plan.expected_hatching_date]].map(([stage,expected],i)=>{
      const dates=actual[i].filter(Boolean).sort(),recorded=dates.length>0;
      return `<div class="${recorded?'recorded':due.has(stage)?'due':'planned'}"><span>预计${stage}</span><b>${esc(date(expected))}</b><small>${recorded?'实录 '+esc(dates[0])+(dates.length>1?' 等 '+dates.length+' 条':''):due.has(stage)?'待核实进度':'尚未记录'}</small></div>`;
    }).join('');
  }
  function render(){
    if(!currentUser||!currentProfile?.active)return;
    const overview=document.getElementById('workspaceOverview');overview.querySelector('#breedingReminderSummary')?.remove();
    const tasks=reminders(plans,localDate()),summary=document.createElement('div');summary.id='breedingReminderSummary';summary.className='ws-panel breeding-summary';
    summary.innerHTML=`<div><h2>繁育日程</h2><p class="ws-note">${error?'日程暂不可用，请确认 025 迁移并刷新。':!loaded?'正在读取日程…':tasks.length?`${tasks.length} 项临近或已到预计日期，待核实记录。`:'暂无临近的预计日程。可在年度计划设置提醒日期。'}</p></div><div class="ws-actions">${tasks.length?button('查看提醒','reminders',''):''}${button('查看繁育计划','plans','')}${canWrite()?button('新增计划','new',''):''}</div>`;
    overview.querySelector('.ws-greeting')?.after(summary);
    let host=document.getElementById('breedingCalendar');if(!host){host=document.createElement('div');host.id='breedingCalendar';host.className='ws-panel';document.querySelector('#page-production .pageHead').after(host);}
    const rows=plans.filter(p=>Number(p.year)===Number(state.year)&&(!stageFilter||stageOf(p)===stageFilter)&&(!monthFilter||[p.expected_pairing_date,p.expected_laying_date,p.expected_hatching_date,...(p.events||[]).map(e=>e.date),...(p.clutches||[]).flatMap(c=>[c.laid,c.hatch_start,c.expected_hatch])].some(d=>d?.slice(5,7)===monthFilter)));
    host.innerHTML=`<div class="ws-heading"><div><h2>繁育计划与实际进度</h2><p class="ws-note">预计时间与真实记录分开。记录交配结果，再关联窝次；每窝可单独调整预计出壳日。</p></div>${canWrite()?button('新增繁育计划','new',''):''}</div>${error?'<p class="ws-alert">日程读取失败，请检查 025 迁移或刷新重试。</p>':''}<div class="calendar-filters"><label>计划阶段<select data-calendar-filter="stage" aria-label="繁育计划阶段">${[['','全部阶段'],['planned','待配种'],['paired','已交配 / 待产蛋'],['incubating','孵化中'],['finished','窝次已结束'],['unsuccessful','交配未成功']].map(([v,l])=>`<option value="${v}" ${stageFilter===v?'selected':''}>${l}</option>`).join('')}</select></label><label>相关月份<select data-calendar-filter="month" aria-label="繁育计划月份"><option value="">全年</option>${Array.from({length:12},(_,i)=>{const v=String(i+1).padStart(2,'0');return `<option value="${v}" ${monthFilter===v?'selected':''}>${i+1} 月</option>`;}).join('')}</select></label><span class="ws-note">${rows.length} 个计划 · 月份匹配预计或实际日期</span></div><div class="breeding-calendar-grid">${rows.map(p=>`<article class="breeding-calendar-card" id="calendar-plan-${p.id}"><h3>${esc(p.title)}</h3><p class="ws-note">${esc(p.female||'母本待定')} × ${esc(p.male||'公本待定')} · 提前 ${p.reminder_days??3} 天提醒 · ${p.reminders_enabled?'提醒开启':'提醒关闭'}</p><div class="calendar-milestones">${milestones(p)}</div><div class="ws-list">${(p.events||[]).map(e=>`<div class="ws-list-row"><div><b>${labels[e.status]||esc(e.status)}</b><small>交配日 ${date(e.date)}</small></div>${canWrite()?button('更新交配结果','event',e.id)+button('记录产蛋','lay',e.id):''}</div>`).join('')||'<p class="ws-note">尚未记录实际交配。</p>'}${(p.clutches||[]).map(c=>`<div class="ws-list-row"><div><b>${esc(c.code||'窝次 #'+c.id)}</b><small>产蛋 ${date(c.laid)} · 开始出壳 ${date(c.hatch_start)} · 结束 ${date(c.hatch_end)}<br>本窝预计出壳 ${date(c.expected_hatch||p.expected_hatching_date)}</small></div>${canWrite()?button('更新出壳记录','clutch',c.id):''}</div>`).join('')}</div><div class="ws-actions">${canWrite()?button('编辑计划','edit',p.id)+button('记录交配','pair',p.id):''}</div></article>`).join('')||'<div class="ws-empty">本年度暂无繁育日程。点击新增繁育计划，设置亲本、预计日期和提醒。</div>'}</div>`;
    host.querySelectorAll('[data-calendar-filter]').forEach(select=>select.onchange=()=>{stageFilter=host.querySelector('[data-calendar-filter=stage]').value;monthFilter=host.querySelector('[data-calendar-filter=month]').value;render();});
    window.dispatchEvent(new Event('suoha:calendar'));
  }
  async function load(){if(!currentUser||!currentProfile?.active)return;const own=++epoch;loading=true;try{const result=await sb.rpc('breeding_calendar');if(own!==epoch)return;if(result.error||!Array.isArray(result.data))throw new Error('unavailable');plans=result.data;error='';loaded=true;}catch{if(own!==epoch)return;error='unavailable';loaded=false;}finally{if(own===epoch){loading=false;render();}}}
  document.addEventListener('click',async event=>{const b=event.target.closest('[data-calendar-action]');if(!b)return;const action=b.dataset.calendarAction,id=Number(b.dataset.id);if(action==='reminders')return window.SuohaReminders?.open();if(action==='plans')return setPage('production');if(action==='visit'){const plan=plans.find(p=>Number(p.id)===id),taskStage=b.dataset.stage,clutchId=b.dataset.clutch;dialog.close();setPage('production');if(!canWrite())return;try{if(taskStage==='交配')await window.SuohaWorkspace.recordPlan(id);else if(clutchId)await window.SuohaWorkspace.editClutch(Number(clutchId));else{const event=(plan?.events||[]).filter(e=>!['cancelled','unsuccessful'].includes(e.status)).at(-1);if(event)await window.SuohaWorkspace.editClutch(null,event.id);else document.getElementById('calendar-plan-'+id)?.scrollIntoView({block:'center'});}}catch(e){toast(e.message||'记录表单暂不可用',true);}return;}if(!canWrite())return;b.disabled=true;try{if(action==='new')openPlanForm();if(action==='edit')openPlanForm(id);if(action==='pair')await window.SuohaWorkspace.recordPlan(id);if(action==='event')await window.SuohaWorkspace.editEvent(id);if(action==='lay')await window.SuohaWorkspace.editClutch(null,id);if(action==='clutch')await window.SuohaWorkspace.editClutch(id);}catch(e){toast(e.message||'读取失败，请刷新重试',true);}finally{b.disabled=false;}});
  window.SuohaCalendar={snapshot:()=>({plans,error,loaded}),reminders};
  const previous=window.SuohaWorkspace.render;window.SuohaWorkspace.render=function(){previous();render();};
  addEventListener('suoha:data',load);addEventListener('suoha:listings',load);
  addEventListener('suoha:logout',()=>{epoch++;plans=[];loaded=false;loading=false;pending=[];dialog.close();document.getElementById('breedingCalendar')?.remove();});
  setInterval(()=>{if(document.visibilityState==='visible'&&currentUser&&!loading)load();},60000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&currentUser&&!loading)load();});
  if(currentUser)load();
})();
