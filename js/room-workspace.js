/* Private room controls. Geometry, recurrence and durable writes have separate owners. */
(() => {
  'use strict';
  const M = window.SuohaRoomModel, D = window.SuohaRoomData;
  const host = document.getElementById('workspaceRoom');
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const copy = v => JSON.parse(JSON.stringify(v));
  const uid = () => crypto.randomUUID();
  const weekdays = ['一','二','三','四','五','六','日'];
  const state = {snapshot:null,draft:null,build:false,view:'perspective',feedingMode:false,showEnvironment:false,cabinetId:null,selected:[],hover:null,week:null,loaded:false,loading:false,error:'',busy:false,undo:[],redo:[],epoch:0,tasks:[],selectedSlot:null};
  let scene = null, dialogOrigin = null, hoverTimer, initialized = false, overviewScroll = 0, overviewView = 'perspective', dialogOriginSelector = null;
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
  const titleOfSlot = id => { const x = slotInfo(id); return x ? `${x.c.name} · L${x.c.levels.length-x.li} / ${x.ci+1}` : '待定位'; };
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
    workflows.protectIncubations(next);
    const valid = new Map(next.cabinets.flatMap(c=>c.levels.flatMap(l=>l.slots.map(s=>[s.id,s.box_id]))));
    for(const a of assignments()){const old=slotInfo(a.slot_id);if(!valid.has(a.slot_id)||valid.get(a.slot_id)!==old?.s.box_id)throw Error(`${titleOfSlot(a.slot_id)} 仍有 ${a.snake_id}，请先实际转移后再移除。`);}
  }
  let environmentModulePromise=null,telemetry=null,telemetryError='',telemetryLoading=false,telemetryGeneration=0,telemetryFetchedAt=null;
  async function ensureEnvironment(){
    if(window.SuohaRoomEnvironment?.metrics)return window.SuohaRoomEnvironment;
    if(!environmentModulePromise)environmentModulePromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='/js/room-environment.js?v=20261016-env3';
      script.onload=()=>window.SuohaRoomEnvironment?.metrics?resolve(window.SuohaRoomEnvironment):reject(Error('温湿度组件加载不完整，请刷新页面后重试。'));
      script.onerror=()=>reject(Error('温湿度组件加载失败，请检查网络后重试。'));document.head.append(script);
    }).finally(()=>{environmentModulePromise=null;});
    return environmentModulePromise;
  }
  function paintEnvironment(){paintScene();host.querySelectorAll('[data-rw=environment-refresh]').forEach(b=>b.disabled=telemetryLoading);}
  async function refreshEnvironment(){
    const generation=++telemetryGeneration,epoch=state.epoch;
    telemetry=null;telemetryError='';telemetryFetchedAt=null;telemetryLoading=true;paintEnvironment();
    try{
      const E=await ensureEnvironment();
      const cfg=state.snapshot?.config;
      const bound=cfg?.cabinets?.some(c=>c.levels.some(l=>l.environment?.temperature||l.environment?.humidity));
      const result=bound?await D.environment():E.snapshot(cfg);
      if(!result||!Array.isArray(result.levels))throw Error('温湿度响应不完整，请重试。');
      if(generation!==telemetryGeneration||epoch!==state.epoch)return;
      telemetry=result;if(bound)telemetryFetchedAt=Date.now();
    }catch(e){if(generation===telemetryGeneration&&epoch===state.epoch)telemetryError=e.message||'温湿度读取失败';}
    finally{if(generation===telemetryGeneration&&epoch===state.epoch){telemetryLoading=false;paintEnvironment();}}
  }
  async function load(force=false) {
    if(state.loading||!canWrite()||!currentUser)return;
    state.loading=true;state.error='';paint();const epoch=state.epoch,user=currentUser.id;
    try {
      const [snap] = await Promise.all([D.load(),window.SuohaWorkspace.load()]);
      if(epoch!==state.epoch||currentUser?.id!==user)return;
      if(!snap||!Number.isInteger(Number(snap.revision)))throw Error('爬房响应不完整，请检查数据库迁移与权限。');
      state.snapshot=snap;state.snapshot.config ||= M.defaultConfig();state.loaded=true;void refreshEnvironment();
      if(!force&&!state.draft)try{const saved=JSON.parse(sessionStorage.getItem(draftKey())||'null');if(saved&&saved.revision===snap.revision){state.draft=saved.config;state.build=true;}else if(saved)state.error='旧布局草稿版本已过期，当前已加载实际布局。';}catch{}
      if(snap.revision>0)await syncPlans();rememberDraft();
    }catch(e){if(epoch===state.epoch)state.error=e.message||'爬房读取失败。';}
    finally{if(epoch===state.epoch){state.loading=false;paint();}}
  }
  async function write(operation) {
    if(state.busy)throw Error('正在保存，请稍候。');
    state.busy=true;paintStatus();const epoch=state.epoch;
    try{const previous=copy(state.snapshot.config),result=await operation();if(epoch!==state.epoch)throw Error('登录状态已改变。');state.snapshot=result;state.loaded=true;if(state.draft){state.draft=mergeSaved(state.draft,previous,result.config);state.undo=state.undo.map(c=>mergeSaved(c,previous,result.config));state.redo=state.redo.map(c=>mergeSaved(c,previous,result.config));}try{await syncPlans();}catch(e){state.error='操作已保存，备料同步待重试：'+e.message;}rememberDraft();return state.snapshot;}
    finally{state.busy=false;if(epoch===state.epoch)paint();}
  }
  function mergeSaved(local,before,after) {
    if(JSON.stringify(before)===JSON.stringify(after))return copy(local);
    if(Array.isArray(before)&&Array.isArray(after)&&before.every(x=>x?.id)&&after.every(x=>x?.id)&&Array.isArray(local)){
      const old=new Map(before.map(x=>[x.id,x])),fresh=new Map(after.map(x=>[x.id,x]));
      return [...local.filter(x=>!old.has(x.id)||fresh.has(x.id)).map(x=>old.has(x.id)&&fresh.has(x.id)?mergeSaved(x,old.get(x.id),fresh.get(x.id)):copy(x)),...after.filter(x=>!old.has(x.id)&&!local.some(y=>y.id===x.id)).map(copy)];
    }
    if(before&&after&&local&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
      const result=copy(local);for(const key of new Set([...Object.keys(before),...Object.keys(after)])){if(JSON.stringify(before[key])===JSON.stringify(after[key]))continue;if(!(key in after))delete result[key];else result[key]=key in result?mergeSaved(result[key],before[key],after[key]):copy(after[key]);}return result;
    }
    return copy(after);
  }
  const savedSlot = id => state.snapshot?.config?.cabinets.flatMap(c=>c.levels.flatMap(l=>l.slots)).find(s=>s.id===id);
  const slotReady = id => savedSlot(id)?.box_id===slotInfo(id)?.s.box_id&&!!savedSlot(id);
  async function saveBusinessConfig(next) {requireErrors(next);await write(()=>D.save(next,state.snapshot.revision));}
  async function saveSchedules(next,ids,slotId,overwrite) {
    if(!state.draft)return saveConfig(next);
    const actual=copy(state.snapshot.config);
    for(const c of actual.cabinets){const desired=next.cabinets.find(x=>x.id===c.id);if(!desired||!ids.includes(c.id))continue;if(slotId){if(c.levels.some(l=>l.slots.some(s=>s.id===slotId))){c.slotSchedules||={};if(Object.hasOwn(desired.slotSchedules||{},slotId))c.slotSchedules[slotId]=copy(desired.slotSchedules[slotId]);else delete c.slotSchedules[slotId];}}else{c.schedule=copy(desired.schedule??null);if(overwrite)c.slotSchedules={};}}
    if(JSON.stringify(actual)!==JSON.stringify(state.snapshot.config))await saveBusinessConfig(actual);
    for(const c of state.draft.cabinets){const desired=next.cabinets.find(x=>x.id===c.id);if(desired&&ids.includes(c.id)){c.schedule=copy(desired.schedule??null);c.slotSchedules=copy(desired.slotSchedules||{});}}
    rememberDraft();paint();
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
    host.innerHTML=`<div class="rw-workspace"><div class="rw-header" data-rw-header></div><div data-rw-message></div><div data-rw-daily></div><div class="rw-week-strip" data-rw-week></div><div class="rw-toolbar" data-rw-toolbar></div><div data-rw-top-summary></div><div class="rw-body"><div class="rw-main"><div class="rw-canvas" data-rw-canvas></div><div class="rw-scene-caption" data-rw-caption></div></div><aside class="rw-aside" data-rw-aside aria-label="各柜备料"></aside></div></div>`;
    scene=new window.SuohaRoomScene(host.querySelector('[data-rw-canvas]'),{
      onEnvironment:(cabinetId,levelId)=>openLayerDevices(cabinetId,levelId).catch(e=>toast(e.message,true)),
      onCabinet:id=>focusCabinet(typeof id==='object'?id.id:id),onSlot:id=>openSlot(typeof id==='object'?id.id:id),
      onMove:move=>{if(!state.build)return;const next=copy(config()),c=next.cabinets.find(c=>c.id===move.cabinetId);if(!c)return;Object.assign(c,{x:Math.round(move.x),z:Math.round(move.z)});if(move.rotation!=null)c.rotation=move.rotation;try{requireErrors(next);editConfig(next);}catch(e){toast(e.message,true);paintScene();}},
      onViewChange:change=>{const view=typeof change==='string'?change:change?.view;if(view&&(view!==state.view||change?.cabinetId&&change.cabinetId!==state.cabinetId)){state.view=view;if(change?.cabinetId)state.cabinetId=change.cabinetId;paint();}}
    });
  }
  function updateTasks() {
    if(!state.loaded){state.tasks=[];state.preparationTasks=[];return;}
    const overviewKey=JSON.stringify([state.snapshot.revision,config(),dateNow(),Math.floor(Date.now()/60000),measurements()]);
    if(overviewKey!==state.overviewKey){state.overview=M.feedingOverview(config(),assignments(),snakes(),measurements(),records(),{plannedTasks:state.snapshot.planned_tasks||[]});state.overviewKey=overviewKey;}
    const ds=days();state.tasks=M.generateTasks(config(),assignments(),snakes(),measurements(),records(),{from:ds[0],to:ds[6],plannedTasks:state.snapshot?.planned_tasks||[]});
    state.preparationTasks=M.preparationTasks(state.tasks,config(),snakes(),measurements());
  }
  const mouseRules = () => [...config().rules,...state.tasks.filter(t=>t.mouseMin>0&&t.mouseMax>0)];
  const preparation = () => state.preparationTasks||[];
  function paint() {
    if(typeof currentUser==='undefined'||!currentUser||state.page==='none')return;
    if(!canWrite()){host.textContent='仅授权编辑成员可使用爬房工作台。';return;}
    const focusedDate=host.contains(document.activeElement)?document.activeElement?.dataset.rwDate:null;
    const focusedControl=host.contains(document.activeElement)&&!document.activeElement.closest('[data-rw-canvas]')?focusSelector(document.activeElement):null;
    setup();updateTasks();
    host.querySelector('.rw-workspace').classList.toggle('is-cabinet',state.view==='cabinet');
    const c=activeCabinet(), cfg=config(), slots=cfg.cabinets.flatMap(c=>c.levels.flatMap(l=>l.slots));
    const nextTask=state.overview?.nextTask||state.tasks.filter(t=>t.status==='pending'&&new Date(t.dueAt||t.plannedAt)>new Date()).sort((a,b)=>String(a.dueAt||a.plannedAt).localeCompare(String(b.dueAt||b.plannedAt)))[0];
    const lastRecord=records().at(-1);
    host.querySelector('[data-rw-header]').innerHTML=`<div><p class="eyebrow">ROOM STUDIO / 爬房工作台</p><h1>${esc(c&&state.view==='cabinet'?c.name:cfg.name||'我的爬房')}</h1><p class="rw-muted">${cfg.cabinets.length} 个爬柜 · ${assignments().length} 条已定位 · ${slots.length} 个格位 <span data-rw-status></span></p><div class="rw-feed-overview"><span>本次查看：${esc(rangeLabel())}</span><span>下次待喂：${nextTask?esc(nextTask.date+' '+nextTask.time):'未来一年暂无'}</span><span>最近记录：${lastRecord?esc(new Date(lastRecord.occurred_at).toLocaleString('zh-CN',{timeZone:cfg.timezone})): '暂无'}</span></div></div><div class="rw-actions">${btn('房间设置','room-settings')}${btn('温湿度设备','environment')}${btn('鼠重规则','rules')}${btn('标签','labels')}${btn('备料批次','batches')}${btn('刷新','refresh')}</div>`;
    host.querySelector('[data-rw-message]').innerHTML=state.error?`<div class="rw-alert" role="alert">${esc(state.error)} ${btn('重新读取','refresh')}</div>`:!state.loaded?'<p class="rw-empty" role="status">正在连接实际爬房资料…</p>':state.snapshot.revision===0?'<div class="rw-notice">这是待校准的单间参考尺寸。添加爬柜并应用布局后保存到工作台。</div>':'';
    host.querySelector('[data-rw-daily]').innerHTML=workflows.dailyMarkup();
    paintWeek();
    host.querySelector('[data-rw-toolbar]').innerHTML=`<div class="rw-actions">${state.view==='cabinet'?btn('← 房间总览','back')+(workflows.isIncubator(c)?'':`<div class="rw-display-modes" role="group" aria-label="柜体展示模式">${btn('档案模式','normal-mode',`aria-pressed="${!state.feedingMode}"`)}${btn('喂食模式','feeding-mode',`aria-pressed="${state.feedingMode}"`)}</div>`):''}${btn('俯视','view-plan',`aria-pressed="${state.view==='plan'}"`)}${btn('立体','view-perspective',`aria-pressed="${state.view==='perspective'}"`)}${btn('适应','fit')}${btn('−','zoom-out','aria-label="缩小房间"')}${btn('+','zoom-in','aria-label="放大房间"')}</div><div class="rw-actions">${btn(state.build?'退出搭建':'搭建房间','build',`aria-pressed="${state.build}"`)}${state.build?btn('添加爬柜','add-cabinet')+btn('添加孵化箱','add-incubator')+btn('撤销','undo',state.undo.length?'':'disabled')+btn('重做','redo',state.redo.length?'':'disabled'):''}${state.draft?btn('放弃草稿','discard',state.busy?'disabled':'')+btn('应用布局','apply',state.busy?'disabled':'',true):''}${c&&state.view==='cabinet'?btn('温湿度显示','toggle-environment',`role="switch" aria-checked="${state.showEnvironment}"`)+btn('层设备','layer-devices',`data-cabinet="${esc(c.id)}"`)+btn('刷新温湿度','environment-refresh',telemetryLoading?'disabled':'')+btn('柜体设置','cabinet-tools')+`<div class="rw-cabinet-tools${state.controlsExpanded||state.build?' is-open':''}">`+btn('柜体配置','edit-cabinet')+btn('旋转 90°','rotate-cabinet',`data-cabinet="${esc(c.id)}"`)+btn('复制柜体结构','clone-cabinet')+deleteCabinetButton(c)+'</div>'+(workflows.isIncubator(c)?'':btn('喂食计划','schedule',`data-cabinet="${esc(c.id)}"`,true)):btn('喂食计划','schedule','',true)}${btn('未入住蛇','unassigned')}${btn('历史记录','history')}</div>`;
    host.querySelector('[data-rw-top-summary]').innerHTML=state.view==='cabinet'&&c?(state.selected.length?roomPreparation(): '')+summary(c,true):'';
    const all=M.summarize(preparation(),state.selected.length?state.selected:null,state.view==='cabinet'?state.cabinetId:null);
    host.querySelector('[data-rw-aside]').innerHTML=`<form class="rw-search-row" data-room-search><input type="search" name="query" aria-label="搜索蛇只或柜名" placeholder="蛇只编号、基因、柜名"><button class="rw-btn" type="submit">定位</button></form><div class="rw-aside-heading"><span class="eyebrow">${state.view==='cabinet'&&workflows.isIncubator(c)?c.purpose==='eggs'?'INCUBATION / 孵蛋':'BRUMATION / 冬化':'FEEDING / 备料'}</span><h2>${state.view==='cabinet'?'当前柜操作':'各柜备料'}</h2>${state.view==='cabinet'&&workflows.isIncubator(c)?'<p>按盒管理与追踪位置</p>':`<p>${esc(rangeLabel())} · 待备料</p><small>计划 ${all.taskCount} 次 · 待处理 ${all.pendingCount} 次 · 待确认 ${all.unknownCount} 项</small>`}</div>${state.view==='cabinet'&&c?`<div class="rw-summary"><h3>${esc(c.name)}</h3><p class="rw-muted">${workflows.isEggs(c)?'点击盒子查看窝次、放入蛇蛋或转移。':workflows.isIncubator(c)?'点击盒子查看档案、安排冬化或移出蛇只。':'点击盒子查看档案、分配蛇只或记录喂食。'}</p>${workflows.isIncubator(c)?`<p>${c.purpose==='eggs'?'点击盒子选择繁育计划与窝次。':'冬化期间不安排常规喂食，移出后采用目标柜计划。'}</p>`:btn('配置本柜计划','schedule',`data-cabinet="${esc(c.id)}"`)+btn('逐项巡柜','feeding-list')}</div>`:roomPreparation()+(cfg.cabinets.map(c=>summary(c,false)).join('')||`<div class="rw-empty">先搭建第一座爬柜，逐层添加盒子，再安排现有蛇只。${btn('添加爬柜','add-cabinet','',true)}</div>`)}<div class="rw-aside-footer">${state.view==='cabinet'&&workflows.isIncubator(c)?c.purpose==='eggs'?'蛋数按盒汇总，父母本与繁育计划保持一致。':'冬化期间暂停常规喂食，移出时预览目标柜排期。':'边框日期色表示喂食日；喂食模式底色表示鼠重档。未确认备料按最新称重计算，已确认批次保留原备料。'}</div>`;
    host.querySelector('[data-rw-caption]').innerHTML=state.view==='cabinet'?(workflows.isEggs(c)?'点击空盒放入蛇蛋 · 点击已使用盒查看窝次、父母本和转移记录。':workflows.isIncubator(c)?'点击空盒安排冬化 · 点击有蛇盒查看档案或移出，冬化期间暂停常规喂食。':state.feedingMode?'盒内为建议鼠重 · 日期色边框标出待喂格 · 点击盒子记录或查看详情。':'点击空盒分配蛇只 · 点击有蛇格位查看档案、排期和喂食记录。'):state.build?'在俯视或立体画布拖动柜体摆放，使用「旋转 90°」调整方向。尺寸单位：mm。':`${state.view==='plan'?'俯视平面':'空间浏览 · 拖动旋转视角'} · 滚轮／双指缩放 · 点击柜体展开`;
    paintScene();paintStatus();
    if(focusedDate)host.querySelector(`[data-rw-date="${CSS.escape(focusedDate)}"]`)?.focus({preventScroll:true});
    else if(focusedControl&&!dialog.open)host.querySelector(focusedControl)?.focus({preventScroll:true});
  }
  function paintWeek() {
    const ds=days(),scope=null;
    host.querySelector('[data-rw-week]').innerHTML=`<div class="rw-week-heading"><b>本周喂食计划</b><span>${esc(rangeLabel())} · ${scope?'当前柜':'全房'}</span><div>${btn('‹','prev-week','aria-label="上一周"')}${btn('本周','this-week')}${btn('›','next-week','aria-label="下一周"')}${btn('全部日期','all-dates',`aria-pressed="${!state.selected.length}"`)}</div></div><div class="rw-days">${ds.map((d,i)=>{const ts=state.tasks.filter(t=>t.date===d&&(!scope||t.cabinetId===scope)),pending=ts.filter(t=>t.status==='pending').length;return `<button type="button" class="rw-day${state.selected.includes(d)?' is-selected':''}${ts.length?' has-plan':''}" style="--day-color:${M.dayColors[i]}" data-rw-date="${d}" aria-pressed="${state.selected.includes(d)}" aria-label="周${weekdays[i]} ${d} ${pending}次待喂"><span class="rw-day-label"><i class="rw-day-dot" aria-hidden="true"></i>周${weekdays[i]}</span><b>${d.slice(5).replace('-','/')}</b><small>${ts.length?`${pending} 待喂 · ${ts.length-pending} 已处理`:'暂无计划'}</small></button>`;}).join('')}</div>`;
  }
  // Calendar selection is an explicit preview; the normal canvas shows only active reminders.
  const displayTasks=()=>state.hover||state.selected.length?preparation():state.overview?.reminderTasks||[];
  function taskColors(slotId) { const use=state.hover?[state.hover]:state.selected;return [...new Set(displayTasks().filter(t=>t.slotId===slotId&&t.status==='pending'&&(!use.length||use.includes(t.date))).map(t=>M.dayColors[(new Date(t.date+'T12:00:00Z').getUTCDay()+6)%7]))]; }
  function mini(c) { return `<div class="rw-mini-grid" aria-label="${esc(c.name)}格位图">${[...c.levels].reverse().map(l=>`<div class="rw-mini-row" style="grid-template-columns:repeat(${l.slots.length},minmax(0,1fr))">${l.slots.map(s=>{const colors=taskColors(s.id);return `<button class="rw-mini-cell${colors.length?' is-planned':''}" data-rw="slot" data-slot="${esc(s.id)}" data-mini-slot="${esc(s.id)}" aria-label="${esc(titleOfSlot(s.id))} ${esc(occupant(s.id)?.snake_id||(workflows.eggs().find(e=>e.slot_id===s.id)?'蛇蛋':'空盒'))}" style="${colors.length?`--plan-color:${colors[0]};background:${colors.length>1?`linear-gradient(120deg,${colors.map((col,i)=>`${col}35 ${i/colors.length*100}%,${col}35 ${(i+1)/colors.length*100}%`).join(',')})`:colors[0]+'35'};border-color:${colors[0]}`:''}">${esc(occupant(s.id)?.snake_id||(workflows.eggs().find(e=>e.slot_id===s.id)?workflows.eggs().find(e=>e.slot_id===s.id).egg_count+'枚':'·'))}</button>`;}).join('')}</div>`).join('')}</div>`; }
  function summary(c,top) {
    if(workflows.isIncubator(c))return workflows.incubationSummary(c,top);
    const next=state.overview?.nextFeedingByCabinet?.[c.id],sum=M.summarize(state.selected.length?preparation():next?.tasks||[],state.selected.length?state.selected:null,c.id);
    const label=state.selected.length?rangeLabel():next?.date?'下一个喂食日 · '+next.date:'暂无待喂计划';
    return `<section class="rw-summary${top?' rw-summary-top':''}" data-summary-cabinet="${esc(c.id)}"><div class="rw-summary-title"><h3>${esc(c.name)}${top?' · 备料':''}</h3>${!top?btn('展开 ↗','cabinet',`data-cabinet="${esc(c.id)}"`):`<span>${esc(label)}</span>`}</div><div class="rw-summary-groups">${sum.groups.map(g=>`<div class="rw-summary-row" style="--mouse-ink:${M.mouseColor(g.mouseMin,g.mouseMax,mouseRules()).ink};--mouse-fill:${M.mouseColor(g.mouseMin,g.mouseMax,mouseRules()).fill}"><span>${g.mouseMin}–${g.mouseMax}<small> g</small></span><b>${g.quantity}<small> 只</small></b></div>`).join('')||'<p class="rw-muted">当前范围无需备料或鼠重待确认</p>'}</div><p class="rw-summary-meta">${sum.pendingCount} 次待喂${sum.unknownCount?` · ${sum.unknownCount} 项待确认`:''}</p>${!top?mini(c)+`<div class="rw-cabinet-placement"><span>朝向 ${c.rotation||0}°</span>${btn('旋转 90°','rotate-cabinet',`data-cabinet="${esc(c.id)}" aria-label="旋转 ${esc(c.name)} 90°"`)}${deleteCabinetButton(c)}</div>`:''}</section>`;
  }
  function roomPreparation() {
    const selected=state.selected.length?state.selected:null,nextDate=state.overview?.nextFeedingDate;
    const tasks=selected?preparation():state.overview?.nextFeedingTasks||[],sum=M.summarize(tasks,selected),scoped=tasks.filter(t=>!selected||selected.includes(t.date)),locked=scoped.filter(t=>t.status==='pending'&&t.locked).length;
    const heading=selected?rangeLabel()+' · 待备料':nextDate?'下一个喂食日 · '+nextDate+'（周'+weekdays[(new Date(nextDate+'T12:00:00Z').getUTCDay()+6)%7]+'）':'未来一年暂无待喂计划';
    const winter=new Set(assignments().filter(a=>slotInfo(a.slot_id)?.c.type==='incubator').map(a=>a.snake_id));
    const active=snakes().filter(s=>s.status==='active'),planned=new Set(scoped.map(t=>t.snakeId));
    const unscheduled=active.filter(s=>!winter.has(s.id)&&!planned.has(s.id)).length,total=sum.groups.reduce((n,g)=>n+g.quantity,0);
    return '<section class="rw-room-preparation" aria-label="全房备料汇总" aria-live="polite"><div class="rw-preparation-title"><div><span class="eyebrow">ROOM / 全部柜子</span><h3>'+esc(heading)+'</h3></div><strong data-mouse-total>'+(sum.unknownCount&&!total?'<small>数量待确认</small>':total+'<small> 只'+(sum.unknownCount?'（已知）':'')+'</small>')+'</strong></div><div class="rw-mouse-totals">'+sum.groups.map(g=>{const color=M.mouseColor(g.mouseMin,g.mouseMax,mouseRules());return '<div class="rw-mouse-total" data-mouse-range="'+g.mouseMin+'-'+g.mouseMax+'" style="--mouse-ink:'+color.ink+';--mouse-fill:'+color.fill+'"><span>'+g.mouseMin+'–'+g.mouseMax+' g</span><b>'+g.quantity+'<small> 只</small></b></div>';}).join('')+(sum.groups.length?'':'<p class="rw-muted">'+(sum.unknownCount?'有计划尚待确认，暂不计入数量。':'此日期范围没有待备料。')+'</p>')+'</div><p>'+sum.pendingCount+' 次待喂 · '+sum.completedCount+' 次已处理'+(sum.unknownCount?' · <strong>'+sum.unknownCount+' 项待称重 / 确认只数</strong>':'')+'</p><small>按最新有效称重与每次只数汇总'+(locked?'；其中 '+locked+' 项已确认批次沿用原备料':'')+'。'+winter.size+' 条冬化暂停 · '+unscheduled+' 条本范围无计划，不计入备料。</small>'+(!selected&&nextDate?'<p class="rw-muted">汇总当天所有待喂时段，不含已处理任务；与当前查看周无关。</p>':'')+'</section>';
  }
  function deleteCabinetButton(c) {
    const ids=new Set(c.levels.flatMap(l=>l.slots.map(s=>s.id))),count=assignments().filter(a=>ids.has(a.slot_id)).length;
    const eggCount=workflows.eggs().filter(e=>ids.has(e.slot_id)).length;
    if(eggCount)return btn('删除空柜','delete-cabinet',`disabled title="箱内仍有蛇蛋，请先转移或结束孵化" data-cabinet="${esc(c.id)}"`);
    return btn('删除空柜','delete-cabinet',`data-cabinet="${esc(c.id)}" title="${count?`柜内仍有 ${count} 条蛇，请先转移`:'从布局草稿删除，可撤销'}" ${count?'disabled':''}`);
  }
  function deleteCabinet(id) {
    if(!cabinet(id))return;
    const next=copy(config());next.cabinets=next.cabinets.filter(c=>c.id!==id);
    protectSlots(next);
    if(state.cabinetId===id){state.view=overviewView;state.cabinetId=null;state.selectedSlot=null;state.focusSlotId=null;}
    editConfig(next);dialog.close();toast('空柜已从布局草稿删除，可撤销；应用布局后保存。');
  }
  function sceneEnvironment(){
    const E=window.SuohaRoomEnvironment,rows={};
    for(const c of config().cabinets)for(const l of c.levels){const row=telemetry?.levels?.find(r=>r.cabinetId===c.id&&r.levelId===l.id),item={};
      for(const m of ['temperature','humidity']){const b=l.environment?.[m];let r=row?.[m];
        if(!b)r={status:'unbound'};else if(telemetryLoading)r={status:'loading'};else if(telemetryError)r={status:'unavailable',message:telemetryError};
        else if(r?.observedAt&&Date.now()-Date.parse(r.observedAt)>b.staleAfterSeconds*1000)r={...r,status:'stale'};
        const labels={unbound:'未绑定',loading:'读取中',unavailable:'读取失败',not_connected:'待接入',offline:'离线',invalid:'数据无效',stale:'已过期',cloud_cached:'云端值',ok:''};
        item[m]={text:(typeof r?.value==='number'?r.value+(m==='temperature'?'℃':'%')+' ':'')+(labels[r?.status]??'待刷新'),detail:E?E.display(r):'等待读取'};
      }rows[l.id]=item;
    }return rows;
  }
  function paintScene(pulse=false) { if(scene&&state.loaded)scene.update({showEnvironment:state.showEnvironment,environment:state.showEnvironment?sceneEnvironment():{},config:config(),assignments:assignments(),incubations:workflows.eggs(),focusSlotId:state.focusSlotId,snakes:snakes(),measurements:measurements(),tasks:displayTasks(),mouseRules:mouseRules(),feedingMode:state.feedingMode,selectedDates:state.selected,hoverDate:state.hover,view:state.view,cabinetId:state.cabinetId,build:state.build,labels:config().labels,highlightPulse:pulse}); }
  function previewDate(date,pulse=true) {
    state.hover=date;paintScene(pulse);
    for(const el of host.querySelectorAll('[data-mini-slot]')){const colors=taskColors(el.dataset.miniSlot);el.style.background=colors.length===1?colors[0]+'45':colors.length?`linear-gradient(120deg,${colors.map((c,i)=>`${c}45 ${i/colors.length*100}%,${c}45 ${(i+1)/colors.length*100}%`).join(',')})`:'';el.style.borderColor=colors[0]||'';el.style.setProperty('--plan-color',colors[0]||'transparent');el.classList.remove('rw-plan-pulse');if(date&&colors.length&&pulse){void el.offsetWidth;el.classList.add('rw-plan-pulse');}}
  }
  function focusCabinet(id) { if(!cabinet(id))return;if(state.view!=='cabinet'){overviewScroll=window.scrollY;overviewView=state.view;}state.focusSlotId=null;state.cabinetId=id;state.view='cabinet';state.hover=null;paint();if(innerWidth<=760&&!state.build)requestAnimationFrame(()=>window.scrollTo({top:host.querySelector('[data-rw-week]').getBoundingClientRect().top+window.scrollY-76,behavior:'instant'})); }
  function findFocusTarget(selector) {return [...host.querySelectorAll(selector)].find(el=>!el.closest('[aria-hidden="true"]'));}
  function focusSelector(el) {if(!el?.dataset)return null;const parts=['rw','rwDate','slot','cabinet','snake'].filter(k=>el.dataset[k]!=null).map(k=>'[data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+'="'+CSS.escape(el.dataset[k])+'"]');return parts.join('')||null;}
  function closeDialog() { if(state.busy)return;dialog.close(); }
  function showDialog(title,content,onSubmit,submit='保存',after,placement='modal') {
    if(dialog.open&&dialog.dataset.placement!==placement)dialog.close();
    dialog.setAttribute('aria-labelledby','rw-dialog-title');dialog.dataset.placement=placement;dialog.classList.toggle('rw-slot-detail',placement==='detail');dialog.setAttribute('aria-modal',String(placement==='modal'));
    if(!dialog.open){dialogOrigin=document.activeElement;dialogOriginSelector=focusSelector(dialogOrigin);}
    dialog.innerHTML=`<form class="rw-form"><div class="rw-dialog-head"><div><p class="eyebrow">ROOM STUDIO</p><h2 id="rw-dialog-title">${esc(title)}</h2></div><button class="rw-btn" type="button" data-dialog-close aria-label="关闭">×</button></div><div class="rw-form-body">${content}</div><p class="rw-form-error" role="status"></p><div class="rw-dialog-foot"><button type="button" class="rw-btn" data-dialog-close>关闭</button>${onSubmit?`<button type="submit" class="rw-btn rw-primary">${esc(submit)}</button>`:''}</div></form>`;
    dialog.querySelectorAll('[data-dialog-close]').forEach(b=>b.onclick=closeDialog);
    dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(!onSubmit||state.busy)return;const form=e.currentTarget,submit=form.querySelector('[type=submit]');submit.disabled=true;form.querySelector('.rw-form-error').textContent='';try{if(await onSubmit(form,e.submitter)!==false)dialog.close();}catch(error){form.querySelector('.rw-form-error').textContent=error.message||'操作失败，请重试。';}finally{submit.disabled=false;}};
    if(!dialog.open){if(placement==='detail')dialog.show();else dialog.showModal();}after?.(dialog);
  }
  dialog.addEventListener('cancel',e=>{if(state.busy)e.preventDefault();});
  dialog.addEventListener('close',()=>{if(dialog.open)return;
    // Native close events are queued. Never steal focus after the user has already moved on.
    const active=document.activeElement;if(active&&active!==document.body&&active!==dialogOrigin&&!dialog.contains(active))return;
    const target=dialogOrigin?.isConnected?dialogOrigin:dialogOriginSelector?findFocusTarget(dialogOriginSelector):null;(target||host.querySelector('[data-rw=room-settings]'))?.focus({preventScroll:true});});
  function environmentTools(telemetry) {
    const ids=telemetry.deviceIds||[];
    return '<details class="rw-environment-level"><summary>涂鸦设备、数据点与控制</summary><p class="rw-muted">'+(telemetry.capabilities?.credentialsConfigured?'密钥已填写，请验证云授权；绑定设备并配置设备 ID 后可读取数据点。':'服务器尚未配置涂鸦云授权。请先配置密钥。')+'</p><button class="rw-btn" type="button" data-env-connection>验证云授权</button>'+select('已授权设备','environment_device',ids.map(id=>[id,id]),ids[0]||'')+'<button class="rw-btn" type="button" data-env-inspect '+(!ids.length?'disabled':'')+'>读取设备</button><div data-env-detail></div><p data-env-message role="status"></p></details>';
  }
  function bindEnvironmentTools(root,telemetry){
    const inspect=root.querySelector('[data-env-inspect]'),output=root.querySelector('[data-env-detail]'),message=root.querySelector('[data-env-message]');
    if(!inspect)return;
    let current=null,working=false,pendingCommand=null;
    const connection=root.querySelector('[data-env-connection]');
    connection.onclick=async()=>{if(working)return;working=true;connection.disabled=true;message.textContent='正在验证云授权…';try{const result=await D.environmentConnection();message.textContent=result.message;}catch(e){message.textContent=e.message;}finally{working=false;connection.disabled=false;}};
    inspect.onclick=async()=>{if(working)return;working=true;inspect.disabled=true;message.textContent='正在读取涂鸦云…';output.innerHTML='';
      try{const id=root.querySelector('[name=environment_device]').value;current=await D.environmentDevice(id);
        const affected=(state.snapshot.config.cabinets||[]).flatMap(c=>c.levels.flatMap((l,i)=>['davinci','tuya_cloud'].includes(l.environment?.temperature?.provider)&&l.environment.temperature.deviceId===id?[c.name+' · L'+(c.levels.length-i)]:[]));
        const codes=(current.specification?.status||[]).map(d=>'<li>'+esc(d.name||d.code)+'：<code>'+esc(d.code)+'</code> · '+esc(d.type)+' · '+esc(JSON.stringify(d.values))+'</li>').join('');
        const t=current.controls?.temperature,p=current.controls?.power;
        output.innerHTML='<h3>'+esc(current.name)+'</h3><p>'+esc(current.online===true?'设备在线':current.online===false?'设备离线':'在线状态未知')+'</p><p>已保存绑定：'+esc(affected.join('、')||'无，请先保存温度绑定后控制')+'</p><p class="rw-muted">下列状态为云端原始值；按规格中的 scale 换算。复制实际测温 code 到对应层的数据通道。</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(current.status,null,2))+'</pre><ul>'+codes+'</ul>'+(affected.length&&current.online===true?(t?'<div class="rw-form-grid">'+field('目标温度 °C','environment_target','','number','min="'+t.min+'" max="'+t.max+'" step="'+t.step+'"')+'</div><button type="button" class="rw-btn" data-env-temperature>设置目标温度</button>':'')+(p?'<button type="button" class="rw-btn" data-env-power="true">开启加热</button><button type="button" class="rw-btn" data-env-power="false">关闭加热</button>':''):'')+(!t&&!p?'<p class="rw-muted">控制尚未启用，或设备未提供已配置的控制通道。</p>':'');
        message.textContent='读取完成。云端接受控制指令不代表设备已执行，请重新读取核对。';
      }catch(e){message.textContent=e.message;}finally{working=false;inspect.disabled=false;}
    };
    output.onclick=async event=>{const button=event.target.closest('[data-env-temperature],[data-env-power]');if(!button||working||!current)return;
      const temperature=button.hasAttribute('data-env-temperature'),input=output.querySelector('[name=environment_target]');
      if(temperature&&(!input.value||!input.checkValidity())){message.textContent='请填写设备允许范围和步进内的目标温度';return;}
      const intent={revision:telemetry.revision??state.snapshot.revision,deviceId:current.id,action:temperature?'temperature':'power',value:temperature?Number(input.value):button.dataset.envPower==='true'};
      const key=JSON.stringify(intent);if(!pendingCommand||pendingCommand.key!==key)pendingCommand={key,requestId:crypto.randomUUID()};
      working=true;output.querySelectorAll('button').forEach(b=>b.disabled=true);inspect.disabled=true;
      try{const response=await D.environmentCommand({...intent,requestId:pendingCommand.requestId});message.textContent=response.message||response.status;if(['accepted','failed'].includes(response.status))pendingCommand=null;}
      catch(e){message.textContent=e.message+'；请先读取设备状态再决定下一步，同一请求不会自动重发。';}
      finally{working=false;output.querySelectorAll('button').forEach(b=>b.disabled=false);inspect.disabled=false;}
    };
  }
  const deviceProviders=[['tuya_cloud','涂鸦云（A1 智能版）'],['davinci','达芬奇 A1（兼容原绑定）'],['home_assistant','Home Assistant（待接入）'],['mqtt','MQTT（待接入）'],['custom','其他来源（待接入）']];
  function deviceForm(d){return `<fieldset class="rw-environment-level" data-environment-device="${esc(d.id)}"><legend>${esc(d.label||'新增设备')}</legend><div class="rw-form-grid">`+
    field('设备名称','device_label',d.label,'text','required maxlength="80"')+select('设备来源','device_provider',deviceProviders,d.provider)+field('设备 ID','device_id',d.deviceId,'text','required maxlength="200"')+
    field('温度通道','device_temperature',d.temperatureChannel,'text','maxlength="200" placeholder="例如 temp_current，不支持则留空"')+field('湿度通道','device_humidity',d.humidityChannel,'text','maxlength="200" placeholder="不支持则留空"')+
    field('数据有效期（秒）','device_stale',d.staleAfterSeconds,'number','min="30" max="86400" step="1" required')+'</div><label class="rw-check"><input type="checkbox" name="device_remove">删除此设备，并解除对应柜层绑定</label></fieldset>';}
  async function openEnvironment() {
    if(state.draft)throw Error('请先保存或放弃布局草稿，再配置温湿度。');
    const cfg=copy(state.snapshot.config),E=await ensureEnvironment();
    let telemetry,warning='';try{telemetry=await D.environment();}catch(e){telemetry={deviceIds:[],capabilities:{},levels:[]};warning=e.message;}
    const previous=E.catalog(cfg),devices=E.catalog(cfg,telemetry.deviceIds||[]);
    const content='<p class="rw-muted">在这里统一配置设备参数，保存后在爬柜每层右侧选择设备。修改参数会同步到使用该设备的所有层。A1 温度通道预填 temp_current，请读取设备核对。</p>'+(warning?'<p role="status">云连接暂不可用：'+esc(warning)+'，仍可编辑已保存的设备。</p>':'')+environmentTools(telemetry)+
      '<div data-environment-devices>'+devices.map(deviceForm).join('')+'</div><button type="button" class="rw-btn" data-add-environment-device>添加设备</button>';
    showDialog('温湿度设备',content,async form=>{
      const next=[...form.querySelectorAll('[data-environment-device]')].filter(row=>!row.querySelector('[name=device_remove]').checked).map(row=>{const v=name=>row.querySelector('[name='+name+']').value.trim();return {id:row.dataset.environmentDevice,provider:v('device_provider'),deviceId:v('device_id'),label:v('device_label'),temperatureChannel:v('device_temperature'),humidityChannel:v('device_humidity'),staleAfterSeconds:Number(v('device_stale'))};});
      E.applyCatalog(cfg,next,previous);await saveBusinessConfig(cfg);void refreshEnvironment();
    },'保存设备参数',root=>{bindEnvironmentTools(root,telemetry);root.querySelector('[data-add-environment-device]').onclick=()=>root.querySelector('[data-environment-devices]').insertAdjacentHTML('beforeend',deviceForm({id:uid(),provider:'tuya_cloud',deviceId:'',label:'',temperatureChannel:'temp_current',humidityChannel:'',staleAfterSeconds:300}));});
  }
  async function openLayerDevices(cabinetId,levelId){
    if(state.draft)throw Error('请先保存或放弃布局草稿，再选择设备。');
    const E=await ensureEnvironment(),cfg=copy(state.snapshot.config),c=cfg.cabinets.find(c=>c.id===cabinetId);
    if(!c)return;const devices=E.catalog(cfg),levels=levelId?c.levels.filter(l=>l.id===levelId):c.levels;
    if(!devices.length){toast('请先在温湿度设备中保存设备参数。');return openEnvironment();}
    E.applyCatalog(cfg,devices);
    const content='<p class="rw-muted">为每层选择已配置的设备。多个层可以共用同一台设备；温度与湿度可分别选择。</p>'+levels.map((l,i)=>'<fieldset class="rw-environment-level"><legend>L'+(c.levels.length-c.levels.indexOf(l))+'</legend><div class="rw-form-grid">'+E.metrics.map(m=>select(m==='temperature'?'温度设备':'湿度设备',i+'_'+m,[['','未绑定'],...devices.filter(d=>d[m+'Channel']).map(d=>[d.id,d.label+' · '+d.deviceId])],E.findDevice(devices,m,l.environment?.[m])?.id||'')).join('')+'</div></fieldset>').join('');
    showDialog(c.name+' · '+(levelId?'L'+(c.levels.length-c.levels.findIndex(l=>l.id===levelId))+' ':'')+'设备绑定',content,async form=>{
      const v=formValues(form);levels.forEach((l,i)=>{const env={};for(const m of E.metrics){const binding=E.deviceBinding(devices.find(d=>d.id===v[i+'_'+m]),m);if(binding)env[m]=binding;}if(Object.keys(env).length)l.environment=env;else delete l.environment;});
      await saveBusinessConfig(cfg);void refreshEnvironment();
    },'保存层设备');
  }
  function openRoomSettings() {
    const c=config();showDialog('房间尺寸',`<p class="rw-muted">墙体按这里的实际高度显示，与柜体使用相同比例。请按实测尺寸校准。</p><div class="rw-form-grid">${field('房间名称','name',c.name,'text','required maxlength="80"')}${field('房间宽度 mm','width',c.width,'number','min="500" max="30000" required')}${field('房间深度 mm','depth',c.depth,'number','min="500" max="30000" required')}${field('墙高／房间高度 mm','height',c.height,'number','min="500" max="10000" required')}${field('房间时区','timezone',c.timezone,'text','required')}</div>`,form=>{const v=formValues(form),next=copy(config());Object.assign(next,{name:v.name,width:+v.width,depth:+v.depth,height:+v.height,timezone:v.timezone});requireErrors(next);editConfig(next);},'保存到布局草稿');
  }
  function levelRow(l,index) {return `<div class="rw-level-row" data-level-id="${esc(l.id||uid())}"><b data-level-number>L${index+1}</b>${field('层高 mm','levelHeight',l.height,'number','min="30" required')}${field('盒数','levelCount',l.count||l.slots?.length||3,'number','min="1" max="30" required')}${field('盒宽 mm','boxWidth',l.boxWidth,'number','min="10" required')}${field('盒深 mm','boxDepth',l.boxDepth,'number','min="10" required')}${field('盒高 mm','boxHeight',l.boxHeight,'number','min="10" required')}<button type="button" class="rw-btn" data-remove-level aria-label="移除第${index+1}层">−</button></div>`;}
  function openCabinet(id,duplicate=false) {
    if(workflows.isIncubator(cabinet(id)))return workflows.openIncubator(id,duplicate);
    const cfg=config(),original=cabinet(id),existing=duplicate?null:original;let c=duplicate?M.cloneCabinet(original,{name:original.name+' 副本',x:cfg.width/2,z:cfg.depth/2}):existing?copy(existing):M.createCabinet({name:`A${String(cfg.cabinets.length+1).padStart(2,'0')}`,width:1200,depth:500,height:1700,x:cfg.width/2,z:cfg.depth/2,rotation:0});
    // Stored levels run from the floor upward; the editor runs from the top (L1) downward.
    const displayLevels=[...c.levels].reverse();
    showDialog(duplicate?'复制柜体结构':existing?'配置爬柜':'添加银色爬柜',`<div class="rw-form-grid">${field('柜名','name',c.name,'text','required maxlength="60"')}${field('柜宽 mm','width',c.width,'number','min="100" required')}${field('柜深 mm','depth',c.depth,'number','min="100" required')}${field('柜高 mm','height',c.height,'number','min="100" required')}</div><h3>逐层搭建 <small>顶层为 L1，由上向下编号</small></h3><button class="rw-btn" type="button" data-add-level>＋ 在顶部新增一层</button><p class="rw-muted">新增层默认复制当前 L1 的尺寸和盒数；新增或删除一层时，柜高同步加减该层层高。</p><div class="rw-levels">${displayLevels.map(levelRow).join('')}</div><p class="rw-muted">保存后在房间画布中拖动柜子，使用「旋转 90°」调整方向。每格最多一条蛇；移除有蛇的格位前请先转移。</p>${existing?deleteCabinetButton(existing):''}`,form=>{
      const v=formValues(form);let changed=copy(c);Object.assign(changed,{name:v.name,width:+v.width,depth:+v.depth,height:+v.height});
      const specs=[...form.querySelectorAll('[data-level-id]')].reverse().map(row=>({id:row.dataset.levelId,height:+row.querySelector('[name=levelHeight]').value,count:+row.querySelector('[name=levelCount]').value,boxWidth:+row.querySelector('[name=boxWidth]').value,boxDepth:+row.querySelector('[name=boxDepth]').value,boxHeight:+row.querySelector('[name=boxHeight]').value}));
      changed=M.resizeLevels(changed,specs);c=copy(changed);
      const next=copy(config());if(existing)next.cabinets[next.cabinets.findIndex(x=>x.id===id)]=changed;else {placeNewCabinet(changed,next);next.cabinets.push(changed);}requireErrors(next);protectSlots(next);editConfig(next);state.cabinetId=changed.id;
    },'保存到布局草稿',root=>{
      const levels=root.querySelector('.rw-levels'),cabinetHeight=root.querySelector('[name=height]');
      const renumberLevels=()=>{
        const rows=[...levels.querySelectorAll('[data-level-id]')];
        rows.forEach((row,index)=>{
          row.querySelector('[data-level-number]').textContent='L'+(index+1);
          const remove=row.querySelector('[data-remove-level]');
          remove.setAttribute('aria-label','移除第'+(index+1)+'层');remove.disabled=rows.length===1;
        });
      };
      root.querySelector('[data-add-level]').onclick=()=>{
        const top=levels.firstElementChild;
        if(!cabinetHeight.reportValidity()||(top&&!top.querySelector('[name=levelHeight]').reportValidity()))return;
        const l=top?Object.fromEntries(['levelHeight','levelCount','boxWidth','boxDepth','boxHeight'].map(n=>[n,+top.querySelector(`[name=${n}]`).value])):{levelHeight:250,levelCount:3,boxWidth:360,boxDepth:460,boxHeight:200};
        levels.insertAdjacentHTML('afterbegin',levelRow({id:uid(),height:l.levelHeight,count:l.levelCount,...l},0));
        cabinetHeight.value=String(Number(cabinetHeight.value)+l.levelHeight);renumberLevels();
      };
      levels.onclick=e=>{
        const b=e.target.closest('[data-remove-level]');if(!b||b.disabled)return;
        const row=b.closest('[data-level-id]'),height=row.querySelector('[name=levelHeight]');
        if(!cabinetHeight.reportValidity()||!height.reportValidity())return;
        cabinetHeight.value=String(Number(cabinetHeight.value)-Number(height.value));
        row.remove();renumberLevels();
      };
      renumberLevels();
    });
  }
  function placeNewCabinet(c,cfg) {
    const hw=(c.rotation%180?c.depth:c.width)/2,hd=(c.rotation%180?c.width:c.depth)/2;
    if(!(hw>0&&hd>0)||hw*2>cfg.width||hd*2>cfg.depth)return;
    const boxes=cfg.cabinets.map(c=>{const corners=M.cabinetCorners(c);return {left:Math.min(...corners.map(p=>p.x)),right:Math.max(...corners.map(p=>p.x)),top:Math.min(...corners.map(p=>p.z)),bottom:Math.max(...corners.map(p=>p.z))};});
    const candidates=(center,min,max,edges)=>[...new Set([center,min,max,...edges])].filter(v=>v>=min&&v<=max).sort((a,b)=>Math.abs(a-center)-Math.abs(b-center));
    const xs=candidates(cfg.width/2,hw,cfg.width-hw,boxes.flatMap(b=>[b.left-hw,b.right+hw]));
    const zs=candidates(cfg.depth/2,hd,cfg.depth-hd,boxes.flatMap(b=>[b.top-hd,b.bottom+hd]));
    for(const z of zs)for(const x of xs)if(!boxes.some(b=>x-hw<b.right-.01&&x+hw>b.left+.01&&z-hd<b.bottom-.01&&z+hd>b.top+.01)){c.x=x;c.z=z;return;}
    throw Error('当前房间没有可放入此尺寸柜体的空位，请先拖动已有柜体腾出空间。');
  }
  function scheduleFields(s={}) {return `<div class="rw-form-grid">${select('重复方式','mode',[['weekly','每周固定日'],['interval','每 N 天一次']],s.mode||'weekly')}${field('起始日期','start',s.start||dateNow(),'date','required')}${field('结束日期（可留空）','end',s.end||'','date')}${field('间隔天数','interval',s.interval||7,'number','min="1" max="365"')}${field('默认喂食时刻','time',s.time||'18:00','time','required')}${field('每次老鼠只数（待确认可留空）','quantity',s.quantity??'','number','min="1" max="100"')}<label class="rw-check"><input type="checkbox" name="paused" ${s.paused?'checked':''}>暂停本计划</label></div><fieldset class="rw-week-fields"><legend>每周固定日与各日时刻</legend>${weekdays.map((w,i)=>`<label class="rw-check"><input type="checkbox" name="weekdays" value="${i+1}" ${(s.weekdays||[]).includes(i+1)?'checked':''}>周${w}<input type="time" name="time${i+1}" value="${esc(s.times?.[String(i+1)]||s.time||'18:00')}" aria-label="周${w}喂食时刻"></label>`).join('')}</fieldset>`;}
  function readSchedule(form) {const v=formValues(form),weekdaysSelected=[...form.querySelectorAll('[name=weekdays]:checked')].map(x=>+x.value);if(v.mode==='weekly'&&!weekdaysSelected.length)throw Error('请至少选择一个喂食日。');return {mode:v.mode,start:v.start,end:v.end||null,interval:+v.interval,time:v.time,weekdays:weekdaysSelected,times:Object.fromEntries(weekdaysSelected.map(d=>[d,v['time'+d]||v.time])),quantity:v.quantity===''?null:+v.quantity,paused:!!v.paused};}
  function openSchedule(cabinetId,slotId) {
    const c=cabinet(cabinetId)||activeCabinet(),hasOverride=!!slotId&&Object.prototype.hasOwnProperty.call(c?.slotSchedules||{},slotId),s=hasOverride?c.slotSchedules[slotId]:c?.schedule;
    if(workflows.isIncubator(c))return toast('孵化箱不配置常规喂食计划。',true);
    if(!config().cabinets.some(c=>!workflows.isIncubator(c)))return toast('请先添加并应用爬柜。',true);
    showDialog(slotId?'单格喂食计划':'按柜批量配置喂食计划',`<p class="rw-muted">在这里设置喂食频率、日期、时间和每次老鼠只数。备料数量根据计划自动汇总。已有柜计划直接保存；新建柜／新格位计划随布局草稿保存。</p>${slotId?`<p>${esc(titleOfSlot(slotId))} · ${scheduleLabel(c,slotId)}</p><label class="rw-check"><input type="checkbox" name="inherit">恢复继承柜计划</label><label class="rw-check"><input type="checkbox" name="noPlan" ${hasOverride&&s===null?'checked':''}>本格不安排喂食</label>`:`<fieldset class="rw-cabinet-checks"><legend>应用到爬柜</legend>${config().cabinets.filter(x=>!workflows.isIncubator(x)).map(x=>`<label class="rw-check"><input type="checkbox" name="cabinetIds" value="${esc(x.id)}" ${!c||c.id===x.id?'checked':''}>${esc(x.name)}</label>`).join('')}</fieldset><p class="rw-muted">默认保留各格的独立计划。周期从起始日期计算，迟喂不自动平移周期。</p><label class="rw-check"><input type="checkbox" name="overwrite">同时清除所选柜的格级独立计划</label>`}${scheduleFields(s||{})}`,async form=>{const next=copy(config()),v=formValues(form);if(slotId&&v.inherit){delete (next.cabinets.find(x=>x.id===c.id).slotSchedules||={})[slotId];}else if(slotId&&v.noPlan){(next.cabinets.find(x=>x.id===c.id).slotSchedules||={})[slotId]=null;}else{const sch=readSchedule(form);if(slotId){const target=next.cabinets.find(x=>x.id===c.id);(target.slotSchedules||={})[slotId]=sch;}else{const ids=[...form.querySelectorAll('[name=cabinetIds]:checked')].map(x=>x.value);if(!ids.length)throw Error('请选择至少一个柜子。');for(const target of next.cabinets.filter(x=>ids.includes(x.id))){target.schedule=copy(sch);if(v.overwrite)target.slotSchedules={};}}}await saveSchedules(next,slotId?[c.id]:[...form.querySelectorAll('[name=cabinetIds]:checked')].map(x=>x.value),slotId,!!v.overwrite);},'保存喂食计划',root=>workflows.attachSchedulePreview(root,c?.id,slotId));
  }
  function openRules() {return extras.openRules();}

  function openLabels() {return extras.openLabels(state.view==='cabinet'?state.cabinetId:null);}

  function openUnassigned() {const unplaced=snakes().filter(s=>s.status==='active'&&!assignments().some(a=>a.snake_id===s.id));showDialog('未入住蛇',`${btn('批量入住','batch-assign')}<input class="rw-search" type="search" aria-label="搜索未入住蛇" placeholder="搜索编号或基因"><div class="rw-animal-list">${unplaced.map(s=>`<div class="rw-animal-row" data-search="${esc((s.id+' '+s.gene_text).toLowerCase())}"><div><b>${esc(s.id)}</b><p>${esc(s.gene_text)} · ${({F:'♀ 母',M:'♂ 公',U:'未知'})[s.sex]||'未知'}</p></div><button class="rw-btn" type="button" data-place-snake="${esc(s.id)}">选择盒子</button></div>`).join('')||'<p class="rw-empty">所有在养蛇只均已定位。</p>'}</div>`,null,'',root=>{root.querySelector('[type=search]').oninput=e=>root.querySelectorAll('[data-search]').forEach(row=>row.hidden=!row.dataset.search.includes(e.target.value.toLowerCase()));root.querySelectorAll('[data-place-snake]').forEach(b=>b.onclick=()=>openMove(b.dataset.placeSnake));});}
  function openMove(snakeId,sourceSlot=null,wholeBox=false) {return extras.openMove(snakeId,sourceSlot,wholeBox);}

  function openSlot(slotId) {
    const info=slotInfo(slotId);if(!info)return;state.selectedSlot=slotId;
    if(state.draft&&!slotReady(slotId))return showDialog('先应用布局，再操作格位',`<p>${esc(titleOfSlot(slotId))}</p><p class="rw-muted">这个格位尚未保存，或盒子结构已变更。应用布局后即可入住；已有格位可直接操作。</p>${btn('应用布局并继续','apply-and-slot',`data-slot="${esc(slotId)}"`,true)}`,null);
    if(workflows.isEggs(info.c))return workflows.openEggSlot(slotId);
    state.focusSlotId=slotId;if(state.view==='cabinet'&&state.cabinetId===info.c.id)scene?.selectSlot?.(slotId);else paintScene();
    const a=occupant(slotId),s=snakes().find(s=>s.id===a?.snake_id),w=s?M.latestWeight(s.id,measurements()):null,ts=state.tasks.filter(t=>t.slotId===slotId&&(!state.selected.length||state.selected.includes(t.date)));
    showDialog(titleOfSlot(slotId),s?`<div class="rw-specimen"><p class="eyebrow">${esc(s.id)} · ${({F:'♀ 母',M:'♂ 公',U:'性别待确认'})[s.sex]||'性别待确认'}</p><h3>${esc(s.gene_text||'基因待确认')}</h3><p>${w?`${w.weight} g · 测于 ${esc(w.measuredAt)}`:'未称重'} · ${scheduleLabel(info.c,slotId)}</p></div><div class="rw-actions">${btn('移动蛇只','move-snake',`data-snake="${esc(s.id)}"`)}${workflows.isIncubator(info.c)?'':btn('整盒移动','move-box',`data-slot="${esc(slotId)}" data-snake="${esc(s.id)}"`)}${workflows.isIncubator(info.c)?'<span class="rw-notice">冬化期间暂停常规喂食</span>':btn('本格喂食计划','slot-schedule',`data-slot="${esc(slotId)}"`)}${btn('称重','weigh',`data-snake="${esc(s.id)}"`)}${btn('标签备注','slot-note',`data-slot="${esc(slotId)}"`)}</div>${extras.labelDetail(slotId)}<h3>当前日期范围的喂食</h3>${taskList(ts)}<h3>最近位置／喂食记录</h3>${records().filter(r=>r.snake_id===s.id).slice(-6).reverse().map(r=>`<p class="rw-muted">${esc(r.occurred_at?.slice(0,16).replace('T',' '))} · ${({offered:'已投喂',fed:'确认进食',refused:'拒食',skipped:'跳过'})[r.result]||esc(r.result)} · ${r.mouse_min_g??'—'}–${r.mouse_max_g??'—'}g</p>`).join('')||'<p class="rw-muted">暂无喂食记录</p>'}`:`<p class="rw-empty">这是一个空盒。选择未入住蛇放入；已定位的蛇请从原格位点击「移动蛇只」，预览排期变化后转移。</p><div class="rw-form-grid">${select('选择蛇只','snake',[['','请选择未入住蛇'],...snakes().filter(s=>s.status==='active'&&!assignments().some(a=>a.snake_id===s.id)).map(s=>[s.id,`${s.id} · ${s.gene_text}`])],'')}</div>${workflows.isIncubator(info.c)?'<span class="rw-notice">冬化期间暂停常规喂食</span>':btn('本格喂食计划','slot-schedule',`data-slot="${esc(slotId)}"`)}${btn('标签备注','slot-note',`data-slot="${esc(slotId)}"`)}`,s?null:async form=>{const id=form.elements.snake.value;if(!id)throw Error('请先选择一条未入住蛇。');await write(()=>D.assign(id,slotId,state.snapshot.revision,false));},'放入蛇只',root=>{root.querySelector('.rw-form-body').insertAdjacentHTML('afterbegin',workflows.slotNavigation(slotId));workflows.attachSnakeSearch(root);},'detail');
  }
  function taskList(tasks) {tasks=M.preparationTasks(tasks,config(),snakes(),measurements());return tasks.length?`<div class="rw-task-list">${tasks.map(t=>`<article class="rw-task" style="--day-color:${M.dayColors[(new Date(t.date+'T12:00Z').getUTCDay()+6)%7]}"><div><b>${esc(t.snakeId)} · ${esc(t.date.slice(5))} ${esc(t.time)}</b><p>${t.mouseMin!=null?`${t.mouseMin}–${t.mouseMax}g`:'鼠重待确认'} × ${t.quantity??'—'}只 · ${({pending:'待喂',offered:'已投喂',completed:'已进食',refused:'拒食',skipped:'跳过',cancelled:'已取消'})[t.status]||t.status}</p>${t.locked?`<p class="rw-muted">已确认备料${t.needsReview?' · 位置或计划已变化，请复核':''}</p>`:''}</div><div class="rw-actions">${['pending','offered'].includes(t.status)?btn('记录结果','feed',`data-task="${esc(t.id)}"`):t.status!=='cancelled'?btn('更正记录','feed',`data-task="${esc(t.id)}"`):'<span aria-label="已取消">—</span>'}${t.status==='pending'&&!t.locked?btn('改期','reschedule',`data-task="${esc(t.id)}"`):''}</div></article>`).join('')}</div>`:'<p class="rw-empty">当前范围没有计划。先配置柜级或本格频率与时间。</p>';}
  function openFeedingList() {showDialog('本周巡柜',taskList(state.tasks.filter(t=>(state.view!=='cabinet'||t.cabinetId===state.cabinetId)&&(!state.selected.length||state.selected.includes(t.date))).sort((a,b)=>a.plannedAt.localeCompare(b.plannedAt))),null);}
  function openFeed(id) {
    const source=typeof id==='object'?id:state.tasks.find(t=>t.id===id);if(!source)return;const task=M.preparationTasks([source],config(),snakes(),measurements())[0];
    const existing=records().find(r=>r.snake_id===task.snakeId&&new Date(r.planned_at).getTime()===new Date(task.plannedAt).getTime());
    showDialog(`喂食记录 · ${task.snakeId}`,`<p>${esc(titleOfSlot(task.slotId))} · 计划 ${esc(task.date)} ${esc(task.time)}</p><div class="rw-form-grid">${select('结果','result',[['offered','已投喂，待确认进食'],['fed','已确认进食'],['refused','拒食'],['skipped','跳过']],existing?.result||({completed:'fed',offered:'offered',refused:'refused',skipped:'skipped'})[task.status]||'fed')}${field('实际时间','occurred',localInputNow(existing?.occurred_at),'datetime-local','required')}${field('本次鼠重下限 g','mouseMin',(existing?existing.mouse_min_g:task.mouseMin)??'','number','step="0.01" min="0.01"')}${field('本次鼠重上限 g','mouseMax',(existing?existing.mouse_max_g:task.mouseMax)??'','number','step="0.01" min="0.01"')}${field('本次只数','quantity',(existing?existing.quantity:task.quantity)??'','number','min="0" max="100"')}${field('备注／人工覆盖原因','notes',existing?.notes||'','text','maxlength="1000"')}</div>`,async (form,submitter)=>{const v=formValues(form),occurred=M.localDateTimeToInstant(v.occurred.slice(0,10),v.occurred.slice(11,16),config().timezone);if(!occurred||new Date(occurred)>new Date())throw Error('实际时间不能在未来。');const notFed=['refused','skipped'].includes(v.result);const payload={snake_id:task.snakeId,slot_id:task.slotId,cabinet_id:task.cabinetId,planned_at:task.plannedAt,due_at:task.dueAt||task.plannedAt,result:v.result,mouse_min_g:v.mouseMin===''?null:+v.mouseMin,mouse_max_g:v.mouseMax===''?null:+v.mouseMax,quantity:v.quantity===''?(notFed?0:null):+v.quantity,occurred_at:occurred,notes:v.notes};if(!notFed&&!(payload.quantity>0))throw Error('请填写实际投喂只数。');await write(()=>D.record(payload,state.snapshot.revision));window.SuohaWorkspace.load(true);if(submitter?.hasAttribute('data-feed-next'))return workflows.advanceTour(task);},'保存实际记录',root=>workflows.decorateFeed(task,root));
  }
  function openReschedule(id) {
    const task=state.tasks.find(t=>t.id===id);if(!task)return;
    showDialog('调整本次计划',`<p>${esc(task.snakeId)} · 原定 ${esc(task.date)} ${esc(task.time)}。仅调整这一次，之后仍按原周期。</p><div class="rw-form-grid">${field('改为日期','date',task.date,'date','required')}${field('改为时刻','time',task.time,'time','required')}</div><label class="rw-check"><input type="checkbox" name="cancelled">取消本次计划</label>`,async form=>{const v=formValues(form),next=copy(state.snapshot.config);const instant=M.localDateTimeToInstant(v.date,v.time,next.timezone);if(!instant)throw Error('所选当地时间无效。');const other=state.tasks.find(t=>t.id!==task.id&&t.snakeId===task.snakeId&&(t.dueAt||t.plannedAt)===instant&&t.status!=='cancelled');if(other&&!v.cancelled)throw Error('该蛇在目标时刻已有任务，请选择其他时间。');next.taskOverrides=(next.taskOverrides||[]).filter(x=>!(x.snakeId===task.snakeId&&x.plannedAt===task.plannedAt));next.taskOverrides.push({snakeId:task.snakeId,plannedAt:task.plannedAt,overrideAt:v.cancelled?null:instant,cancelled:!!v.cancelled});await saveBusinessConfig(next);},'保存本次调整');
  }
  function localInputNow(value) {const date=value?new Date(value):new Date();const parts=new Intl.DateTimeFormat('en-CA',{timeZone:config().timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;}
  function openWeigh(id) {showDialog(`称重 · ${id}`,`<div class="rw-form-grid">${field('实际称重日期','date',dateNow(),'date',`required max="${dateNow()}"`)}${field('蛇体重 g','weight','','number','required min="0.01" step="0.01"')}</div>`,async form=>{const v=formValues(form),r=await sb.from('snake_measurements').insert({snake_id:id,measured_at:v.date,weight_g:+v.weight,record_kind:'measurement'});if(r.error)throw r.error;await window.SuohaWorkspace.load(true);paint();},'保存测量');}
  function openHistory() {
    showDialog('历史记录',
      '<div class="rw-history"><p>查看全部位置变更与喂食记录，不受总览日期选择限制。喂食记录显示每次计划的最新结果。</p><div class="rw-history-filters">'+
      field('搜索蛇编号／位置／备注','historySearch','','search')+
      select('记录类型','historyType',[['','全部记录'],['move','位置变更'],['feeding','喂食记录'],['incubation','孵化记录']],'')+
      select('爬柜','historyCabinet',[['','全部爬柜']],'')+
      select('喂食结果','historyResult',[['','全部结果'],['offered','已投喂'],['fed','确认进食'],['refused','拒食'],['skipped','跳过']],'')+
      field('开始日期','historyFrom','','date')+field('结束日期','historyTo','','date')+
      select('时间排序','historySort',[['desc','最新在前'],['asc','最早在前']],'desc')+
      '<div class="rw-history-tools"><button type="button" class="rw-btn" data-history-reset>重置筛选</button><button type="button" class="rw-btn" data-history-refresh>刷新记录</button></div></div><p data-history-status role="status">正在读取历史记录…</p><div data-history-list></div><nav class="rw-history-pages" aria-label="历史记录分页"><button type="button" class="rw-btn" data-history-prev>上一页</button><span data-history-page></span><button type="button" class="rw-btn" data-history-next>下一页</button></nav></div>',null,'',root=>{
        const panel=root.querySelector('.rw-history'),form=root.querySelector('form'),list=panel.querySelector('[data-history-list]'),status=panel.querySelector('[data-history-status]');
        const prev=panel.querySelector('[data-history-prev]'),next=panel.querySelector('[data-history-next]'),refresh=panel.querySelector('[data-history-refresh]');
        const value=name=>form.elements[name].value;
        let rows=[],page=1,loading=false;
        const size=20,results={offered:'已投喂',fed:'确认进食',refused:'拒食',skipped:'跳过'};
        function render(){
          if(loading)return;
          const query=value('historySearch').trim().toLowerCase(),from=value('historyFrom'),to=value('historyTo');
          if(from&&to&&from>to){status.textContent='开始日期不能晚于结束日期。';list.innerHTML='';prev.disabled=next.disabled=true;panel.querySelector('[data-history-page]').textContent='';return;}
          const matches=rows.filter(r=>(!value('historyType')||r.kind===value('historyType'))&&(!value('historyResult')||(r.kind==='feeding'&&r.result===value('historyResult')))&&(!value('historyCabinet')||r.cabinets.includes(value('historyCabinet')))&&(!from||r.date>=from)&&(!to||r.date<=to)&&(!query||r.search.includes(query)))
            .sort((a,b)=>(value('historySort')==='asc'?1:-1)*(a.time-b.time||a.order-b.order));
          const pages=Math.max(1,Math.ceil(matches.length/size));page=Math.min(page,pages);
          status.textContent='共 '+matches.length+' 条记录'+(matches.length?' · 当前 '+((page-1)*size+1)+'–'+Math.min(page*size,matches.length)+' 条':'');
          list.innerHTML=matches.slice((page-1)*size,page*size).map(r=>'<article class="rw-history-card"><header><strong>'+esc(r.snake_id||'未知蛇只')+'</strong><span class="rw-history-kind">'+esc(r.kind==='move'?'位置变更':r.kind==='incubation'?({save:'孵蛋分配',move:'孵化盒转移',release:'结束孵化'})[r.action]||'孵化记录':results[r.result]||r.result)+'</span><time>'+esc(r.displayTime)+'</time></header><p>'+esc(r.location)+'</p>'+(r.kind==='feeding'?'<p>鼠重 '+esc(r.mouse_min_g??'—')+'–'+esc(r.mouse_max_g??'—')+' g · 数量 '+esc(r.quantity??'待确认')+' 只</p><details><summary>查看详情</summary><dl><dt>原计划时间</dt><dd>'+esc(r.plannedDisplay)+'</dd><dt>执行计划时间</dt><dd>'+esc(r.dueDisplay)+'</dd><dt>备注</dt><dd>'+esc(r.notes||'无')+'</dd><dt>记录编号</dt><dd>'+esc(r.id||'—')+'</dd></dl></details>':'<details><summary>查看详情</summary><p>记录编号：'+esc(r.id||'—')+'</p><p>原格位：'+esc(r.source||'未入住')+'<br>目标格位：'+esc(r.target||'未入住')+'</p></details>')+'</article>').join('')||'<p class="rw-empty">没有符合条件的历史记录。</p>';
          prev.disabled=page<=1;next.disabled=page>=pages;panel.querySelector('[data-history-page]').textContent=page+' / '+pages+' 页';
        }
        async function fetchHistory(){
          loading=true;refresh.disabled=prev.disabled=next.disabled=true;status.textContent='正在读取历史记录…';
          try{
            const snapshot=await D.load();if(!panel.isConnected||!root.open)return;
            const cfg=snapshot.config||M.defaultConfig(),tz=cfg.timezone||'Asia/Shanghai',slots=new Map(),cabinets=new Map();
            cfg.cabinets.forEach(c=>{cabinets.set(c.id,c.name);c.levels.forEach((l,li)=>l.slots.forEach((slot,si)=>slots.set(slot.id,{cabinet:c.id,label:c.name+' · L'+(c.levels.length-li)+' / '+(si+1)})));});
            const place=id=>!id?'未入住':slots.get(id)?.label||'已移除格位（'+id+'）';
            const format=v=>v&&!Number.isNaN(Date.parse(v))?new Intl.DateTimeFormat('zh-CN',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(v)):'未记录';
            rows=[...(snapshot.moves||snapshot.history||[]).map(r=>({...r,kind:'move',source:r.from_slot_id||r.source_slot||r.from_slot,target:r.to_slot_id||r.target_slot||r.to_slot})),...(snapshot.records||[]).map(r=>({...r,kind:'feeding'})),...(snapshot.incubation_history||[]).map(r=>({...r,kind:'incubation',source:r.source_slot,target:r.target_slot,snake_id:'窝次 '+r.payload?.clutch_id,notes:r.payload?.notes||'',egg_count:r.payload?.egg_count}))].map((r,order)=>{
              const stamp=r.occurred_at||r.created_at,time=Date.parse(stamp),ids=r.kind!=='feeding'?[slots.get(r.source)?.cabinet,slots.get(r.target)?.cabinet]:[r.cabinet_id||slots.get(r.slot_id)?.cabinet];
              ids.filter(Boolean).forEach(id=>{if(!cabinets.has(id))cabinets.set(id,'已移除爬柜（'+id+'）');});
              const location=r.kind==='feeding'?place(r.slot_id):r.kind==='incubation'?(r.source?place(r.source):'放入')+' → '+(r.target?place(r.target):'已结束')+' · '+(r.egg_count??'—')+' 枚 · '+(r.notes||'无备注'):place(r.source)+' → '+place(r.target);
              return {...r,order,time:Number.isNaN(time)?0:time,date:Number.isNaN(time)?'':M.localDate(new Date(time),tz),displayTime:format(stamp),plannedDisplay:format(r.planned_at),dueDisplay:format(r.due_at||r.planned_at),cabinets:ids.filter(Boolean),location,search:[r.snake_id,location,r.source,r.target,r.slot_id,r.notes].join(' ').toLowerCase()};
            });
            const chosen=value('historyCabinet');form.elements.historyCabinet.innerHTML='<option value="">全部爬柜</option>'+[...cabinets].map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');form.elements.historyCabinet.value=cabinets.has(chosen)?chosen:'';
            loading=false;render();
          }catch(e){if(panel.isConnected){list.innerHTML='';status.textContent='读取失败：'+e.message+'。请点击刷新记录重试。';panel.querySelector('[data-history-page]').textContent='';}}
          finally{loading=false;refresh.disabled=false;}
        }
        panel.querySelectorAll('input,select').forEach(input=>input.addEventListener('input',()=>{page=1;render();}));
        prev.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};
        panel.querySelector('[data-history-reset]').onclick=()=>{panel.querySelectorAll('input,select').forEach(input=>input.value=input.name==='historySort'?'desc':'');page=1;render();};
        refresh.onclick=fetchHistory;fetchHistory();
      });
  }
  async function action(b) {
    const a=b.dataset.rw;
    if(a==='layer-devices')return openLayerDevices(b.dataset.cabinet||state.cabinetId,b.dataset.level);
    if(a==='environment-refresh')return refreshEnvironment();
    if(a==='toggle-environment'){state.showEnvironment=!state.showEnvironment;paint();return;}
    if(a==='refresh')return load(true);
    if(!state.loaded||state.busy||state.loading)return;
    if(a==='cabinet'){dialog.close();return focusCabinet(b.dataset.cabinet);}
    if(a==='cabinet-tools'){state.controlsExpanded=!state.controlsExpanded;paint();return;}
    if(a==='add-incubator')return workflows.openIncubator();
    if(a==='batch-assign')return workflows.openBatchAssign();
    if(a==='egg-move')return workflows.moveEgg(b.dataset.slot);
    if(a==='egg-clear')return workflows.clearEgg(b.dataset.slot);
    if(a==='daily')return workflows.daily(b.dataset.kind);
    if(a==='daily-feed'){workflows.startTour(state.dailyTasks||[],b.dataset.task);return openFeed(state.dailyTasks?.find(t=>t.id===b.dataset.task));}
    if(a==='locate-slot'){const info=slotInfo(b.dataset.slot);if(!info)return;dialog.close();focusCabinet(info.c.id);state.focusSlotId=info.s.id;paintScene();scene.highlightSlot?.(info.s.id);return openSlot(info.s.id);}
    if(a==='feeding-mode'||a==='normal-mode'){state.feedingMode=a==='feeding-mode';paint();return;}
    if(a==='slot')return openSlot(b.dataset.slot);
    if(a==='delete-cabinet')return deleteCabinet(b.dataset.cabinet);
    if(a==='apply-and-slot'){try{await saveConfig(copy(config()));openSlot(b.dataset.slot);}catch(e){dialog.querySelector('[role=status]').textContent=e.message;}return;}
    if(a==='rotate-cabinet'){
      const next=copy(config()),c=next.cabinets.find(c=>c.id===b.dataset.cabinet);if(!c)return;
      c.rotation=((c.rotation||0)+90)%360;
      const hw=(c.rotation%180?c.depth:c.width)/2,hd=(c.rotation%180?c.width:c.depth)/2;
      c.x=Math.max(hw,Math.min(next.width-hw,c.x));c.z=Math.max(hd,Math.min(next.depth-hd,c.z));
      try{requireErrors(next);editConfig(next);toast(`${c.name} 已旋转至 ${c.rotation}°，应用布局后保存。`);}catch(e){toast('无法旋转：'+e.message,true);}return;
    }
    if(a==='environment')return openEnvironment();
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
    if(a==='feed'){workflows.startTour(workflows.tourTasks(),b.dataset.task);return openFeed(b.dataset.task);}
    if(a==='reschedule')return openReschedule(b.dataset.task);
    if(a==='feeding-list')return openFeedingList();
    if(a==='history')return openHistory();
    if(a==='fit')return scene.fit();
    if(a==='zoom-in'||a==='zoom-out')return scene.zoomBy(a==='zoom-in'?1.2:1/1.2);
    if(a==='apply'){try{await saveConfig(copy(config()));toast('爬房布局已保存');}catch(e){state.error=e.message;paint();}return;}
    if(a==='build'){state.build=!state.build;}
    if(a==='back'){state.view=overviewView;state.cabinetId=null;state.hover=null;state.focusSlotId=null;dialog.close();if(innerWidth<=760)requestAnimationFrame(()=>window.scrollTo({top:overviewScroll,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));}
    if(a==='view-plan'||a==='view-perspective'){state.view=a==='view-plan'?'plan':'perspective';state.hover=null;}
    if(a==='all-dates'){state.selected=[];state.hover=null;}
    if(a==='this-week'){state.week=dateNow();state.selected=[];}
    if(a==='prev-week'||a==='next-week'){const d=new Date(days()[0]+'T12:00Z');d.setUTCDate(d.getUTCDate()+(a==='next-week'?7:-7));state.week=d.toISOString().slice(0,10);state.selected=[];}
    if(a==='undo'&&state.undo.length){state.redo.push(copy(config()));state.draft=state.undo.pop();rememberDraft();}
    if(a==='redo'&&state.redo.length){state.undo.push(copy(config()));state.draft=state.redo.pop();rememberDraft();}
    if(a==='discard'&&confirm('放弃当前尚未应用的布局草稿？这不会修改已经保存的实际布局。')){state.draft=null;state.build=false;state.undo=[];state.redo=[];rememberDraft();}
    paint();
  }
  const workflows=window.SuohaRoomWorkflows.create({M,D,state,config,snakes,measurements,assignments,records,cabinet,slotInfo,titleOfSlot,days,dateNow,copy,esc,field,select,btn,showDialog,write,slotReady,placeNewCabinet,requireErrors,protectSlots,editConfig,mini,deleteCabinetButton,readSchedule,openFeed});
  const extras=window.SuohaRoomExtras.create({M,D,state,config,snakes,measurements,assignments,records,cabinet,slotInfo,titleOfSlot,days,dateNow,copy,esc,field,select,btn,showDialog,saveConfig,write,syncPlans,toast,editConfig,openFeed,slotReady,saveBusinessConfig,startTour:workflows.startTour});
  host.addEventListener('click',e=>{const d=e.target.closest('[data-rw-date]');if(d){state.selected=state.selected.includes(d.dataset.rwDate)?state.selected.filter(x=>x!==d.dataset.rwDate):[...state.selected,d.dataset.rwDate];state.hover=null;paint();return;}const b=e.target.closest('[data-rw]');if(b)Promise.resolve(action(b)).catch(e=>toast(e.message,true));});
  host.addEventListener('submit',e=>{if(!e.target.matches('[data-room-search]'))return;e.preventDefault();const query=e.target.elements.query.value.trim().toLowerCase();if(!query)return;const cs=config().cabinets.filter(c=>c.name.toLowerCase().includes(query));const ss=snakes().filter(s=>[s.id,s.gene_text].join(' ').toLowerCase().includes(query));if(cs.length===1&&!ss.length)return focusCabinet(cs[0].id);if(ss.length===1){const a=assignments().find(a=>a.snake_id===ss[0].id);if(a){focusCabinet(slotInfo(a.slot_id).c.id);return openSlot(a.slot_id);}return openMove(ss[0].id);}showDialog('定位结果',`${cs.map(c=>`<p>${btn(esc(c.name),'cabinet',`data-cabinet="${esc(c.id)}"`)}</p>`).join('')}${ss.map(s=>{const a=assignments().find(a=>a.snake_id===s.id);return `<p>${btn(esc(s.id+' · '+s.gene_text),a?'slot':'move-snake',a?`data-slot="${esc(a.slot_id)}"`:`data-snake="${esc(s.id)}"`)}</p>`;}).join('')||(!cs.length?'<p>没有匹配结果。</p>':'')}`,null);});
  dialog.addEventListener('click',e=>{const b=e.target.closest('[data-rw]');if(b)Promise.resolve(action(b)).catch(e=>toast(e.message,true));});
  host.addEventListener('pointerover',e=>{const d=e.target.closest('[data-rw-date]');if(!d||d.contains(e.relatedTarget))return;clearTimeout(hoverTimer);hoverTimer=setTimeout(()=>previewDate(d.dataset.rwDate),100);});
  host.addEventListener('pointerout',e=>{const d=e.target.closest('[data-rw-date]');if(!d||d.contains(e.relatedTarget))return;clearTimeout(hoverTimer);previewDate(null,false);});
  host.addEventListener('focusin',e=>{const d=e.target.closest('[data-rw-date]');if(d)previewDate(d.dataset.rwDate);});
  host.addEventListener('focusout',e=>{if(e.target.closest('[data-rw-date]'))previewDate(null,false);});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.dataset.placement==='detail'){e.preventDefault();closeDialog();}});
  host.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open&&state.view==='cabinet'){e.preventDefault();const id=state.cabinetId;state.view=overviewView;state.cabinetId=null;paint();host.querySelector(`[data-rw="cabinet"][data-cabinet="${CSS.escape(id)}"]`)?.focus({preventScroll:true});}});
  function render() {if(!currentUser||!canWrite())return;if(!state.loaded&&!state.loading&&!state.error)load();else paint();}
  window.SuohaRoomWorkspace={render,reload:()=>load(true),snapshot:()=>copy(state.snapshot),getView:()=>({view:state.view,cabinetId:state.cabinetId,dates:[...state.selected]})};
  addEventListener('suoha:listings',()=>{if(state.loaded&&document.getElementById('page-room').classList.contains('active'))paint();});
  addEventListener('suoha:logout',()=>{telemetryGeneration++;telemetry=null;telemetryError='';telemetryLoading=false;telemetryFetchedAt=null;state.epoch++;state.snapshot=null;state.draft=null;state.loaded=false;state.loading=false;state.error='';state.selected=[];state.hover=null;state.undo=[];state.redo=[];state.cabinetId=null;state.feedingMode=false;state.showEnvironment=false;state.view='perspective';scene?.destroy();scene=null;initialized=false;host.replaceChildren();dialog.close();});
  setInterval(()=>{if(state.loaded&&!state.busy&&!dialog.open&&document.getElementById('page-room')?.classList.contains('active'))paint();},60000);
  addEventListener('beforeunload',e=>{if(state.draft||state.busy){e.preventDefault();e.returnValue='';}});
})();
