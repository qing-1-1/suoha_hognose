/* Shared series semantics and the individual entry controls. */
function snakeSeries(row){return [...new Set((Array.isArray(row.series_names)?row.series_names:[row.series]).filter(Boolean))];}
function sharesSeries(a,b){return snakeSeries(a).some(name=>snakeSeries(b).includes(name));}
window.SnakeEntry={
  markup(row){return `<section class="formField full snake-series"><strong>所属系列 · 可多选</strong><div data-series-options></div><div class="series-create"><input aria-label="新系列名称" maxlength="100" placeholder="输入新系列名称"><button type="button" class="topBtn" data-series-create>新建并选中</button></div><details><summary>编辑已有系列</summary><p class="smallNote">修改名称会同步到所有关联个体。系列修改立即保存。</p><div class="series-create"><select aria-label="要编辑的系列"></select><input aria-label="修改后的系列名称" maxlength="100" placeholder="新的系列名称"><button type="button" class="topBtn" data-series-rename>保存名称</button></div></details><p data-series-message aria-live="polite"></p></section>`;},
  async mount(row,root=document){
    const host=root.querySelector('.snake-series');if(!host)return;
    const selected=new Set(snakeSeries(row));let names=[...new Set(REMOTE_RAW.snakes.flatMap(snakeSeries))];
    const message=host.querySelector('[data-series-message]');
    const search=document.createElement('input');search.type='search';search.placeholder='搜索系列';search.setAttribute('aria-label','搜索系列');host.querySelector('[data-series-options]').before(search);
    const summary=document.createElement('p');summary.className='smallNote';host.querySelector('[data-series-options]').after(summary);
    const used=name=>REMOTE_RAW.snakes.filter(s=>snakeSeries(s).includes(name)).length;
    const draw=()=>{
      host.querySelector('[data-series-options]').innerHTML=names.sort((a,b)=>a.localeCompare(b,'zh')).map(name=>`<label class="series-chip"><input type="checkbox" value="${esc(name)}" ${selected.has(name)?'checked':''}><span>${esc(name)}</span></label>`).join('')||'<p class="smallNote">暂无系列，可在下方新建。</p>';
      host.querySelector('select').innerHTML=names.map(name=>`<option value="${esc(name)}">${esc(name)} · ${used(name)} 条</option>`).join('');
      filter();
    };
    const filter=()=>{host.querySelectorAll('.series-chip').forEach(label=>label.hidden=!label.textContent.toLowerCase().includes(search.value.toLowerCase()));summary.textContent='已选 '+selected.size+' 项：'+([...selected].join('、')||'尚未选择');};search.oninput=filter;
    host.addEventListener('change',e=>{if(e.target.type==='checkbox'){if(e.target.checked)selected.add(e.target.value);else selected.delete(e.target.value);filter();}});
    host.readSeries=()=>[...selected];draw();
    let busy=false;
    async function mutate(button,task){if(busy)return;busy=true;const save=host.closest('form')?.querySelector('button[type=submit]');if(save)save.disabled=true;button.disabled=true;message.textContent='保存中…';try{await task();message.textContent='系列已保存';draw();}catch(e){message.textContent=e.message||String(e);}finally{button.disabled=false;if(save)save.disabled=false;busy=false;}}
    const create=host.querySelector('[data-series-create]'),field=host.querySelector('[aria-label="新系列名称"]');
    create.onclick=()=>mutate(create,async()=>{const name=field.value.trim();if(!name)throw Error('请输入系列名称');if(!names.includes(name)){const {error}=await sb.from('snake_series').insert({name});if(error)throw error;names.push(name);}selected.add(name);field.value='';});
    field.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();create.click();}};
    const rename=host.querySelector('[data-series-rename]');
    const impact=document.createElement('p');impact.className='smallNote';rename.parentElement.after(impact);const showImpact=()=>impact.textContent=`更名将同步更新 ${used(host.querySelector('select').value)} 条个体；公开档案和系列筛选随之更新。`;host.querySelector('select').addEventListener('change',showImpact);showImpact();
    const archive=document.createElement('button');archive.type='button';archive.className='topBtn';archive.textContent='归档未使用系列';impact.after(archive);archive.onclick=()=>mutate(archive,async()=>{const name=host.querySelector('select').value;if(used(name)||selected.has(name))throw Error('此系列仍被个体使用或已在当前表单选中，请先取消关联');const {error}=await sb.rpc('archive_snake_series',{p_name:name,p_archived:true});if(error)throw error;names=names.filter(n=>n!==name);});
    rename.onclick=()=>mutate(rename,async()=>{const before=host.querySelector('select').value,name=host.querySelector('[aria-label="修改后的系列名称"]').value.trim();if(!before||!name)throw Error('请选择系列并填写新名称');if(before===name)return;if(names.includes(name))throw Error('此名称已存在，请使用不同名称');const {error}=await sb.rpc('rename_snake_series',{p_old:before,p_new:name});if(error)throw error;names=names.map(n=>n===before?name:n);if(selected.delete(before))selected.add(name);await refreshRemote(false);});
    document.querySelectorAll('#editFormFields .formField').forEach((field,i)=>{const input=field.querySelector('input,select,textarea'),label=field.querySelector('label');if(input&&label&&!input.id){input.id='snake-field-'+i;label.htmlFor=input.id;}});
    document.querySelectorAll('#editFormFields input[type=date]').forEach(input=>{
      if(input.name==='birth_date')input.max=localDate();
      const controls=document.createElement('div');controls.className='date-shortcuts';
      controls.innerHTML='<button type="button">今天</button><button type="button">选择日期</button><button type="button">清空</button>';
      const [today,picker,clear]=controls.children;today.onclick=()=>{input.value=localDate();};picker.onclick=()=>{input.focus();try{input.showPicker?.();}catch{}};clear.onclick=()=>{input.value='';};input.after(controls);
      const quick=document.createElement('details');quick.className='date-parts';
      const title=input.name==='birth_date'?'出生':'预计成熟',year=new Date().getFullYear();
      const choices=(label,values)=>`<select aria-label="${title}${label}"><option value="">${label}</option>${values.map(n=>`<option value="${String(n).padStart(2,'0')}">${n}${label}</option>`).join('')}</select>`;
      const initialYear=Number(input.value.slice(0,4))||year;
      const first=Math.min(year-50,initialYear),last=Math.max(year+20,initialYear);
      quick.innerHTML='<summary>按年月日快速填写</summary><div>'+choices('年',Array.from({length:last-first+1},(_,i)=>last-i))+choices('月',Array.from({length:12},(_,i)=>i+1))+choices('日',Array.from({length:31},(_,i)=>i+1))+'</div>';
      const parts=[...quick.querySelectorAll('select')];
      const sync=()=>{const values=input.value.split('-');parts.forEach((p,i)=>p.value=values[i]||'');};
      quick.onchange=()=>{const [y,m,d]=parts.map(p=>p.value);const days=y&&m?new Date(Number(y),Number(m),0).getDate():31;[...parts[2].options].forEach(o=>o.disabled=Number(o.value)>days);if(Number(d)>days)parts[2].value='';if(y&&m&&parts[2].value)input.value=[y,m,parts[2].value].join('-');else input.value='';};
      input.addEventListener('input',sync);controls.addEventListener('click',sync);controls.after(quick);sync();
    });
    try{const result=await window.SuohaData.fetchAll(sb,'snake_series',[['name',true]]);if(!host.isConnected)return;if(result.error)throw result.error;names=[...new Set([...names,...result.data.filter(s=>!s.archived).map(s=>s.name)])];draw();}catch(e){message.textContent='系列库读取失败，请刷新重试：'+(e.message||e);}
  },
  read(root=document){const names=root.querySelector('.snake-series')?.readSeries()||[];if(!names.length)throw Error('请至少选择一个系列');return names;}
};
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
