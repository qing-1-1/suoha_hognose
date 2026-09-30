/* One photo library for an animal, shared by its editor and public listing. */
(() => {
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let pending=0,serial=0;
  const check=async query=>{const {data,error}=await query;if(error)throw error;return data;};
  async function encode(file){
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('请选择 JPEG、PNG 或 WebP；HEIC 请先转换为 JPEG。');
    if(file.size>20*1024*1024)throw Error('原始照片不能超过 20MB，请缩小后重试。');
    let bitmap;
    try{bitmap=await createImageBitmap(file);}catch{throw Error('无法解码这张照片，请重新导出为 JPEG 或 PNG。');}
    try{
      const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.88));
      if(!blob||blob.size>8*1024*1024)throw Error('照片处理失败或压缩后仍超过 8MB，请缩小后重试。');
      return blob;
    }finally{bitmap.close();}
  }
  function mount(host,snakeId,onChange=()=>{}){
    if(!host)return;
    host.classList.add('animal-photo-editor');
    if(!snakeId){host.innerHTML='<h3>个体照片</h3><p class="ws-note">请先保存新个体，再打开编辑上传照片。</p>';return;}
    const owner=currentUser?.id,uid='animal-photos-'+(++serial);
    let listing=null,rows=[],working=false,loaded=false,version=0;
    const alive=()=>host.isConnected&&currentUser?.id===owner&&canWrite();
    host.innerHTML=`<div class="animal-photo-heading"><div><h3>个体照片</h3><p class="ws-note" data-photo-state>正在读取图库…</p></div><button type="button" class="ws-action" data-photo-reload>刷新照片</button></div>
      <p class="ws-note">照片单独保存，下面的“保存 / 取消”只作用于个体资料。新增照片默认仅内部可见；勾选“选入公开档案”并保存照片设置后，已发布档案才会展示。公开封面取已选公开照片中的第一张。</p>
      <div class="animal-photo-grid" data-photo-grid></div>
      <div class="animal-photo-upload"><label for="${uid}-files">添加真实个体照片<input id="${uid}-files" data-photo-files type="file" accept="image/jpeg,image/png,image/webp" multiple></label><p class="ws-note">每次最多 8 张，原图每张不超过 20MB；自动适配网页尺寸。</p>
      <div class="animal-photo-fields"><label for="${uid}-caption">新照片说明<input id="${uid}-caption" data-photo-caption maxlength="200" placeholder="例如：头部、背纹或拍摄时的状态"></label><label for="${uid}-date">新照片拍摄日期<input id="${uid}-date" data-photo-date type="date"></label></div>
      <button class="ws-action primary" type="button" data-photo-upload>上传照片</button></div><p class="animal-photo-message" data-photo-message role="status" aria-live="polite"></p>`;
    const grid=host.querySelector('[data-photo-grid]'),state=host.querySelector('[data-photo-state]'),message=host.querySelector('[data-photo-message]');
    const say=(text,error=false)=>{if(!alive())return;message.textContent=text;message.classList.toggle('error',error);};
    function lock(){host.querySelectorAll('input,button').forEach(el=>el.disabled=working||(!loaded&&!el.hasAttribute('data-photo-reload')));host.setAttribute('aria-busy',String(working));}
    async function fetchRows(){
      const own=++version;loaded=false;lock();
      const record=await check(sb.from('specimen_listings').select('*').eq('snake_id',snakeId).maybeSingle());
      const media=record?await check(sb.from('specimen_media').select('*').eq('listing_id',record.id).order('sort_order',{ascending:true}).order('created_at',{ascending:true})):[];
      if(!alive()||own!==version)return;
      listing=record;rows=media||[];loaded=true;
      state.textContent=`${rows.length} 张照片 · ${listing?.published&&!listing.deleted_at?'已发布 · '+rows.filter(r=>r.is_public!==false).length+' 张选入公开档案':'未发布，仅内部可见'}`;
      const signed=await Promise.all(rows.map(async row=>{try{const result=await sb.storage.from('specimen-media').createSignedUrl(row.storage_path,300);return {...row,url:result.data?.signedUrl};}catch{return row;}}));
      if(!alive()||own!==version)return;
      grid.innerHTML=signed.length?signed.map((row,index)=>`<article class="animal-photo-card" data-media-id="${esc(row.id)}"><div class="animal-photo-preview">${row.url?`<img src="${esc(row.url)}" alt="${esc(row.caption||snakeId+' 个体照片')}" loading="lazy">`:'<span>照片暂时无法预览</span>'}${index===0?'<span class="animal-photo-cover">内部封面</span>':''}${row.is_public!==false&&rows.find(r=>r.is_public!==false)?.id===row.id?'<span class="animal-public-cover">公开封面</span>':''}</div>
        <label class="photo-visibility"><input type="checkbox" data-media-public ${row.is_public!==false?'checked':''}>选入公开档案</label><label>照片说明<input data-media-caption value="${esc(row.caption)}" maxlength="200"></label><label>拍摄日期<input data-media-date type="date" value="${esc(row.photographed_at||'')}"></label>
        <div class="ws-actions"><button type="button" class="ws-action" data-photo-action="save">保存照片设置</button><button type="button" class="ws-action" data-photo-action="cover">设为封面</button><button type="button" class="ws-action" data-photo-action="replace">替换照片</button><button type="button" class="ws-action danger" data-photo-action="remove">删除照片</button></div><input type="file" data-media-replacement accept="image/jpeg,image/png,image/webp" hidden></article>`).join(''):'<div class="ws-empty">暂无照片。上传后可在这里编辑说明、替换照片和设置封面。</div>';
      grid.querySelectorAll('img').forEach(img=>img.onerror=()=>{const fallback=document.createElement('span');fallback.textContent='照片暂时无法预览，请刷新重试';img.replaceWith(fallback);});
      lock();
    }
    async function ensureListing(){
      if(listing)return listing;
      const animal=REMOTE_RAW.snakes.find(s=>s.id===snakeId);
      if(!animal)throw Error('个体不存在，请重新打开档案。');
      const result=await sb.from('specimen_listings').insert({snake_id:snakeId,slug:'specimen-'+crypto.randomUUID(),title:String(animal.gene_text||snakeId).slice(0,150),published:false,sale_status:'display'}).select('*').single();
      if(result.error?.code==='23505')listing=await check(sb.from('specimen_listings').select('*').eq('snake_id',snakeId).maybeSingle());
      else if(result.error)throw result.error;
      else listing=result.data;
      if(!listing)throw Error('无法准备个体图库，请重试。');
      return listing;
    }
    async function uploadBlob(blob){
      if(!alive())throw Error('登录状态已改变，请重新登录。');
      const row=await ensureListing(),path=`${row.id}/${crypto.randomUUID()}.webp`;
      await check(sb.storage.from('specimen-media').upload(path,blob,{contentType:'image/webp',cacheControl:'0',upsert:false}));
      return path;
    }
    async function clean(path){try{await check(sb.storage.from('specimen-media').remove([path]));return true;}catch{return false;}}
    async function run(action){
      if(working||!alive())return;
      working=true;pending++;lock();say('正在保存照片…');
      try{
        const result=await action();
        if(!alive())return;
        await fetchRows();await onChange();say(result||'照片已保存。');
      }catch(error){
        if(alive()){
          let suffix='';try{await fetchRows();await onChange();}catch{loaded=false;suffix=' 图库刷新失败，请点击“刷新照片”。';}
          say((/is_public|schema cache/.test(error.message||'')?'照片权限功能需要先执行 026 数据库迁移，请完成后刷新图库。':error.message||'照片操作失败，请重试。')+suffix,true);
        }
      }finally{working=false;pending--;if(alive())lock();}
    }
    host.querySelector('[data-photo-reload]').onclick=()=>run(async()=>{await fetchRows();return '图库已刷新。';});
    host.querySelector('[data-photo-upload]').onclick=()=>{
      if(!loaded)return;
      const fileInput=host.querySelector('[data-photo-files]'),files=[...fileInput.files];
      if(!files.length||files.length>8){say('请选择 1–8 张照片。',true);return;}
      const caption=host.querySelector('[data-photo-caption]').value.trim(),date=host.querySelector('[data-photo-date]');
      if(!date.reportValidity())return;
      const photographed_at=date.value||null;
      run(async()=>{
        let saved=0;const order=Math.max(-1,...rows.map(r=>r.sort_order));
        try{
          for(const file of files){
            say(`正在上传 ${saved+1} / ${files.length}…`);
            const blob=await encode(file),path=await uploadBlob(blob);
            try{await check(sb.from('specimen_media').insert({listing_id:listing.id,storage_path:path,caption,photographed_at,is_public:false,sort_order:order+saved+1}));}
            catch(error){await clean(path);throw error;}
            saved++;
          }
          return `已保存 ${saved} 张照片。新增照片仅内部可见；选入公开档案并保存后才会对外展示。`;
        }catch(error){throw Error(`已保存 ${saved} / ${files.length} 张。${error.message} 请重新选择未成功的照片。`);}
        finally{fileInput.value='';}
      });
    };
    grid.addEventListener('click',event=>{
      const button=event.target.closest('[data-photo-action]');if(!button||working||!loaded)return;
      const card=button.closest('[data-media-id]'),row=rows.find(r=>r.id===card.dataset.mediaId);if(!row)return;
      const action=button.dataset.photoAction;
      if(action==='replace'){card.querySelector('[data-media-replacement]').click();return;}
      if(action==='remove'&&!confirm(`删除这张个体照片？${row.is_public!==false&&listing.published?'此照片正在公开展示，删除后首页和详情也会移除。':'此照片当前用于内部图库。'}其他照片与个体资料保留。`))return;
      const date=card.querySelector('[data-media-date]');if(action==='save'&&!date.reportValidity())return;
      const patch=action==='cover'?{sort_order:Math.min(0,...rows.map(r=>r.sort_order))-1}:{caption:card.querySelector('[data-media-caption]').value.trim(),photographed_at:date.value||null,is_public:card.querySelector('[data-media-public]').checked};
      run(async()=>{
        if(action==='remove'){
          await check(sb.from('specimen_media').delete().eq('id',row.id).eq('listing_id',listing.id));
          return await clean(row.storage_path)?'照片已删除。':'照片已从档案移除，但原文件清理失败；不会再公开显示。';
        }
        await check(sb.from('specimen_media').update(patch).eq('id',row.id).eq('listing_id',listing.id));
        return action==='cover'?'封面已更新。':'照片设置已保存。';
      });
    });
    grid.addEventListener('change',event=>{
      if(!event.target.matches('[data-media-replacement]')||working)return;
      const file=event.target.files[0],card=event.target.closest('[data-media-id]'),row=rows.find(r=>r.id===card.dataset.mediaId);
      if(!file||!row)return;
      run(async()=>{
        const oldPath=row.storage_path,blob=await encode(file),path=await uploadBlob(blob);
        try{await check(sb.from('specimen_media').update({storage_path:path}).eq('id',row.id).eq('listing_id',listing.id));}
        catch(error){await clean(path);throw error;}
        return await clean(oldPath)?'照片已替换，说明和封面顺序保留。':'照片已替换，旧文件清理失败；旧照片已停止公开。';
      });
    });
    fetchRows().catch(error=>{if(alive()){loaded=false;state.textContent='图库读取失败';say(error.message||'请刷新图库后重试。',true);lock();}});
  }
  document.getElementById('editForm')?.addEventListener('submit',event=>{
    if(!pending)return;event.preventDefault();event.stopImmediatePropagation();toast('照片正在保存，请稍候。',true);
  },true);
  window.SuohaPhotos={mount,isBusy:()=>pending>0};
})();
