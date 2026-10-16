(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SuohaRoomModel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const environment = typeof module === 'object' && module.exports && typeof require === 'function' ? require('./room-environment.js') : (typeof window !== 'undefined' ? window.SuohaRoomEnvironment : null);
  const dayColors = Object.freeze(['#2563EB', '#15803D', '#C2410C', '#7C3AED', '#0E7490', '#BE185D', '#946200']);
  const dateFormatters = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  let sequence = 0;
  const uid = prefix => prefix + '-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + '-' + (++sequence).toString(36));
  const numeric = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const positive = value => numeric(value) && Number(value) > 0;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  const weekday = date => (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7 + 1;
  function defaultConfig() {
    const bounds = [[0,10,1,2],[10,23,2,3],[23,35,3,4],[35,45,4,6],[45,60,6,8],[60,120,7,11],[120,160,16,20],[160,200,16,20],[200,null,20,24]];
    return { version: 1, name: '我的爬房', width: 4000, depth: 3000, height: 2600, timezone: 'Asia/Shanghai', cabinets: [], rules: bounds.map((r,i) => ({ id:'rule-'+(i+1), min:r[0], max:r[1], mouseMin:r[2], mouseMax:r[3] })), labels: ['id','sex','gene','weight','mouse','next'] };
  }
  function resizeLevels(cabinet, specs) {
    const next = clone(cabinet);
    next.levels = specs.map((spec, index) => {
      const old = spec.id ? cabinet.levels.find(level => level.id === spec.id) : cabinet.levels[index];
      const count = Number(spec.count);
      if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('每层盒数须为 1–50 的整数');
      return { ...(old?.environment ? {environment:clone(old.environment)} : {}), id: old?.id || uid('level'), height:Number(spec.height), count,
        boxWidth:Number(spec.boxWidth ?? (next.width / count)), boxDepth:Number(spec.boxDepth ?? next.depth), boxHeight:Number(spec.boxHeight ?? spec.height),
        slots:Array.from({length:count}, (_,i) => old?.slots[i] ? clone(old.slots[i]) : {id:uid('slot'), box_id:uid('box')}) };
    });
    const ids = new Set(next.levels.flatMap(level => level.slots.map(slot => slot.id)));
    next.slotSchedules = Object.fromEntries(Object.entries(next.slotSchedules || {}).filter(([id]) => ids.has(id)));
    return next;
  }
  function createCabinet(options = {}) {
    if(options.type==='incubator')return createIncubator(options);
    const cabinet = { id:options.id || uid('cabinet'), name:options.name || '银色爬柜', width:Number(options.width ?? 1200), depth:Number(options.depth ?? 500), height:Number(options.height ?? 1800), x:Number(options.x ?? (Number(options.width ?? 1200)/2+100)), z:Number(options.z ?? (Number(options.depth ?? 500)/2+100)), rotation:Number(options.rotation ?? 0), levels:[], schedule:null, slotSchedules:{}, ruleSetId:null };
    return resizeLevels(cabinet, options.levels || Array.from({length:5}, () => ({height:300,count:3,boxWidth:360,boxDepth:460,boxHeight:240})));
  }
  function resizeIncubator(cabinet,specs,box = {}) {
    const first=specs[0]||cabinet.levels?.[0]||{},old=cabinet.levels?.[0]||{};
    const dimensions={boxWidth:Number(box.boxWidth??first.boxWidth??old.boxWidth??360),boxDepth:Number(box.boxDepth??first.boxDepth??old.boxDepth??540),boxHeight:Number(box.boxHeight??first.boxHeight??old.boxHeight??240)};
    return resizeLevels({...cabinet,type:'incubator',schedule:null,slotSchedules:{}},specs.map(spec=>({...spec,...dimensions,height:dimensions.boxHeight})));
  }
  function createIncubator(options = {}) {
    const width=Number(options.width??1200),depth=Number(options.depth??600);
    const cabinet={id:options.id||uid('incubator'),name:options.name||(options.purpose==='eggs'?'孵蛋箱':'冬化箱'),type:'incubator',purpose:options.purpose??'brumation',width,depth,height:Number(options.height??1800),x:Number(options.x??width/2+100),z:Number(options.z??depth/2+100),rotation:Number(options.rotation??0),levels:[],schedule:null,slotSchedules:{},ruleSetId:null};
    return resizeIncubator(cabinet,options.levels||Array.from({length:5},()=>({count:3})),options);
  }
  // Cabinet-local coordinates: left/front origin in x/z, floor-origin y.
  // Each logical row contributes only its present columns; no shelf gaps.
  function incubatorLayout(cabinet) {
    const heights=[],boxes=[];let columns=0;
    (cabinet.levels||[]).forEach((level,row)=>{columns=Math.max(columns,level.slots?.length||0);(level.slots||[]).forEach((slot,column)=>{
      const width=Number(level.boxWidth),depth=Number(level.boxDepth),height=Number(level.boxHeight),y=heights[column]||0;
      boxes.push({slotId:slot.id,boxId:slot.box_id,levelId:level.id,row,column,x:column*width,y,z:0,width,depth,height});heights[column]=y+height;
    });});
    return {boxes,columns,stackHeight:Math.max(0,...heights)};
  }
  function cloneLevel(level) {
    return {id:uid('level'),height:Number(level.height),count:Number(level.count),boxWidth:Number(level.boxWidth),boxDepth:Number(level.boxDepth),boxHeight:Number(level.boxHeight),slots:Array.from({length:Number(level.count)},()=>({id:uid('slot'),box_id:uid('box')}))};
  }
  function cloneCabinet(cabinet, options = {}) {
    return {id:uid('cabinet'),name:options.name || `${cabinet.name} 副本`,width:Number(cabinet.width),depth:Number(cabinet.depth),height:Number(cabinet.height),x:Number(options.x??cabinet.x),z:Number(options.z??cabinet.z),rotation:Number(cabinet.rotation),levels:cabinet.levels.map(cloneLevel),schedule:null,slotSchedules:{},ruleSetId:null,...(cabinet.type?{type:cabinet.type}:{}),...(cabinet.purpose?{purpose:cabinet.purpose}:{}),...(cabinet.labelTemplate?{labelTemplate:clone(cabinet.labelTemplate)}:{})};
  }
  function locateSlot(config,slotId) {
    for(const cabinet of config.cabinets||[])for(const level of cabinet.levels||[])for(const slot of level.slots||[])if(slot.id===slotId)return {cabinet,level,slot};
    return null;
  }
  function effectiveSchedule(config,slotId) {
    const info=locateSlot(config,slotId);
    if(!info)return null;
    const independent=Object.prototype.hasOwnProperty.call(info.cabinet.slotSchedules||{},slotId);
    const rawSchedule=clone((independent?info.cabinet.slotSchedules[slotId]:info.cabinet.schedule)??null),suspended=info.cabinet.type==='incubator';
    return {cabinetId:info.cabinet.id,slotId,source:independent?'slot':'cabinet',schedule:suspended?null:rawSchedule,rawSchedule,suspended,suspendReason:suspended?(info.cabinet.purpose==='eggs'?'孵蛋箱不安排蛇只喂食':'冬化期间暂停喂食'):null,cabinetPaused:!!info.cabinet.schedule?.paused||suspended};
  }
  function previewMove(snapshot,request,snakes,measurements,options) {
    const config=clone(snapshot.config),assignments=clone(snapshot.assignments||[]),records=clone(snapshot.records||[]),warnings=[],errors=[];
    const now=options.now ? new Date(options.now).toISOString() : new Date().toISOString();
    const originalSource=(snapshot.assignments||[]).find(a=>a.snake_id===request.snakeId);
    const sourceSlotId=request.wholeBox?request.sourceSlotId:(originalSource?.slot_id||null),targetSlotId=request.targetSlotId||null;
    const source=locateSlot(config,sourceSlotId),target=locateSlot(config,targetSlotId),mode=request.scheduleMode||'inherit';
    const sourceAssignment=assignments.find(a=>a.slot_id===sourceSlotId),targetAssignment=assignments.find(a=>a.slot_id===targetSlotId);
    const affectedIds=new Set([request.wholeBox?sourceAssignment?.snake_id:request.snakeId,targetAssignment?.snake_id].filter(Boolean));
    const result={config,assignments,records,affected:[],beforeTasks:[],afterTasks:[],beforeSummary:summarize([]),afterSummary:summarize([]),addedTasks:[],removedTasks:[],changedTasks:[],warnings,errors};
    if(!['inherit','carry'].includes(mode))errors.push('请选择采用目标计划或携带原计划');
    if(!request.wholeBox&&request.sourceSlotId&&request.sourceSlotId!==originalSource?.slot_id)errors.push('来源格位已改变或已移空，请刷新后重新预览');
    if(request.wholeBox&&request.snakeId&&sourceAssignment?.snake_id!==request.snakeId)errors.push('来源蛇只已改变或盒子已移空，请刷新后重新预览');
    if(targetSlotId&&!target)errors.push('目标格位不存在');
    if(target?.cabinet.type==='incubator'&&target.cabinet.purpose==='eggs')errors.push('孵蛋箱仅放蛋盒，不能放入蛇只');
    if(mode==='carry'&&(source?.cabinet.type==='incubator'||target?.cabinet.type==='incubator'))errors.push('移入或移出孵化箱须采用目标计划，不能携带喂食排期');
    if(request.wholeBox&&(source?.cabinet.type==='incubator'||target?.cabinet.type==='incubator'))errors.push('孵化箱只支持移动蛇只，不支持整盒交换');
    for(const [animal,destination] of [[request.wholeBox?sourceAssignment?.snake_id:request.snakeId,target],[targetAssignment?.snake_id,source]]){
      if(!animal||destination?.cabinet.type!=='incubator'||destination.cabinet.purpose!=='brumation')continue;
      const locked=[...(snapshot.planned_tasks||[]).filter(t=>t.batch_id||t.batch_item_id),...(snapshot.locked_tasks||[]),...(snapshot.batches||[]).flatMap(b=>b.items||[])].filter(t=>t.snake_id===animal);
      if(locked.some(t=>{const r=records.find(r=>r.snake_id===animal&&Date.parse(r.planned_at)===Date.parse(t.planned_at))||t.record;return !r||r.result==='offered';}))errors.push('进入冬化前须先完成或跳过已确认备料批次');
    }
    if(request.wholeBox&&(!source||!target||sourceSlotId===targetSlotId))errors.push('整盒移动需要两个不同的实际格位');
    if(!request.wholeBox){const snake=snakes.find(s=>s.id===request.snakeId);if(!snake||(targetSlotId&&snake.status&&snake.status!=='active'))errors.push('仅在养蛇只可放入格位');}
    if(targetAssignment&&targetAssignment.snake_id!==request.snakeId&&(!request.swap||(!request.wholeBox&&!source)))errors.push('目标已有蛇只，请明确选择交换并提供原格位');
    if(!request.wholeBox&&targetAssignment&&snakes.find(s=>s.id===targetAssignment.snake_id)?.status&&snakes.find(s=>s.id===targetAssignment.snake_id)?.status!=='active')errors.push('目标蛇只不在养，不能交换');
    if(mode==='carry'&&(!source||!target))errors.push('携带原计划需要两个实际格位');
    if(request.wholeBox&&source&&target&&['boxWidth','boxDepth','boxHeight'].some(k=>Number(source.level[k])!==Number(target.level[k])))errors.push('整盒交换要求两格盒子长宽高一致');
    if(errors.length)return result;
    const noChange=!request.wholeBox&&sourceSlotId===targetSlotId;
    if(!noChange){
      if(mode==='carry'){
        const from=effectiveSchedule(snapshot.config,sourceSlotId)?.schedule??null,to=effectiveSchedule(snapshot.config,targetSlotId)?.schedule??null;
        (target.cabinet.slotSchedules||={})[targetSlotId]=clone(from);
        const carryBack=request.wholeBox?!!request.swap:!!targetAssignment;
        if(carryBack)(source.cabinet.slotSchedules||={})[sourceSlotId]=clone(to);
        warnings.push('目标格的独立计划将替换为来源计划；空计划也会保留为明确的未安排状态');
      }
      if(request.wholeBox){const id=source.slot.box_id;source.slot.box_id=target.slot.box_id;target.slot.box_id=id;}
      result.assignments=assignments.filter(a=>!affectedIds.has(a.snake_id));
      const snakeId=request.wholeBox?sourceAssignment?.snake_id:request.snakeId;
      if(snakeId&&targetSlotId)result.assignments.push({snake_id:snakeId,slot_id:targetSlotId,assigned_at:now});
      if(targetAssignment&&targetAssignment.snake_id!==snakeId&&sourceSlotId)result.assignments.push({snake_id:targetAssignment.snake_id,slot_id:sourceSlotId,assigned_at:now});
      if(targetAssignment&&targetAssignment.snake_id!==snakeId)warnings.push(`交换将同时移动 ${targetAssignment.snake_id}，并按${mode==='carry'?'携带双方原计划':'各自目标格计划'}重新预览`);
    }
    const taskOptions={...options,now,plannedTasks:snapshot.planned_tasks||[],lockedTasks:snapshot.locked_tasks||[]};
    result.beforeTasks=generateTasks(snapshot.config,snapshot.assignments||[],snakes,measurements,records,taskOptions).filter(t=>affectedIds.has(t.snakeId));
    result.afterTasks=generateTasks(config,result.assignments,snakes,measurements,records,taskOptions).filter(t=>affectedIds.has(t.snakeId));
    result.beforeSummary=summarize(result.beforeTasks);result.afterSummary=summarize(result.afterTasks);
    const key=t=>t.snakeId+':'+t.plannedAt,before=new Map(result.beforeTasks.map(t=>[key(t),t])),after=new Map(result.afterTasks.map(t=>[key(t),t]));
    result.addedTasks=result.afterTasks.filter(t=>!before.has(key(t)));result.removedTasks=result.beforeTasks.filter(t=>!after.has(key(t)));
    const changedFields=['slotId','cabinetId','dueAt','mouseMin','mouseMax','quantity','status'];
    result.changedTasks=result.afterTasks.filter(t=>before.has(key(t))&&changedFields.some(f=>before.get(key(t))[f]!==t[f])).map(t=>({before:before.get(key(t)),after:t}));
    result.affected=[...affectedIds].map(snakeId=>{const from=(snapshot.assignments||[]).find(a=>a.snake_id===snakeId)?.slot_id||null,to=result.assignments.find(a=>a.snake_id===snakeId)?.slot_id||null,beforeScheduleInfo=effectiveSchedule(snapshot.config,from),afterScheduleInfo=effectiveSchedule(config,to);return {snakeId,fromSlotId:from,toSlotId:to,beforeSchedule:beforeScheduleInfo?.schedule??null,afterSchedule:afterScheduleInfo?.schedule??null,beforeScheduleInfo,afterScheduleInfo,beforeTasks:result.beforeTasks.filter(t=>t.snakeId===snakeId),afterTasks:result.afterTasks.filter(t=>t.snakeId===snakeId)};});
    if(records.some(r=>affectedIds.has(r.snake_id)))warnings.push('既有实际喂食记录保留原柜位及鼠量；待确认投喂任务导航到新位置');
    if(result.afterTasks.some(t=>t.locked))warnings.push('已锁定备料保留确认时的安排，需复核新位置与计划差异');
    if(target?.cabinet.type==='incubator')warnings.push('移入冬化箱后暂停喂食；移出时恢复目标格位的喂食计划');
    if(source?.cabinet.type==='incubator')warnings.push('移出冬化箱后采用目标格位的喂食计划，原历史记录不迁移');
    return result;
  }
  function localParts(value, timezone) {
    if (!dateFormatters.has(timezone)) dateFormatters.set(timezone,new Intl.DateTimeFormat('en-GB', {timeZone:timezone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
    const entries = dateFormatters.get(timezone).formatToParts(new Date(value));
    return Object.fromEntries(entries.filter(p => p.type !== 'literal').map(p => [p.type,p.value]));
  }
  function localDate(now = new Date(), timezone = 'Asia/Shanghai') {
    const p = localParts(now, timezone); return `${p.year}-${p.month}-${p.day}`;
  }
  function weekDates(dateIso = localDate(), timezone = 'Asia/Shanghai') {
    const date = validDate(dateIso) ? dateIso : localDate(dateIso, timezone);
    const monday = addDays(date, 1-weekday(date));
    return Array.from({length:7}, (_,i) => addDays(monday,i));
  }
  // Resolve calendar time against IANA timezone offsets. A spring-forward gap is
  // rejected; the earlier occurrence is chosen for a repeated autumn hour.
  function localDateTimeToInstant(date, time, timezone = 'Asia/Shanghai') {
    if (!validDate(date) || !validTime(time)) return null;
    const wall = Date.parse(`${date}T${time}:00Z`), offsets = new Set();
    try {
      for (const delta of [-36,-12,0,12,36]) {
        const instant = wall + delta*3600000, p = localParts(instant,timezone);
        offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`) - instant);
      }
      const matches = [...offsets].map(offset => wall-offset).filter(instant => {
        const p = localParts(instant,timezone);
        return `${p.year}-${p.month}-${p.day}` === date && `${p.hour}:${p.minute}` === time;
      });
      return matches.length ? new Date(Math.min(...matches)).toISOString() : null;
    } catch (_) { return null; }
  }
  function validateSchedule(schedule, prefix, errors) {
    if (schedule == null) return;
    if (!['weekly','interval'].includes(schedule.mode)) errors.push(prefix+'：请选择排期模式');
    if (!validDate(schedule.start)) errors.push(prefix+'：请填写有效起始日期');
    if (schedule.end != null && (!validDate(schedule.end) || schedule.end < schedule.start)) errors.push(prefix+'：结束日期不得早于起始日期');
    if (!validTime(schedule.time)) errors.push(prefix+'：请填写有效喂食时刻');
    if (schedule.quantity != null && (!Number.isInteger(schedule.quantity) || schedule.quantity < 1)) errors.push(prefix+'：只数须为正整数或留空');
    if (schedule.mode === 'interval' && (!Number.isInteger(schedule.interval) || schedule.interval < 1)) errors.push(prefix+'：间隔须为正整数天');
    if (schedule.mode === 'weekly' && (!Array.isArray(schedule.weekdays) || !schedule.weekdays.length || schedule.weekdays.some(day => !Number.isInteger(day) || day<1 || day>7) || new Set(schedule.weekdays).size !== schedule.weekdays.length)) errors.push(prefix+'：请选择不重复的星期');
    if (Object.entries(schedule.times || {}).some(([day,time]) => !/^[1-7]$/.test(day) || !validTime(time))) errors.push(prefix+'：各日时刻无效');
  }
  function cabinetCorners(cabinet) {
    const radians = Number(cabinet.rotation)*Math.PI/180, cos=Math.cos(radians), sin=Math.sin(radians);
    const cx=Number(cabinet.x), cz=Number(cabinet.z);
    return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z]) => ({x:cx+x*cabinet.width/2*cos-z*cabinet.depth/2*sin,z:cz+x*cabinet.width/2*sin+z*cabinet.depth/2*cos}));
  }
  function overlaps(a,b) {
    for (const polygon of [a,b]) for (let i=0;i<4;i++) {
      const p=polygon[i],q=polygon[(i+1)%4], axis={x:-(q.z-p.z),z:q.x-p.x};
      const ap=a.map(v => v.x*axis.x+v.z*axis.z),bp=b.map(v => v.x*axis.x+v.z*axis.z);
      if (Math.max(...ap)<=Math.min(...bp)+0.001 || Math.max(...bp)<=Math.min(...ap)+0.001) return false;
    }
    return true;
  }
  function validateConfig(config) {
    const errors=[];
    if (!config || typeof config !== 'object') return ['房间配置无效'];
    for (const [key,label] of [['width','房间宽度'],['depth','房间深度'],['height','房间高度']]) if (!positive(config[key])) errors.push(label+'须为正数');
    try { if (typeof config.timezone!=='string' || !config.timezone) throw new Error(); localDate(new Date(),config.timezone); } catch (_) { errors.push('房间时区无效'); }
    if (!Array.isArray(config.rules) || !config.rules.length) errors.push('至少配置一档完整鼠重规则');
    else {
      const rules=config.rules.slice().sort((a,b)=>a.min-b.min), ruleIds=new Set();
      let previous=0;
      rules.forEach((rule,i)=>{
        if (!rule.id || ruleIds.has(rule.id)) errors.push('鼠重规则编号缺失或重复'); ruleIds.add(rule.id);
        if (!numeric(rule.min) || rule.min<0 || rule.min!==previous) errors.push('蛇重档位必须从 0 开始连续覆盖，不得重叠或留空');
        if (rule.max!==null && (!positive(rule.max) || rule.max<=rule.min)) errors.push('蛇重档位上限须大于下限');
        if ((rule.max===null)!==(i===rules.length-1)) errors.push('仅最后一档上限应为无限');
        if (!positive(rule.mouseMin) || !positive(rule.mouseMax) || rule.mouseMax<rule.mouseMin) errors.push('鼠重上下限须为正数且顺序正确');
        previous=rule.max;
      });
    }
    const ids=new Set(), boxIds=new Set(), polygons=[];
    const overrideKeys=new Set();
    for (const entry of config.taskOverrides || []) {
      const key=entry.snakeId+':'+entry.plannedAt;
      if (!entry.snakeId || !entry.plannedAt || Number.isNaN(Date.parse(entry.plannedAt)) || (entry.overrideAt!=null && Number.isNaN(Date.parse(entry.overrideAt))) || typeof entry.cancelled!=='boolean' || overrideKeys.has(key)) errors.push('单次改期须包含有效蛇只、原定时间及唯一计划');
      overrideKeys.add(key);
    }
    if (!Array.isArray(config.cabinets)) return [...errors,'柜体列表无效'];
    for (const cabinet of config.cabinets) {
      const name=cabinet.name || '柜体';
      if(cabinet.type!=null&&!['rack','incubator'].includes(cabinet.type))errors.push(name+'：柜体类型无效');
      if(cabinet.type==='incubator'&&!['brumation','eggs'].includes(cabinet.purpose))errors.push(name+'：孵化箱用途须为冬化或孵蛋');
      if(cabinet.type==='incubator'&&(cabinet.schedule!=null||Object.keys(cabinet.slotSchedules||{}).length))errors.push(name+'：孵化箱不支持喂食排期');
      for (const key of ['width','depth','height']) if (!positive(cabinet[key])) errors.push(name+'：柜体尺寸须为正数');
      if (Number(cabinet.height)>Number(config.height)) errors.push(name+'：柜体高于房间');
      if (![cabinet.x,cabinet.z,cabinet.rotation].every(numeric)) errors.push(name+'：位置或角度无效');
      if (![0,90,180,270].includes(Number(cabinet.rotation))) errors.push(name+'：柜体朝向须为 0、90、180 或 270 度');
      for (const item of [cabinet,...(cabinet.levels||[]),...(cabinet.levels||[]).flatMap(l=>l.slots||[])]) { if (!item.id || ids.has(item.id)) errors.push('柜、层、格编号缺失或重复'); ids.add(item.id); }
      const corners=cabinetCorners(cabinet);
      if (corners.some(p=>p.x < -0.001 || p.z < -0.001 || p.x > Number(config.width)+0.001 || p.z > Number(config.depth)+0.001)) errors.push(name+'：柜体超出房间边界');
      if (polygons.some(other=>overlaps(corners,other))) errors.push(name+'：柜体与其他柜体重叠');
      polygons.push(corners);
      if (!Array.isArray(cabinet.levels) || !cabinet.levels.length) errors.push(name+'：至少需要一层');
      if (cabinet.type!=='incubator'&&(cabinet.levels||[]).reduce((n,l)=>n+Number(l.height),0)>Number(cabinet.height)) errors.push(name+'：层高合计超出柜高');
      if(cabinet.type==='incubator'){
        const first=cabinet.levels?.[0];
        if((cabinet.levels||[]).some(l=>['boxWidth','boxDepth','boxHeight'].some(k=>Number(l[k])!==Number(first[k]))))errors.push(name+'：孵化箱各层须使用统一盒型');
        if(incubatorLayout(cabinet).boxes.some(b=>b.x+b.width>Number(cabinet.width)+0.001||b.z+b.depth>Number(cabinet.depth)+0.001||b.y+b.height>Number(cabinet.height)+0.001))errors.push(name+'：堆叠盒子超出孵化箱空间');
      }
      for (const level of cabinet.levels||[]) {
        if(level.environment!==undefined){if(!environment)errors.push('温湿度模块未加载');else errors.push(...environment.validate(level.environment));}
        if (!Number.isInteger(level.count) || level.count<1 || level.count>50 || level.slots?.length!==level.count) errors.push(name+'：每层格数或格位列表无效');
        if (![level.height,level.boxWidth,level.boxDepth,level.boxHeight].every(positive)) errors.push(name+'：层和盒子尺寸须为正数');
        if (level.boxWidth*level.count>Number(cabinet.width)+0.001 || Number(level.boxDepth)>Number(cabinet.depth) || Number(level.boxHeight)>Number(level.height)) errors.push(name+'：盒子尺寸超出本层容纳范围');
        for (const slot of level.slots||[]) { if (!slot.box_id || boxIds.has(slot.box_id)) errors.push('盒子编号缺失或重复'); boxIds.add(slot.box_id); }
      }
      validateSchedule(cabinet.schedule,name,errors);
      const slotIds=new Set((cabinet.levels||[]).flatMap(l=>(l.slots||[]).map(s=>s.id)));
      for (const [slot,schedule] of Object.entries(cabinet.slotSchedules||{})) { if (!slotIds.has(slot)) errors.push(name+'：独立计划引用不存在的格位'); validateSchedule(schedule,name+'单格',errors); }
    }
    return [...new Set(errors)];
  }
  function matchMouse(weight,rules,sex) {
    if (!positive(weight)) return null;
    const matches=(rules||[]).filter(rule=>Number(weight)>Number(rule.min) && (rule.max===null || Number(weight)<=Number(rule.max)));
    const result=matches.length===1 && positive(matches[0].mouseMin) && positive(matches[0].mouseMax) && matches[0].mouseMax>=matches[0].mouseMin ? clone(matches[0]) : null;
    if(result&&sex==='M'&&(result.mouseMin>6||result.mouseMax>8))Object.assign(result,{mouseMin:6,mouseMax:8});
    return result;
  }
  function latestWeight(snakeId,measurements,through=null) {
    const idOrder=(a,b)=>/^\d+$/.test(String(a))&&/^\d+$/.test(String(b))?(BigInt(b)>BigInt(a)?1:BigInt(b)<BigInt(a)?-1:0):String(b).localeCompare(String(a));
    const record=(measurements||[]).filter(row=>row.snake_id===snakeId && positive(row.weight_g) && !Number.isNaN(Date.parse(row.measured_at)) && (!through||String(row.measured_at).slice(0,10)<=through)).sort((a,b)=>Date.parse(b.measured_at)-Date.parse(a.measured_at) || idOrder(a.id,b.id))[0];
    return record ? {weight:Number(record.weight_g),measurementId:record.id,measuredAt:record.measured_at} : null;
  }
  function generateTasks(config,assignments,snakes,measurements,records,{from,to,plannedTasks=[],lockedTasks=[],now=Date.now()}) {
    if (!validDate(from) || !validDate(to) || from>to || (Date.parse(to)-Date.parse(from))/86400000>366) throw new Error('计划日期范围须有效且不超过 367 天');
    const snakeIds=new Set((snakes||[]).map(s=>s.id)), assignmentMap=new Map(), tasks=[], seen=new Set(), instants=new Map();
    for (const a of assignments||[]) if (snakeIds.has(a.snake_id) && !assignmentMap.has(a.slot_id)) assignmentMap.set(a.slot_id,a);
    const results=new Map(), overrideMap=new Map(),lockedMap=new Map();
    for(const stored of [...plannedTasks.filter(t=>t.batch_id||t.batch_item_id),...lockedTasks])if(stored.planned_at&&!Number.isNaN(Date.parse(stored.planned_at)))lockedMap.set(stored.snake_id+':'+new Date(stored.planned_at).toISOString(),stored);
    for (const entry of config.taskOverrides || []) if (entry.plannedAt && !Number.isNaN(Date.parse(entry.plannedAt))) overrideMap.set(entry.snakeId+':'+new Date(entry.plannedAt).toISOString(),entry);
    for (const record of records||[]) {
      if (!record.planned_at || Number.isNaN(Date.parse(record.planned_at))) continue;
      const key=record.snake_id+':'+new Date(record.planned_at).toISOString();
      const old=results.get(key);
      if (!old || String(record.occurred_at||'')>String(old.occurred_at||'')) results.set(key,record);
    }
    for (const cabinet of config.cabinets||[]) {
      if (cabinet.schedule?.paused||cabinet.type==='incubator') continue;
      for (const level of cabinet.levels||[]) for (const slot of level.slots||[]) {
        const assignment=assignmentMap.get(slot.id); if (!assignment) continue;
        const schedule=Object.prototype.hasOwnProperty.call(cabinet.slotSchedules||{},slot.id) ? cabinet.slotSchedules[slot.id] : cabinet.schedule;
        if (!schedule || schedule.paused || !validDate(schedule.start)) continue;
        const measured=latestWeight(assignment.snake_id,measurements), mouse=matchMouse(measured?.weight,config.rules,snakes.find(s=>s.id===assignment.snake_id)?.sex);
        const candidateDates=new Set();for(let d=from;d<=to;d=addDays(d,1))candidateDates.add(d);
        for(const entry of config.taskOverrides||[]) if(entry.snakeId===assignment.snake_id&&entry.overrideAt&&localDate(entry.overrideAt,config.timezone)>=from&&localDate(entry.overrideAt,config.timezone)<=to)candidateDates.add(localDate(entry.plannedAt,config.timezone));
        for (const originalDate of candidateDates) {
          let date=originalDate;
          if (date<schedule.start || (schedule.end && date>schedule.end)) continue;
          const day=weekday(date);
          if (schedule.mode==='weekly' ? !schedule.weekdays?.includes(day) : schedule.mode!=='interval' || !Number.isInteger(schedule.interval) || schedule.interval<1 || ((Date.parse(date)-Date.parse(schedule.start))/86400000)%schedule.interval!==0) continue;
          let time=schedule.mode==='weekly' ? schedule.times?.[day] || schedule.time : schedule.time;
          const clockKey=date+'T'+time;
          if (!instants.has(clockKey)) instants.set(clockKey,localDateTimeToInstant(date,time,config.timezone));
          const plannedAt=instants.get(clockKey);
          // A DST gap does not become a silently shifted feeding event.
          const key=assignment.snake_id+':'+(plannedAt || `${date}T${time}`);
          const override=overrideMap.get(key),locked=lockedMap.get(key),dueAt=locked?(locked.due_at||locked.planned_at):override?.overrideAt || plannedAt;
          if(dueAt){const parts=localParts(dueAt,config.timezone);date=`${parts.year}-${parts.month}-${parts.day}`;time=`${parts.hour}:${parts.minute}`;}
          if(date<from||date>to)continue;
          if (assignment.assigned_at && plannedAt && Date.parse(plannedAt)<Date.parse(assignment.assigned_at)) continue;
          if (seen.has(key)) continue; seen.add(key);
          const record=results.get(key), warnings=[];
          let mouseMin=mouse?.mouseMin ?? null,mouseMax=mouse?.mouseMax ?? null,quantity=Number.isInteger(schedule.quantity)&&schedule.quantity>0?schedule.quantity:null;
          if (record) { mouseMin=record.mouse_min_g;mouseMax=record.mouse_max_g;quantity=record.quantity; }
          if (!measured && !record) warnings.push('待称重');
          if (!positive(mouseMin) || !positive(mouseMax) || mouseMax<mouseMin) { mouseMin=null;mouseMax=null;warnings.push('鼠重待确认'); }
          if (!Number.isInteger(quantity) || quantity<1) {quantity=null;warnings.push('只数待确认');}
          if (!plannedAt) warnings.push('当地时刻不存在，请调整计划');
          const status=record ? ({fed:'completed',eaten:'completed',completed:'completed',offered:'offered',skipped:'skipped',refused:'refused',cancelled:'cancelled'}[record.result] || 'pending') : !locked&&override?.cancelled?'cancelled':'pending';
          tasks.push({id:`${assignment.snake_id}:${plannedAt||originalDate+'T'+time}`,snakeId:assignment.snake_id,slotId:slot.id,cabinetId:cabinet.id,date,time,plannedAt,dueAt,originalPlannedAt:plannedAt,weight:measured?.weight ?? null,measurementId:record?.measurement_id || measured?.measurementId || null,measuredAt:measured?.measuredAt || null,mouseMin,mouseMax,quantity,status,warnings,recordId:record?.id || null});
        }
      }
    }
    // Actual records survive recurrence edits and moves. Elapsed frozen plans
    // retain their confirmed quantities; location follows the current animal.
    for(const stored of [...plannedTasks.filter(t=>t.batch_id||t.batch_item_id||Date.parse(t.due_at||t.planned_at)<=new Date(now).getTime()),...lockedTasks,...results.values()]){
      if(!stored.planned_at||Number.isNaN(Date.parse(stored.planned_at)))continue;
      const plannedAt=new Date(stored.planned_at).toISOString(),key=stored.snake_id+':'+plannedAt,override=overrideMap.get(key);
      const locked=lockedMap.get(key),dueAt=stored.result ? stored.due_at||locked?.due_at||override?.overrideAt||plannedAt : locked ? locked.due_at||plannedAt : override?.overrideAt||stored.due_at||plannedAt,parts=localParts(dueAt,config.timezone),date=`${parts.year}-${parts.month}-${parts.day}`,time=`${parts.hour}:${parts.minute}`;
      if(date<from||date>to)continue;
      const index=tasks.findIndex(t=>t.snakeId===stored.snake_id&&t.plannedAt===plannedAt),existing=tasks[index];
      const historical=stored.result && stored.result!=='offered';
      const placement=(assignments||[]).find(a=>a.snake_id===stored.snake_id),slotId=historical?stored.slot_id:placement?.slot_id||null;
      const rack=(config.cabinets||[]).find(c=>(c.levels||[]).some(l=>(l.slots||[]).some(s=>s.id===slotId)));
      const measured=latestWeight(stored.snake_id,measurements),status=stored.result?({fed:'completed',eaten:'completed',completed:'completed',offered:'offered',skipped:'skipped',refused:'refused',cancelled:'cancelled'}[stored.result]||'pending'):!locked&&override?.cancelled?'cancelled':'pending';
      const needsReview=!!locked&&!stored.result&&(!existing||['mouseMin','mouseMax','quantity','dueAt'].some((k,i)=>existing[k]!==[stored.mouse_min_g,stored.mouse_max_g,stored.quantity,dueAt][i])||locked.slot_id!==slotId);
      const task={...existing,id:`${stored.snake_id}:${plannedAt}`,snakeId:stored.snake_id,slotId,cabinetId:historical?stored.cabinet_id:rack?.id||null,date,time,plannedAt,dueAt,originalPlannedAt:plannedAt,weight:measured?.weight??null,measurementId:stored.measurement_id||measured?.measurementId||null,measuredAt:measured?.measuredAt||null,mouseMin:stored.mouse_min_g??null,mouseMax:stored.mouse_max_g??null,quantity:stored.quantity??null,status,warnings:[...(stored.warnings||[])],recordId:stored.result?stored.id:null,frozen:!stored.result,locked:!!locked,batchId:locked?.batch_id||null,batchItemId:locked?.batch_item_id||null,needsReview:needsReview||existing?.needsReview||false,snapshotSlotId:locked?.slot_id||stored.slot_id,snapshotCabinetId:locked?.cabinet_id||stored.cabinet_id};
      if(!stored.result&&!locked&&snakes.find(s=>s.id===stored.snake_id)?.sex==='M'&&(task.mouseMin>6||task.mouseMax>8)){task.mouseMin=6;task.mouseMax=8;}
      task.needsLocation=!historical&&!placement;task.ruleVersionId=stored.rule_version_id||locked?.rule_version_id||existing?.ruleVersionId||null;
      if(!stored.result&&rack?.type==='incubator'){task.status='suspended';task.suspended=true;task.warnings.push('冬化期间暂停喂食');if(task.locked)task.needsReview=true;}
      if(index>=0)tasks[index]=task;else tasks.push(task);
    }
    const reserved=new Map();for(const task of tasks)if(task.locked)reserved.set(task.snakeId+':'+task.date,task);
    for(let i=tasks.length-1;i>=0;i--){const task=tasks[i],locked=reserved.get(task.snakeId+':'+task.date);if(locked&&!task.locked&&task.status==='pending'&&task.plannedAt!==locked.plannedAt){locked.needsReview=true;locked.warnings.push('已锁定批次保留原安排，同日变更新计划未追加');tasks.splice(i,1);}}
    return tasks.sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time) || String(a.cabinetId).localeCompare(String(b.cabinetId)) || String(a.slotId).localeCompare(String(b.slotId)));
  }
  // Live preparation preview: historical records and confirmed batches retain their snapshots.
  function preparationTasks(tasks,config,snakes,measurements) {
    const animals=new Map(snakes.map(s=>[s.id,s])),weights=new Map(),through=localDate(Date.now(),config.timezone);
    return tasks.map(task=>{
      if(task.status!=='pending'||task.locked)return {...task};
      if(!weights.has(task.snakeId))weights.set(task.snakeId,latestWeight(task.snakeId,measurements,through));
      const animal=animals.get(task.snakeId),measured=weights.get(task.snakeId);
      const rule=matchMouse(measured?.weight,config.rules,animal?.sex);
      return {...task,weight:measured?.weight??null,mouseMin:rule?.mouseMin??null,mouseMax:rule?.mouseMax??null};
    });
  }
  function mouseColor(min,max,rules=[]) {
    if(!positive(min)||!positive(max))return {ink:'#58615e',fill:'#edf0ee'};
    const ranges=[...new Set([...rules.map(r=>`${r.mouseMin}:${r.mouseMax}`),'6:8',`${min}:${max}`])].sort((a,b)=>Number(a.split(':')[0])-Number(b.split(':')[0])||Number(a.split(':')[1])-Number(b.split(':')[1]));
    const palette=[['#285e8e','#e6f1fc'],['#226747','#e3f2e9'],['#805a14','#fff1cf'],['#a14926','#fbe9dc'],['#74519b','#f0e8fb'],['#9b3f64','#fae5ee'],['#276c73','#dff1f2'],['#635531','#eee9dc']];
    const index=ranges.indexOf(`${min}:${max}`),pair=palette[index];
    return pair?{ink:pair[0],fill:pair[1]}:{ink:`hsl(${(index*137.508)%360} 55% 30%)`,fill:`hsl(${(index*137.508)%360} 60% 92%)`};
  }
  function summarize(tasks,selectedDates=null,cabinetId=null) {
    const dates=selectedDates && selectedDates.size!==undefined ? [...selectedDates] : selectedDates;
    const filtered=tasks.filter(t=>(!dates?.length || dates.includes(t.date)) && (!cabinetId || t.cabinetId===cabinetId));
    const unique=[...new Map(filtered.map(t=>[t.snakeId+':'+(t.plannedAt||t.date+'T'+t.time),t])).values()];
    const groups=new Map();let unknownCount=0,pendingCount=0,completedCount=0,suspendedCount=0;
    for (const task of unique) {
      if(task.status==='suspended'){suspendedCount++;continue;}
      if (task.status!=='pending') {completedCount++;continue;} pendingCount++;
      if (!task.plannedAt || !positive(task.mouseMin) || !positive(task.mouseMax) || !Number.isInteger(task.quantity) || task.quantity<1) {unknownCount++;continue;}
      const key=task.mouseMin+':'+task.mouseMax;
      const group=groups.get(key)||{mouseMin:task.mouseMin,mouseMax:task.mouseMax,quantity:0,taskCount:0};
      group.quantity+=task.quantity;group.taskCount++;groups.set(key,group);
    }
    return {groups:[...groups.values()].sort((a,b)=>a.mouseMin-b.mouseMin || a.mouseMax-b.mouseMax),pendingCount,completedCount,unknownCount,suspendedCount,taskCount:unique.length,snakeCount:new Set(unique.map(t=>t.snakeId)).size};
  }
  function feedingOverview(config,assignments,snakes,measurements,records,{now=Date.now(),lookaheadDays=366,plannedTasks=[],lockedTasks=[]}={}) {
    if(!Number.isInteger(lookaheadDays)||lookaheadDays<1||lookaheadDays>366)throw new Error('查询未来天数须为 1–366');
    const today=localDate(now,config.timezone),through=addDays(today,lookaheadDays),tasks=generateTasks(config,assignments,snakes,measurements,records,{from:today,to:through,now,plannedTasks,lockedTasks});
    // Past-due history comes only from persisted snapshots, never recurrence reconstruction.
    const pastDates=[...new Set([...plannedTasks,...lockedTasks,...(records||[]).filter(r=>r.result==='offered')].map(t=>t.due_at||t.planned_at).filter(t=>t&&!Number.isNaN(Date.parse(t))).map(t=>localDate(t,config.timezone)).filter(d=>d<today))];
    const overdueTasks=pastDates.flatMap(date=>generateTasks({...config,cabinets:(config.cabinets||[]).map(c=>({...c,schedule:null,slotSchedules:{}}))},assignments,snakes,measurements,records,{from:date,to:date,now,plannedTasks,lockedTasks})).filter(t=>['pending','offered'].includes(t.status));
    const todayTasks=tasks.filter(t=>t.date===today),future=tasks.filter(t=>t.status==='pending'&&t.dueAt&&Date.parse(t.dueAt)>=new Date(now).getTime()),nextByCabinet={},nextBySnake={};
    for(const task of future){if(task.cabinetId&&!nextByCabinet[task.cabinetId])nextByCabinet[task.cabinetId]=task;if(!nextBySnake[task.snakeId])nextBySnake[task.snakeId]=task;}
    overdueTasks.push(...todayTasks.filter(t=>['pending','offered'].includes(t.status)&&t.dueAt&&Date.parse(t.dueAt)<new Date(now).getTime()));
    return {today,through,lookaheadDays,todayTasks,todaySummary:summarize(todayTasks),overdueTasks,unknownTasks:todayTasks.filter(t=>t.status==='pending'&&(!positive(t.mouseMin)||!positive(t.mouseMax)||!Number.isInteger(t.quantity)||t.quantity<1)),nextTask:future[0]||null,nextByCabinet,nextBySnake};
  }
  return {defaultConfig,createCabinet,createIncubator,resizeIncubator,incubatorLayout,cloneCabinet,cloneLevel,resizeLevels,effectiveSchedule,previewMove,validateConfig,matchMouse,latestWeight,weekDates,localDate,localDateTimeToInstant,generateTasks,feedingOverview,preparationTasks,mouseColor,summarize,dayColors,cabinetCorners};
});
