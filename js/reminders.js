(function(root){
 'use strict';
 function collect({model={},raw={},breeding=[],calendarClutches=[],now=new Date()}={}){
  const tasks=[],add=(key,title,detail,page)=>tasks.push({key,title,detail,page});
  for(const t of breeding)add('breeding:'+t.key+':'+(t.days<0?'overdue':t.days===0?'today':'soon'),t.title+' · 预计'+t.stage,t.date+' · '+(t.days<0?'已过预计日期':t.days===0?'今天到期':'即将到期'),'production');
  const linked=new Set([...calendarClutches,...breeding.filter(t=>t.clutch).map(t=>t.clutch)].map(String));
  for(const c of model.clutches||[]){
   if(c.status==='incubating'&&!c.hatch_start_date&&c.expected_hatch_date&&!linked.has(String(c.id))){const days=Math.round((Date.parse(c.expected_hatch_date.slice(0,10)+'T00:00:00Z')-Date.parse(now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')+'T00:00:00Z'))/86400000);if(days<=3)add('clutch:'+c.id+':'+c.expected_hatch_date+':'+(days<0?'overdue':days===0?'today':'soon'),(c.clutch_code||'窝次 #'+c.id)+' · 待核实出壳',c.expected_hatch_date,'records');}
   if(c.status==='hatched'){const remaining=Number(c.hatched_count||0)-(raw.snakes||[]).filter(s=>String(s.clutch_id)===String(c.id)).length;if(remaining>0)add('hatchlings:'+c.id+':'+remaining,(c.clutch_code||'窝次 #'+c.id)+' · 幼体待入库',remaining+' 条尚未登记','records');}
  }
  const pending=new Set((model.receipts||[]).filter(r=>r.status==='pending').map(r=>r.inquiry_id));
  for(const r of model.receipts||[])if(r.status==='pending'){const order=(model.inquiries||[]).find(i=>i.id===r.inquiry_id);add('receipt:'+r.id,'付款待审核',order?.reference||'买家已提交付款信息','payments');}
  for(const i of model.inquiries||[]){const detail=(i.reference||'')+' · '+(i.customer_name||'买家');
   if(['new','contacted','paid','delivered'].includes(i.status))add('sale:'+i.id+':'+i.status,({new:'新购买意向 · 待联系',contacted:'购买意向 · 待跟进',paid:'已收款 · 待交付',delivered:'已交付 · 待完成'})[i.status],detail,'sales');
   if(i.status==='reserved'&&!pending.has(i.id)){const expired=i.reserved_until&&new Date(i.reserved_until)<now;add('sale:'+i.id+':reserved:'+Boolean(expired),'购买订单 · '+(expired?'预留已到期':'等待付款'),detail,'sales');}
  }
  for(const a of model.auctions||[])if(a.status==='open'&&new Date(a.ends_at)<now)add('auction:'+a.id+':ended','拍卖已到期 · 待结算','请核实成交状态','auctions');
  for(const p of raw.plans||[])if(p.review_status==='pending')add('plan:'+p.id+':pending','繁育计划待审核',p.project_name||'计划 #'+p.id,'production');
  for(const r of raw.recommendations||[])if(r.status==='proposed')add('recommendation:'+r.id,'建议待处理',r.title||'查看分析建议','admin');
  for(const l of model.listings||[])if(!l.deleted_at&&!(model.media||[]).some(m=>m.listing_id===l.id))add('photos:'+l.id,'展示档案待补照片',l.title||l.snake_id,'publishing');
  return tasks;
 }
 if(typeof module!=='undefined')module.exports={collect};
 if(typeof document==='undefined')return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const host=document.createElement('div');host.className='reminder-center';host.hidden=true;
 host.innerHTML='<button type="button" id="reminderToggle" aria-expanded="false" aria-controls="reminderPanel"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg> 提醒 <span data-count hidden></span></button><section id="reminderPanel" aria-label="提醒汇总" hidden><div class="reminder-heading"><strong>待办提醒</strong><button type="button" data-restore>恢复已关闭</button></div><p class="reminder-note">关闭仅隐藏本账号在此浏览器的提醒，不改变业务状态。</p><div data-reminder-list></div><p data-reminder-health role="status"></p></section>';
 document.querySelector('.topbar').prepend(host);
 const toggle=host.querySelector('#reminderToggle'),panel=host.querySelector('#reminderPanel');let hiddenKeys=new Set(),userId='',tasks=[];
 const storageKey=()=> 'suoha.reminders.closed.'+userId;
 function save(){try{localStorage.setItem(storageKey(),JSON.stringify([...hiddenKeys].slice(-2000)));}catch{host.querySelector('[data-reminder-health]').textContent='浏览器无法保存关闭状态，当前页面仍生效。';}}
 function render(){
  if(!currentUser||!currentProfile?.active){host.hidden=true;panel.hidden=true;userId='';return;}
  if(userId!==currentUser.id){userId=currentUser.id;try{const saved=JSON.parse(localStorage.getItem(storageKey())||'[]');hiddenKeys=new Set(Array.isArray(saved)?saved:[]);}catch{hiddenKeys=new Set();}}
  host.hidden=false;const calendar=root.SuohaCalendar?.snapshot(),date=new Date(),today=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  const model=root.SuohaWorkspace.snapshot();tasks=collect({model:canWrite()?model:{},raw:REMOTE_RAW,calendarClutches:(calendar?.plans||[]).flatMap(p=>(p.clutches||[]).map(c=>c.id)),breeding:root.SuohaCalendar?.reminders(calendar?.plans||[],today)||[]});
  const visible=tasks.filter(t=>!hiddenKeys.has(t.key)),badge=host.querySelector('[data-count]');badge.textContent=visible.length;badge.hidden=!visible.length;toggle.setAttribute('aria-label','提醒，'+visible.length+' 项待办');
  host.querySelector('[data-reminder-list]').innerHTML=visible.length?visible.map(t=>'<article class="reminder-item"><div><b>'+esc(t.title)+'</b><p>'+esc(t.detail)+'</p><a href="#'+esc(t.page)+'" data-reminder-page="'+esc(t.page)+'">前往'+esc(PAGE_NAMES[t.page]||'对应模块')+' ↗</a></div><button type="button" data-dismiss="'+esc(t.key)+'" aria-label="关闭提醒：'+esc(t.title)+'">×</button></article>').join(''):'<p class="reminder-empty">暂无未关闭的提醒</p>';
  host.querySelector('[data-reminder-health]').textContent=calendar?.error||Object.values(model.errors||{}).some(Boolean)?'部分提醒数据读取失败，请刷新后重试。':!model.loaded||!calendar?.loaded?'提醒正在加载…':'';
 }
 function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');}
 toggle.onclick=()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));};
 host.onclick=e=>{const dismiss=e.target.closest('[data-dismiss]'),link=e.target.closest('[data-reminder-page]');if(dismiss){const index=[...host.querySelectorAll('[data-dismiss]')].indexOf(dismiss);hiddenKeys.add(dismiss.dataset.dismiss);save();render();(host.querySelectorAll('[data-dismiss]')[index]||toggle).focus();}if(link){e.preventDefault();close();if(link.dataset.reminderPage==='records')root.SuohaWorkspace.showClutches();else setPage(link.dataset.reminderPage);}if(e.target.closest('[data-restore]')){hiddenKeys.clear();save();render();}};
 document.addEventListener('click',e=>{if(!host.contains(e.target))close();});host.addEventListener('keydown',e=>{if(e.key==='Escape'){close();toggle.focus();}});
 for(const event of ['suoha:data','suoha:listings','suoha:calendar','suoha:logout'])addEventListener(event,render);
 addEventListener('storage',e=>{if(e.key===storageKey()){userId='';render();}});
 setInterval(()=>{if(!document.hidden&&currentUser){root.SuohaWorkspace.load();render();}},60000);
 root.SuohaReminders={open(){render();panel.hidden=false;toggle.setAttribute('aria-expanded','true');toggle.focus();}};render();
})(typeof window==='undefined'?globalThis:window);
