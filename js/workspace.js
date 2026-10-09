/* Staff-only publishing, sales and operational records. No public table reads. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId = id => document.getElementById(id);
  const labels={available:'在售',display:'留种展示',reserved:'已预留',sold:'已售',new:'待联系',contacted:'已联系',paid:'已收款',delivered:'已交付',completed:'已成交',cancelled:'已取消',paired:'已配种',observed_copulation:'观察到交配',successful:'交配成功',unsuccessful:'交配未成功',incubating:'孵化中',hatched:'已孵化',failed:'失败',archived:'归档'};
  const model={listings:[],media:[],inquiries:[],activity:[],events:[],clutches:[],measurements:[],transfers:[],counts:{},errors:{},loaded:false};
  const tableMap={listings:'specimen_listings',media:'specimen_media',inquiries:'purchase_inquiries',activity:'sales_activity',events:'breeding_events',clutches:'clutches',measurements:'snake_measurements',transfers:'inventory_transfers'};
  let loading=null,generation=0,recordTab='events',salesFilter='open',publishingQuery='',lastFocus=null;
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const date=value=>value?new Date(value).toLocaleDateString('zh-CN'):'—';
  const currency=(amount,code='CNY')=>amount==null?'询价':new Intl.NumberFormat('zh-CN',{style:'currency',currency:code}).format(amount);
  const status=value=>`<span class="ws-status ${escape(value)}">${escape(labels[value]||value)}</span>`;
  const button=(label,action,id='',primary=false)=>`<button class="ws-action ${primary?'primary':''}" data-ws-action="${action}" data-id="${escape(id)}">${label}</button>`;
  const heading=(kicker,title,sub,actions='')=>`<div class="ws-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p>${sub}</p></div><div class="ws-actions">${actions}</div></div>`;
  const empty=text=>`<div class="ws-empty">${text}</div>`;
  const animal=id=>REMOTE_RAW.snakes.find(s=>s.id===id);
  const animalName=id=>`${id || '—'} · ${animal(id)?.gene_text || '资料待补充'}`;
  const options=(rows,value,label,selected='')=>rows.map(row=>`<option value="${escape(value(row))}" ${String(value(row))===String(selected)?'selected':''}>${escape(label(row))}</option>`).join('');
  const animalOptions=(sex,selected)=>options(REMOTE_RAW.snakes.filter(s=>!sex||s.sex===sex),s=>s.id,s=>`${s.inventory_library==='nursery'?'[自繁库]':'[种群库]'} ${s.id} · ${s.gene_text}`,selected);
  const input=(name,label,value='',type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;
  const select=(name,label,content)=>`<label>${label}<select name="${name}" aria-label="${escape(label)}">${content}</select></label>`;
  const area=(name,label,value='',max=4000)=>`<label class="full">${label}<textarea name="${name}" maxlength="${max}">${escape(value)}</textarea></label>`;

  async function load(force=false){
    if(!currentUser||!currentProfile?.active)return;
    if(loading&&!force)return loading;
    const own=++generation,user=currentUser.id;
    model.loaded=false;
    loading=(async()=>{
      if(canWrite()){
        const results=await Promise.all(Object.entries(tableMap).map(async([key,table])=>{
          const order=key==='activity'?'id':'created_at';
          const result=await window.SuohaData.fetchAll(sb,table,order==='id'?[['id',false]]:[[order,false],['id',true]]);
          return {key,result};
        }));
        if(own!==generation||currentUser?.id!==user)return;
        for(const {key,result} of results){model[key]=result.data||[];model.counts[key]=result.count||0;model.errors[key]=result.error?.message||'';}
      }
    if(own!==generation)return;model.loaded=true;render();window.dispatchEvent(new Event("suoha:listings"));
    })().catch(()=>{model.errors.listings='读取失败，请刷新重试';render();}).finally(()=>{if(own===generation)loading=null;});
    return loading;
  }
  function warning(keys=['listings']){const broken=keys.filter(k=>model.errors[k]);return broken.length?`<div class="ws-alert">此功能暂不可用：${broken.map(k=>escape(tableMap[k])).join('、')}。请检查账号权限与数据库迁移；新功能需要部署 019 / 020。${button('重新读取','reload')}</div>`:'';}
  function render(){
    if(!currentUser||!currentProfile?.active)return;
    window.SuohaAuctionAdmin?.render();
    window.SuohaPaymentAdmin?.render();
    renderOverview();
    if(state.page==='individual')renderIndividual();
    if(canWrite()){renderPublishing();renderSales();renderRecords();}
    else ['workspacePublishing','workspaceSales','workspaceRecords'].forEach(id=>byId(id).innerHTML=empty('仅授权编辑成员可使用此功能。'));
  }
  function showIndividual(id){
    const url=new URL(location.href);url.searchParams.set('snake',id);history.pushState({},'',url.pathname+url.search+'#individual');
    byId('drawer').classList.remove('open');setPage('individual',false);
  }
  function renderIndividual(){
    const id=new URLSearchParams(location.search).get('snake'),row=animal(id),host=byId('workspaceIndividual');
    if(!row){host.innerHTML=heading('INDIVIDUAL ARCHIVE','未找到个体','个体可能已被删除，或当前账号无权查看。',button('返回种群','population'));return;}
    const mediaListing=model.listings.find(l=>l.snake_id===id),portrait=model.media.filter(m=>m.listing_id===mediaListing?.id).sort((a,b)=>a.sort_order-b.sort_order)[0];
    const genes=REMOTE_RAW.snakeGenes.filter(g=>g.snake_id===id),events=model.events.filter(e=>e.female_snake_id===id||e.male_snake_id===id),measurements=model.measurements.filter(m=>m.snake_id===id),children=REMOTE_RAW.snakes.filter(s=>s.sire_id===id||s.dam_id===id);
    const geneStates={visual:'表现',het:'确定携带',possible_het:'可能携带',super:'Super',line_trait:'品系性状',unknown:'未知'};
    const facts=[['编号',row.id],['性别',({F:'母 ♀',M:'公 ♂',U:'未知'})[row.sex]||'未知'],['生命周期',({active:'在养',sold:'已售',retired:'退役',deceased:'死亡',planned:'计划'})[row.status]||row.status],['出生记录',row.birth_date?.slice(0,7)||'未记录'],['预计成熟',row.mature_date?.slice(0,7)||'未记录'],['来源',({purchased:'购入',produced:'繁育产出',other:'其他'})[row.origin]||'未记录']];
    host.innerHTML=heading('INDIVIDUAL / '+escape(id),escape(row.gene_text||id),escape(row.series||'未分类'),button('返回种群','population')+(canWrite()?button('编辑个体','edit-animal',id,true):''))+`<div class="ws-profile-header"><div class="ws-profile-portrait" id="individualPortrait">${portrait?'照片读取中…':'照片待补充'}</div><div><p>INDIVIDUAL / ${escape(row.inventory_library==='nursery'?'自繁库':'种群库')}</p><h2>${escape(row.id)} · ${{F:'母 ♀',M:'公 ♂',U:'性别待确认'}[row.sex]||'性别待确认'}</h2><p>${escape(row.series||'系列待确认')} · 出生 ${escape(row.birth_date||'未记录')}</p></div></div><div class="ws-panel"><dl class="ws-detail-grid">${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><p class="ws-note">出生默认按月份展示，原始日期可在编辑中核实。预计成熟不等于已确认适合配种。</p></div><div class="ws-columns"><div class="ws-panel"><h2>结构化基因</h2>${genes.length?genes.map(g=>`<span class="ws-pill">${escape(REMOTE_RAW.genes.find(x=>x.id===g.gene_id)?.name_zh||g.gene_id)} · ${geneStates[g.state]||escape(g.state)}${g.state==='possible_het'?' '+Math.round(Number(g.probability||0)*100)+'%':''}</span>`).join(''):empty('尚未记录原子基因。缺失不代表已确认不携带。')}<p class="ws-note">原始描述：${escape(row.gene_text)}</p></div><div class="ws-panel"><h2>亲本与后代</h2><div class="ws-list"><div class="ws-list-row"><span>母本</span>${row.dam_id?button(escape(animalName(row.dam_id)),'individual',row.dam_id):'未记录'}</div><div class="ws-list-row"><span>公本</span>${row.sire_id?button(escape(animalName(row.sire_id)),'individual',row.sire_id):'未记录'}</div><div class="ws-list-row"><span>窝次</span><span>${row.clutch_id?'#'+escape(row.clutch_id):'未关联'}</span></div></div><p class="ws-note">已登记直接后代 ${children.length} 条</p><div class="ws-actions">${children.map(s=>button(escape(s.id),'individual',s.id)).join('')}</div></div></div><div class="ws-columns"><div class="ws-panel"><h2>成长记录</h2>${measurements.length?`<div class="ws-list">${measurements.slice(0,12).map(m=>`<div class="ws-list-row"><div>${date(m.measured_at)}<small>${escape(m.feeding_status||'')} ${escape(m.condition_note||'')}</small></div><b>${m.weight_g??'—'} g</b></div>`).join('')}</div>`:empty(canWrite()?'暂无已加载的测量记录。':'实际操作记录仅授权编辑成员可查看。')}${canWrite()?button('新增测量','measure-animal',id):''}</div><div class="ws-panel"><h2>实际繁育记录</h2>${events.length?`<div class="ws-list">${events.map(e=>`<div class="ws-list-row"><div>${escape(e.female_snake_id)} × ${escape(e.male_snake_id)}<small>${date(e.paired_at)}</small></div>${status(e.status)}</div>`).join('')}</div>`:empty('暂无已加载的实际配种记录。')}<p class="ws-note">测量和配种来自当前权限内的完整记录。</p></div></div><div class="ws-panel"><h2>内部备注</h2><p style="white-space:pre-line">${escape(row.notes||'暂无备注。')}</p><p class="ws-note">内部备注不进入公开档案；公开说明需单独编辑和确认。</p></div>`;
    if(portrait){
      const box=byId('individualPortrait');
      sb.storage.from('specimen-media').createSignedUrl(portrait.storage_path,300).then(({data})=>{
        if(!box.isConnected)return;
        if(!data?.signedUrl){box.textContent='照片暂不可读';return;}
        const img=document.createElement('img');img.alt=row.id+' 个体照片';img.onerror=()=>{box.textContent='照片暂不可读';};img.src=data.signedUrl;box.replaceChildren(img);
      }).catch(()=>{if(box.isConnected)box.textContent='照片暂不可读';});
    }

  }
  function renderOverview(){
    const pending=REMOTE_RAW.recommendations.filter(r=>r.status==='proposed').length;
    const active=REMOTE_RAW.snakes.filter(s=>s.status==='active').length;
    const inquiries=model.inquiries.filter(i=>i.status==='new').length;
    const expiring=model.inquiries.filter(i=>i.status==='reserved'&&new Date(i.reserved_until)<new Date());
    const published=model.listings.filter(l=>l.published).length;
    const plans=REMOTE_RAW.plans.filter(p=>Number(p.plan_year)===state.year&&p.review_status!=='pending'&&p.review_status!=='returned');
    const count=(value)=>model.loaded?value:'—';
    byId('workspaceOverview').innerHTML=heading('WORKSPACE / OVERVIEW','工作概览','把今天的工作，与长期的繁育方向放在一起。',`<a class="ws-action" href="/" target="_blank" rel="noopener">查看公开网站 ↗</a>${button('刷新','reload')}`)+
      `<div class="ws-greeting"><p>SUOHA HOGNOSE / PRIVATE WORKSPACE</p><h2>${escape(currentProfile.display_name||currentUser.email?.split('@')[0]||'成员')}，欢迎回来。</h2><p>${state.year} 年的计划、真实个体和每一条待办，都从这里继续。公开展示与内部档案分开管理。</p></div><div class="ws-metrics"><button class="ws-metric" data-ws-page="population"><span>活跃个体</span><b>${active}</b><small>进入种群档案 ↗</small></button><button class="ws-metric" data-ws-page="production"><span>${state.year} 年度计划</span><b>${plans.length}</b><small>计划条数，不代表实际产出 ↗</small></button><button class="ws-metric" data-ws-page="${canWrite()?'sales':'lab'}"><span>${canWrite()?'待联系意向':'配对实验室'}</span><b>${canWrite()?count(inquiries):'↗'}</b><small>${canWrite()?'当前权限内的全部待办':'查看遗传结果与计算条件'}</small></button><button class="ws-metric" data-ws-page="${canWrite()?'publishing':'routes'}"><span>${canWrite()?'已发布档案':'繁殖路线'}</span><b>${canWrite()?count(published):REMOTE_RAW.routes.length}</b><small>${canWrite()?'当前权限内的发布配置':'查看多代规划'} ↗</small></button></div>`+
      `<div class="ws-columns"><div class="ws-panel"><h2>需要你关注</h2><div class="ws-list">${canWrite()?`<div class="ws-list-row"><div>待审核的 AI 建议<small>保留人工确认，不自动执行</small></div>${button(`${pending} 项 · 查看`,'reviews')}</div><div class="ws-list-row"><div>到期预留<small>需人工联系确认，取消后恢复为仅展示</small></div>${button(`${count(expiring.length)} 项 · 查看`,'sales')}</div><div class="ws-list-row"><div>待补照片的发布档案<small>没有真实照片的个体不会被替换成示例图</small></div>${button(`${count(model.listings.filter(l=>!l.deleted_at&&!model.media.some(m=>m.listing_id===l.id)).length)} 项`,'publishing')}</div>`:empty('你拥有只读访问权限，可查看种群、路线和已通过的计划。')}</div></div><div class="ws-panel"><h2>本年度计划</h2>${plans.length?`<div class="ws-list">${plans.slice(0,5).map(p=>`<div class="ws-list-row"><div>${escape(p.project_name)}<small>${escape(p.female_snake_id||'计划后代')} × ${escape(p.male_snake_id||'计划后代')}</small></div><span class="ws-status">${Number(p.planned_clutches||0)} 计划窝</span></div>`).join('')}</div>`:empty('本年度暂无已通过计划。可先在配对实验室评估，再加入年度计划。')}${button('进入年度规划','production')}</div></div><div class="ws-panel"><h2>最近 AI 分析</h2>${REMOTE_RAW.analysisRuns.length?`<div class="ws-list">${REMOTE_RAW.analysisRuns.slice(0,5).map(run=>`<div class="ws-list-row"><div>${escape(({investment:'投资分析',annual_plan:'年度规划',pairing:'配对分析'})[run.analysis_type]||run.analysis_type)}<small>${date(run.created_at)} · ${escape(run.model_name||'')}</small></div><div class="ws-actions">${status(run.status)}${run.status==='succeeded'?button('查看对话','conversation',run.id):''}</div></div>`).join('')}</div>`:empty('暂无分析记录。分析完成后，可从这里继续追问。')}</div>`;
  }
  function renderPublishing(){
    if(!canWrite())return;
    window.SuohaAuctionAdmin?.ensureLoaded();
    const auctionInfo=l=>window.SuohaAuctionAdmin?.forListing(l.id)||{ready:false};
    const trade=l=>{
      const info=auctionInfo(l),a=info.active;
      if(!info.ready)return '<span class="ws-note">拍卖状态'+(info.error?'读取失败':'读取中')+'</span>';
      if(a)return '<span class="ws-status auction">拍卖 · '+(Date.now()<new Date(a.starts_at)?'待开拍':'进行中')+'</span><small>起拍 '+currency(a.start_price)+' · '+(a.bid_count?'当前 '+currency(a.current_price):'暂无出价')+'</small>';
      if(l.sale_status==='display')return '<span class="ws-status">仅展示</span>';
      if(info.latest?.status==='won'&&['reserved','sold'].includes(l.sale_status))return '<span class="ws-status">拍卖成交</span><small>'+currency(info.latest.current_price)+'</small>';
      return '<span class="ws-status">'+(['reserved','sold'].includes(l.sale_status)?labels[l.sale_status]:l.asking_price>0?'一口价售卖':'询价售卖')+'</span><small>'+currency(l.asking_price,l.currency)+'</small>';
    };
    const auctionActions=l=>{
      const info=auctionInfo(l);
      if(!info.ready)return '<button class="ws-action" disabled>拍卖状态'+(info.error?'读取失败':'读取中')+'</button>';
      if(info.active)return button('管理拍卖','manage-auction',l.id);
      const reason=!l.published?'先发布再拍卖':l.sale_status!=='available'?'设为在售后可拍卖':l.currency!=='CNY'?'拍卖仅支持人民币':'';
      return (reason?'<button class="ws-action" disabled title="'+reason+'">'+reason+'</button>':button('配置拍卖','configure-auction',l.id))+(info.latest?button('拍卖记录','manage-auction',l.id):'');
    };
    const rows=model.listings.filter(l=>!l.deleted_at&&(l.title+' '+l.snake_id).toLowerCase().includes(publishingQuery.toLowerCase()));
    byId('workspacePublishing').innerHTML=heading('PUBLISHING / PUBLIC ARCHIVE','公开展示','在同一个体上管理公开资料、一口价售卖与拍卖。配置拍卖时自动带入个体；成交后进入意向与销售。',button('新增展示档案','new-listing','',true))+warning()+`<div class="ws-panel"><div class="ws-toolbar"><input id="publishingSearch" placeholder="搜索编号或标题" aria-label="搜索展示档案" value="${escape(publishingQuery)}"><span class="ws-note">当前显示 ${rows.length} 份配置</span></div>${rows.length?`<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>个体</th><th>公开状态</th><th>交易方式 / 价格</th><th>照片</th><th>操作</th></tr></thead><tbody>${rows.map(l=>`<tr><td><b>${escape(l.title)}</b><small>${escape(l.snake_id)} / ${escape(l.slug)}</small></td><td><span class="ws-status">${l.published?'已发布':'草稿'}</span> ${status(l.sale_status)}</td><td>${trade(l)}</td><td>${model.media.filter(m=>m.listing_id===l.id).length} 张</td><td><div class="ws-actions">${button('编辑','edit-listing',l.id)}${auctionActions(l)}${button('照片','photos',l.id)}${button('删除','delete-listing',l.id)}${l.published?`<a class="ws-action" href="/specimens/${encodeURIComponent(l.slug)}" target="_blank" rel="noopener">查看 ↗</a>`:''}</div></td></tr>`).join('')}</tbody></table></div>`:empty('还没有展示档案。点击“新增展示档案”，从现有真实个体中选择并准备资料；默认保存为未发布草稿。')}</div>`;
    byId('publishingSearch').addEventListener('input',event=>{publishingQuery=event.target.value;const start=event.target.selectionStart;renderPublishing();byId('publishingSearch').focus();byId('publishingSearch').setSelectionRange(start,start);});
    window.SuohaUpgrades?.publishing();
  }
  function renderSales(){
    const rows=model.inquiries.filter(i=>salesFilter==='all'||!['completed','cancelled'].includes(i.status));
    byId('workspaceSales').innerHTML=heading('SALES DESK / INQUIRIES','意向与销售','从联系到交付，保留每一次确认。已收款交易暂不支持直接取消，避免丢失账务历史。',button('刷新','reload'))+warning(['inquiries'])+`<div class="ws-tabs"><button data-sales-filter="open" class="${salesFilter==='open'?'active':''}">处理中</button><button data-sales-filter="all" class="${salesFilter==='all'?'active':''}">全部记录</button></div><div class="ws-panel"><p class="ws-note">已读取 ${model.inquiries.length} / ${model.counts.inquiries||0} 条意向；不作为全部历史成交额统计。</p>${rows.length?`<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>意向 / 个体</th><th>客户联系</th><th>状态</th><th>预留到期</th><th>操作</th></tr></thead><tbody>${rows.map(i=>{const listing=model.listings.find(l=>l.id===i.listing_id);const expired=i.status==='reserved'&&new Date(i.reserved_until)<new Date();return `<tr><td><b>${escape(i.reference)}</b><small>${escape(listing?.snake_id||'')} · ${date(i.created_at)}</small></td><td>${escape(i.customer_name)}<small>${escape(i.contact)}</small></td><td>${status(i.status)}</td><td>${date(i.reserved_until)}${expired?'<small style="color:#a04b32">已到期，请人工处理</small>':''}</td><td>${button('处理 / 历史','sale-detail',i.id)}</td></tr>`;}).join('')}</tbody></table></div>`:empty('暂无待处理意向。访客提交成功后，会在这里出现；提交意向并不锁定个体。')}</div>`;
  }
  function renderRecords(){
    const items=model[recordTab]||[];
    byId('workspaceRecords').innerHTML=heading('HUSBANDRY / ACTUAL RECORDS','繁育与成长记录','记录已经发生的事实。年度计划不会自动变成配种、窝次或后代。',button('新增记录','new-record','',true))+warning(['events','clutches','measurements'])+`<div class="ws-tabs">${[['events','配种事件'],['clutches','窝次与孵化'],['measurements','体重与成长']].map(([key,label])=>`<button data-record-tab="${key}" class="${recordTab===key?'active':''}">${label} · ${model.counts[key]||0}</button>`).join('')}</div><div class="ws-panel"><p class="ws-note">已读取 ${items.length} 条记录。</p>${items.length?`<div class="ws-list">${items.map(item=>recordTab==='events'?`<div class="ws-list-row"><div><b>${escape(item.female_snake_id)} ♀ × ${escape(item.male_snake_id)} ♂</b><small>${date(item.paired_at)} · ${item.plan_id?'关联计划 #'+item.plan_id:'独立记录'} · ${escape(item.notes||'')}</small></div><div class="ws-actions">${status(item.status)}${button('编辑','edit-event',item.id)}${button('记录窝次','event-clutch',item.id)}</div></div>`:recordTab==='clutches'?`<div class="ws-list-row"><div><b>${escape(item.clutch_code||'窝次 #'+item.id)}</b><small>${escape(item.female_snake_id)} × ${escape(item.male_snake_id)} · 产蛋 ${date(item.laid_date)} · 出壳 ${date(item.hatch_start_date)}${item.hatch_end_date?' 至 '+date(item.hatch_end_date):''} · ${item.egg_count??'—'} 蛋 / ${item.hatched_count??'—'} 孵化</small></div><div class="ws-actions">${status(item.status)}${button('更新','edit-clutch',item.id)}${item.status==='hatched'?button('幼体入库','hatchling',item.id):''}</div></div>`:`<div class="ws-list-row"><div><b>${escape(item.snake_id)}</b><small>${date(item.measured_at)} · ${escape(item.feeding_status||'无进食备注')}</small></div><div>${item.weight_g??'—'} g · ${item.length_cm??'—'} cm</div></div>`).join('')}</div>`:empty('还没有实际记录。新增配种、窝次或测量，逐步补齐个体的真实历史。')}</div>`;
    window.SuohaUpgrades?.records();
  }

  const dialog=document.createElement('dialog');dialog.className='ws-dialog';dialog.id='workspaceDialog';document.body.appendChild(dialog);
  let dirty=false,busy=false;
  function closeDialog(){if(busy||window.SuohaPhotos?.isBusy())return;if(dirty&&!confirm('有未保存的修改，确认放弃吗？'))return;dialog.close();}
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
  dialog.addEventListener('close',()=>{dirty=false;lastFocus?.focus();});
  function openDialog(title,subtitle,content){lastFocus=document.activeElement;dirty=false;dialog.innerHTML=`<div class="ws-dialog-head"><div><h2 id="wsDialogTitle">${escape(title)}</h2><p>${escape(subtitle)}</p></div><button class="ws-dialog-close" aria-label="关闭">×</button></div>${content}`;dialog.setAttribute('aria-labelledby','wsDialogTitle');dialog.querySelector('.ws-dialog-close').onclick=closeDialog;if(!dialog.open)dialog.showModal();}
  function formDialog(title,subtitle,fields,onSave,submit='保存'){
    openDialog(title,subtitle,`<form class="ws-form"><div class="ws-form-fields">${fields}</div><p class="ws-form-message" role="status"></p><div class="ws-actions"><button class="ws-action" type="button" data-cancel>取消</button><button class="ws-action primary" type="submit">${submit}</button></div></form>`);
    const form=dialog.querySelector('form');form.addEventListener('input',()=>{dirty=true;if(!busy)form.querySelector('.ws-form-message').textContent='';});form.querySelector('[data-cancel]').onclick=closeDialog;
    form.onsubmit=async event=>{event.preventDefault();if(busy||!form.reportValidity())return;const button=form.querySelector('[type=submit]');busy=true;button.disabled=true;const message=form.querySelector('.ws-form-message');message.textContent='正在保存…';try{await onSave(Object.fromEntries(new FormData(form)),form);dirty=false;dialog.close();await load(true);toast('已保存');}catch(error){message.textContent=({'All recorded hatchlings are already registered':'本窝已登记数量已达到已孵化数。请更新窝次的实际孵化数量后再入库。'})[error.message]||error.message||String(error);message.scrollIntoView({block:'nearest'});}finally{button.disabled=false;busy=false;}};
  }
  async function ensureRecord(key,id){if(!id||model[key].some(r=>String(r.id)===String(id)))return;const result=await sb.from(tableMap[key]).select('*').eq('id',id).maybeSingle();if(result.error||!result.data)throw new Error('记录不存在或暂时无法读取，请刷新');model[key].push(result.data);}
  async function checked(query){const {data,error}=await query;if(error)throw error;return data;}
  function listingForm(id){
    const row=model.listings.find(l=>l.id===id)||{};
    const available=REMOTE_RAW.snakes.filter(s=>s.id===row.snake_id||!model.listings.some(l=>l.snake_id===s.id&&!l.deleted_at));
    if(!available.length)return toast('所有个体已有展示配置，请编辑现有档案。');
    const auction=window.SuohaAuctionAdmin?.forListing(row.id)?.active;
    const locked=!!auction||['reserved','sold'].includes(row.sale_status);
    formDialog(row.id?'编辑公开档案':'新增展示档案','只发布已确认的资料。售价独立于购入成本；售出和预留状态通过销售流程维护。',
      select('library_filter','从哪个库选择','<option value="all">全部个体</option><option value="stock">种群库</option><option value="nursery">自繁库</option>')+select('snake_id','真实个体',options(available,s=>s.id,s=>`${s.inventory_library==='nursery'?'[自繁库]':'[种群库]'} ${s.id} · ${{F:'母 ♀',M:'公 ♂',U:'未知'}[s.sex]||'未知'} · ${s.birth_date||'出生待补'} · ${s.gene_text}`,row.snake_id))+`<div class="ws-animal-preview full" id="listingAnimalPreview" aria-live="polite"></div>`+
      input('slug','公开网址标识',row.slug||'specimen-'+available[0].id.toLowerCase().replace(/[^a-z0-9-]/g,'-'),'text','required pattern="[a-z0-9][a-z0-9-]{0,79}" maxlength="80"')+
      input('title','公开标题',row.title||available[0].gene_text,'text','required maxlength="150"')+
      select('birth_precision','出生时间公开精度',options(['unknown','year','month','day'],x=>x,x=>({unknown:'不公开 / 未确认',year:'只知道年份',month:'精确到月份',day:'已确认具体日期'})[x],row.birth_precision||'month'))+
      input('asking_price','公开售价（留空为询价）',row.asking_price??'','number','min="0" step="0.01"')+
      select('currency','币种',options(['CNY','USD','EUR','GBP','JPY'],x=>x,x=>x,row.currency||'CNY'))+
      (auction?`<p class="ws-note full">此个体正在拍卖，售价、币种、销售状态与发布状态已锁定。请从公开展示中的“管理拍卖”查看或取消场次。</p>`:locked?`<p class="ws-note full">销售状态：${labels[row.sale_status]}。请通过意向与销售处理。</p>`:select('sale_status','销售状态',options(['display','available'],x=>x,x=>labels[x],row.sale_status||'display')))+
      area('description','公开描述',row.description)+area('husbandry_summary','公开个体情况（注明测量日期，勿填写内部备注）',row.husbandry_summary,1000)+area('pedigree_summary','已确认且允许公开的谱系说明',row.pedigree_summary,1000)+
      `<label class="check"><input name="featured" type="checkbox" ${row.featured?'checked':''}>作为精选优先展示</label><label class="check"><input name="published" type="checkbox" ${row.published?'checked':''}>公开发布（未勾选为私有草稿）</label>`,
      async(values,form)=>{const data={snake_id:row.snake_id||values.snake_id,slug:values.slug.trim(),title:values.title.trim(),description:values.description,husbandry_summary:values.husbandry_summary,pedigree_summary:values.pedigree_summary,birth_precision:values.birth_precision,asking_price:auction?row.asking_price:values.asking_price===''?null:Number(values.asking_price),currency:auction?row.currency:values.currency,sale_status:locked?row.sale_status:values.sale_status,published:auction?row.published:form.elements.published.checked,featured:form.elements.featured.checked};const existing=row.id?row:model.listings.find(l=>l.snake_id===data.snake_id&&l.deleted_at);if(existing?.deleted_at)data.deleted_at=null;await checked(existing?sb.from('specimen_listings').update(data).eq('id',existing.id):sb.from('specimen_listings').insert(data));});
    if(auction)for(const name of ['asking_price','currency','published'])dialog.querySelector('[name='+name+']').disabled=true;
    const snakeSelect=dialog.querySelector('[name=snake_id]');snakeSelect.required=true;
    let previewVersion=0;
    async function preview(){
      const version=++previewVersion,s=animal(snakeSelect.value),host=byId('listingAnimalPreview');
      if(!s){host.innerHTML='<p>此库暂无可新增的个体，请切换来源。</p>';return;}
      const listing=model.listings.find(l=>l.snake_id===s.id),media=model.media.filter(m=>m.listing_id===listing?.id).sort((a,b)=>a.sort_order-b.sort_order);
      host.innerHTML=`<div class="ws-animal-photo">${media.length?'照片读取中…':'暂无照片'}</div><div><b>${escape(s.id)} · ${escape(s.gene_text||'基因待确认')}</b><p>${s.inventory_library==='nursery'?'自繁库':'种群库'} · ${{F:'母 ♀',M:'公 ♂',U:'性别未知'}[s.sex]||'性别未知'} · 出生 ${escape(s.birth_date||'未记录')}</p><p>${escape(s.series||'系列未记录')} · ${media.length} 张照片${media.length?'':' · 保存档案后，点击「照片」上传真实个体照片'}</p></div>`;
      if(media.length){try{const {data}=await sb.storage.from('specimen-media').createSignedUrl(media[0].storage_path,300);if(version!==previewVersion||!host.isConnected)return;const box=host.querySelector('.ws-animal-photo');if(data?.signedUrl){const img=document.createElement('img');img.alt=s.id+' 个体照片';img.onerror=()=>{box.textContent='照片暂不可读';};img.src=data.signedUrl;box.replaceChildren(img);}else box.textContent='照片暂不可读';}catch{if(version===previewVersion&&host.isConnected)host.querySelector('.ws-animal-photo').textContent='照片暂不可读';}}
    }
    dialog.querySelector('[name=library_filter]').onchange=event=>{snakeSelect.innerHTML=options(available.filter(s=>event.target.value==='all'||(s.inventory_library||'stock')===event.target.value),s=>s.id,s=>`${s.id} · ${{F:'母',M:'公',U:'未知'}[s.sex]||'未知'} · ${s.birth_date||'出生待补'} · ${s.gene_text}`);snakeSelect.dispatchEvent(new Event('change'));};
    if(row.id){snakeSelect.disabled=true;dialog.querySelector('[name=library_filter]').disabled=true;}
    snakeSelect.onchange=()=>{const s=animal(snakeSelect.value);if(!row.id){dialog.querySelector('[name=title]').value=s?.gene_text||s?.id||'';dialog.querySelector('[name=slug]').value=s?'specimen-'+s.id.toLowerCase().replace(/[^a-z0-9-]/g,'-'):'';}preview();};
    preview();
  }

  async function photos(id){
    if(!canWrite())return;
    const row=model.listings.find(l=>l.id===id);if(!row)return;
    openDialog('个体照片 · '+row.snake_id,'这里和“编辑个体”共用同一份图库，照片单独保存。','<section id="listingPhotoEditor"></section>');
    window.SuohaPhotos?.mount(byId('listingPhotoEditor'),row.snake_id,()=>load(true));
  }
  function saleDetail(id){
    const row=model.inquiries.find(i=>i.id===id);if(!row)return;
    const actions={new:[['标为已联系','contact'],['确认预留','reserve'],['取消意向','cancel']],contacted:[['确认预留','reserve'],['取消意向','cancel']],reserved:[['确认已收款','paid'],['取消预留','cancel']],paid:[['确认已交付','deliver']],delivered:[['确认成交','complete']]}[row.status]||[];
    openDialog('意向 '+row.reference,'收款与交付由人工核实后记录。取消预留会恢复为仅展示，确认后可重新上架。',`<dl class="ws-detail-grid"><div><dt>称呼</dt><dd>${escape(row.customer_name)}</dd></div><div><dt>联系</dt><dd>${escape(row.contact)}</dd></div><div><dt>状态</dt><dd>${status(row.status)}</dd></div><div><dt>约定金额</dt><dd>${currency(row.agreed_price,row.currency)}</dd></div><div><dt>收款</dt><dd>${date(row.paid_at)}</dd></div><div><dt>交付</dt><dd>${date(row.delivered_at)}</dd></div></dl><p class="ws-note" style="white-space:pre-line">${escape(row.message||'无留言')}</p><div class="ws-actions">${actions.map(([label,action])=>button(label,'sale-'+action,row.id,action!=='cancel')).join('')}</div><h3 style="font-size:14px;margin-top:28px">处理历史</h3><div class="ws-list">${model.activity.filter(a=>a.inquiry_id===id).map(a=>`<div class="ws-list-row"><div>${escape(a.action)}<small>${date(a.created_at)} · ${escape(a.note||'')}</small></div></div>`).join('')||empty('暂无处理记录。')}</div>`);
  }
  function saleAction(id,action){const row=model.inquiries.find(i=>i.id===id),listing=model.listings.find(l=>l.id===row?.listing_id);if(!row)return;formDialog(({contact:'标记已联系',reserve:'确认预留',paid:'确认已收款',deliver:'确认已交付',complete:'确认成交',cancel:'取消意向 / 预留'})[action],action==='complete'?'将同时更新销售状态和个体为已售，保留全部历史。':'请根据真实沟通和交易情况确认，不会自动扣款。',
      (action==='reserve'?input('until','预留截止时间','','datetime-local','required')+input('amount',`约定金额 (${listing?.currency||'CNY'})`,listing?.asking_price??'','number','required min="0" step="0.01"'):'')+area('note','处理备注'+(action==='cancel'?'（必填）':''),'',1500),
      async values=>{await checked(sb.rpc('manage_specimen_sale',{p_id:id,p_action:action,p_note:values.note,p_until:values.until?new Date(values.until).toISOString():null,p_amount:values.amount==null?null:Number(values.amount)}));await refreshRemote(false);},'确认');}

  function eventForm(id){const row=model.events.find(e=>String(e.id)===String(id))||{};formDialog(id?'更新配种事件':'记录实际配种','仅记录已经发生的配种。关联计划时，亲本必须匹配且计划已通过审核。',
    select('female','母蛇',animalOptions('F',row.female_snake_id))+select('male','公蛇',animalOptions('M',row.male_snake_id))+
    select('plan','关联年度计划','<option value="">不关联</option>'+options(REMOTE_RAW.plans.filter(p=>p.review_status!=='pending'&&p.review_status!=='returned'),p=>p.id,p=>`${p.plan_year} · ${p.project_name}`,row.plan_id))+
    input('paired_at','实际配种日期',row.paired_at||today(),'date',`required max="${today()}"`)+
    select('status','事件状态',options(['paired','observed_copulation','successful','unsuccessful','cancelled'],x=>x,x=>labels[x],row.status||'paired'))+area('notes','观察备注',row.notes),
    async values=>checked(sb.rpc('record_breeding_event',{p_id:row.id||null,p_plan_id:values.plan?Number(values.plan):null,p_female:values.female,p_male:values.male,p_date:values.paired_at,p_status:values.status,p_notes:values.notes})));
    dialog.querySelector('[name=plan]').onchange=event=>{const p=REMOTE_RAW.plans.find(p=>String(p.id)===event.target.value);if(p){dialog.querySelector('[name=female]').value=p.female_snake_id||'';dialog.querySelector('[name=male]').value=p.male_snake_id||'';}};
  }
  function clutchForm(id,eventId){const row=model.clutches.find(e=>String(e.id)===String(id))||{};if(!model.events.length)return toast('请先记录真实配种事件。');formDialog(id?'更新窝次':'记录实际窝次','亲本从配种事件关联；已登记幼体的窝次不能随意变更亲本。',
    select('event','关联配种事件',options(model.events,e=>e.id,e=>`#${e.id} · ${e.female_snake_id} × ${e.male_snake_id}`,row.breeding_event_id||eventId))+
    input('code','窝次编号',row.clutch_code||'','text','maxlength="80"')+input('laid','产蛋日期',row.laid_date||today(),'date',`required max="${today()}"`)+
    input('eggs','总蛋数',row.egg_count??'','number','required min="0" step="1"')+input('fertile','受精蛋数（未确认留空）',row.fertile_egg_count??'','number','min="0" step="1"')+input('hatched','已孵化数（幼体入库前必填）',row.hatched_count??'','number','min="0" step="1"')+
    `<p class="ws-note full ws-date-help">尚未出壳：填写预计日期（可选未来），状态保留「孵化中」。已有幼体出壳：填写实际日期和已孵化数，再选择「已孵化」进行幼体入库。</p>`+input('expected_hatch','预计出壳日期（可选未来）',row.expected_hatch_date||'','date')+input('hatch_start','实际开始出壳日期',row.hatch_start_date||'','date',`max="${today()}"`)+input('hatch_end','实际结束出壳日期（未结束留空）',row.hatch_end_date||'','date',`max="${today()}"`)+
    select('status','窝次状态',options(['incubating','hatched','failed','archived'],x=>x,x=>labels[x],row.status||'incubating')),
    async v=>{if(v.status==='hatched'&&(!v.hatch_start||v.hatched===''||Number(v.hatched)<1))throw new Error('已孵化的窝次请填写实际开始出壳日期和已孵化数（至少 1 条）。尚未出壳请选「孵化中」，填写预计出壳日期。');return checked(sb.rpc('record_clutch_dates',{p_id:row.id||null,p_event_id:Number(v.event),p_code:v.code,p_date:v.laid,p_eggs:Number(v.eggs),p_fertile:v.fertile===''?null:Number(v.fertile),p_hatched:v.hatched===''?null:Number(v.hatched),p_status:v.status,p_hatch_start:v.hatch_start||null,p_hatch_end:v.hatch_end||null,p_expected_hatch:v.expected_hatch||null}));});
    const form=dialog.querySelector('form');
    function dateLimits(){for(const name of ['expected_hatch','hatch_start'])form.elements[name].min=form.elements.laid.value;form.elements.hatch_end.min=form.elements.hatch_start.value||form.elements.laid.value;}
    form.elements.laid.addEventListener('input',dateLimits);form.elements.hatch_start.addEventListener('input',dateLimits);dateLimits();
  }
  function measurementForm(){formDialog('记录体重与成长','只记录实际测量；空白表示未测量，不以零代替未知。',select('snake_id','个体',animalOptions())+input('measured_at','测量日期',today(),'date',`required max="${today()}"`)+input('weight_g','体重 g','','number','min="0" step="0.01"')+input('length_cm','体长 cm','','number','min="0" step="0.01"')+input('feeding_status','进食情况','','text','maxlength="300"')+area('condition_note','状态说明','',1000),async v=>{if(!v.weight_g&&!v.length_cm&&!v.feeding_status&&!v.condition_note)throw new Error('请至少填写一项实际记录。');await checked(sb.from('snake_measurements').insert({...v,weight_g:v.weight_g===''?null:Number(v.weight_g),length_cm:v.length_cm===''?null:Number(v.length_cm)}));});}
  function hatchlingForm(id){const clutch=model.clutches.find(c=>String(c.id)===String(id));if(!clutch)return;const registered=REMOTE_RAW.snakes.filter(s=>String(s.clutch_id)===String(id)).length;if(!clutch.hatched_count||registered>=Number(clutch.hatched_count)){clutchForm(id);dialog.querySelector('.ws-form-message').textContent=!clutch.hatched_count?'请先填写本窝实际已孵化数，保存后即可登记幼体。':`本窝已登记 ${registered} 条，已达到已孵化数。如有新增出壳，请先更新数量。`;dialog.querySelector('[name=hatched]').focus();return;}formDialog('幼体入库','幼体默认进入自繁库，并关联母本、公本和窝次。确认留种后可转入种群库；不会从亲本概率自动推断幼体基因。',input('id','个体编号',nextSnakeId(),'text','required pattern="[A-Za-z0-9_-]{1,64}"')+select('sex','性别',options(['U','F','M'],x=>x,x=>({U:'未知',F:'母',M:'公'})[x]))+input('birth','实际孵化日期',clutch.hatch_start_date||clutch.laid_date||today(),'date',`required min="${clutch.hatch_start_date||clutch.laid_date}" max="${clutch.hatch_end_date||today()}"`)+input('series','系列',animal(clutch.female_snake_id)?.series||'','text','required maxlength="100"')+input('gene_text','个体基因描述（不确定请注明）','待确认','text','required maxlength="300"'),async v=>{await checked(sb.rpc('register_hatchling',{p_clutch:clutch.id,p_id:v.id,p_sex:v.sex,p_birth:v.birth,p_series:v.series,p_gene_text:v.gene_text,p_investor:currentInvestorName()}));await refreshRemote(false);});}

  async function handleAction(action,id){
    if(action==='individual'){showIndividual(id);return;}
    if(['reload','conversation','reviews','production','publishing','sales','population'].includes(action)){
      if(action==='reload'){await refreshRemote(false);await load(true);}
      else if(action==='conversation')await openAiConversation(Number(id));
      else if(action==='reviews'){adminTab='annual-review';setPage('admin');}
      else setPage(action);return;
    }
    if(!canWrite())return toast('当前账号没有写权限',true);
    if(action==='new-listing'||action==='edit-listing')listingForm(id);
    else if(action==='configure-auction')await window.SuohaAuctionAdmin.createForListing(id);
    else if(action==='manage-auction')await window.SuohaAuctionAdmin.manageListing(id);
    else if(action==='delete-listing'){if(!await confirmWorkflow({title:'删除公开展示？',sub:'将从公开网站和展示列表移除。个体、照片及历史意向保留；以后可以通过上架恢复。有效交易需先处理。',confirm:'确认删除',danger:true}))return;await checked(sb.rpc('delete_specimen_listing',{p_id:id}));await load(true);toast('展示档案已删除，原个体保留');}
    else if(action==='photos')await photos(id);
    else if(action==='sale-detail')saleDetail(id);
    else if(action.startsWith('sale-'))saleAction(id,action.slice(5));
    else if(action==='cover'){const m=model.media.find(m=>m.id===id);if(!m)return;const order=Math.min(0,...model.media.filter(x=>x.listing_id===m.listing_id).map(x=>x.sort_order))-1;await checked(sb.from('specimen_media').update({sort_order:order}).eq('id',id));await load(true);await photos(m.listing_id);}
    else if(action==='remove-photo'){const m=model.media.find(m=>m.id===id);if(!m||!confirm('从公开档案移除这张照片？'))return;await checked(sb.from('specimen_media').delete().eq('id',id));await sb.storage.from('specimen-media').remove([m.storage_path]);await load(true);await photos(m.listing_id);}
    else if(action==='new-record')({events:eventForm,clutches:clutchForm,measurements:measurementForm})[recordTab]();
    else if(action==='edit-event')eventForm(id);
    else if(action==='edit-clutch')clutchForm(id);
    else if(action==='event-clutch')clutchForm(null,id);
    else if(action==='hatchling')hatchlingForm(id);
    else if(action==='edit-animal')openSnakeForm(id);
    else if(action==='measure-animal'){measurementForm();dialog.querySelector('[name=snake_id]').value=id;}
  }
  document.addEventListener('click',event=>{
    const page=event.target.closest('[data-ws-page]');if(page){setPage(page.dataset.wsPage);return;}
    const tab=event.target.closest('[data-record-tab]');if(tab){recordTab=tab.dataset.recordTab;renderRecords();return;}
    const filter=event.target.closest('[data-sales-filter]');if(filter){salesFilter=filter.dataset.salesFilter;renderSales();return;}
    const action=event.target.closest('[data-ws-action]');if(action){action.disabled=true;Promise.resolve(handleAction(action.dataset.wsAction,action.dataset.id)).catch(error=>toast(error.message||String(error),true)).finally(()=>action.disabled=false);}
  });
  window.SuohaWorkspace={render,renderPublishing,load,snapshot:()=>model,async recordPlan(id){await load(true);let plan=REMOTE_RAW.plans.find(p=>String(p.id)===String(id));if(!plan){const result=await sb.from('annual_breeding_plans').select('*').eq('id',id).maybeSingle();if(result.error||!result.data)throw new Error('计划暂时无法读取，请刷新');plan=result.data;REMOTE_RAW.plans.push(plan);}if(plan.review_status&&plan.review_status!=='approved')throw new Error('请先通过计划审核，再关联实际配种记录');eventForm();const select=dialog.querySelector('[name=plan]');select.value=String(id);select.dispatchEvent(new Event('change'));},async editEvent(id){await load(true);await ensureRecord('events',id);eventForm(id);},async editClutch(id,eventId){await load(true);if(id){await ensureRecord('clutches',id);eventId=model.clutches.find(c=>String(c.id)===String(id)).breeding_event_id;}await ensureRecord('events',eventId);clutchForm(id,eventId);},async publishAnimal(id){if(!canWrite())throw new Error('当前账号没有写权限');await load(true);if(model.errors.listings)throw new Error('展示配置读取失败，请刷新后再试');const existing=model.listings.find(l=>l.snake_id===id);listingForm(existing?.id);if(!existing){const select=dialog.querySelector('[name=snake_id]');select.value=id;select.dispatchEvent(new Event('change'));}const sale=dialog.querySelector('[name=sale_status]');if(sale)sale.value='available';dialog.querySelector('[name=published]').checked=true;},showClutches(){recordTab='clutches';setPage('records');renderRecords();}};
  const previousDrawer=openDrawer;
  openDrawer=function(s){previousDrawer(s);const action=document.createElement('button');action.className='ws-action primary';action.textContent='打开完整档案 ↗';action.style.marginTop='20px';action.onclick=()=>showIndividual(s.id);byId('drawerContent').appendChild(action);};
  const previousLab=renderLab;
  const comparisons=[];
  renderLab=function(){previousLab();if(!byId('labF').value||!byId('labM').value)return;const actions=document.createElement('div');actions.className='ws-actions';actions.style.marginTop='20px';
    const compare=document.createElement('button');compare.className='ws-action';compare.textContent='加入配对比较';compare.onclick=()=>{const female=byId('labF').value,male=byId('labM').value;if(comparisons.some(c=>c.female===female&&c.male===male))return toast('这组配对已在比较中');if(comparisons.length>=4)return toast('最多比较 4 组，请先清空比较');comparisons.push({female,male,result:window.SuohaGenetics.calculateCross({genes:REMOTE_RAW.genes,maternalGenes:snakeGeneRows(female),paternalGenes:snakeGeneRows(male),morphs:REMOTE_RAW.morphs,morphComponents:REMOTE_RAW.morphComponents})});paintComparisons();};actions.appendChild(compare);
    if(canWrite()){const save=document.createElement('button');save.className='ws-action primary';save.textContent='加入年度计划';save.onclick=()=>{const female=byId('labF').value,male=byId('labM').value;openPlanForm();const form=byId('editForm');for(const [name,value] of Object.entries({female_snake_id:female,male_snake_id:male,plan_year:state.year,project_name:`${female} × ${male} 配对计划`}))if(form.elements[name])form.elements[name].value=value;};actions.appendChild(save);}byId('labResult').appendChild(actions);paintComparisons();};
  function paintComparisons(){let host=byId('pairComparisons');if(!host){host=document.createElement('div');host.id='pairComparisons';host.className='ws-panel';byId('mendelianResult').parentElement.after(host);}host.hidden=!comparisons.length;if(!comparisons.length)return;host.innerHTML=`<h2>配对比较 · 本次会话</h2><p class="ws-note">不同位点按独立分离估算；未计算的性状不进入组合概率。清空或刷新后重新选择。</p><div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>亲本</th><th>可计算位点</th><th>未计算位点</th><th>组合结果</th></tr></thead><tbody>${comparisons.map(c=>`<tr><td>${escape(c.female)} × ${escape(c.male)}</td><td>${c.result.loci.length}</td><td>${c.result.skipped.length}</td><td>${c.result.derivedMorphs.map(m=>`${escape(m.name_zh)} ${Math.round(m.probability*10000)/100}%`).join(' / ')||'暂无可推导的命名组合'}</td></tr>`).join('')}</tbody></table></div><button class="ws-action" id="clearComparisons">清空比较</button>`;byId('clearComparisons').onclick=()=>{comparisons.length=0;paintComparisons();};}
  byId('labF').onchange=()=>renderLab();byId('labM').onchange=()=>renderLab();
  window.addEventListener('suoha:data',()=>load(true));
  window.addEventListener('suoha:logout',()=>{generation++;loading=null;model.loaded=false;comparisons.length=0;Object.keys(tableMap).forEach(k=>model[k]=[]);['workspaceOverview','workspacePublishing','workspaceSales','workspaceRecords','workspaceIndividual'].forEach(id=>byId(id).innerHTML='');dialog.close();});
  if(currentUser&&currentProfile?.active)load();
})();
