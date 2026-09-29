(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statuses = { available:'在售',reserved:'已预留',sold:'已售',display:'留种展示' };
  const sexes = { F:'母 ♀',M:'公 ♂',U:'性别未知' };
  const states = { visual:'表现',het:'确定携带',possible_het:'可能携带',super:'Super',line_trait:'品系性状',unknown:'未知' };
  let current = null, abort = null, revision = 0, requestIds = {}, lastTrigger = null;
  const money = item => item.asking_price == null ? '询价' : new Intl.NumberFormat('zh-CN',{style:'currency',currency:item.currency || 'CNY',maximumFractionDigits:2}).format(item.asking_price);
  const placeholder = () => '<div class="no-photo"><img src="/assets/mark.svg" alt=""><span>个体照片待补充</span></div>';
  function photo(item) { return item.photos?.[0] ? `<img src="${esc(item.photos[0].url)}" alt="${esc(item.title)}" loading="lazy" width="600" height="550">` : placeholder(); }
  function card(item) { return `<a class="specimen-card reveal-in" href="/specimens/${encodeURIComponent(item.slug)}"><div class="specimen-photo">${photo(item)}<span class="photo-label ${esc(item.sale_status)}">${esc(statuses[item.sale_status] || '展示')}</span><span class="specimen-number">${esc(item.snake_id)}</span></div><div class="specimen-meta"><h3>${esc(item.title)}</h3><span class="specimen-price">${item.sale_status==='display'?'留种档案':money(item)}</span></div><div class="specimen-sub"><span>${esc(sexes[item.sex] || sexes.U)}</span><span>${esc(item.birth || '出生时间待确认')}</span><span>${esc(item.series || '未分类')}</span></div></a>`; }
  function empty(host, error=false) {
    host.innerHTML=`<div class="empty-collection"><span class="empty-glyph" aria-hidden="true">✳</span><div><h3>${error?'档案暂时无法连接。':'下一份独特，正在准备。'}</h3><p>${error?'暂未能读取公开目录。你可以稍后重试；这里不会用示例个体替代真实档案。':'当前条件下暂无公开个体。我们只展示已确认发布的资料，照片与档案准备完成后会在这里呈现。'}</p>${error?'<button data-retry>重新连接 ↗</button>':'<a href="/collection">查看全部档案 ↗</a>'}</div></div>`;
    host.querySelector('[data-retry]')?.addEventListener('click',route);
  }
  async function fetchCatalog(params, signal) {
    const r = await fetch('/.netlify/functions/public-catalog?'+new URLSearchParams(params),{signal});
    if(!r.ok) throw new Error('目录暂时无法连接');
    return r.json();
  }
  function rememberScroll() { if(location.pathname==='/collection') sessionStorage.setItem('suoha.catalogScroll',String(scrollY)); }
  function navigate(url) { rememberScroll();const restore=url==='/collection'+(sessionStorage.getItem('suoha.catalogQuery')||'');history.pushState({restore},'',url);route();if(!restore)scrollTo(0,0); }
  async function loadPreview(status='') {
    const host=$('#featuredGrid');host.innerHTML='<div class="catalog-loading">正在读取公开档案…</div>';
    const ownRevision=++revision;
    try { const data=await fetchCatalog({status});if(ownRevision!==revision)return;if(!data.items.length)return empty(host);host.innerHTML=data.items.slice(0,3).map(card).join(''); }
    catch { if(ownRevision===revision)empty(host,true); }
  }
  async function route() {
    abort?.abort();abort=new AbortController();
    const detail=location.pathname.startsWith('/specimens/'), catalog=location.pathname==='/collection';
    $('#homeView').hidden=detail||catalog;$('#catalogView').hidden=!catalog;$('#detailView').hidden=!detail;
    $('a[data-nav="collection"]').setAttribute('aria-current',catalog||detail?'page':'false');
    document.title=detail?'个体档案 · SUOHA':catalog?'探索个体 · SUOHA':'SUOHA · 猪鼻蛇繁育档案';
    if(detail){
      const host=$('#detailView');host.innerHTML='<div class="catalog-loading">正在读取个体档案…</div>';
      try { const slug=decodeURIComponent(location.pathname.split('/')[2]||'');const data=await fetchCatalog({slug},abort.signal);current=data.items[0];if(!current){host.innerHTML='<div class="empty-collection"><div><h1>这份档案暂未公开。</h1><p>可能尚未发布或已经下架。</p><a href="/collection">返回个体目录 ↗</a></div></div>';return;}renderDetail(current); }
      catch(error){if(error.name!=='AbortError')empty(host,true);}return;
    }
    if(!catalog){loadPreview();return;}
    const form=$('#catalogFilters'), params=new URLSearchParams(location.search), host=$('#catalogGrid');
    sessionStorage.setItem('suoha.catalogQuery',location.search);
    for(const field of ['q','sex','status','sort'])form.elements[field].value=params.get(field)|| (field==='sort'?'newest':'');
    host.innerHTML='<div class="catalog-loading">正在读取公开档案…</div>';$('#pagination').innerHTML='';
    try {
      const data=await fetchCatalog(Object.fromEntries(params),abort.signal);
      form.elements.series.innerHTML='<option value="">全部系列</option>'+data.series.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');form.elements.series.value=params.get('series')||'';
      $('#catalogCount').textContent=`${data.total} 份公开档案`;
      if(data.items.length)host.innerHTML=data.items.map(card).join('');else empty(host);
      const pages=Math.max(1,Math.ceil(data.total/24));
      if(pages>1)$('#pagination').innerHTML=`<button data-page="${data.page-1}" ${data.page<=1?'disabled':''}>← 上一页</button><span>${data.page} / ${pages}</span><button data-page="${data.page+1}" ${data.page>=pages?'disabled':''}>下一页 →</button>`;
      if(history.state?.restore){requestAnimationFrame(()=>scrollTo(0,Number(sessionStorage.getItem('suoha.catalogScroll')||0)));}
    } catch(error){if(error.name!=='AbortError'){empty(host,true);$('#catalogCount').textContent='连接暂不可用';}}
  }
  function renderDetail(item) {
    document.title=`${item.title} · ${item.snake_id} · SUOHA`;
    const genes=(item.genes||[]).map(g=>`<span class="${g.state==='possible_het'||g.state==='unknown'?'uncertain':''}">${esc(g.name)} · ${esc(states[g.state]||g.state)}${g.state==='possible_het'&&g.probability!=null?' '+Math.round(g.probability*100)+'%':''}</span>`).join('');
    const canInquire=['available','reserved'].includes(item.sale_status);
    $('#detailView').innerHTML=`<nav class="breadcrumbs" aria-label="面包屑"><a href="/">首页</a><span>/</span><a href="/collection${esc(sessionStorage.getItem('suoha.catalogQuery')||'')}">个体档案</a><span>/ ${esc(item.snake_id)}</span></nav><div class="detail-layout"><div><button class="detail-main-photo" id="detailPhoto" type="button" aria-label="放大个体照片" ${!item.photos.length?'disabled':''}>${photo(item)}</button><div class="detail-thumbnails">${item.photos.map((p,i)=>`<button type="button" data-photo="${i}" aria-pressed="${i===0}" aria-label="照片 ${i+1}"><img src="${esc(p.url)}" alt="${esc(p.caption||item.title)}" loading="lazy"></button>`).join('')}</div><p class="photo-caption" id="photoCaption">${esc(item.photos[0]?.caption||'仅展示此个体的真实照片')}${item.photos[0]?.date?' · '+esc(item.photos[0].date):''}</p></div><div class="detail-copy"><span class="sale-tag">${esc(statuses[item.sale_status])}</span><p class="eyebrow">SPECIMEN / ${esc(item.snake_id)}</p><h1>${esc(item.title)}</h1><div class="detail-price">${item.sale_status==='display'?'留种展示':money(item)}</div><dl class="detail-facts"><div><dt>性别</dt><dd>${esc(sexes[item.sex]||sexes.U)}</dd></div><div><dt>出生时间</dt><dd>${esc(item.birth||'待确认')}</dd></div><div><dt>系列</dt><dd>${esc(item.series||'未分类')}</dd></div></dl><p>${esc(item.description||'更多个体资料正在整理中。')}</p><div class="gene-tags">${genes||'<span class="uncertain">结构化基因资料待补充</span>'}</div><p>基因状态以已记录资料为依据，可能携带不等于确定携带。</p><div class="detail-purchase">${canInquire?`<button class="button button-dark" id="openInquiry">${item.sale_status==='reserved'?'提交候补咨询':'咨询购买'} <span>↗</span></button>`:'<a class="button button-dark" href="/collection?status=available">探索其他在售个体 <span>↗</span></a>'}<p>无需注册 · 提交不扣款 · 预留由人工确认</p></div></div></div><div class="detail-notes"><article><h3>个体情况</h3><p>${esc(item.husbandry_summary||'暂无公开的成长与进食记录，可在咨询时进一步了解。')}</p></article><article><h3>谱系资料</h3><p>${esc(item.pedigree_summary||'暂无已确认公开的亲本资料。')}</p></article></div>`;
    $('#openInquiry')?.addEventListener('click',openInquiry);
    $('#detailPhoto')?.addEventListener('click',()=>{const img=$('#detailPhoto img');if(!img)return;$('#lightbox img').src=img.src;$('#lightbox img').alt=item.title;$('#lightbox').showModal();});
    document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{const p=item.photos[Number(button.dataset.photo)];$('#detailPhoto').innerHTML=`<img src="${esc(p.url)}" alt="${esc(p.caption||item.title)}">`;$('#photoCaption').textContent=[p.caption,p.date].filter(Boolean).join(' · ');document.querySelectorAll('[data-photo]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
  }
  function openInquiry(event) {lastTrigger=event.currentTarget;$('#inquirySubject').textContent=`${current.snake_id} · ${current.title}${current.sale_status==='reserved'?' · 候补咨询':''}`;$('#inquiryForm').hidden=false;$('#inquiryMessage').textContent='';$('#inquiryDialog').showModal();}
  $('#inquiryForm').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),message=$('#inquiryMessage');
    if(!form.reportValidity()||!current)return;button.disabled=true;message.textContent='正在提交…';message.className='';
    const key=current.id;let id=requestIds[key]||sessionStorage.getItem('suoha.inquiry.'+key);if(!id){id=crypto.randomUUID();sessionStorage.setItem('suoha.inquiry.'+key,id);}requestIds[key]=id;
    try{const values=Object.fromEntries(new FormData(form));const result=await fetch('/.netlify/functions/purchase-inquiry',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...values,consent:form.elements.consent.checked,listing_id:key,request_id:id})});const payload=await result.json();if(!result.ok)throw new Error(payload.error||'提交失败，请稍后再试。');message.textContent=`已收到意向。请保留编号：${payload.reference}\n我们会通过你留下的联系方式沟通。提交不等于预留成功。`;form.reset();sessionStorage.removeItem('suoha.inquiry.'+key);delete requestIds[key];button.textContent='意向已提交';setTimeout(()=>{button.disabled=false;button.innerHTML='提交购买意向 <span>↗</span>';},2000);}
    catch(error){message.textContent=error.message;message.className='error-text';button.disabled=false;}
  });
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('click',event=>{if(event.target===d){const rect=d.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)d.close();}});d.addEventListener('close',()=>lastTrigger?.focus());});
  $('#catalogFilters').addEventListener('submit',event=>{event.preventDefault();const params=new URLSearchParams();new FormData(event.currentTarget).forEach((v,k)=>{if(v)params.set(k,v);});sessionStorage.setItem('suoha.catalogQuery','?'+params);sessionStorage.setItem('suoha.catalogScroll','0');navigate('/collection?'+params);});
  $('#catalogFilters').addEventListener('reset',()=>{sessionStorage.setItem('suoha.catalogQuery','');navigate('/collection');});
  $('#pagination').addEventListener('click',event=>{const b=event.target.closest('[data-page]');if(!b)return;const p=new URLSearchParams(location.search);p.set('page',b.dataset.page);navigate('/collection?'+p);});
  document.querySelectorAll('[data-preview-status]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-preview-status]').forEach(el=>el.classList.toggle('is-active',el===b));loadPreview(b.dataset.previewStatus);}));
  document.addEventListener('click',event=>{const link=event.target.closest('a');if(!link||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button>0)return;const url=new URL(link.href,location.href);if(url.origin!==location.origin||url.pathname.startsWith('/admin')||url.hash)return;if(url.pathname==='/'||url.pathname==='/collection'||url.pathname.startsWith('/specimens/')){event.preventDefault();navigate(url.pathname+url.search);}});
  addEventListener('popstate',()=>{history.replaceState({restore:true},'');route();});
  $('#copyrightYear').textContent=new Date().getFullYear();route();
})();
