(() => {
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(v);
 const date=v=>new Date(v).toLocaleString('zh-CN');
 const labels={open:'拍卖中',won:'拍卖成交',unsold:'本场流拍',cancelled:'拍卖已取消'};
 let mounted=null,version=0,offset=0,loading=false,submitting=false,accountName='',pendingBid=null;
 const dialog=document.createElement('dialog');dialog.className='auction-dialog';dialog.id='buyerDialog';document.body.append(dialog);
 const account=document.createElement('button');account.className='buyer-account';account.textContent='我的订单 / 竞拍';account.type='button';account.onclick=()=>showAccount();document.body.append(account);
 async function api(body,listing){const response=await fetch('/.netlify/functions/auction-api'+(listing?'?listing_id='+encodeURIComponent(listing):''),{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw new Error(result.error||'竞拍服务暂不可用');return result;}
 function shell(title,content){dialog.innerHTML=`<button type="button" data-buyer-close aria-label="关闭">关闭 ×</button><h2>${title}</h2>${content}`;if(!dialog.open)dialog.showModal();}
 dialog.addEventListener('click',e=>{if(e.target.closest('[data-buyer-close]'))dialog.close();});
 function authForm(register=false){
  shell(register?'注册竞拍账号':'登录竞拍账号',`<p>买家账号用于购买、出价和查看付款记录。请保存好账号密码；联系方式不会公开。</p><form class="auction-form"><label>账号<input name="username" required pattern="[A-Za-z0-9_]{4,30}" minlength="4" maxlength="30" autocomplete="username" placeholder="4–30 位字母、数字或下划线"></label><label>密码<input name="password" type="password" required minlength="10" maxlength="128" autocomplete="${register?'new-password':'current-password'}" placeholder="至少 10 位"></label>${register?'<label>微信号或手机号<input name="contact" required minlength="3" maxlength="200" autocomplete="off"></label><label class="auction-consent"><input name="consent" type="checkbox" required>我同意有效出价不可撤回，成交后按约联系付款，并允许店铺使用联系方式处理交易。</label>':''}<p role="status" class="auction-message"></p><button type="submit" class="button button-dark">${register?'注册并登录':'登录'}</button><button type="button" data-switch-auth>${register?'已有账号，去登录':'创建竞拍账号'}</button></form>`);
  dialog.querySelector('[data-switch-auth]').onclick=()=>authForm(!register);
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('[type=submit]');b.disabled=true;try{const v=Object.fromEntries(new FormData(f));await api({...v,consent:f.elements.consent?.checked===true,action:register?'register':'login'});await showAccount();await refresh();}catch(err){f.querySelector('[role=status]').textContent=err.message;}finally{b.disabled=false;}};
 }
 async function showAccount(){
  shell('我的竞拍','<p role="status">正在读取…</p>');
  try{const result=await api();accountName=result.username||'';if(!accountName)return authForm();
   shell('我的竞拍',`<p>已登录：${esc(accountName)} <button type="button" data-buyer-logout>退出登录</button></p><p>展示最近 100 场参与记录。未中标不扣款；成交后可扫码付款并上传截图，等待店铺人工核实。</p><div class="auction-history">${result.items.map(a=>`<article><a href="/specimens/${encodeURIComponent(a.slug)}">${esc(a.title)}</a><p>${esc(labels[a.status])}${a.status==='open'&&a.leading?' · 你已领先':''}${a.status==='open'&&!a.leading?' · 已被超价':''} · ${money(a.current_price??a.start_price)}</p>${a.order?`<p>成交编号 ${esc(a.order.reference)}<br>状态：${esc(({reserved:'待联系付款',paid:'已收款',delivered:'已交付',completed:'已完成',cancelled:'已取消'})[a.order.status]||a.order.status)}<br>付款期限 ${date(a.order.reserved_until)}</p>`:''}${a.cancel_reason?`<p>取消原因：${esc(a.cancel_reason)}</p>`:''}</article>`).join('')||'<p>尚未参与拍卖，进入拍卖个体详情即可出价。</p>'}</div>`);
   window.SuohaPayments?.orders(dialog);
   dialog.querySelectorAll('.auction-history article').forEach((article,index)=>window.SuohaPayments?.mount(article,result.items[index].order));
   dialog.querySelector('[data-buyer-logout]').onclick=async()=>{try{await api({action:'logout'});accountName='';pendingBid=null;authForm();await refresh();}catch(err){shell('退出失败',`<p role="alert">${esc(err.message)}</p>`);}};
   dialog.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>dialog.close()));
  }catch(err){shell('我的竞拍',`<p role="alert">${esc(err.message)}</p><button data-account-retry>重试</button>`);dialog.querySelector('[data-account-retry]').onclick=showAccount;}
 }
 function decorate(items){for(const item of items){if(!item.auction)continue;for(const link of document.querySelectorAll('.specimen-card')){if(new URL(link.href,location.href).pathname!=='/specimens/'+item.slug)continue;const a=item.auction;const badge=link.querySelector('.photo-label');if(badge)badge.textContent=a.status==='open'?(Date.now()<new Date(a.starts_at)?'即将开拍':'竞拍中'):labels[a.status];const price=link.querySelector('.specimen-price');if(price&&['open','won'].includes(a.status))price.textContent=(a.current_price==null?'起拍 ':'当前 ')+money(a.current_price??a.start_price);}}}
 function mount(item){
  version++;mounted=null;pendingBid=null;
  window.SuohaPayments?.purchase(item);
  if(!item.auction)return;
  const copy=document.querySelector('#detailView .detail-copy');if(!copy)return;
  const host=document.createElement('section');host.id='auctionPanel';host.className='auction-panel';host.innerHTML='<h2>竞拍</h2><p role="status">正在核实最新价格…</p>';
  const purchase=copy.querySelector('.detail-purchase');purchase.before(host);
  if(['open','won'].includes(item.auction.status))purchase.hidden=true;
  const price=copy.querySelector('.detail-price');if(price)price.textContent=(item.auction.current_price==null?'起拍 ':'当前 ')+money(item.auction.current_price??item.auction.start_price);
  host.tabIndex=-1;mounted={item,host};refresh();
 }
 async function refresh(){
  const own=version,target=mounted;if(!target?.host.isConnected||target.host.closest('[hidden]')||loading||submitting)return;
  loading=true;
  try{const result=await api(null,target.item.id);if(own!==version||!target.host.isConnected)return;
   accountName=result.username||'';offset=new Date(result.server_time).getTime()-Date.now();
   const a=result.items.find(a=>a.id===target.item.auction.id)||result.items[0];if(!a){target.host.innerHTML='<p>本场拍卖暂不可用，请刷新页面。</p>';return;}
   paint(target.host,a);
  }catch(err){if(own===version&&target.host.isConnected){let message=target.host.querySelector('.auction-message');if(!message){message=document.createElement('p');message.className='auction-message';message.setAttribute('role','alert');target.host.append(message);}message.textContent=err.message+'，正在等待重新连接。';target.host.querySelector('[type=submit]')?.setAttribute('disabled','');}}
  finally{loading=false;}
 }
 function paint(host,a){
  // Keep the input/focus while refreshing current price and history.
  const prior=host.querySelector('[name=amount]'),typed=prior?.value,focused=document.activeElement===prior,consented=host.querySelector('[name=consent]')?.checked;
  const now=Date.now()+offset,started=now>=new Date(a.starts_at),ended=now>=new Date(a.ends_at),canBid=a.status==='open'&&started&&!ended&&!a.leading;
  const minimum=Math.round(Number(a.current_price==null?a.start_price:Number(a.current_price)+Number(a.increment))*100)/100;
  const label=a.status==='open'?(started?(ended?'已截止，正在结拍':'竞拍中'):'即将开拍'):labels[a.status];
  const price=document.querySelector('#detailView .detail-price'),tag=document.querySelector('#detailView .sale-tag');
  if(price)price.textContent=(a.current_price==null?'起拍 ':'当前 ')+money(a.current_price??a.start_price);
  if(tag)tag.textContent=label;
  host.innerHTML=`<p class="eyebrow">LIVE AUCTION</p><h2>${esc(label)}</h2><div class="auction-price">${money(a.current_price??a.start_price)} <small>${a.current_price==null?'起拍价':'当前最高价'}</small></div><p>${a.bid_count} 次出价 · 每次至少加 ${money(a.increment)}</p><p data-auction-clock data-end="${a.status==='open'&&!started?a.starts_at:a.ends_at}" data-prefix="${!started?'距离开拍':'剩余'}"></p><p>距截止不足 ${a.idle_minutes} 分钟时，有效出价将截止时间延至本次出价后 ${a.idle_minutes} 分钟；不会缩短已有截止时间。${a.hard_ends_at?'本场另设强制截止：'+date(a.hard_ends_at)+'，延时不超过此时间。':'无强制截止，可连续延时。'}无人出价到截止时间流拍。</p><p>当前截止：${date(a.ends_at)} · 成交后 ${a.payment_hours} 小时内联系付款。运费和交付条件以个体公开说明为准。</p>${a.leading?`<p class="auction-leading">${a.status==='won'?'你已中标，请核对订单后扫码付款并上传截图。':a.status==='open'?'你已领先，无需继续加价。':'你曾是本场最高出价者。'}</p>`:a.participated&&a.status==='open'?'<p>你的报价已被超过。</p>':''}${a.cancel_reason?`<p>取消原因：${esc(a.cancel_reason)}</p>`:''}${a.order?`<p>成交编号：${esc(a.order.reference)}<br>付款期限：${date(a.order.reserved_until)}<br>请在下方扫码付款并上传截图；人工核实到账后更新订单状态。</p>`:''}${a.status==='open'?`<form class="auction-form"><label>我的报价（元，当前最低 ${money(minimum)}）<input name="amount" type="number" min="${minimum}" max="9999999999.99" step="0.01" required value="${esc(typed||minimum)}" ${canBid?'':'disabled'}></label><label class="auction-consent"><input name="consent" type="checkbox" required ${canBid?'':'disabled'}>确认出价不可撤回，成交后按约联系付款。</label><button type="submit" class="button button-dark" ${canBid?'':'disabled'}>${accountName?'确认出价':'登录后出价'}</button></form>`:''}<p role="status" class="auction-message"></p><details><summary>最近 20 条出价</summary><ol class="auction-bids">${a.bids.map(b=>`<li>出价 #${b.number}${b.mine?'（我）':''} · ${money(b.amount)}<small>${date(b.at)}</small></li>`).join('')||'<li>尚无出价</li>'}</ol></details>`;
  if(focused)host.querySelector('[name=amount]')?.focus({preventScroll:true});
  if(consented&&host.querySelector('[name=consent]'))host.querySelector('[name=consent]').checked=true;
  tick();
  if(a.order)window.SuohaPayments?.mount(host,a.order,true);
  const form=host.querySelector('form');if(form)form.onsubmit=async e=>{
   e.preventDefault();if(!accountName){authForm();return;}
   const button=form.querySelector('[type=submit]'),message=host.querySelector('.auction-message'),amount=Number(form.elements.amount.value);button.disabled=true;submitting=true;
   if(!pendingBid||pendingBid.id!==a.id||pendingBid.amount!==amount)pendingBid={action:'bid',id:a.id,amount,request_id:crypto.randomUUID()};
   try{await api(pendingBid);pendingBid=null;submitting=false;await refresh();const m=host.querySelector('.auction-message');if(m)m.textContent='出价已确认。';host.focus({preventScroll:true});}
   catch(err){message.textContent=err.message;button.disabled=false;}
   finally{submitting=false;}
  };
 }
 function tick(){const clock=mounted?.host.querySelector('[data-auction-clock]');if(!clock)return;const left=Math.max(0,Math.ceil((new Date(clock.dataset.end)-Date.now()-offset)/1000));clock.textContent=`${clock.dataset.prefix}：${Math.floor(left/3600)} 小时 ${Math.floor(left%3600/60)} 分 ${left%60} 秒`;if(!left&&clock.dataset.prefix==='剩余')mounted.host.querySelector('[type=submit]')?.setAttribute('disabled','');}
 setInterval(()=>{if(!document.hidden)tick();},1000);
 setInterval(()=>{if(!document.hidden&&!dialog.open)refresh();},5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 window.SuohaAuctionPublic={mount,decorate,login:()=>authForm()};
})();
