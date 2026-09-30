/* Shared keyboard, saved views and task-level navigation for the legacy screens. */
(() => {
  const focusOrigins=new Map(),originalOpen=openModal,originalClose=closeModal;
  openModal=function(id){const modal=document.getElementById(id);if(!modal)return;focusOrigins.set(id,document.activeElement);originalOpen(id);modal.setAttribute('aria-hidden','false');const panel=modal.querySelector('.modalPanel');panel?.setAttribute('role','dialog');panel?.setAttribute('aria-modal','true');const heading=panel?.querySelector('h3');if(heading){heading.id||=id+'Heading';panel.setAttribute('aria-labelledby',heading.id);}requestAnimationFrame(()=>modal.querySelector('input:not([type=hidden]),select,textarea,button')?.focus());};
  closeModal=function(id){originalClose(id);const modal=document.getElementById(id);if(modal?.classList.contains('open'))return;modal?.setAttribute('aria-hidden','true');focusOrigins.get(id)?.focus();};
  document.addEventListener('keydown',event=>{
    if(document.querySelector('dialog[open]'))return;
    const modal=[...document.querySelectorAll('.modalBackdrop.open')].at(-1);if(!modal)return;
    if(event.key==='Escape'){event.preventDefault();closeModal(modal.id);return;}
    if(event.key!=='Tab')return;
    const focusable=[...modal.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
    if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  const filters=['popSearch','popSeries','popSex','globalYear'];
  function key(){return 'suoha.view.'+(currentUser?.id||'anonymous');}
  function saveView(){if(!currentUser)return;sessionStorage.setItem(key(),JSON.stringify({q:state.q,series:state.series,sex:state.sex,year:state.year,sort:document.getElementById('popSort')?.value||'id'}));}
  filters.forEach(id=>document.getElementById(id)?.addEventListener(id==='popSearch'?'input':'change',saveView));
  const toolbar=document.getElementById('popSearch')?.parentElement;
  const sort=document.createElement('select');sort.id='popSort';sort.className='filter';sort.setAttribute('aria-label','个体排序');sort.innerHTML='<option value="id">按编号</option><option value="score">战略分优先</option><option value="maturity">预计成熟时间</option><option value="price">购入成本从高到低</option>';
  toolbar?.appendChild(sort);
  const oldRows=renderRows;
  renderRows=function(){oldRows();const host=document.getElementById('popRows');const rows=[...host.children];rows.sort((a,b)=>{const left=snakeById[a.dataset.s],right=snakeById[b.dataset.s];if(sort.value==='score')return right.score-left.score;if(sort.value==='price')return right.price-left.price;if(sort.value==='maturity')return String(left.mature||'9999').localeCompare(String(right.mature||'9999'));return String(left.id).localeCompare(String(right.id),undefined,{numeric:true});});rows.forEach(row=>{row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-label','查看个体 '+row.dataset.s);row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();row.click();}};host.appendChild(row);});};
  sort.onchange=()=>{renderRows();saveView();};
  let restoredUser=null;
  addEventListener('suoha:data',()=>{if(!currentUser||restoredUser===currentUser.id)return;restoredUser=currentUser.id;try{const saved=JSON.parse(sessionStorage.getItem(key())||'null');if(!saved)return;state.q=String(saved.q||'');state.series=String(saved.series||'');state.sex=['F','M','U'].includes(saved.sex)?saved.sex:'';if(planningYears().includes(Number(saved.year)))state.year=Number(saved.year);sort.value=saved.sort||'id';document.getElementById('popSearch').value=state.q;document.getElementById('popSex').value=state.sex;document.getElementById('globalYear').value=String(state.year);}catch{} });
  addEventListener('suoha:logout',()=>restoredUser=null);

  // Give investment decisions and expense entry their own task views.
  const investment=document.getElementById('page-investment');
  const ledger=document.getElementById('investmentLedger'), ledgerBottom=investment.querySelector('.ledgerBottomGrid');
  if(investment&&ledger){const tabs=document.createElement('div');tabs.className='ws-tabs';tabs.innerHTML='<button type="button" class="active" data-investment-view="decisions">采购与投资决策</button><button type="button" data-investment-view="ledger">实际支出台账</button>';investment.querySelector('.pageHead').after(tabs);const originals=[...investment.children].filter(el=>el!==tabs&&!el.classList.contains('pageHead'));const choose=mode=>{tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.investmentView===mode));originals.forEach(el=>{const accounting=el===ledger||el===ledgerBottom;el.hidden=mode==='ledger'?!accounting:accounting;});};tabs.addEventListener('click',event=>{const b=event.target.closest('button');if(b)choose(b.dataset.investmentView);});choose('decisions');}
})();
