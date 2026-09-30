/* One identity and pedigree, two inventory libraries, independent sales badges. */
(() => {
  let sales=null,epoch=0,search='',filter='active';
  const library=s=>s.inventory_library==='nursery'?'自繁库':'种群库';
  const lifecycle=s=>({active:'在养',sold:'已售',retired:'退役',deceased:'死亡',planned:'计划'})[s.status]||'待确认';
  const sale=s=>sales?.get(s.id)|| (s.status==='sold'?'sold':sales?'normal':'unknown');
  const badge=s=>`<span class="inventory-badge ${sale(s)}">${({normal:'正常',available:'待出售',reserved:'已预留',sold:'已售',unknown:'销售状态待同步'})[sale(s)]}</span>`;
  document.querySelectorAll('.sidebar,.mobileNav').forEach(nav=>{
    const stock=nav.querySelector('[data-page="population"]');if(!stock)return;
    stock.querySelector('b').textContent=nav.classList.contains('sidebar')?'种群库':'种群';

  });
  function decorate(){
    document.querySelectorAll('#popRows [data-s]').forEach(row=>{const animal=snakeById[row.dataset.s];row.querySelector('.inventory-badge')?.remove();if(animal)row.cells[5].insertAdjacentHTML('beforeend',badge(animal));});
    const individual=document.querySelector('#workspaceIndividual .ws-heading');
    if(individual){
      individual.parentElement.querySelector('.inventory-status')?.remove();
      const s=REMOTE_RAW.snakes.find(s=>s.id===new URLSearchParams(location.search).get('snake'));
      if(s){const block=document.createElement('div');block.className='inventory-status';block.innerHTML=`<span class="ws-pill">${library(s)}</span>${badge(s)}${transferButton(s)}`;individual.after(block);}
    }
  }
  function transferButton(s){const homebred=s.origin==='produced'||s.inventory_library==='nursery';const retained=homebred&&s.inventory_library!=='nursery';return `${retained?'<span class="inventory-badge retained">已留存 · 种群同步</span>':''}${canWrite()&&s.status==='active'?`${homebred&&!retained?`<button class="ws-action primary" data-transfer="${esc(s.id)}" data-target="stock">留存</button>`:''}<button class="ws-action" data-nursery-publish="${esc(s.id)}">上架</button>`:''}`;}

  function render(){
    decorate();if(state.page!=='nursery')return;
    const all=REMOTE_RAW.snakes.filter(s=>s.inventory_library==='nursery'||s.origin==='produced');
    const rows=all.filter(s=>(filter==='all'||s.status===filter)&&(!search||[s.id,s.gene_text,s.series,s.dam_id,s.sire_id].join(' ').toLowerCase().includes(search.toLowerCase())));
    document.getElementById('nurseryWorkspace').innerHTML=`<div class="ws-heading"><div><p class="eyebrow">NURSERY / GROW • SELECT • RETAIN</p><h1>繁育个体</h1><p>保留全部自繁档案。留存后同步显示在种群总览，本栏保留原始记录并标记已留存。</p></div><div class="ws-actions">${canWrite()?'<button class="ws-action" data-nursery-add>补录自繁个体</button><button class="ws-action primary" data-nursery-clutch>从窝次登记幼体</button>':''}</div></div><div class="ws-metrics">${[['自繁档案',all.length],['在养幼体',all.filter(s=>s.status==='active').length],['待出售',all.filter(s=>sale(s)==='available').length],['已售',all.filter(s=>s.status==='sold').length]].map(([label,value])=>`<div class="ws-metric"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="ws-panel"><div class="ws-toolbar"><input id="nurserySearch" type="search" aria-label="搜索自繁个体" placeholder="编号、基因、亲本…" value="${esc(search)}"><select id="nurseryStatus" aria-label="自繁生命周期">${[['active','在养'],['all','全部状态'],['sold','已售'],['retired','退役'],['deceased','死亡']].map(([v,l])=>`<option value="${v}" ${filter===v?'selected':''}>${l}</option>`).join('')}</select><span class="ws-note">${rows.length} / ${all.length} 条</span></div><div class="nursery-grid">${rows.map(s=>`<article class="nursery-card"><div class="nursery-card-top"><span>${esc(s.id)} · ${({F:'♀ 母',M:'♂ 公'})[s.sex]||'性别待确认'}</span>${badge(s)}</div><h2>${esc(s.gene_text||'基因待确认')}</h2><p>${esc(s.series||'系列待确认')} · ${lifecycle(s)}</p><dl><div><dt>出生</dt><dd>${esc(s.birth_date?.slice(0,7)||'待确认')}</dd></div><div><dt>母本 / 公本</dt><dd>${esc(s.dam_id||'—')} / ${esc(s.sire_id||'—')}</dd></div><div><dt>窝次</dt><dd>${s.clutch_id?'#'+esc(s.clutch_id):'历史补录 / 未关联'}</dd></div></dl><div class="ws-actions"><button class="ws-action" data-nursery-open="${esc(s.id)}">查看档案 ↗</button>${transferButton(s)}</div></article>`).join('')||'<div class="ws-empty">暂无符合条件的自繁个体。新孵化的幼体从“繁育与成长记录”的窝次登记；已有自繁档案可在详情中转入这里。</div>'}</div></div>`;
    document.getElementById('nurserySearch').oninput=e=>{const position=e.target.selectionStart;search=e.target.value;render();const input=document.getElementById('nurserySearch');input.focus();input.setSelectionRange(position,position);};
    document.getElementById('nurseryStatus').onchange=e=>{filter=e.target.value;render();};
    window.SuohaUpgrades?.nursery();
  }
  async function load(){const own=++epoch;if(!currentUser||!currentProfile?.active)return;try{const rows=[];for(let offset=0;;){let query=sb.rpc('inventory_sale_states');const paged=typeof query.range==='function';if(paged)query=query.order('snake_id').range(offset,offset+499);const result=await query;if(own!==epoch)return;if(result.error||!Array.isArray(result.data))throw Error('销售状态读取失败');rows.push(...result.data);offset+=result.data.length;if(!paged||!result.data.length)break;}sales=new Map(rows.map(r=>[r.snake_id,r.sale_state]));}catch{if(own!==epoch)return;sales=null;}render();}
  const previousRows=renderRows;renderRows=function(){previousRows();decorate();};
  const previousRender=window.SuohaWorkspace.render;window.SuohaWorkspace.render=function(){previousRender();render();};
  const previousDrawer=openDrawer;openDrawer=function(s){previousDrawer(s);document.getElementById('drawerContent').insertAdjacentHTML('afterbegin',`<div class="inventory-status"><span class="ws-pill">${library(s)}</span>${badge(s)}${transferButton(s)}</div>`);};
  document.addEventListener('click',async e=>{
    const open=e.target.closest('[data-nursery-open]');if(open){const url=new URL(location.href);url.searchParams.set('snake',open.dataset.nurseryOpen);history.pushState({},'',url.pathname+url.search+'#individual');setPage('individual',false);return;}
    if(e.target.closest('[data-nursery-add]'))return openSnakeForm(null,'nursery');
    if(e.target.closest('[data-nursery-clutch]'))return window.SuohaWorkspace.showClutches();
    const publish=e.target.closest('[data-nursery-publish]');if(publish){publish.disabled=true;try{await window.SuohaWorkspace.publishAnimal(publish.dataset.nurseryPublish);}catch(error){toast(error.message,true);}finally{publish.disabled=false;}return;}
    const transfer=e.target.closest('[data-transfer]');if(!transfer||!canWrite())return;
    const id=transfer.dataset.transfer,target=transfer.dataset.target;
    if(!await confirmWorkflow({title:'确认留存？',sub:`${id} 的完整档案将同步到种群总览，繁育个体栏仍保留并标记已留存。两处共用同一编号，后续资料修改同步。`,confirm:'确认留存',danger:false}))return;
    transfer.disabled=true;
    try{const {error}=await sb.rpc('transfer_inventory_animal',{p_id:id,p_target:target});if(error)throw error;document.getElementById('drawer').classList.remove('open');await refreshRemote(false);render();toast('已留存到种群总览，繁育档案保留');}catch(error){toast(error.message||'转入失败，请确认已执行 023 迁移',true);}finally{transfer.disabled=false;}
  });
  addEventListener('suoha:data',load);addEventListener('suoha:listings',load);
  addEventListener('suoha:logout',()=>{epoch++;sales=null;search='';document.getElementById('nurseryWorkspace').innerHTML='';});
  if(currentUser)load();
})();
