(() => {
  'use strict';
  const content = window.SuohaHomeContent;
  if (!content) return;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const picture = (key, sizes = '(max-width: 700px) 100vw, 50vw') => {
    const img = content.images[key];
    return `<img src="${esc(img.src)}" srcset="${esc(img.small)} ${img.smallWidth || 768}w, ${esc(img.src)} ${img.width}w" sizes="${esc(sizes)}" width="${img.width}" height="${img.height}" alt="${esc(img.alt)}" loading="lazy" decoding="async">`;
  };
  const notes = document.querySelector('#fieldNotes');
  if (notes) notes.innerHTML = content.notes.map((item, i) => `<button type="button" class="field-note-row" data-note="${esc(item.id)}"><span class="note-number">0${i + 1}</span><span class="note-row-copy"><small>${esc(item.category)}</small><strong>${esc(item.title.replace(/\n/g, ''))}</strong></span><span class="note-arrow" aria-hidden="true">↗</span></button>`).join('');
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
