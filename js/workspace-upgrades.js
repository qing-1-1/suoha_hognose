/* Staff workflow refinements. All photos and operational records remain authenticated. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const model = () => window.SuohaWorkspace.snapshot();
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kindNames = {measurement:'体重测量',feeding:'喂食记录',shedding:'蜕皮记录',observation:'健康观察'};
  const lifecycle = {active:'在养',sold:'已售',retired:'退役',deceased:'死亡',planned:'计划'};
  const today = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const checked = async q => {const r=await q;if(r.error)throw r.error;return r.data;};
  let stockView='list', nurseryView='cards', nurseryGroup='clutch', nurseryYear='', growthKind='', epoch=0, saving=false, focusOrigin=null,dirty=false;
  const pageState = new Map(), signed = new Map();
  const cover = id => {const l=model().listings.find(l=>l.snake_id===id);return model().media.filter(m=>m.listing_id===l?.id).sort((a,b)=>a.sort_order-b.sort_order)[0];};
  const photo = id => {const m=cover(id);return `<div class="private-photo" ${m?`data-private-path="${escape(m.storage_path)}"`:''}><span>${m?'照片读取中…':'暂无个体照片'}</span></div>`;};
  async function hydrate(root) {
    const own=epoch, user=currentUser?.id;
    if(!canWrite())return;
    const boxes=[...root.querySelectorAll('[data-private-path]')].filter(b=>!b.dataset.loading&&b.getClientRects().length);
    await Promise.all(boxes.map(async box=>{
      box.dataset.loading='true';const path=box.dataset.privatePath;
      try {
        let item=signed.get(path);
        if(!item||item.expires<Date.now()){
          const r=await sb.storage.from('specimen-media').createSignedUrl(path,300);
          if(r.error||!r.data?.signedUrl)throw Error('照片暂不可读');
          item={url:r.data.signedUrl,expires:Date.now()+240000};signed.set(path,item);
        }
        if(own!==epoch||currentUser?.id!==user||!box.isConnected)return;
        const img=document.createElement('img');img.alt='内部个体照片';img.loading='lazy';img.src=item.url;
        img.onerror=()=>{box.textContent='照片暂不可读';};box.replaceChildren(img);
      } catch {if(box.isConnected&&own===epoch)box.textContent='照片暂不可读';}
    }));
  }
  function paginate(host,rows,key,size=24) {
    const anchor=host.tagName==='TBODY'?host.closest('.ws-table-wrap,.tableWrap'):host;
    anchor.parentElement.querySelector(`[data-page-control="${key}"]`)?.remove();
    const signature=rows.map(row=>row.dataset.s||row.dataset.recordId||row.textContent).join('|');
    let state=pageState.get(key)||{page:1,signature};if(state.signature!==signature)state={page:1,signature};
    state.page=Math.min(state.page,Math.max(1,Math.ceil(rows.length/size)));pageState.set(key,state);
    rows.forEach((row,i)=>row.hidden=i<(state.page-1)*size||i>=state.page*size);
    if(rows.length<=size){hydrate(host);return;}
    const controls=document.createElement('div');controls.className='ws-page-controls';controls.dataset.pageControl=key;
    controls.innerHTML=`<span>${rows.length} 条 · 第 ${state.page} / ${Math.ceil(rows.length/size)} 页</span><button class="ws-action" ${state.page===1?'disabled':''} data-delta="-1">上一页</button><button class="ws-action" ${state.page*size>=rows.length?'disabled':''} data-delta="1">下一页</button>`;
    anchor.after(controls);controls.onclick=event=>{const b=event.target.closest('[data-delta]');if(!b)return;state.page+=Number(b.dataset.delta);paginate(host,rows,key,size);host.scrollIntoView({block:'start'});};hydrate(host);
  }
  function stock() {
    if(state.page!=='population')return;const body=$('#popRows');if(!body)return;
    const card=body.closest('.card');if(!card)return;
    let tools=card.querySelector('.stock-view-tools');
    if(!tools){tools=document.createElement('div');tools.className='stock-view-tools';tools.innerHTML='<span>显示方式</span><button class="ws-action" data-stock-view="list">列表</button><button class="ws-action" data-stock-view="cards">卡片</button>';card.querySelector('.cardHead').after(tools);tools.onclick=e=>{const b=e.target.closest('[data-stock-view]');if(b){stockView=b.dataset.stockView;stock();}};}
    tools.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stockView===stockView)));
    let grid=card.querySelector('.stock-card-grid');if(!grid){grid=document.createElement('div');grid.className='stock-card-grid';card.append(grid);}
    const rows=[...body.querySelectorAll('[data-s]')];
    grid.innerHTML=rows.map(row=>{const s=REMOTE_RAW.snakes.find(s=>s.id===row.dataset.s);if(!s)return '';const last=model().measurements.filter(m=>m.snake_id===s.id).sort((a,b)=>String(b.measured_at).localeCompare(String(a.measured_at)))[0];return `<article class="stock-profile-card" data-record-id="${escape(s.id)}">${photo(s.id)}<div><div class="stock-card-title"><b>${escape(s.id)}</b>${row.querySelector('.inventory-badge')?.outerHTML||''}</div><h3>${escape(s.gene_text||'基因待确认')}</h3><p>${escape(s.series||'系列待确认')} · ${{F:'母',M:'公'}[s.sex]||'性别未知'} · ${escape(lifecycle[s.status]||s.status)}</p><p>种群库${s.origin==='produced'?' · 自繁留存':''}</p><small>${last?`最近记录 ${escape(last.measured_at)} · ${escape(kindNames[last.record_kind]||'成长记录')}`:model().errors.measurements?'成长记录读取失败':'暂无成长记录'}</small><button type="button" class="ws-action" data-stock-open="${escape(s.id)}">查看档案 ↗</button></div></article>`;}).join('')||'<div class="ws-empty">没有符合条件的个体，可调整搜索或筛选。</div>';
    card.querySelector('.tableWrap').hidden=stockView!=='list';grid.hidden=stockView!=='cards';
    card.querySelectorAll('.ws-page-controls').forEach(el=>el.remove());
    if(stockView==='cards')paginate(grid,[...grid.children],'stock-cards');else paginate(body,rows,'stock-list');
    grid.onclick=e=>{const b=e.target.closest('[data-stock-open]');if(b){history.pushState({},'',`/admin?snake=${encodeURIComponent(b.dataset.stockOpen)}#individual`);setPage('individual',false);}};
    hydrate(card);
  }
  function nursery() {
    if(state.page!=='nursery')return;const root=$('#nurseryWorkspace'),grid=root.querySelector('.nursery-grid');if(!grid||grid.dataset.enhanced)return;
    grid.dataset.enhanced='true';const cards=[...grid.querySelectorAll('.nursery-card')];
    const toolbar=root.querySelector('.ws-toolbar');
    const controls=document.createElement('div');controls.className='nursery-group-controls';
    const years=[...new Set(REMOTE_RAW.snakes.filter(s=>s.inventory_library==='nursery'||s.origin==='produced').map(s=>s.birth_date?.slice(0,4)).filter(Boolean))].sort().reverse();
    controls.innerHTML=`<label>出生年份<select aria-label="繁育个体年份"><option value="">全部年份</option>${years.map(y=>`<option ${y===nurseryYear?'selected':''}>${y}</option>`).join('')}</select></label><label>分组方式<select aria-label="繁育个体分组"><option value="clutch" ${nurseryGroup==='clutch'?'selected':''}>按窝次</option><option value="year" ${nurseryGroup==='year'?'selected':''}>按年份</option></select></label><div class="nursery-view-tools"><button class="ws-action" data-nursery-view="cards">卡片</button><button class="ws-action" data-nursery-view="list">列表</button></div>`;toolbar.after(controls);
    const paint=()=>{
      grid.replaceChildren();grid.classList.add('nursery-grouped');grid.classList.toggle('nursery-list-view',nurseryView==='list');controls.querySelectorAll('[data-nursery-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.nurseryView===nurseryView)));const groups=new Map();
      cards.forEach(card=>{const id=card.querySelector('[data-nursery-open]')?.dataset.nurseryOpen,s=REMOTE_RAW.snakes.find(s=>s.id===id);if(!s||nurseryYear&&s.birth_date?.slice(0,4)!==nurseryYear)return;
        card.dataset.recordId=id;
        if(!card.querySelector('.private-photo')){card.querySelector('.nursery-card-top').after(document.createRange().createContextualFragment(photo(id)));const record=model().measurements.filter(m=>m.snake_id===id).sort((a,b)=>String(b.measured_at).localeCompare(String(a.measured_at)))[0];card.querySelector('dl').insertAdjacentHTML('afterend',`<p class="ws-note nursery-last-record">${record?`最近记录 ${escape(record.measured_at)} · ${escape(kindNames[record.record_kind]||'成长记录')}`:'暂无成长记录'} · ${s.inventory_library==='nursery'?'自繁库':'种群库 / 已留存'}</p>`);}
        const key=nurseryGroup==='year'?(s.birth_date?.slice(0,4)||'未记录年份'):(s.clutch_id?'clutch-'+s.clutch_id:'历史补录');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(card);
      });
      for(const [key,children] of groups){const clutch=model().clutches.find(c=>'clutch-'+c.id===key),registered=clutch?REMOTE_RAW.snakes.filter(s=>String(s.clutch_id)===String(clutch.id)).length:0;const group=document.createElement('section');group.className='nursery-clutch-group';group.innerHTML=`<header><div><h2>${escape(clutch?.clutch_code|| (clutch?'窝次 #'+clutch.id:key))}</h2><p>${clutch?`${escape(clutch.female_snake_id)} × ${escape(clutch.male_snake_id)} · 出壳 ${escape(clutch.hatch_start_date||'未记录')} · 已登记 ${registered} / ${clutch.hatched_count??'待确认'} · 未登记 ${clutch.hatched_count==null?'待确认':Math.max(0,clutch.hatched_count-registered)}`:children.length+' 条档案'}</p></div>${clutch?.status==='hatched'&&canWrite()?`<button class="ws-action" data-batch-clutch="${clutch.id}">批量登记幼体</button>`:''}</header><div class="nursery-group-cards"></div>`;grid.append(group);const host=group.querySelector('.nursery-group-cards');host.append(...children);paginate(host,children,'nursery-'+key,12);}
      if(!groups.size)grid.innerHTML='<div class="ws-empty">当前年份或条件没有匹配的个体。</div>';hydrate(grid);
    };
    controls.querySelectorAll('[data-nursery-view]').forEach(b=>b.onclick=()=>{nurseryView=b.dataset.nurseryView;paint();});
    controls.querySelectorAll('select').forEach(select=>select.onchange=()=>{nurseryYear=controls.querySelector('[aria-label="繁育个体年份"]').value;nurseryGroup=controls.querySelector('[aria-label="繁育个体分组"]').value;paint();});paint();
  }
  function publishing() {
    const root=$('#workspacePublishing');if(!root)return;
    root.querySelectorAll('tbody tr').forEach(row=>{
      if(row.dataset.enhanced)return;row.dataset.enhanced='true';
      const id=row.querySelector('[data-ws-action="edit-listing"]')?.dataset.id,l=model().listings.find(l=>l.id===id);if(!l)return;row.dataset.recordId=id;
      row.cells[0].insertAdjacentHTML('afterbegin',photo(l.snake_id));
      const media=model().media.filter(m=>m.listing_id===id),published=media.filter(m=>m.is_public!==false);
      row.cells[3].innerHTML=`${media.length} 张内部 / ${published.length} 张选入公开`;
      const missing=[!published.length?'缺公开照片':'',!l.description?'缺公开描述':''].filter(Boolean);
      if(missing.length)row.cells[0].insertAdjacentHTML('beforeend',`<span class="publish-missing">${missing.join(' · ')}</span>`);
      row.querySelector('.ws-actions').insertAdjacentHTML('afterbegin',`<button class="ws-action" data-preview-listing="${escape(id)}">发布预览</button>`);
      row.querySelector('[data-ws-action="delete-listing"]')?.classList.add('separate-danger');
    });
    const body=root.querySelector('tbody');if(body)paginate(body,[...body.children],'publishing');hydrate(root);
  }
  function records() {
    const root=$('#workspaceRecords');if(!root)return;
    root.querySelectorAll('[data-ws-action="hatchling"]').forEach(button=>{if(button.parentElement.querySelector('[data-batch-clutch]'))return;button.insertAdjacentHTML('afterend',`<button class="ws-action" data-batch-clutch="${escape(button.dataset.id)}">批量登记幼体</button>`);});
    const list=root.querySelector('.ws-panel>.ws-list');if(list)paginate(list,[...list.children],'records');
    const sales=$('#workspaceSales tbody');if(sales)paginate(sales,[...sales.children],'sales');
  }
  function growth() {
    if(state.page!=='individual')return;const root=$('#workspaceIndividual'),id=new URLSearchParams(location.search).get('snake');if(!id||!root)return;
    let host=root.querySelector('#growthTimeline');
    if(!host){host=[...root.querySelectorAll('.ws-panel')].find(p=>p.querySelector('h2')?.textContent==='成长记录');if(!host)return;host.id='growthTimeline';}
    const all=model().measurements.filter(m=>m.snake_id===id).sort((a,b)=>String(b.measured_at).localeCompare(String(a.measured_at))||String(b.id).localeCompare(String(a.id)));
    const weights=all.filter(m=>m.weight_g!==null&&m.weight_g!==undefined&&m.weight_g!==''&&Number.isFinite(Number(m.weight_g))).slice().reverse();
    const rows=all.filter(m=>!growthKind||(m.record_kind||'measurement')===growthKind);
    let chart='';if(weights.length){const values=weights.map(m=>Number(m.weight_g)),max=Math.max(...values),min=Math.min(...values),dates=weights.map(m=>Date.parse(m.measured_at)),span=Math.max(1,dates.at(-1)-dates[0]);const points=weights.map((m,i)=>[22+(dates[i]-dates[0])/span*436,112-(Number(m.weight_g)-min)/Math.max(1,max-min)*82]);chart=`<figure class="weight-trend"><figcaption>实际体重 · ${weights.length} 次测量</figcaption><svg viewBox="0 0 480 140" role="img" aria-label="体重趋势，最低 ${min} 克，最高 ${max} 克"><path d="M22 25V118H462" fill="none" stroke="#d2dbc9"/>${weights.length>1?`<polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#718953" stroke-width="2"/>`:''}${points.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="#496537"><title>${escape(weights[i].measured_at)} · ${escape(weights[i].weight_g)} g</title></circle>`).join('')}</svg><div><span>${escape(weights[0].measured_at)}</span><span>${escape(weights.at(-1).measured_at)}</span></div></figure>`;}
    host.innerHTML=`<div class="growth-heading"><h2>成长时间轴</h2>${canWrite()?`<button class="ws-action" data-growth-new="${escape(id)}">新增成长记录</button>`:''}</div>${model().errors.measurements?'<p class="ws-alert">成长记录读取失败，请刷新重试。</p>':chart}<label class="growth-filter">记录类型<select aria-label="成长记录类型"><option value="">全部记录</option>${Object.entries(kindNames).map(([k,v])=>`<option value="${k}" ${growthKind===k?'selected':''}>${v}</option>`).join('')}</select></label><div class="growth-events">${rows.map(m=>`<article class="growth-event" data-record-id="${escape(m.id)}"><div><time>${escape(m.measured_at)}</time><span class="ws-pill">${escape(kindNames[m.record_kind]||'体重测量')}</span></div><p>${m.weight_g!=null?escape(m.weight_g)+' g · ':''}${m.length_cm!=null?escape(m.length_cm)+' cm · ':''}${escape(m.feeding_status||'')}</p><p>${escape(m.condition_note||'')}</p>${canWrite()?`<div class="ws-actions"><button class="ws-action" data-growth-edit="${escape(m.id)}">编辑记录</button><button class="ws-action separate-danger" data-growth-delete="${escape(m.id)}">删除记录</button></div>`:''}</article>`).join('')||'<p class="ws-note">暂无匹配的实际记录，不据此判断健康或成长异常。</p>'}</div>`;
    host.querySelector('select').onchange=e=>{growthKind=e.target.value;growth();};paginate(host.querySelector('.growth-events'),[...host.querySelectorAll('.growth-event')],'growth',10);
    root.querySelector('#retentionHistory')?.remove();const transfers=model().transfers.filter(t=>t.individual_id===id&&t.to_library==='stock');
    if(transfers.length){const panel=document.createElement('div');panel.id='retentionHistory';panel.className='ws-panel';panel.innerHTML=`<h2>留存评估记录</h2>${transfers.map(t=>`<p class="ws-note">${escape(t.created_at?.slice(0,10))} · 留存至种群库</p><p class="retention-note">${escape(t.assessment||'当时未填写留存理由。')}</p>`).join('')}`;root.append(panel);}
  }
  const dialog=document.createElement('dialog');dialog.className='ws-dialog upgrade-dialog';dialog.id='upgradeDialog';document.body.append(dialog);
  function open(title,sub,html,onSave,submit='保存') {
    focusOrigin=document.activeElement;dirty=false;dialog.innerHTML=`<div class="ws-dialog-head"><div><h2 id="upgradeTitle">${escape(title)}</h2><p>${escape(sub)}</p></div><button class="ws-dialog-close" type="button" data-upgrade-close aria-label="关闭">×</button></div><form class="ws-form"><div class="ws-form-fields">${html}</div><p class="ws-form-message" role="status"></p><div class="ws-actions"><button class="ws-action" type="button" data-upgrade-close>取消</button>${onSave?`<button class="ws-action primary" type="submit">${submit}</button>`:''}</div></form>`;dialog.setAttribute('aria-labelledby','upgradeTitle');dialog.showModal();
    dialog.querySelectorAll('[data-upgrade-close]').forEach(b=>b.onclick=()=>{if(!saving&&(!dirty||confirm('有未保存的修改，确认放弃吗？')))dialog.close();});
    dialog.querySelector('form').addEventListener('input',()=>{dirty=true;});
    dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();if(saving||!onSave||!event.target.reportValidity())return;saving=true;const b=event.target.querySelector('[type=submit]'),msg=event.target.querySelector('[role=status]');b.disabled=true;msg.textContent='正在保存…';try{await onSave(event.target);dirty=false;dialog.close();await refreshRemote(false);await window.SuohaWorkspace.load(true);render();toast('已保存');}catch(error){msg.textContent=/schema cache|record_kind|assessment|function.*does not exist/.test(error.message||'')?'此功能需要先执行 026 / 027 数据库迁移，再刷新页面。':error.message||'保存失败，请重试';msg.scrollIntoView({block:'nearest'});}finally{saving=false;b.disabled=false;}};
  }
  dialog.addEventListener('cancel',event=>{if(saving||(dirty&&!confirm('有未保存的修改，确认放弃吗？')))event.preventDefault();});dialog.addEventListener('close',()=>focusOrigin?.focus());
  function measurement(id,row={}) {
    if(!canWrite())return;
    open(row.id?'编辑成长记录':'新增成长记录',id+' · 仅记录实际观察。未测量的数值请留空。',`<label>记录类型<select name="record_kind">${Object.entries(kindNames).map(([k,v])=>`<option value="${k}" ${(row.record_kind||'measurement')===k?'selected':''}>${v}</option>`).join('')}</select></label><label>实际日期<input name="measured_at" type="date" max="${today()}" value="${escape(row.measured_at||today())}" required></label><label>体重 g<input name="weight_g" type="number" min="0" step="0.01" value="${row.weight_g??''}"></label><label>体长 cm<input name="length_cm" type="number" min="0" step="0.01" value="${row.length_cm??''}"></label><label class="full">进食情况<input name="feeding_status" maxlength="300" value="${escape(row.feeding_status||'')}"></label><label class="full">观察与备注<textarea name="condition_note" maxlength="1000" rows="3">${escape(row.condition_note||'')}</textarea></label>`,async form=>{const v=Object.fromEntries(new FormData(form));if(!v.weight_g&&!v.length_cm&&!v.feeding_status.trim()&&!v.condition_note.trim())throw Error('请至少填写一项实际观察。');const payload={...v,snake_id:id,weight_g:v.weight_g===''?null:Number(v.weight_g),length_cm:v.length_cm===''?null:Number(v.length_cm)};await checked((row.id?sb.from('snake_measurements').update(payload).eq('id',row.id):sb.from('snake_measurements').insert(payload)).select('id').single());});
  }
  function batch(id) {
    if(!canWrite())return;const c=model().clutches.find(c=>String(c.id)===String(id));if(!c)return;
    const registered=REMOTE_RAW.snakes.filter(s=>String(s.clutch_id)===String(id)).length,remaining=Number(c.hatched_count||0)-registered;
    if(c.status!=='hatched'||remaining<1)return toast('请先确认实际已孵化数，当前没有可登记名额。',true);
    let request=crypto.randomUUID(),lastPayload='',previewReady=false;
    open('批量登记幼体',`${c.clutch_code||'窝次 #'+c.id} · 已登记 ${registered} / ${c.hatched_count}，剩余 ${remaining} 条。整批成功才入库；不从亲本概率推断基因。`,`<label>编号前缀<input name="prefix" value="${escape((c.clutch_code||'H'+c.id).replace(/[^A-Za-z0-9_-]/g,'').slice(0,40)||'H')}" pattern="[A-Za-z0-9_-]{1,50}" required></label><label>起始序号<input name="start" type="number" min="1" max="99999" value="${registered+1}" required></label><label>登记数量<input name="amount" type="number" min="1" max="${Math.min(remaining,50)}" value="${Math.min(remaining,5)}" required></label><button type="button" class="ws-action" data-batch-preview>生成 / 重置预览</button><div class="full batch-rows" id="batchRows"></div>`,async form=>{
      if(!previewReady)throw Error('编号规则或数量已改变，请重新生成预览并逐条确认。');
      const rows=[...form.querySelectorAll('[data-batch-row]')].map(el=>Object.fromEntries([...el.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.value])));
      if(!rows.length)throw Error('请先生成预览并逐条确认。');const ids=new Set();rows.forEach((r,i)=>{if(ids.has(r.id)||REMOTE_RAW.snakes.some(s=>s.id===r.id))throw Error(`第 ${i+1} 行：编号 ${r.id} 重复或已存在。`);ids.add(r.id);});
      const payload=JSON.stringify(rows);if(lastPayload&&lastPayload!==payload)request=crypto.randomUUID();lastPayload=payload;
      await checked(sb.rpc('register_hatchlings_batch',{p_request:request,p_clutch:c.id,p_rows:rows,p_investor:currentInvestorName()}));
    },'确认整批入库');
    const form=dialog.querySelector('form');const preview=()=>{if(!['prefix','start','amount'].every(k=>form.elements[k].reportValidity()))return;previewReady=true;const amount=Number(form.elements.amount.value),start=Number(form.elements.start.value),prefix=form.elements.prefix.value;
      $('#batchRows').innerHTML=Array.from({length:amount},(_,i)=>`<fieldset data-batch-row><legend>第 ${i+1} 条</legend><label>个体编号<input data-field="id" value="${escape(prefix+'-'+String(start+i).padStart(2,'0'))}" pattern="[A-Za-z0-9_-]{1,64}" required></label><label>性别<select data-field="sex"><option value="U">未知</option><option value="F">母</option><option value="M">公</option></select></label><label>实际出壳日期<input data-field="birth" type="date" value="${escape(c.hatch_start_date||today())}" min="${escape(c.hatch_start_date||c.laid_date)}" max="${escape(c.hatch_end_date||today())}" required></label><label>系列<input data-field="series" value="${escape(REMOTE_RAW.snakes.find(s=>s.id===c.female_snake_id)?.series||'待确认')}" maxlength="100" required></label><label class="full">基因描述<input data-field="gene_text" value="待确认" maxlength="300" required></label></fieldset>`).join('');};form.querySelector('[data-batch-preview]').onclick=preview;['prefix','start','amount'].forEach(name=>form.elements[name].addEventListener('input',()=>{previewReady=false;}));preview();
  }
  function previewListing(id) {
    const l=model().listings.find(l=>l.id===id),s=REMOTE_RAW.snakes.find(s=>s.id===l?.snake_id);if(!l||!s)return;
    const photos=model().media.filter(m=>m.listing_id===id&&m.is_public!==false).sort((a,b)=>a.sort_order-b.sort_order);
    const birth=l.birth_precision==='unknown'?'未公开':s.birth_date?.slice(0,l.birth_precision==='year'?4:l.birth_precision==='day'?10:7)||'待确认';
    const genes=(REMOTE_RAW.snakeGenes||[]).filter(g=>g.snake_id===s.id).map(g=>`${REMOTE_RAW.genes.find(x=>x.id===g.gene_id)?.name_zh||g.gene_id} · ${{visual:'表现',het:'确定携带',possible_het:'可能携带',super:'Super',line_trait:'品系性状',unknown:'未知'}[g.state]||g.state}${g.state==='possible_het'&&g.probability!=null?' '+Math.round(g.probability*100)+'%':''}`).join(' / ');
    open('公开内容预览', '发布前核对：这里只列出会进入公开档案的字段。内部成本、备注与留存评估不会公开。',`<div class="full listing-preview"><div class="preview-photo-strip">${photos.map(m=>`<div class="private-photo" data-private-path="${escape(m.storage_path)}"></div>`).join('')||'<p class="ws-alert">没有选入公开档案的照片，请在照片编辑器逐张勾选并保存。</p>'}</div><h3>${escape(l.title)}</h3><p>${escape(s.id)} · ${escape(s.sex)} · ${escape(l.sale_status)} · ${l.asking_price==null?'询价':escape(l.asking_price)+' '+escape(l.currency)}</p><p>出生：${escape(birth)} · 系列：${escape(s.series||'未分类')}</p><p>基因：${escape(genes||'结构化基因资料待补充')}</p><p>${escape(l.description||'未填写公开描述')}</p><h4>公开个体情况</h4><p>${escape(l.husbandry_summary||'未填写')}</p><h4>公开谱系</h4><p>${escape(l.pedigree_summary||'未填写')}</p><p class="ws-note">当前${l.published?'已发布':'为草稿'}。确认后返回“编辑”修改发布状态。</p></div>`,null);hydrate(dialog);
  }
  document.addEventListener('click',event=>{
    const transfer=event.target.closest('[data-transfer]');if(!transfer||!canWrite())return;
    event.preventDefault();event.stopImmediatePropagation();const id=transfer.dataset.transfer;
    open('确认留存？',`${id} 将同步到种群库，繁育栏保留同一身份和全部资料。`,`<label class="full">留存评估（可选）<textarea name="assessment" maxlength="2000" rows="5" placeholder="育种目标、实际观察、留存理由；未确认的基因请保留不确定性。"></textarea></label>`,async form=>checked(sb.rpc('retain_inventory_animal',{p_id:id,p_assessment:form.elements.assessment.value})), '确认留存');
  },true);
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-growth-new],[data-growth-edit],[data-growth-delete],[data-batch-clutch],[data-preview-listing]');if(!b||!canWrite())return;
    if(b.dataset.growthNew)return measurement(b.dataset.growthNew);
    if(b.dataset.batchClutch)return batch(b.dataset.batchClutch);
    if(b.dataset.previewListing)return previewListing(b.dataset.previewListing);
    const row=model().measurements.find(m=>String(m.id)===String(b.dataset.growthEdit||b.dataset.growthDelete));if(!row)return;
    if(b.dataset.growthEdit)return measurement(row.snake_id,row);
    if(!await confirmWorkflow({title:'删除成长记录？',sub:`${row.snake_id} · ${row.measured_at} 的记录将删除，个体及其他记录保留。`,confirm:'确认删除',danger:true}))return;
    b.disabled=true;try{await checked(sb.from('snake_measurements').delete().eq('id',row.id).select('id').single());await window.SuohaWorkspace.load(true);render();toast('记录已删除');}catch(e){toast(e.message||'删除失败',true);}finally{b.disabled=false;}
  });
  function render(){if(!currentUser||!currentProfile?.active)return;stock();nursery();publishing();records();growth();}
  const mobileNav=document.querySelector('.mobileNav');
  if(mobileNav){for(const [label,pages] of [['概览',['overview']],['个体',['population','nursery']],['繁育',['production','records','lab','routes']],['经营',['publishing','sales','investment']],['更多',['admin']]]){const group=document.createElement('div');group.className='mobile-nav-group';group.setAttribute('role','group');group.setAttribute('aria-label',label);const caption=document.createElement('span');caption.textContent=label;group.append(caption);for(const page of pages){const button=mobileNav.querySelector(`[data-page="${page}"]`);if(button)group.append(button);}if(group.children.length>1)mobileNav.append(group);}}
  window.SuohaUpgrades={publishing,records,nursery};
  const previousRows=renderRows;renderRows=function(){previousRows();stock();};
  const previousRender=window.SuohaWorkspace.render;window.SuohaWorkspace.render=function(){previousRender();render();};
  addEventListener('suoha:listings',render);addEventListener('suoha:data',render);
  addEventListener('suoha:logout',()=>{epoch++;signed.clear();pageState.clear();dialog.close();stockView='list';nurseryYear='';growthKind='';});
})();
