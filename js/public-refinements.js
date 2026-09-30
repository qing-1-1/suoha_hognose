/* Catalogue controls and keyboard navigation. No business data is fabricated. */
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

})();
