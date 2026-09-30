(() => {
  'use strict';
  const content = window.SuohaHomeContent;
  if (!content) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const picture = (key, sizes = '(max-width: 700px) 100vw, 50vw') => {
    const img = content.images[key];
    return `<img src="${esc(img.src)}" srcset="${esc(img.small)} ${img.smallWidth || 768}w, ${esc(img.src)} ${img.width}w" sizes="${esc(sizes)}" width="${img.width}" height="${img.height}" alt="${esc(img.alt)}" loading="lazy" decoding="async">`;
  };
  const doors = document.querySelector('#discoveryDoors');
  if (doors) doors.innerHTML = content.doors.map(item => `<a class="discovery-door" href="${esc(item.link)}" data-field-reveal><div class="door-photo">${picture(item.image)}<span class="door-index">${esc(item.index)} / EXPLORE</span><small>${esc(content.images[item.image].credit)}</small></div><div class="door-copy"><p class="eyebrow">${esc(item.kicker)}</p><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p><span class="door-action">${esc(item.action)} <span aria-hidden="true">↗</span></span></div></a>`).join('');
  const scene = document.querySelector('#studioScene');
  const tabs = document.querySelector('#studioTabs');
  const panel = document.querySelector('#studioPanel');
  if (scene && tabs && panel) {
    scene.innerHTML = `<div class="studio-viewport">${picture('studio', '(max-width: 900px) 100vw, 62vw')}<span class="studio-glow" hidden aria-hidden="true"></span></div><figcaption>${esc(content.images.studio.credit)}</figcaption>`;
    tabs.innerHTML = content.moments.map((item, i) => `<button type="button" id="studioTab-${item.id}" role="tab" aria-selected="${i === 0}" aria-controls="studioPanel" tabindex="${i === 0 ? 0 : -1}" data-moment="${i}"><span>0${i + 1}</span>${esc(item.label)}</button>`).join('');
    const selectMoment = index => {
      const item = content.moments[index];
      tabs.querySelectorAll('button').forEach((button, i) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; });
      panel.setAttribute('aria-labelledby', `studioTab-${item.id}`);
      panel.innerHTML = `<p class="eyebrow">${esc(item.time)}</p><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p>${item.note ? `<button class="studio-link" type="button" data-note="${esc(item.note)}">${esc(item.action)} <span aria-hidden="true">↗</span></button>` : `<a class="studio-link" href="${esc(item.link)}">${esc(item.action)} <span aria-hidden="true">↗</span></a>`}`;
      scene.style.setProperty('--beacon-x', `${item.x}%`);
      scene.style.setProperty('--beacon-y', `${item.y}%`);
      scene.dataset.moment = item.id;
    };
    tabs.addEventListener('click', event => { const button = event.target.closest('[data-moment]'); if (button) selectMoment(Number(button.dataset.moment)); });
    tabs.addEventListener('keydown', event => {
      const button = event.target.closest('[data-moment]');
      if (!button || !['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? content.moments.length - 1 : (Number(button.dataset.moment) + (event.key === 'ArrowRight' ? 1 : -1) + content.moments.length) % content.moments.length;
      selectMoment(index); tabs.children[index].focus();
    });
    selectMoment(0);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const updateMotion = () => { scene.dataset.motion = visible && !document.hidden && !motion.matches ? 'running' : 'paused'; };
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; updateMotion(); }, {threshold: .15}).observe(scene);
    motion.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateMotion);
  }
  const notes = document.querySelector('#fieldNotes');
  if (notes) notes.innerHTML = content.notes.map((item, i) => `<button type="button" class="field-note-card" data-note="${esc(item.id)}" data-field-reveal><span class="note-topline"><span>NOTE / 0${i + 1}</span><span>${esc(item.category)}</span></span><svg class="field-icon" aria-hidden="true"><use href="/assets/field-icons.svg#${esc(item.icon)}"></use></svg><h3>${esc(item.title).replace(/\n/g, '<br>')}</h3><p>${esc(item.description)}</p><span class="note-read">阅读手记 <span aria-hidden="true">↗</span></span></button>`).join('');
  if (notes) {
    const topics=document.createElement('div');topics.className='note-topics';topics.setAttribute('role','group');topics.setAttribute('aria-label','手记分类');
    topics.innerHTML=[['','全部手记'],['growth','饲养观察'],['archive','基因档案'],['breeding','繁育记录'],['connect','咨询指南']].map(([id,label])=>`<button type="button" data-note-topic="${id}" aria-pressed="${id===''}">${label}</button>`).join('');
    notes.before(topics);topics.onclick=event=>{const b=event.target.closest('[data-note-topic]');if(!b)return;topics.querySelectorAll('button').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));notes.querySelectorAll('[data-note]').forEach(el=>el.hidden=!!b.dataset.noteTopic&&el.dataset.note!==b.dataset.noteTopic);};
  }
  const dialog = document.querySelector('#fieldNoteDialog');
  let returnFocus;
  if (dialog) {
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-note]');
      const item = trigger && content.notes.find(note => note.id === trigger.dataset.note);
      if (!item) return;
      if (!dialog.open) returnFocus = trigger;
      dialog.querySelector('.note-cover').innerHTML = `${picture(item.image, '(max-width: 700px) 100vw, 720px')}<figcaption>${esc(content.images[item.image].credit)}</figcaption>`;
      dialog.querySelector('#fieldNoteTitle').textContent = item.title.replace(/\n/g, '');
      dialog.querySelector('.note-category').textContent = `${item.category} / ${item.en}`;
      dialog.querySelector('.note-body').innerHTML = `<p class="note-updated">更新于 ${esc(item.updated || '2026-09-30')} · SUOHA 编辑手记 · 本站档案与沟通流程说明</p><nav class="note-toc" aria-label="手记目录">${item.sections.map((section,i)=>`<button type="button" data-note-section="${i}">${esc(section.title)}</button>`).join('')}</nav><p class="note-intro">${esc(item.intro)}</p>${item.sections.map((section,i) => `<section data-note-part="${i}"><h3>${esc(section.title)}</h3><p>${esc(section.text)}</p></section>`).join('')}<div class="note-related" aria-label="相关手记">${content.notes.filter(note=>note.id!==item.id).map(note=>`<button type="button" data-note="${esc(note.id)}">${esc(note.category)}：${esc(note.title.replace(/\n/g,''))} ↗</button>`).join('')}</div>`;
      dialog.showModal(); dialog.scrollTop = 0;
      document.documentElement.classList.add('note-reading');
      dialog.querySelector('[data-close-note]').focus({preventScroll:true});
    });
    dialog.querySelector('[data-close-note]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      const section = event.target.closest('[data-note-section]');
      if (section) dialog.querySelector(`[data-note-part="${section.dataset.noteSection}"]`)?.scrollIntoView({block:'center'});
      if (event.target.closest('a')) dialog.close();
    });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('note-reading');
      if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({preventScroll:true});
    });
    // Browser back/forward can change the SPA route while a native dialog is open.
    const home = document.querySelector('#homeView');
    if (home) new MutationObserver(() => {
      if (home.hidden && dialog.open) dialog.close();
    }).observe(home, {attributes:true, attributeFilter:['hidden']});
  }
  const menu = document.querySelector('#mobileMenu');
  if (menu) {
    menu.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; });
    document.addEventListener('click', event => { if (!menu.contains(event.target)) menu.open = false; });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
  }
})();
