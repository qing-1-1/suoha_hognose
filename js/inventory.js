/* One identity and pedigree, two inventory libraries, independent sales badges. */
(() => {
  let sales=null,epoch=0,search='',filter='active';
  const library=s=>s.inventory_library==='nursery'?'自繁库':'种群库';
  const lifecycle=s=>({active:'在养',sold:'已售',retired:'退役',deceased:'死亡',planned:'计划'})[s.status]||'待确认';
  const sale=s=>s.status==='sold'?'sold':sales?.get(s.id)||(sales?'normal':'unknown');
  const badge=s=>`<span class="inventory-badge ${sale(s)}">${({normal:'正常',available:'待出售',reserved:'已预留',sold:'已售',unknown:'销售状态待同步'})[sale(s)]}</span>`;
  document.querySelectorAll('.sidebar,.mobileNav').forEach(nav=>{
    const stock=nav.querySelector('[data-page="population"]');if(!stock)return;
    stock.querySelector('b').textContent=nav.classList.contains('sidebar')?'种群库':'种群';

  });
  function decorate(){
    const toolbar=document.getElementById('popSearch')?.closest('.toolbar');
    if(toolbar){let action=toolbar.querySelector('[data-return-all-sold]');if(!action){action=document.createElement('button');action.type='button';action.className='ws-action';action.dataset.returnAllSold='';toolbar.append(action);}const count=REMOTE_RAW.snakes.filter(s=>s.status==='sold'||sales?.get(s.id)==='sold').length;action.textContent=`全部已售回库（${count}）`;action.hidden=!canWrite()||count===0;}
    document.querySelectorAll('#popRows [data-s]').forEach(row=>{const animal=snakeById[row.dataset.s];row.querySelector('.inventory-badge')?.remove();if(animal)row.cells[5].insertAdjacentHTML('beforeend',badge(animal));});
    const individual=document.querySelector('#workspaceIndividual .ws-heading');
    if(individual){
      individual.parentElement.querySelector('.inventory-status')?.remove();
      const s=REMOTE_RAW.snakes.find(s=>s.id===new URLSearchParams(location.search).get('snake'));
      if(s){const block=document.createElement('div');block.className='inventory-status';block.innerHTML=`<span class="ws-pill">${library(s)}</span>${badge(s)}${transferButton(s)}`;individual.after(block);}
    }
  }
  function transferButton(s){if(canWrite()&&sale(s)==='sold')return `<button class="ws-action primary" data-return-sold="${esc(s.id)}">放回种群库</button>`;const homebred=s.origin==='produced'||s.inventory_library==='nursery';const retained=homebred&&s.inventory_library!=='nursery';return `${retained?'<span class="inventory-badge retained">已留存 · 种群同步</span>':''}${canWrite()&&s.status==='active'?`${homebred&&!retained?`<button class="ws-action primary" data-transfer="${esc(s.id)}" data-target="stock">留存</button>`:''}<button class="ws-action" data-nursery-publish="${esc(s.id)}">上架</button>`:''}`;}

  function returnSold(ids){
    if(!canWrite()||!ids.length)return;
    let request=crypto.randomUUID(),submitted=null;
    openWorkflowModal({title:ids.length===1?'放回种群库？':`将 ${ids.length} 条已售个体放回种群库？`,sub:`个体：${ids.slice(0,12).join('、')}${ids.length>12?`等 ${ids.length} 条`:''}。回库后恢复在养并加入种群库，公开展示先下架；原成交、收款和谱系记录保留。若仍有未结束交易、拍卖或待核实付款，整批不会执行。`,fields:[{name:'reason',label:'回库原因',required:true,placeholder:'例如：状态误标、退回或重新留种'}],submit:'确认回库',onSubmit:async values=>{
      const reason=values.reason.trim();if(!reason||reason.length>2000)throw Error('请填写回库原因（最多 2000 字）');
      if(submitted!==null&&submitted!==reason)request=crypto.randomUUID();submitted=reason;
      const {data,error}=await sb.rpc('return_sold_animals',{p_ids:ids,p_reason:reason,p_request:request});
      if(error)throw Error(/schema cache|does not exist|Could not find/i.test(error.message||'')?'请先执行 046 已售回库迁移，再刷新页面重试':error.message||'回库失败');
      if(!data||!Array.isArray(data.returned_ids))throw Error('回库结果暂未确认，请使用相同原因重试');
      document.getElementById('drawer').classList.remove('open');
      await refreshRemote(false);await load();
      if(state.page==='population'){state.lifecycle='active';state.library='stock';state.q=state.series=state.sex='';['popSearch','popSeries','popSex'].forEach(id=>document.getElementById(id).value='');document.getElementById('popLifecycle').value='active';document.getElementById('popLibrary').value='stock';renderRows();}
      render();toast(`已将 ${data.returned_ids.length} 条个体放回种群库，历史销售记录保留`);
    }});
  }

  function render(){
    decorate();if(state.page!=='nursery')return;
    const all=REMOTE_RAW.snakes.filter(s=>s.inventory_library==='nursery'||s.origin==='produced');
    const rows=all.filter(s=>(filter==='all'||s.status===filter)&&(!search||[s.id,s.gene_text,s.series,s.dam_id,s.sire_id].join(' ').toLowerCase().includes(search.toLowerCase())));
    document.getElementById('nurseryWorkspace').innerHTML=`<div class="ws-heading"><div><p class="eyebrow">NURSERY / GROW • SELECT • RETAIN</p><h1>繁育个体</h1><p>保留全部自繁档案。留存后同步显示在种群总览，本栏保留原始记录并标记已留存。</p></div><div class="ws-actions">${canWrite()?'<button class="ws-action" data-nursery-add>补录自繁个体</button><button class="ws-action primary" data-nursery-clutch>从窝次登记幼体</button>':''}</div></div><div class="ws-metrics">${[['自繁档案',all.length],['自繁在养（含留种）',all.filter(s=>s.status==='active').length],['待出售',all.filter(s=>sale(s)==='available').length],['已售',all.filter(s=>s.status==='sold').length]].map(([label,value])=>`<div class="ws-metric"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><div class="ws-panel"><div class="ws-toolbar"><input id="nurserySearch" type="search" aria-label="搜索自繁个体" placeholder="编号、基因、亲本…" value="${esc(search)}"><select id="nurseryStatus" aria-label="自繁生命周期">${[['active','在养'],['all','全部状态'],['sold','已售'],['retired','退役'],['deceased','死亡']].map(([v,l])=>`<option value="${v}" ${filter===v?'selected':''}>${l}</option>`).join('')}</select><span class="ws-note">${rows.length} / ${all.length} 条</span></div><div class="nursery-grid">${rows.map(s=>`<article class="nursery-card"><div class="nursery-card-top"><span>${esc(s.id)} · ${({F:'♀ 母',M:'♂ 公'})[s.sex]||'性别待确认'}</span>${badge(s)}</div><h2>${esc(s.gene_text||'基因待确认')}</h2><p>${esc(s.series||'系列待确认')} · ${lifecycle(s)}</p><dl><div><dt>出生</dt><dd>${esc(s.birth_date?.slice(0,7)||'待确认')}</dd></div><div><dt>母本 / 公本</dt><dd>${esc(s.dam_id||'—')} / ${esc(s.sire_id||'—')}</dd></div><div><dt>窝次</dt><dd>${s.clutch_id?'#'+esc(s.clutch_id):'历史补录 / 未关联'}</dd></div></dl><div class="ws-actions"><button class="ws-action" data-nursery-open="${esc(s.id)}">查看档案 ↗</button>${transferButton(s)}${canWrite()?`<button class="ws-action danger" data-nursery-delete="${esc(s.id)}">删除</button>`:''}</div></article>`).join('')||'<div class="ws-empty">暂无符合条件的自繁个体。新孵化的幼体从“繁育与成长记录”的窝次登记；已有自繁档案可在详情中转入这里。</div>'}</div></div>`;
    document.getElementById('nurserySearch').oninput=e=>{const position=e.target.selectionStart;search=e.target.value;render();const input=document.getElementById('nurserySearch');input.focus();input.setSelectionRange(position,position);};
    document.getElementById('nurseryStatus').onchange=e=>{filter=e.target.value;render();};
    window.SuohaUpgrades?.nursery();
  }
  async function load(){const own=++epoch;if(!currentUser||!currentProfile?.active)return;try{const rows=[];for(let offset=0;;){let query=sb.rpc('inventory_sale_states');const paged=typeof query.range==='function';if(paged)query=query.order('snake_id').range(offset,offset+499);const result=await query;if(own!==epoch)return;if(result.error||!Array.isArray(result.data))throw Error('销售状态读取失败');rows.push(...result.data);offset+=result.data.length;if(!paged||!result.data.length)break;}sales=new Map(rows.map(r=>[r.snake_id,r.sale_state]));}catch{if(own!==epoch)return;sales=null;}render();}
  const previousRows=renderRows;renderRows=function(){previousRows();decorate();};
  const previousRender=window.SuohaWorkspace.render;window.SuohaWorkspace.render=function(){previousRender();render();};
  const previousDrawer=openDrawer;openDrawer=function(s){previousDrawer(s);document.getElementById('drawerContent').insertAdjacentHTML('afterbegin',`<div class="inventory-status"><span class="ws-pill">${library(s)}</span>${badge(s)}${transferButton(s)}</div>`);};
  document.addEventListener('click',async e=>{
    const returned=e.target.closest('[data-return-sold],[data-return-all-sold]');if(returned){returnSold(returned.hasAttribute('data-return-all-sold')?REMOTE_RAW.snakes.filter(s=>s.status==='sold'||sales?.get(s.id)==='sold').map(s=>s.id):[returned.dataset.returnSold]);return;}
    const remove=e.target.closest('[data-nursery-delete]');if(remove){
      if(!canWrite())return;
      const id=remove.dataset.nurseryDelete;
      if(!await confirmWorkflow({title:'删除子代档案？',sub:`${id} 的档案、基因、普通成长记录和未发布图库将永久删除。有亲本、繁育、在售／交易或爬房历史关联时会阻止删除并完整保留数据。`,confirm:'确认删除子代',danger:true}))return;
      remove.disabled=true;
      try{const {data,error}=await sb.rpc('delete_nursery_animal',{p_id:id});if(error)throw error;let filesClean=true;if(data?.removed_paths?.length)try{const removed=await sb.storage.from('specimen-media').remove(data.removed_paths);filesClean=!removed.error;}catch{filesClean=false;}await refreshRemote(false);render();toast(filesClean?'子代档案已删除':'子代档案已删除，私有照片文件清理未完成',!filesClean);}
      catch(error){toast(/schema cache|does not exist|Could not find/.test(error.message||'')?'请先执行 045 子代删除迁移':error.message||'删除失败',true);}finally{remove.disabled=false;}return;
    }
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
