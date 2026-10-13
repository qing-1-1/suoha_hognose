/* Private room controls. Geometry, recurrence and durable writes have separate owners. */
(() => {
  'use strict';
  const M = window.SuohaRoomModel, D = window.SuohaRoomData;
  const host = document.getElementById('workspaceRoom');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = v => JSON.parse(JSON.stringify(v));
  const uid = () => crypto.randomUUID();
  const weekdays = ['一','二','三','四','五','六','日'];
  const state = {snapshot:null,draft:null,build:false,view:'plan',cabinetId:null,selected:[],hover:null,week:null,loaded:false,loading:false,error:'',busy:false,undo:[],redo:[],epoch:0,tasks:[],selectedSlot:null};
  let scene = null, dialogOrigin = null, hoverTimer, initialized = false, overviewScroll = 0, overviewView = 'plan', dialogOriginSelector = null;
  const dialog = document.createElement('dialog'); dialog.id = 'roomDialog'; dialog.className = 'rw-dialog'; document.body.append(dialog);
  const config = () => state.draft || state.snapshot?.config || M.defaultConfig();
  const snakes = () => typeof REMOTE_RAW !== 'undefined' ? REMOTE_RAW.snakes || [] : [];
  const measurements = () => window.SuohaWorkspace?.snapshot().measurements || [];
  const assignments = () => state.snapshot?.assignments || [];
  const records = () => state.snapshot?.records || [];
  const cabinet = id => config().cabinets.find(c => c.id === id);
  const activeCabinet = () => cabinet(state.cabinetId);
  const dateNow = () => M.localDate(new Date(), config().timezone || 'Asia/Shanghai');
  const days = () => M.weekDates(state.week || dateNow(), config().timezone);
  const slotInfo = slotId => { for (const c of config().cabinets) for (const [li,l] of c.levels.entries()) for (const [ci,s] of l.slots.entries()) if (s.id === slotId) return {c,l,s,li,ci}; return null; };
  const scheduleLabel = (c,id) => Object.prototype.hasOwnProperty.call(c.slotSchedules||{},id) ? (c.slotSchedules[id] ? '本格独立计划' : '本格未安排喂食') : '继承柜计划';
  const occupant = id => assignments().find(a => a.slot_id === id);
  const titleOfSlot = id => { const x = slotInfo(id); return x ? `${x.c.name} · L${x.li+1} / ${x.ci+1}` : '待定位'; };
  const btn = (text, action, extra = '', primary = false) => `<button type="button" class="rw-btn${primary?' rw-primary':''}" data-rw="${action}" ${extra}>${text}</button>`;
  const field = (label,name,value='',type='text',extra='') => `<label class="rw-field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const select = (label,name,options,value) => `<label class="rw-field">${label}<select name="${name}" aria-label="${esc(label)}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
  const formValues = form => Object.fromEntries(new FormData(form));
  const rangeLabel = () => state.selected.length ? state.selected.map(x=>x.slice(5)).join('、') : `本周 ${days()[0].slice(5)}—${days()[6].slice(5)}`;
  const draftKey = () => `suoha.room.draft.${currentUser?.id || 'none'}`;
  function rememberDraft() { try { if(state.draft) sessionStorage.setItem(draftKey(),JSON.stringify({revision:state.snapshot?.revision||0,config:state.draft})); else sessionStorage.removeItem(draftKey()); } catch {} }
  function editConfig(next) { pruneSlotNotes(next);state.undo.push(copy(config())); state.redo=[];state.draft=next;state.build=true;rememberDraft();paint(); }
  function pruneSlotNotes(next) {if(next.slotNotes){const slots=new Set(next.cabinets.flatMap(c=>c.levels.flatMap(l=>l.slots.map(s=>s.id))));next.slotNotes=Object.fromEntries(Object.entries(next.slotNotes).filter(([id])=>slots.has(id)));}}
  function requireErrors(next) { const errors=M.validateConfig(next);if(errors.length)throw Error(errors.map(e=>typeof e==='string'?e:e.message||JSON.stringify(e)).join('；')); }
  function protectSlots(next) {
    const valid = new Map(next.cabinets.flatMap(c=>c.levels.flatMap(l=>l.slots.map(s=>[s.id,s.box_id]))));
    for(const a of assignments()){const old=slotInfo(a.slot_id);if(!valid.has(a.slot_id)||valid.get(a.slot_id)!==old?.s.box_id)throw Error(`${titleOfSlot(a.slot_id)} 仍有 ${a.snake_id}，请先实际转移后再移除。`);}
  }
  async function load(force=false) {
    if(state.loading||!canWrite()||!currentUser)return;
    state.loading=true;state.error='';paint();const epoch=state.epoch,user=currentUser.id;
    try {
      const [snap] = await Promise.all([D.load(),window.SuohaWorkspace.load()]);
      if(epoch!==state.epoch||currentUser?.id!==user)return;
      if(!snap||!Number.isInteger(Number(snap.revision)))throw Error('爬房响应不完整，请检查数据库迁移与权限。');
      state.snapshot=snap;state.snapshot.config ||= M.defaultConfig();state.loaded=true;
      if(!force&&!state.draft)try{const saved=JSON.parse(sessionStorage.getItem(draftKey())||'null');if(saved&&saved.revision===snap.revision){state.draft=saved.config;state.build=true;}else if(saved)state.error='旧布局草稿版本已过期，当前已加载实际布局。';}catch{}
      if(snap.revision>0)await syncPlans();
    }catch(e){if(epoch===state.epoch)state.error=e.message||'爬房读取失败。';}
    finally{if(epoch===state.epoch){state.loading=false;paint();}}
  }
  async function write(operation) {
    if(state.busy)throw Error('正在保存，请稍候。');
    state.busy=true;paintStatus();const epoch=state.epoch;
    try{const result=await operation();if(epoch!==state.epoch)throw Error('登录状态已改变。');state.snapshot=result;state.loaded=true;try{await syncPlans();}catch(e){state.error='操作已保存，备料同步待重试：'+e.message;}return state.snapshot;}
    finally{state.busy=false;if(epoch===state.epoch)paint();}
  }
  async function syncPlans() {
    if(!D.syncPlans||!state.snapshot?.revision)return;
    const ds=days(),tasks=M.generateTasks(state.snapshot.config,assignments(),snakes(),measurements(),records(),{from:ds[0],to:ds[6],plannedTasks:state.snapshot.planned_tasks||[]});
    const payload=tasks.filter(t=>t.status==='pending'&&t.plannedAt&&assignments().some(a=>a.snake_id===t.snakeId&&a.slot_id===t.slotId)).map(t=>({snake_id:t.snakeId,slot_id:t.slotId,cabinet_id:t.cabinetId,planned_at:t.plannedAt,due_at:t.dueAt||t.plannedAt,mouse_min_g:t.mouseMin,mouse_max_g:t.mouseMax,quantity:t.quantity,warnings:t.warnings||[]}));
    state.snapshot=await D.syncPlans(payload,ds[0],ds[6],state.snapshot.revision);
  }
  async function saveConfig(next) { pruneSlotNotes(next);requireErrors(next);protectSlots(next);await syncPlans();await write(()=>D.save(next,state.snapshot.revision));state.draft=null;state.build=false;state.undo=[];state.redo=[];rememberDraft();try{await syncPlans();}catch(e){state.error='设置已保存，备料同步待重试：'+e.message;}paint(); }
  function paintStatus() { const el=host.querySelector('[data-rw-status]');if(el)el.textContent=!state.loaded?(state.error?'读取失败':'正在连接…'):state.busy?'正在保存…':state.draft?'布局草稿 · 尚未应用':state.error?'同步待确认':'已同步'; }
  function setup() {
    if(initialized)return;initialized=true;
    host.innerHTML=`<div class="rw-workspace"><div class="rw-header" data-rw-header></div><div data-rw-message></div><div class="rw-week-strip" data-rw-week></div><div class="rw-toolbar" data-rw-toolbar></div><div data-rw-top-summary></div><div class="rw-body"><div class="rw-main"><div class="rw-canvas" data-rw-canvas></div><div class="rw-scene-caption" data-rw-caption></div></div><aside class="rw-aside" data-rw-aside aria-label="各柜备料"></aside></div></div>`;
    scene=new window.SuohaRoomScene(host.querySelector('[data-rw-canvas]'),{
      onCabinet:id=>focusCabinet(typeof id==='object'?id.id:id),onSlot:id=>openSlot(typeof id==='object'?id.id:id),
      onMove:move=>{if(!state.build)return;const next=copy(config()),c=next.cabinets.find(c=>c.id===move.cabinetId);if(!c)return;Object.assign(c,{x:Math.round(move.x),z:Math.round(move.z)});if(move.rotation!=null)c.rotation=move.rotation;try{requireErrors(next);editConfig(next);}catch(e){toast(e.message,true);paintScene();}},
      onViewChange:change=>{const view=typeof change==='string'?change:change?.view;if(view&&view!==state.view){state.view=view;if(change?.cabinetId)state.cabinetId=change.cabinetId;paint();}}
    });
  }
  function updateTasks() {
    if(!state.loaded){state.tasks=[];return;}
    const ds=days();state.tasks=M.generateTasks(config(),assignments(),snakes(),measurements(),records(),{from:ds[0],to:ds[6],plannedTasks:state.snapshot?.planned_tasks||[]});
  }
  function paint() {
    if(typeof currentUser==='undefined'||!currentUser||state.page==='none')return;
    if(!canWrite()){host.textContent='仅授权编辑成员可使用爬房工作台。';return;}
    const focusedDate=host.contains(document.activeElement)?document.activeElement?.dataset.rwDate:null;
    const focusedControl=host.contains(document.activeElement)&&!document.activeElement.closest('[data-rw-canvas]')?focusSelector(document.activeElement):null;
    setup();updateTasks();
    host.querySelector('.rw-workspace').classList.toggle('is-cabinet',state.view==='cabinet');
    const c=activeCabinet(), cfg=config(), slots=cfg.cabinets.flatMap(c=>c.levels.flatMap(l=>l.slots));
    const nextTask=state.tasks.filter(t=>t.status==='pending'&&new Date(t.dueAt||t.plannedAt)>new Date()).sort((a,b)=>String(a.dueAt||a.plannedAt).localeCompare(String(b.dueAt||b.plannedAt)))[0];
    const lastRecord=records().at(-1);
    host.querySelector('[data-rw-header]').innerHTML=`<div><p class="eyebrow">ROOM STUDIO / 爬房工作台</p><h1>${esc(c&&state.view==='cabinet'?c.name:cfg.name||'我的爬房')}</h1><p class="rw-muted">${cfg.cabinets.length} 个爬柜 · ${assignments().length} 条已定位 · ${slots.length} 个格位 <span data-rw-status></span></p><div class="rw-feed-overview"><span>本次查看：${esc(rangeLabel())}</span><span>下次待喂：${nextTask?esc(nextTask.date+' '+nextTask.time):'当前周暂无'}</span><span>最近记录：${lastRecord?esc(new Date(lastRecord.occurred_at).toLocaleString('zh-CN',{timeZone:cfg.timezone})): '暂无'}</span></div></div><div class="rw-actions">${btn('房间设置','room-settings')}${btn('鼠重规则','rules')}${btn('标签','labels')}${btn('备料批次','batches')}${btn('刷新','refresh')}</div>`;
    host.querySelector('[data-rw-message]').innerHTML=state.error?`<div class="rw-alert" role="alert">${esc(state.error)} ${btn('重新读取','refresh')}</div>`:!state.loaded?'<p class="rw-empty" role="status">正在连接实际爬房资料…</p>':state.snapshot.revision===0?'<div class="rw-notice">这是待校准的单间参考尺寸。添加爬柜并应用布局后保存到工作台。</div>':'';
    paintWeek();
    host.querySelector('[data-rw-toolbar]').innerHTML=`<div class="rw-actions">${state.view==='cabinet'?btn('← 房间总览','back'):''}${btn('俯视','view-plan',`aria-pressed="${state.view==='plan'}"`)}${btn('立体','view-perspective',`aria-pressed="${state.view==='perspective'}"`)}${btn('适应','fit')}${btn('−','zoom-out','aria-label="缩小房间"')}${btn('+','zoom-in','aria-label="放大房间"')}</div><div class="rw-actions">${btn(state.build?'退出搭建':'搭建房间','build',`aria-pressed="${state.build}"`)}${state.build?btn('添加爬柜','add-cabinet')+btn('撤销','undo',state.undo.length?'':'disabled')+btn('重做','redo',state.redo.length?'':'disabled'):''}${state.draft?btn('应用布局','apply',state.busy?'disabled':'',true):''}${c&&state.view==='cabinet'?btn('柜体配置','edit-cabinet')+btn('复制柜体结构','clone-cabinet')+btn('喂食排期','schedule',`data-cabinet="${esc(c.id)}"`):btn('批量排期','schedule')}${btn('未分配蛇只','unassigned')}</div>`;
    host.querySelector('[data-rw-top-summary]').innerHTML=state.view==='cabinet'&&c?summary(c,true):'';
    const all=M.summarize(state.tasks,state.selected.length?state.selected:null,state.view==='cabinet'?state.cabinetId:null);
    host.querySelector('[data-rw-aside]').innerHTML=`<form class="rw-search-row" data-room-search><input type="search" name="query" aria-label="搜索蛇只或柜名" placeholder="蛇只编号、基因、柜名"><button class="rw-btn" type="submit">定位</button></form><div class="rw-aside-heading"><span class="eyebrow">FEEDING / 备料</span><h2>${state.view==='cabinet'?'当前柜操作':'各柜备料'}</h2><p>${esc(rangeLabel())} · 待备料</p><small>计划 ${all.taskCount} 次 · 待处理 ${all.pendingCount} 次 · 待确认 ${all.unknownCount} 项</small></div>${state.view==='cabinet'&&c?`<div class="rw-summary"><h3>${esc(c.name)}</h3><p class="rw-muted">点击盒子查看档案、分配蛇只或记录喂食。</p>${btn('配置本柜计划','schedule',`data-cabinet="${esc(c.id)}"`)}${btn('逐项巡柜','feeding-list')}</div>`:cfg.cabinets.map(c=>summary(c,false)).join('')||`<div class="rw-empty">先搭建第一座爬柜，逐层添加盒子，再安排现有蛇只。${btn('添加爬柜','add-cabinet','',true)}</div>`}<div class="rw-aside-footer">日期色表示喂食日，✓ 表示已处理。鼠重与数量以当前已确认计划为准。</div>`;
    host.querySelector('[data-rw-caption]').innerHTML=state.build?'拖动柜体调整布局，或在柜体配置中输入位置。尺寸单位：mm。':`${state.view==='plan'?'俯视平面':'空间浏览'} · 滚轮／双指缩放 · 点击柜体展开 ${btn('位置与喂食记录','history')}`;
    paintScene();paintStatus();
    if(focusedDate)host.querySelector(`[data-rw-date="${CSS.escape(focusedDate)}"]`)?.focus({preventScroll:true});
    else if(focusedControl&&!dialog.open)host.querySelector(focusedControl)?.focus({preventScroll:true});
  }
  function paintWeek() {
    const ds=days(),scope=state.view==='cabinet'?state.cabinetId:null;
    host.querySelector('[data-rw-week]').innerHTML=`<div class="rw-week-heading"><b>本周喂食计划</b><span>${esc(rangeLabel())} · ${scope?'当前柜':'全房'}</span><div>${btn('‹','prev-week','aria-label="上一周"')}${btn('本周','this-week')}${btn('›','next-week','aria-label="下一周"')}${btn('全部日期','all-dates',`aria-pressed="${!state.selected.length}"`)}</div></div><div class="rw-days">${ds.map((d,i)=>{const ts=state.tasks.filter(t=>t.date===d&&(!scope||t.cabinetId===scope)),pending=ts.filter(t=>t.status==='pending').length;return `<button type="button" class="rw-day${state.selected.includes(d)?' is-selected':''}${ts.length?' has-plan':''}" style="--day-color:${M.dayColors[i]}" data-rw-date="${d}" aria-pressed="${state.selected.includes(d)}" aria-label="周${weekdays[i]} ${d} ${pending}次待喂"><span>周${weekdays[i]}</span><b>${d.slice(5).replace('-',' / ')}</b><small>${ts.length?`${pending} 待喂 · ${ts.length-pending} 已处理`:'暂无计划'}</small></button>`;}).join('')}</div>`;
  }
  function taskColors(slotId) { const use=state.hover?[state.hover]:state.selected;return [...new Set(state.tasks.filter(t=>t.slotId===slotId&&t.status==='pending'&&(!use.length||use.includes(t.date))).map(t=>M.dayColors[(new Date(t.date+'T12:00:00Z').getUTCDay()+6)%7]))]; }
  function mini(c) { return `<div class="rw-mini-grid" aria-label="${esc(c.name)}格位图">${[...c.levels].reverse().map(l=>`<div class="rw-mini-row" style="grid-template-columns:repeat(${l.slots.length},minmax(0,1fr))">${l.slots.map(s=>{const colors=taskColors(s.id);return `<button class="rw-mini-cell${colors.length?' is-planned':''}" data-rw="slot" data-slot="${esc(s.id)}" data-mini-slot="${esc(s.id)}" aria-label="${esc(titleOfSlot(s.id))} ${esc(occupant(s.id)?.snake_id||'空盒')}" style="${colors.length?`--plan-color:${colors[0]};background:${colors.length>1?`linear-gradient(120deg,${colors.map((col,i)=>`${col}35 ${i/colors.length*100}%,${col}35 ${(i+1)/colors.length*100}%`).join(',')})`:colors[0]+'35'};border-color:${colors[0]}`:''}">${esc(occupant(s.id)?.snake_id||'·')}</button>`;}).join('')}</div>`).join('')}</div>`; }
  function summary(c,top) {
    const sum=M.summarize(state.tasks,state.selected.length?state.selected:null,c.id);
    return `<section class="rw-summary${top?' rw-summary-top':''}" data-summary-cabinet="${esc(c.id)}"><div class="rw-summary-title"><h3>${esc(c.name)}${top?' · 备料':''}</h3>${!top?btn('展开 ↗','cabinet',`data-cabinet="${esc(c.id)}"`):`<span>${esc(rangeLabel())}</span>`}</div><div class="rw-summary-groups">${sum.groups.map(g=>`<div class="rw-summary-row"><span>${g.mouseMin}–${g.mouseMax}<small> g</small></span><b>${g.quantity}<small> 只</small></b></div>`).join('')||'<p class="rw-muted">当前范围暂无已确认备料</p>'}</div><p class="rw-summary-meta">${sum.pendingCount} 次待喂${sum.unknownCount?` · ${sum.unknownCount} 项待确认`:''}</p>${!top?mini(c):''}</section>`;
  }
  function paintScene(pulse=false) { if(scene&&state.loaded)scene.update({config:config(),assignments:assignments(),snakes:snakes(),measurements:measurements(),tasks:state.tasks,selectedDates:state.selected,hoverDate:state.hover,view:state.view,cabinetId:state.cabinetId,build:state.build,labels:config().labels,highlightPulse:pulse}); }
  function previewDate(date,pulse=true) {
    state.hover=date;paintScene(pulse);
    for(const el of host.querySelectorAll('[data-mini-slot]')){const colors=taskColors(el.dataset.miniSlot);el.style.background=colors.length===1?colors[0]+'45':colors.length?`linear-gradient(120deg,${colors.map((c,i)=>`${c}45 ${i/colors.length*100}%,${c}45 ${(i+1)/colors.length*100}%`).join(',')})`:'';el.style.borderColor=colors[0]||'';el.style.setProperty('--plan-color',colors[0]||'transparent');el.classList.remove('rw-plan-pulse');if(date&&colors.length&&pulse){void el.offsetWidth;el.classList.add('rw-plan-pulse');}}
  }
  function focusCabinet(id) { if(!cabinet(id))return;if(state.view!=='cabinet'){overviewScroll=window.scrollY;overviewView=state.view;}state.cabinetId=id;state.view='cabinet';state.hover=null;paint();if(innerWidth<=760&&!state.build)requestAnimationFrame(()=>window.scrollTo({top:host.querySelector('[data-rw-week]').getBoundingClientRect().top+window.scrollY-76,behavior:'instant'})); }
  function findFocusTarget(selector) {return [...host.querySelectorAll(selector)].find(el=>!el.closest('[aria-hidden="true"]'));}
  function focusSelector(el) {if(!el?.dataset)return null;const parts=['rw','rwDate','slot','cabinet','snake'].filter(k=>el.dataset[k]!=null).map(k=>'[data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+'="'+CSS.escape(el.dataset[k])+'"]');return parts.join('')||null;}
  function closeDialog() { if(state.busy)return;dialog.close(); }
  function showDialog(title,content,onSubmit,submit='保存',after) {
    if(!dialog.open){dialogOrigin=document.activeElement;dialogOriginSelector=focusSelector(dialogOrigin);}
    dialog.innerHTML=`<form class="rw-form"><div class="rw-dialog-head"><div><p class="eyebrow">ROOM STUDIO</p><h2>${esc(title)}</h2></div><button class="rw-btn" type="button" data-dialog-close aria-label="关闭">×</button></div><div class="rw-form-body">${content}</div><p class="rw-form-error" role="status"></p><div class="rw-dialog-foot"><button type="button" class="rw-btn" data-dialog-close>关闭</button>${onSubmit?`<button type="submit" class="rw-btn rw-primary">${esc(submit)}</button>`:''}</div></form>`;
    dialog.querySelectorAll('[data-dialog-close]').forEach(b=>b.onclick=closeDialog);
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(!onSubmit||state.busy)return;const form=e.currentTarget,submit=form.querySelector('[type=submit]');submit.disabled=true;form.querySelector('[role=status]').textContent='';try{await onSubmit(form);dialog.close();}catch(error){form.querySelector('[role=status]').textContent=error.message||'操作失败，请重试。';}finally{submit.disabled=false;}};
    if(!dialog.open)dialog.showModal();after?.(dialog);
  }
  dialog.addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{const target=dialogOrigin?.isConnected?dialogOrigin:dialogOriginSelector?findFocusTarget(dialogOriginSelector):null;(target||host.querySelector('[data-rw=room-settings]'))?.focus({preventScroll:true});});
  function openRoomSettings() {
    const c=config();showDialog('房间尺寸',`<p class="rw-muted">单间参考布局。请按实测尺寸校准，柜子超界时会提示。</p><div class="rw-form-grid">${field('房间名称','name',c.name,'text','required maxlength="80"')}${field('房间宽度 mm','width',c.width,'number','min="500" max="30000" required')}${field('房间深度 mm','depth',c.depth,'number','min="500" max="30000" required')}${field('房间高度 mm','height',c.height,'number','min="500" max="10000" required')}${field('房间时区','timezone',c.timezone,'text','required')}</div>`,form=>{const v=formValues(form),next=copy(config());Object.assign(next,{name:v.name,width:+v.width,depth:+v.depth,height:+v.height,timezone:v.timezone});requireErrors(next);editConfig(next);},'保存到布局草稿');
  }
  function levelRow(l,index) {return `<div class="rw-level-row" data-level-id="${esc(l.id||uid())}"><b>L${index+1}</b>${field('层高 mm','levelHeight',l.height,'number','min="30" required')}${field('盒数','levelCount',l.count||l.slots?.length||3,'number','min="1" max="30" required')}${field('盒宽 mm','boxWidth',l.boxWidth,'number','min="10" required')}${field('盒深 mm','boxDepth',l.boxDepth,'number','min="10" required')}${field('盒高 mm','boxHeight',l.boxHeight,'number','min="10" required')}<button type="button" class="rw-btn" data-remove-level aria-label="移除第${index+1}层">−</button></div>`;}
  function openCabinet(id,duplicate=false) {
    const cfg=config(),original=cabinet(id),existing=duplicate?null:original;let c=duplicate?M.cloneCabinet(original,{name:original.name+' 副本',x:cfg.width/2,z:cfg.depth/2}):existing?copy(existing):M.createCabinet({name:`A${String(cfg.cabinets.length+1).padStart(2,'0')}`,width:1200,depth:500,height:1700,x:cfg.width/2,z:cfg.depth/2,rotation:0});
    showDialog(duplicate?'复制柜体结构':existing?'配置爬柜':'添加银色爬柜',`<div class="rw-form-grid">${field('柜名','name',c.name,'text','required maxlength="60"')}${field('柜宽 mm','width',c.width,'number','min="100" required')}${field('柜深 mm','depth',c.depth,'number','min="100" required')}${field('柜高 mm','height',c.height,'number','min="100" required')}${field('中心 X mm','x',c.x,'number','min="0" required')}${field('中心 Z mm','z',c.z,'number','min="0" required')}${select('朝向','rotation',[[0,'正面向入口'],[90,'正面向右'],[180,'正面向窗'],[270,'正面向左']],c.rotation)}${select('贴墙位置','wall',[['','保留位置'],['north','窗侧墙'],['south','入口侧墙'],['west','左墙'],['east','右墙']],'')}</div><h3>逐层搭建 <small>下方为 L1，由下向上编号</small></h3><div class="rw-levels">${c.levels.map(levelRow).join('')}</div><button class="rw-btn" type="button" data-add-level>＋ 复制上一层</button><p class="rw-muted">每格最多安排一条蛇。盒子按照尺寸显示；移除有蛇的格位前请先转移。</p>${existing?'<button class="rw-btn rw-danger" type="button" data-delete-cabinet>移除空柜</button>':''}`,form=>{
      const v=formValues(form);let changed=copy(c);Object.assign(changed,{name:v.name,width:+v.width,depth:+v.depth,height:+v.height,x:+v.x,z:+v.z,rotation:+v.rotation});
      const specs=[...form.querySelectorAll('[data-level-id]')].map(row=>({id:row.dataset.levelId,height:+row.querySelector('[name=levelHeight]').value,count:+row.querySelector('[name=levelCount]').value,boxWidth:+row.querySelector('[name=boxWidth]').value,boxDepth:+row.querySelector('[name=boxDepth]').value,boxHeight:+row.querySelector('[name=boxHeight]').value}));
      changed=M.resizeLevels(changed,specs);c=copy(changed);
      if(v.wall){changed.rotation=({north:0,south:180,west:270,east:90})[v.wall];const footprintX=changed.rotation%180?changed.depth:changed.width,footprintZ=changed.rotation%180?changed.width:changed.depth;if(v.wall==='north')changed.z=footprintZ/2+30;if(v.wall==='south')changed.z=cfg.depth-footprintZ/2-30;if(v.wall==='west')changed.x=footprintX/2+30;if(v.wall==='east')changed.x=cfg.width-footprintX/2-30;}
      const next=copy(config());if(existing)next.cabinets[next.cabinets.findIndex(x=>x.id===id)]=changed;else next.cabinets.push(changed);requireErrors(next);protectSlots(next);editConfig(next);state.cabinetId=changed.id;
    },'保存到布局草稿',root=>{
      root.querySelector('[data-add-level]').onclick=()=>{const rows=root.querySelectorAll('[data-level-id]'),last=rows[rows.length-1],l=last?Object.fromEntries(['levelHeight','levelCount','boxWidth','boxDepth','boxHeight'].map(n=>[n,+last.querySelector(`[name=${n}]`).value])):{levelHeight:250,levelCount:3,boxWidth:360,boxDepth:460,boxHeight:200};root.querySelector('.rw-levels').insertAdjacentHTML('beforeend',levelRow({id:uid(),height:l.levelHeight,count:l.levelCount,...l},rows.length));};
      root.querySelector('.rw-levels').onclick=e=>{const b=e.target.closest('[data-remove-level]');if(b)b.closest('[data-level-id]').remove();};
      root.querySelector('[data-delete-cabinet]')?.addEventListener('click',()=>{try{const next=copy(config());next.cabinets=next.cabinets.filter(x=>x.id!==id);protectSlots(next);editConfig(next);state.view='plan';state.cabinetId=null;dialog.close();paint();}catch(e){root.querySelector('[role=status]').textContent=e.message;}});
    });
  }
  function scheduleFields(s={}) {return `<div class="rw-form-grid">${select('重复方式','mode',[['weekly','每周固定日'],['interval','每 N 天一次']],s.mode||'weekly')}${field('起始日期','start',s.start||dateNow(),'date','required')}${field('结束日期（可留空）','end',s.end||'','date')}${field('间隔天数','interval',s.interval||7,'number','min="1" max="365"')}${field('默认喂食时刻','time',s.time||'18:00','time','required')}${field('每次老鼠只数（待确认可留空）','quantity',s.quantity??'','number','min="1" max="100"')}<label class="rw-check"><input type="checkbox" name="paused" ${s.paused?'checked':''}>暂停本计划</label></div><fieldset class="rw-week-fields"><legend>每周固定日与各日时刻</legend>${weekdays.map((w,i)=>`<label class="rw-check"><input type="checkbox" name="weekdays" value="${i+1}" ${(s.weekdays||[]).includes(i+1)?'checked':''}>周${w}<input type="time" name="time${i+1}" value="${esc(s.times?.[String(i+1)]||s.time||'18:00')}" aria-label="周${w}喂食时刻"></label>`).join('')}</fieldset>`;}
  function readSchedule(form) {const v=formValues(form),weekdaysSelected=[...form.querySelectorAll('[name=weekdays]:checked')].map(x=>+x.value);if(v.mode==='weekly'&&!weekdaysSelected.length)throw Error('请至少选择一个喂食日。');return {mode:v.mode,start:v.start,end:v.end||null,interval:+v.interval,time:v.time,weekdays:weekdaysSelected,times:Object.fromEntries(weekdaysSelected.map(d=>[d,v['time'+d]||v.time])),quantity:v.quantity===''?null:+v.quantity,paused:!!v.paused};}
  function openSchedule(cabinetId,slotId) {
    if(state.draft)return toast('请先应用布局，再配置实际喂食计划。',true);
    const c=cabinet(cabinetId)||activeCabinet(),hasOverride=!!slotId&&Object.prototype.hasOwnProperty.call(c?.slotSchedules||{},slotId),s=hasOverride?c.slotSchedules[slotId]:c?.schedule;
    if(!config().cabinets.length)return toast('请先添加并应用爬柜。',true);
    showDialog(slotId?'单格喂食计划':'按柜批量配置喂食计划',`${slotId?`<p>${esc(titleOfSlot(slotId))} · ${scheduleLabel(c,slotId)}</p><label class="rw-check"><input type="checkbox" name="inherit">恢复继承柜计划</label><label class="rw-check"><input type="checkbox" name="noPlan" ${hasOverride&&s===null?'checked':''}>本格不安排喂食</label>`:`<fieldset class="rw-cabinet-checks"><legend>应用到爬柜</legend>${config().cabinets.map(x=>`<label class="rw-check"><input type="checkbox" name="cabinetIds" value="${esc(x.id)}" ${!c||c.id===x.id?'checked':''}>${esc(x.name)}</label>`).join('')}</fieldset><p class="rw-muted">默认保留各格的独立计划。周期从起始日期计算，迟喂不自动平移周期。</p><label class="rw-check"><input type="checkbox" name="overwrite">同时清除所选柜的格级独立计划</label>`}${scheduleFields(s||{})}`,async form=>{const next=copy(config()),v=formValues(form);if(slotId&&v.inherit){delete (next.cabinets.find(x=>x.id===c.id).slotSchedules||={})[slotId];}else if(slotId&&v.noPlan){(next.cabinets.find(x=>x.id===c.id).slotSchedules||={})[slotId]=null;}else{const sch=readSchedule(form);if(slotId){const target=next.cabinets.find(x=>x.id===c.id);(target.slotSchedules||={})[slotId]=sch;}else{const ids=[...form.querySelectorAll('[name=cabinetIds]:checked')].map(x=>x.value);if(!ids.length)throw Error('请选择至少一个柜子。');for(const target of next.cabinets.filter(x=>ids.includes(x.id))){target.schedule=copy(sch);if(v.overwrite)target.slotSchedules={};}}}await saveConfig(next);},'保存喂食计划');
  }
  function openRules() {return extras.openRules();}

  function openLabels() {return extras.openLabels(state.view==='cabinet'?state.cabinetId:null);}

  function openUnassigned() {const unplaced=snakes().filter(s=>s.status==='active'&&!assignments().some(a=>a.snake_id===s.id));showDialog('未分配蛇只',`<input class="rw-search" type="search" aria-label="搜索未分配蛇只" placeholder="搜索编号或基因"><div class="rw-animal-list">${unplaced.map(s=>`<div class="rw-animal-row" data-search="${esc((s.id+' '+s.gene_text).toLowerCase())}"><div><b>${esc(s.id)}</b><p>${esc(s.gene_text)} · ${({F:'♀ 母',M:'♂ 公',U:'未知'})[s.sex]||'未知'}</p></div><button class="rw-btn" type="button" data-place-snake="${esc(s.id)}">选择盒子</button></div>`).join('')||'<p class="rw-empty">所有在养蛇只均已定位。</p>'}</div>`,null,'',root=>{root.querySelector('[type=search]').oninput=e=>root.querySelectorAll('[data-search]').forEach(row=>row.hidden=!row.dataset.search.includes(e.target.value.toLowerCase()));root.querySelectorAll('[data-place-snake]').forEach(b=>b.onclick=()=>openMove(b.dataset.placeSnake));});}
  function openMove(snakeId,sourceSlot=null,wholeBox=false) {return extras.openMove(snakeId,sourceSlot,wholeBox);}

  function openSlot(slotId) {
    const info=slotInfo(slotId);if(!info)return;state.selectedSlot=slotId;
    if(state.build){focusCabinet(info.c.id);return openCabinet(info.c.id);}
    if(state.draft)return toast('请先应用布局，再操作实际盒位。',true);
    const a=occupant(slotId),s=snakes().find(s=>s.id===a?.snake_id),w=s?M.latestWeight(s.id,measurements()):null,ts=state.tasks.filter(t=>t.slotId===slotId&&(!state.selected.length||state.selected.includes(t.date)));
    showDialog(titleOfSlot(slotId),s?`<div class="rw-specimen"><p class="eyebrow">${esc(s.id)} · ${({F:'♀ 母',M:'♂ 公',U:'性别待确认'})[s.sex]||'性别待确认'}</p><h3>${esc(s.gene_text||'基因待确认')}</h3><p>${w?`${w.weight} g · 测于 ${esc(w.measuredAt)}`:'未称重'} · ${scheduleLabel(info.c,slotId)}</p></div><div class="rw-actions">${btn('移动蛇只','move-snake',`data-snake="${esc(s.id)}"`)}${btn('整盒移动','move-box',`data-slot="${esc(slotId)}" data-snake="${esc(s.id)}"`)}${btn('本格排期','slot-schedule',`data-slot="${esc(slotId)}"`)}${btn('称重','weigh',`data-snake="${esc(s.id)}"`)}${btn('标签备注','slot-note',`data-slot="${esc(slotId)}"`)}</div>${extras.labelDetail(slotId)}<h3>当前日期范围的喂食</h3>${taskList(ts)}<h3>最近位置／喂食记录</h3>${records().filter(r=>r.snake_id===s.id).slice(-6).reverse().map(r=>`<p class="rw-muted">${esc(r.occurred_at?.slice(0,16).replace('T',' '))} · ${({offered:'已投喂',fed:'确认进食',refused:'拒食',skipped:'跳过'})[r.result]||esc(r.result)} · ${r.mouse_min_g??'—'}–${r.mouse_max_g??'—'}g</p>`).join('')||'<p class="rw-muted">暂无喂食记录</p>'}`:`<p class="rw-empty">这是一个空盒。选择现有蛇只放入，或先设置本格的喂食计划。</p><div class="rw-form-grid">${select('选择蛇只','snake',snakes().filter(s=>s.status==='active').map(s=>[s.id,`${s.id} · ${s.gene_text} ${assignments().some(a=>a.snake_id===s.id)?'（已定位，将转移）':''}`]),'')}</div>${btn('本格排期','slot-schedule',`data-slot="${esc(slotId)}"`)}${btn('标签备注','slot-note',`data-slot="${esc(slotId)}"`)}`,s?null:async form=>{const id=form.elements.snake.value;if(!id)throw Error('暂无可分配蛇只。');await write(()=>D.assign(id,slotId,state.snapshot.revision,false));},'放入蛇只');
  }
  function taskList(tasks) {return tasks.length?`<div class="rw-task-list">${tasks.map(t=>`<article class="rw-task" style="--day-color:${M.dayColors[(new Date(t.date+'T12:00Z').getUTCDay()+6)%7]}"><div><b>${esc(t.snakeId)} · ${esc(t.date.slice(5))} ${esc(t.time)}</b><p>${t.mouseMin!=null?`${t.mouseMin}–${t.mouseMax}g`:'鼠重待确认'} × ${t.quantity??'—'}只 · ${({pending:'待喂',offered:'已投喂',completed:'已进食',refused:'拒食',skipped:'跳过',cancelled:'已取消'})[t.status]||t.status}</p>${t.locked?`<p class="rw-muted">已确认备料${t.needsReview?' · 位置或计划已变化，请复核':''}</p>`:''}</div><div class="rw-actions">${['pending','offered'].includes(t.status)?btn('记录结果','feed',`data-task="${esc(t.id)}"`):t.status!=='cancelled'?btn('更正记录','feed',`data-task="${esc(t.id)}"`):'<span aria-label="已取消">—</span>'}${t.status==='pending'&&!t.locked?btn('改期','reschedule',`data-task="${esc(t.id)}"`):''}</div></article>`).join('')}</div>`:'<p class="rw-empty">当前范围没有计划。先配置柜级或本格频率与时间。</p>';}
  function openFeedingList() {showDialog('本周巡柜',taskList(state.tasks.filter(t=>(state.view!=='cabinet'||t.cabinetId===state.cabinetId)&&(!state.selected.length||state.selected.includes(t.date))).sort((a,b)=>a.plannedAt.localeCompare(b.plannedAt))),null);}
  function openFeed(id) {
    const task=typeof id==='object'?id:state.tasks.find(t=>t.id===id);if(!task)return;
    const existing=records().find(r=>r.snake_id===task.snakeId&&new Date(r.planned_at).getTime()===new Date(task.plannedAt).getTime());
    showDialog(`喂食记录 · ${task.snakeId}`,`<p>${esc(titleOfSlot(task.slotId))} · 计划 ${esc(task.date)} ${esc(task.time)}</p><div class="rw-form-grid">${select('结果','result',[['offered','已投喂，待确认进食'],['fed','已确认进食'],['refused','拒食'],['skipped','跳过']],({completed:'fed',offered:'offered',refused:'refused',skipped:'skipped'})[task.status]||'fed')}${field('实际时间','occurred',localInputNow(existing?.occurred_at),'datetime-local','required')}${field('本次鼠重下限 g','mouseMin',task.mouseMin??'','number','step="0.01" min="0.01"')}${field('本次鼠重上限 g','mouseMax',task.mouseMax??'','number','step="0.01" min="0.01"')}${field('本次只数','quantity',task.quantity??'','number','min="0" max="100"')}${field('备注／人工覆盖原因','notes',existing?.notes||'','text','maxlength="1000"')}</div>`,async form=>{const v=formValues(form),occurred=M.localDateTimeToInstant(v.occurred.slice(0,10),v.occurred.slice(11,16),config().timezone);if(!occurred||new Date(occurred)>new Date())throw Error('实际时间不能在未来。');const notFed=['refused','skipped'].includes(v.result);const payload={snake_id:task.snakeId,slot_id:task.slotId,cabinet_id:task.cabinetId,planned_at:task.plannedAt,due_at:task.dueAt||task.plannedAt,result:v.result,mouse_min_g:v.mouseMin===''?null:+v.mouseMin,mouse_max_g:v.mouseMax===''?null:+v.mouseMax,quantity:v.quantity===''?(notFed?0:null):+v.quantity,occurred_at:occurred,notes:v.notes};if(!notFed&&!(payload.quantity>0))throw Error('请填写实际投喂只数。');await write(()=>D.record(payload,state.snapshot.revision));window.SuohaWorkspace.load(true);},'保存实际记录');
  }
  function openReschedule(id) {
    const task=state.tasks.find(t=>t.id===id);if(!task)return;
    showDialog('调整本次计划',`<p>${esc(task.snakeId)} · 原定 ${esc(task.date)} ${esc(task.time)}。仅调整这一次，之后仍按原周期。</p><div class="rw-form-grid">${field('改为日期','date',task.date,'date','required')}${field('改为时刻','time',task.time,'time','required')}</div><label class="rw-check"><input type="checkbox" name="cancelled">取消本次计划</label>`,async form=>{const v=formValues(form),next=copy(config());const instant=M.localDateTimeToInstant(v.date,v.time,next.timezone);if(!instant)throw Error('所选当地时间无效。');const other=state.tasks.find(t=>t.id!==task.id&&t.snakeId===task.snakeId&&(t.dueAt||t.plannedAt)===instant&&t.status!=='cancelled');if(other&&!v.cancelled)throw Error('该蛇在目标时刻已有任务，请选择其他时间。');next.taskOverrides=(next.taskOverrides||[]).filter(x=>!(x.snakeId===task.snakeId&&x.plannedAt===task.plannedAt));next.taskOverrides.push({snakeId:task.snakeId,plannedAt:task.plannedAt,overrideAt:v.cancelled?null:instant,cancelled:!!v.cancelled});await saveConfig(next);},'保存本次调整');
  }
  function localInputNow(value) {const date=value?new Date(value):new Date();const parts=new Intl.DateTimeFormat('en-CA',{timeZone:config().timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
  function openWeigh(id) {showDialog(`称重 · ${id}`,`<div class="rw-form-grid">${field('实际称重日期','date',dateNow(),'date',`required max="${dateNow()}"`)}${field('蛇体重 g','weight','','number','required min="0.01" step="0.01"')}</div>`,async form=>{const v=formValues(form),r=await sb.from('snake_measurements').insert({snake_id:id,measured_at:v.date,weight_g:+v.weight,record_kind:'measurement'});if(r.error)throw r.error;await window.SuohaWorkspace.load(true);paint();},'保存测量');}
  function openHistory() {const rows=state.snapshot?.moves||state.snapshot?.history||[];showDialog('位置与喂食记录',`<h3>位置变更</h3>${rows.map(r=>`<p>${esc(r.created_at||r.occurred_at)} · ${esc(r.snake_id||r.kind||r.action||'位置变更')} · ${esc(r.from_slot_id||r.source_slot||'待定位')} → ${esc(r.to_slot_id||r.target_slot||'待定位')}</p>`).join('')||'<p class="rw-muted">暂无已加载的位置变更。</p>'}<h3>喂食</h3>${records().slice().reverse().map(r=>`<p>${esc(r.snake_id)} · ${esc(r.occurred_at)} · ${({fed:'确认进食',offered:'已投喂',refused:'拒食',skipped:'跳过'})[r.result]||esc(r.result)}</p>`).join('')||'<p class="rw-muted">暂无记录。</p>'}`,null);}
  async function action(b) {
    const a=b.dataset.rw;
    if(a==='refresh')return load(true);
    if(!state.loaded||state.busy||state.loading)return;
    if(a==='cabinet')return focusCabinet(b.dataset.cabinet);
    if(a==='slot')return openSlot(b.dataset.slot);
    if(a==='room-settings')return openRoomSettings();
    if(a==='add-cabinet')return openCabinet();
    if(a==='edit-cabinet')return openCabinet(state.cabinetId);
    if(a==='clone-cabinet')return openCabinet(state.cabinetId,true);
    if(a==='batches')return extras.openBatches();
    if(a==='slot-note')return extras.openNote(b.dataset.slot);
    if(a==='rules')return openRules();
    if(a==='labels')return openLabels();
    if(a==='schedule')return openSchedule(b.dataset.cabinet);
    if(a==='slot-schedule'){const info=slotInfo(b.dataset.slot);return openSchedule(info.c.id,info.s.id);}
    if(a==='unassigned')return openUnassigned();
    if(a==='move-snake')return openMove(b.dataset.snake);
    if(a==='move-box')return openMove(b.dataset.snake,b.dataset.slot,true);
    if(a==='weigh')return openWeigh(b.dataset.snake);
    if(a==='feed')return openFeed(b.dataset.task);
    if(a==='reschedule')return openReschedule(b.dataset.task);
    if(a==='feeding-list')return openFeedingList();
    if(a==='history')return openHistory();
    if(a==='fit')return scene.fit();
    if(a==='zoom-in'||a==='zoom-out')return scene.zoomBy(a==='zoom-in'?1.2:1/1.2);
    if(a==='apply'){try{await saveConfig(copy(config()));toast('爬房布局已保存');}catch(e){state.error=e.message;paint();}return;}
    if(a==='build'){state.build=!state.build;}
    if(a==='back'){state.view=overviewView;state.cabinetId=null;state.hover=null;if(innerWidth<=760)requestAnimationFrame(()=>window.scrollTo({top:overviewScroll,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));}
    if(a==='view-plan'||a==='view-perspective'){state.view=a==='view-plan'?'plan':'perspective';state.hover=null;}
    if(a==='all-dates'){state.selected=[];state.hover=null;}
    if(a==='this-week'){state.week=dateNow();state.selected=[];}
    if(a==='prev-week'||a==='next-week'){const d=new Date(days()[0]+'T12:00Z');d.setUTCDate(d.getUTCDate()+(a==='next-week'?7:-7));state.week=d.toISOString().slice(0,10);state.selected=[];}
    if(a==='undo'&&state.undo.length){state.redo.push(copy(config()));state.draft=state.undo.pop();rememberDraft();}
    if(a==='redo'&&state.redo.length){state.undo.push(copy(config()));state.draft=state.redo.pop();rememberDraft();}
    paint();
  }
  const extras=window.SuohaRoomExtras.create({M,D,state,config,snakes,measurements,assignments,records,cabinet,slotInfo,titleOfSlot,days,dateNow,copy,esc,field,select,btn,showDialog,saveConfig,write,syncPlans,toast,editConfig,openFeed});
  host.addEventListener('click',e=>{const d=e.target.closest('[data-rw-date]');if(d){state.selected=state.selected.includes(d.dataset.rwDate)?state.selected.filter(x=>x!==d.dataset.rwDate):[...state.selected,d.dataset.rwDate];state.hover=null;paint();return;}const b=e.target.closest('[data-rw]');if(b)Promise.resolve(action(b)).catch(e=>toast(e.message,true));});
  host.addEventListener('submit',e=>{if(!e.target.matches('[data-room-search]'))return;e.preventDefault();const query=e.target.elements.query.value.trim().toLowerCase();if(!query)return;const cs=config().cabinets.filter(c=>c.name.toLowerCase().includes(query));const ss=snakes().filter(s=>[s.id,s.gene_text].join(' ').toLowerCase().includes(query));if(cs.length===1&&!ss.length)return focusCabinet(cs[0].id);if(ss.length===1){const a=assignments().find(a=>a.snake_id===ss[0].id);if(a){focusCabinet(slotInfo(a.slot_id).c.id);return openSlot(a.slot_id);}return openMove(ss[0].id);}showDialog('定位结果',`${cs.map(c=>`<p>${btn(esc(c.name),'cabinet',`data-cabinet="${esc(c.id)}"`)}</p>`).join('')}${ss.map(s=>{const a=assignments().find(a=>a.snake_id===s.id);return `<p>${btn(esc(s.id+' · '+s.gene_text),a?'slot':'move-snake',a?`data-slot="${esc(a.slot_id)}"`:`data-snake="${esc(s.id)}"`)}</p>`;}).join('')||(!cs.length?'<p>没有匹配结果。</p>':'')}`,null);});
  dialog.addEventListener('click',e=>{const b=e.target.closest('[data-rw]');if(b)Promise.resolve(action(b)).catch(e=>toast(e.message,true));});
  host.addEventListener('pointerover',e=>{const d=e.target.closest('[data-rw-date]');if(!d||d.contains(e.relatedTarget))return;clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>previewDate(d.dataset.rwDate),100);});
  host.addEventListener('pointerout',e=>{const d=e.target.closest('[data-rw-date]');if(!d||d.contains(e.relatedTarget))return;clearTimeout(hoverTimer);previewDate(null,false);});
  host.addEventListener('focusin',e=>{const d=e.target.closest('[data-rw-date]');if(d)previewDate(d.dataset.rwDate);});
  host.addEventListener('focusout',e=>{if(e.target.closest('[data-rw-date]'))previewDate(null,false);});
  host.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open&&state.view==='cabinet'){e.preventDefault();const id=state.cabinetId;state.view=overviewView;state.cabinetId=null;paint();host.querySelector(`[data-rw="cabinet"][data-cabinet="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}});
  function render() {if(!currentUser||!canWrite())return;if(!state.loaded&&!state.loading&&!state.error)load();else paint();}
  window.SuohaRoomWorkspace={render,reload:()=>load(true),snapshot:()=>copy(state.snapshot),getView:()=>({view:state.view,cabinetId:state.cabinetId,dates:[...state.selected]})};
  addEventListener('suoha:listings',()=>{if(state.loaded&&document.getElementById('page-room').classList.contains('active'))paint();});
  addEventListener('suoha:logout',()=>{state.epoch++;state.snapshot=null;state.draft=null;state.loaded=false;state.loading=false;state.error='';state.selected=[];state.hover=null;state.undo=[];state.redo=[];state.cabinetId=null;state.view='plan';scene?.destroy();scene=null;initialized=false;host.replaceChildren();dialog.close();});
  addEventListener('beforeunload',e=>{if(state.draft||state.busy){e.preventDefault();e.returnValue='';}});
})();
