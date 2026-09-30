/* Catalogue controls and original pixel shorts. No business data is fabricated. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const form = $('#catalogFilters'), toggle = $('.catalog-filter-toggle');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open)); form.classList.toggle('filters-open', open);
  });
  form.addEventListener('submit', () => {toggle.setAttribute('aria-expanded','false');form.classList.remove('filters-open');});
  const geneState = (reset=false) => {form.elements.gene_state.disabled=!form.elements.gene.value;if(reset&&!form.elements.gene.value)form.elements.gene_state.value='';};
  form.elements.gene.addEventListener('change', () => geneState(true));
  function chips() {
    geneState();
    const params = new URLSearchParams(location.search);
    const labels = {q:'搜索',series:'系列',sex:'性别',status:'状态',year:'出生',gene:'基因',gene_state:'基因状态',sort:'排序'};
    $('#activeCatalogFilters').innerHTML = [...params].filter(([key,value]) => labels[key] && value && !(key==='sort'&&value==='newest')).map(([key,value]) => {
      const field = form.elements[key];
      const selected = field?.selectedOptions?.[0];
      const text = selected?.value === value ? selected.textContent : value;
      return `<button type="button" data-clear-filter="${key}" aria-label="移除${labels[key]}筛选">${labels[key]}：${esc(text)} <span aria-hidden="true">×</span></button>`;
    }).join('') + (params.size ? '<button type="button" data-clear-all>清空全部</button>' : '');
    document.querySelectorAll('#catalogGrid .empty-collection a').forEach(a => {a.textContent = params.size ? '清空筛选，查看全部 ↗' : '查看全部档案 ↗';});
  }
  addEventListener('suoha:catalog', chips);
  // A cached catalog response may finish before this deferred script is evaluated.
  chips();
  $('#activeCatalogFilters').addEventListener('click', event => {
    if (event.target.closest('[data-clear-all]')) {form.reset();return;}
    const b = event.target.closest('[data-clear-filter]');if (!b) return;
    form.elements[b.dataset.clearFilter].value = b.dataset.clearFilter === 'sort' ? 'newest' : '';
    if (b.dataset.clearFilter === 'gene') form.elements.gene_state.value = '';
    form.requestSubmit();
  });
  const detail = $('#detailView');
  function enhanceDetail() {
    const gallery = detail.querySelector('.detail-thumbnails');
    if (!gallery || gallery.dataset.enhanced) return;
    gallery.dataset.enhanced = 'true';gallery.setAttribute('aria-label','个体照片选择');
    gallery.addEventListener('keydown', event => {
      const buttons = [...gallery.querySelectorAll('button')], index = buttons.indexOf(event.target);
      if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length-1 : (index + (event.key==='ArrowRight'?1:-1) + buttons.length)%buttons.length;
      buttons[next].click();buttons[next].focus();buttons[next].scrollIntoView({block:'nearest',inline:'nearest'});
    });
    const facts = detail.querySelector('.detail-facts');
    const code = detail.querySelector('.detail-copy .eyebrow')?.textContent.split('/').slice(1).join('/').trim();
    const status = detail.querySelector('.sale-tag')?.textContent;
    if (facts) {const cells = [...facts.children];facts.innerHTML = `${cells.slice(0,2).map(e=>e.outerHTML).join('')}<div><dt>编号</dt><dd>${esc(code)}</dd></div><div><dt>状态</dt><dd>${esc(status)}</dd></div>${cells.slice(2).map(e=>e.outerHTML).join('')}`;}
  }
  new MutationObserver(enhanceDetail).observe(detail,{childList:true,subtree:true});
  enhanceDetail();

  const theater = $('#pixelTheater');
  const stories = [
    {name:'小小新生',en:'A LITTLE HELLO',file:'/assets/sprites/hognose-hatch-sheet.webp',lines:['安静的等待，也有自己的声音。','世界很大，先探一探头。','一小圈身体，一段新的故事。','你好呀，我们慢慢认识。']},
    {name:'繁育者手记',en:'ONE NOTE AT A TIME',file:'/assets/sprites/keeper-notes-sheet.webp',lines:['今天的观察，从翻开一页开始。','把小变化，认真记下来。','抬头看看，又是充实的一天。','明天见。故事还会继续。']}
  ];
  let story = 0, frame = 0, playing = false, timer = null, origin = null;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  theater.innerHTML = `<div class="pixel-toolbar"><span>SUOHA / PIXEL SHORTS</span><button type="button" data-close-pixel aria-label="关闭像素剧场">×</button></div><div class="pixel-story-tabs" role="group" aria-label="选择像素短片">${stories.map((s,i)=>`<button type="button" data-story="${i}" aria-pressed="${i===0}">${s.name}</button>`).join('')}</div><div class="pixel-stage"><div class="pixel-stars" aria-hidden="true"></div><p class="eyebrow" id="pixelSubtitle"></p><h2 id="pixelTheaterTitle"></h2><div class="pixel-actor" role="img" aria-label="像素动画画面"></div><div class="pixel-ground" aria-hidden="true"></div><p id="pixelCaption"></p></div><div class="pixel-controls"><button type="button" data-pixel-play>暂停动画</button><button type="button" data-pixel-replay>从头播放</button><div role="group" aria-label="选择动画画面">${[0,1,2,3].map(i=>`<button type="button" data-frame="${i}" aria-label="第 ${i+1} 帧" aria-pressed="${i===0}">0${i+1}</button>`).join('')}</div></div><p class="pixel-credit">原创 AI 像素素材 · 四帧品牌小故事，非真实孵化影像</p>`;
  function paint() {
    const s = stories[story], actor = theater.querySelector('.pixel-actor');
    actor.style.backgroundImage = `url("${s.file}")`;
    actor.style.backgroundPosition = `${frame%2*100}% ${Math.floor(frame/2)*100}%`;
    actor.setAttribute('aria-label', `${s.name}，第 ${frame+1} 帧：${s.lines[frame]}`);
    $('#pixelSubtitle').textContent = s.en;$('#pixelTheaterTitle').textContent = s.name;$('#pixelCaption').textContent = s.lines[frame];
    theater.querySelectorAll('[data-frame]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.frame)===frame)));
    theater.querySelectorAll('[data-story]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.story)===story)));
    theater.querySelector('[data-pixel-play]').textContent = playing ? '暂停动画' : '播放动画';
    theater.dataset.playing = String(playing);
  }
  function schedule() {
    clearTimeout(timer);
    if (!playing || !theater.open || document.hidden) return;
    timer = setTimeout(()=>{frame=(frame+1)%4;paint();schedule();},frame===3?2100:1300);
  }
  document.querySelector('[data-open-pixel]').addEventListener('click', event => {
    origin = event.currentTarget;frame=0;playing=!reduced.matches;paint();theater.showModal();
    document.documentElement.classList.add('pixel-reading');schedule();
    theater.querySelector('[data-close-pixel]').focus();
  });
  theater.addEventListener('click', event => {
    const b=event.target.closest('button');if(!b)return;
    if(b.hasAttribute('data-close-pixel'))return theater.close();
    if(b.hasAttribute('data-pixel-play'))playing=!playing;
    if(b.hasAttribute('data-pixel-replay')){frame=0;playing=true;}
    if(b.hasAttribute('data-frame')){frame=Number(b.dataset.frame);playing=false;}
    if(b.hasAttribute('data-story')){story=Number(b.dataset.story);frame=0;}
    paint();schedule();
  });
  theater.addEventListener('close',()=>{playing=false;clearTimeout(timer);document.documentElement.classList.remove('pixel-reading');origin?.focus({preventScroll:true});});
  document.addEventListener('visibilitychange',schedule);
  reduced.addEventListener('change',()=>{if(reduced.matches){playing=false;paint();schedule();}});
  new MutationObserver(()=>{if($('#homeView').hidden&&theater.open)theater.close();}).observe($('#homeView'),{attributes:true,attributeFilter:['hidden']});
})();
