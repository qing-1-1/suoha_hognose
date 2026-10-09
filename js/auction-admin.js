(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={open:'进行中 / 待开拍',won:'已成交',unsold:'流拍',cancelled:'已取消'};
 const date=v=>new Date(v).toLocaleString('zh-CN');
 const host=document.getElementById('workspaceAuctions');
 let rows=[],error='',busy=false,loaded=false,generation=0,selectedListing='';
 PAGE_NAMES.auctions='拍卖管理';
 document.querySelectorAll('[data-page="sales"]').forEach(el=>{const b=el.cloneNode(true);b.dataset.page='auctions';b.innerHTML='<span class="navIcon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m14 4 6 6-3 3-6-6zM9 9l6 6-3 3-6-6zM10 14l-7 7M14 21h8"/></svg></span><span class="navText"><b>拍卖管理</b><small>Auctions</small></span>';b.onclick=()=>setPage('auctions');(el.parentElement.querySelector('[data-page="publishing"]')||el).after(b);});
 const dialog=document.createElement('dialog');dialog.className='auction-dialog';document.body.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target.closest('[data-auction-close]'))dialog.close();});
 async function call(name,args){const r=await sb.rpc(name,args);if(r.error)throw r.error;return r.data;}
 async function load(){
  if(!canWrite()||!currentUser)return;
  const own=++generation;busy=true;error='';
  try{const result=await window.SuohaData.fetchAll(sb,'auctions',[['created_at',false],['id',true]]);if(own!==generation)return;if(result.error)throw result.error;rows=result.data;loaded=true;}
  catch(e){if(own===generation)error='拍卖读取失败，请确认已执行 029_auctions.sql，并检查账号权限。';}
  finally{if(own===generation){busy=false;render();window.SuohaWorkspace?.renderPublishing();}}
 }
 function render(){
  if(!host||state.page!=='auctions')return;
  if(!canWrite()){host.textContent='仅授权编辑成员可使用拍卖管理。';return;}
  host.innerHTML=`<div class="ws-heading"><div><p class="eyebrow">AUCTIONS</p><h1>拍卖管理</h1><p>临近截止的有效出价自动延长截止时间。成交自动进入意向与销售，收款与交付由人工核实。</p></div><div class="ws-actions"><button class="ws-action primary" data-auction-new>创建拍卖</button><button class="ws-action" data-auction-refresh ${busy?'disabled':''}>刷新</button></div></div>${error?`<p role="alert" class="ws-alert">${esc(error)}</p>`:''}${selectedListing?`<p class="ws-note">当前查看所选个体的拍卖记录。<button class="ws-action" data-auction-all>查看全部场次</button></p>`:""}<div class="ws-panel"><p class="ws-note">已开拍的规则不可修改。结拍任务每分钟执行；出价以服务器截止时间为准。待付款超过期限后，请先核实收款再取消预留。</p>${rows.length?`<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>个体 / 场次</th><th>价格 / 出价</th><th>规则</th><th>时间</th><th>状态 / 操作</th></tr></thead><tbody>${rows.filter(a=>!selectedListing||a.listing_id===selectedListing).map(a=>{const l=window.SuohaWorkspace.snapshot().listings.find(l=>l.id===a.listing_id);return `<tr><td>${esc(l?.title||a.listing_id)}<small>${esc(l?.snake_id||'')} · ${esc(a.id.slice(0,8))}</small></td><td>¥${esc(a.current_price??a.start_price)}<small>${a.bid_count} 次 · 加价至少 ¥${esc(a.increment)}</small></td><td>${a.idle_minutes} 分钟无人出价结束<small>成交后 ${a.payment_hours} 小时内联系付款</small></td><td>${date(a.starts_at)} 开始<small>${date(a.ends_at)} 截止</small><small>${a.hard_ends_at?'强制截止 '+date(a.hard_ends_at):'自动延时，无强制截止'}</small></td><td>${esc(labels[a.status])}${a.status==='open'&&Date.now()>=new Date(a.ends_at)?' · 等待结拍':''}<div class="ws-actions">${l?.published?`<a class="ws-action" href="/specimens/${encodeURIComponent(l.slug)}" target="_blank" rel="noopener">查看</a>`:''}<button class="ws-action" data-auction-history="${a.id}">出价记录</button>${a.status==='open'?`<button class="ws-action" data-auction-cancel="${a.id}">取消</button>`:''}${a.inquiry_id?'<button class="ws-action" data-auction-sales>处理成交</button>':''}</div>${a.cancel_reason?`<small>${esc(a.cancel_reason)}</small>`:''}</td></tr>`;}).join('')}</tbody></table></div>`:'<p>暂无拍卖。从已发布的在售个体创建一场拍卖。</p>'}</div>`;
  if(!loaded&&!busy&&!error)load();
 }
 function openForm(listingId=''){
  if(!canWrite())return;
  if(error||!loaded)return toast('拍卖信息尚未读取，请刷新后再试。',true);
  const listings=window.SuohaWorkspace.snapshot().listings.filter(l=>l.published&&!l.deleted_at&&l.sale_status==='available'&&l.currency==='CNY'&&!rows.some(a=>a.listing_id===l.id&&a.status==='open'));
  if(listingId&&!listings.some(l=>l.id===listingId))return toast('该个体暂不能开拍：请先发布、设为在售并使用人民币，且没有正在进行的拍卖。',true);
  if(!listings.length)return toast('暂无可开拍个体，请先在公开展示中发布在售的人民币个体。',true);
  const start=new Date(Date.now()+60000);start.setMinutes(start.getMinutes()-start.getTimezoneOffset());
  dialog.innerHTML=`<button type="button" data-auction-close aria-label="关闭">关闭 ×</button><h2>创建拍卖</h2><p>保存后按设定时间开拍，规则固定。首拍可按起拍价出价；运费及交付条件请提前写入公开个体说明。</p><form class="auction-form"><label>拍卖个体<select name="listing" required><option value="">请选择已发布的在售个体</option>${listings.map(l=>`<option value="${l.id}" ${l.id===listingId?'selected':''}>${esc(l.snake_id)} · ${esc(l.title)}</option>`).join('')}</select></label><label>起拍价（元）<input name="price" type="number" min="0.01" max="9999999999.99" step="0.01" required></label><label>最低加价（元）<input name="increment" type="number" min="0.01" step="0.01" value="50" required></label><label>无人继续出价结束间隔（分钟）<input name="idle" type="number" min="1" max="10080" value="30" required></label><label>开拍时间<input name="starts" type="datetime-local" value="${start.toISOString().slice(0,16)}" required></label><label>无人首拍时，开拍后多久流拍（小时）<input name="first" type="number" min="1" max="720" value="24" required></label><label>强制截止上限（小时，可留空不限延时）<input name="max" type="number" min="1" max="720" placeholder="留空：临近截止持续出价可不断延长"></label><label>成交付款期限（小时）<input name="payment" type="number" min="1" max="168" value="2" required></label><p role="status" class="auction-message"></p><button type="submit" class="ws-action primary">确认创建拍卖</button></form>`;
  dialog.querySelector('[name=listing]').setAttribute('aria-label','拍卖个体');
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('[type=submit]'),m=f.querySelector('[role=status]');b.disabled=true;try{const v=Object.fromEntries(new FormData(f));await call('create_auction',{p_listing:v.listing,p_price:Number(v.price),p_increment:Number(v.increment),p_idle:Number(v.idle),p_starts:new Date(v.starts).toISOString(),p_first_hours:Number(v.first),p_max_hours:v.max===''?null:Number(v.max),p_payment_hours:Number(v.payment)});dialog.close();await load();toast('拍卖已创建');}catch(err){m.textContent=err.message;}finally{b.disabled=false;}};
  dialog.showModal();
 }
 host.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.hasAttribute('data-auction-new')){await load();return openForm();}
  if(b.hasAttribute('data-auction-all')){selectedListing='';return render();}
  if(b.hasAttribute('data-auction-refresh'))return load();
  if(b.hasAttribute('data-auction-sales'))return setPage('sales');
  if(b.dataset.auctionCancel){dialog.innerHTML=`<button data-auction-close>关闭 ×</button><h2>取消拍卖</h2><p>取消原因将向竞拍买家公开。不能通过取消修改已经成交的结果。</p><form class="auction-form"><label>取消原因<textarea name="reason" required maxlength="1000"></textarea></label><p role="status"></p><button class="ws-action" type="submit">确认取消</button></form>`;dialog.querySelector('form').onsubmit=async event=>{event.preventDefault();const f=event.currentTarget,submit=f.querySelector('[type=submit]');submit.disabled=true;try{await call('cancel_auction',{p_id:b.dataset.auctionCancel,p_reason:f.elements.reason.value});dialog.close();await load();await window.SuohaWorkspace.load(true);}catch(err){f.querySelector('[role=status]').textContent=err.message;}finally{submit.disabled=false;}};dialog.showModal();}
  if(b.dataset.auctionHistory){b.disabled=true;try{const result=await sb.from('auction_bids').select('id,amount,created_at').eq('auction_id',b.dataset.auctionHistory).order('id',{ascending:false}).limit(100);if(result.error)throw result.error;dialog.innerHTML=`<button data-auction-close>关闭 ×</button><h2>最近 100 条出价</h2><div class="auction-history">${result.data.map(r=>`<p>#${r.id} · ¥${esc(r.amount)} · ${date(r.created_at)}</p>`).join('')||'尚无出价'}</div>`;dialog.showModal();}catch(err){toast(err.message,true);}finally{b.disabled=false;}}
 });
 window.SuohaAuctionAdmin={render,ensureLoaded(){if(!loaded&&!busy&&!error)load();},forListing(id){if(!loaded||error)return {ready:false,error:!!error};const list=rows.filter(a=>a.listing_id===id);return {ready:true,active:list.find(a=>a.status==='open'),latest:list[0]};},async createForListing(id){await load();openForm(id);},async manageListing(id){selectedListing=id;setPage('auctions');await load();}};
 window.addEventListener('suoha:listings',()=>{loaded=false;load();});
 window.addEventListener('suoha:logout',()=>{generation++;rows=[];selectedListing='';loaded=false;busy=false;error='';host.innerHTML='';dialog.close();});
 if(location.hash==='#auctions')setPage('auctions',false);
})();
