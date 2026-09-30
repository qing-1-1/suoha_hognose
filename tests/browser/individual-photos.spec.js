const {test,expect}=require('@playwright/test');

test('individual editor manages a private photo library without losing unsaved animal fields',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/fonts.googleapis.com/**',r=>r.abort());
  await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
    const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'1442399241@qq.com'};
    window.photoFixture={snakes:[{id:'PHOTO01',sex:'F',series:'测试',gene_text:'康达',status:'active',birth_date:'2025-01-01',origin:'purchased'}],profiles:[{...user,display_name:'suohama',role:'admin',active:true}],specimen_listings:[],specimen_media:[],uploads:[],removed:[]};
    window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user,access_token:'test'}}})},
      from(table){let filters=[],operation,values,cached;const query={select(){return this},eq(k,v){filters.push([k,v]);return this},order(){return this},range(){return this},limit(){return this},insert(v){operation='insert';values=v;return this},update(v){operation='update';values=v;return this},delete(){operation='delete';return this},
        execute(){if(cached)return cached;const list=photoFixture[table]||[],match=r=>filters.every(([k,v])=>r[k]===v);let selected=list.filter(match);
          if(operation==='insert'){selected=[{id:crypto.randomUUID(),created_at:new Date().toISOString(),...values}];(photoFixture[table]??=[]).push(...selected);}
          if(operation==='update')selected.forEach(r=>Object.assign(r,values));
          if(operation==='delete')photoFixture[table]=list.filter(r=>!match(r));
          selected=[...selected].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));return cached={data:structuredClone(selected),count:selected.length,error:null};},
        maybeSingle(){const r=this.execute();return Promise.resolve({...r,data:r.data[0]||null});},single(){return this.maybeSingle();},then(resolve,reject){return Promise.resolve(this.execute()).then(resolve,reject);}};return query;},
      rpc:async()=>({data:[],error:null}),storage:{from(){return {
        createSignedUrl:async()=>({data:{signedUrl:'/assets/photos/hognose-closeup-768.webp'}}),
        createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'/assets/photos/hognose-closeup-768.webp'}))}),
        download:async()=>{const c=document.createElement('canvas');c.width=2000;c.height=1000;return {data:await new Promise(resolve=>c.toBlob(resolve,'image/webp'))};},
        upload:async(path,blob)=>{const bitmap=await createImageBitmap(blob);const width=bitmap.width;photoFixture.uploads.push({path,size:blob.size,type:blob.type,width,height:bitmap.height});bitmap.close();return photoFixture.failThumbnail&&width===640?{error:{message:'缩略图上传失败'}}:{data:{path},error:null};},
        remove:async paths=>{photoFixture.removed.push(...paths);return {data:[],error:null};}
      };}}
    })};
  `}));
  await page.goto('/admin?snake=PHOTO01#individual');
  await page.getByRole('button',{name:'编辑个体',exact:true}).click();
  const host=page.locator('#individualPhotoEditor');
  await expect(host).toContainText('未发布，仅内部可见');
  expect(await page.evaluate(()=>photoFixture.specimen_listings.length)).toBe(0);
  await page.locator('#editForm [name=notes]').fill('尚未保存的个体备注');
  const base64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2000;c.height=1000;c.getContext('2d').fillRect(0,0,2000,1000);return c.toDataURL('image/png').split(',')[1];});
  const file={name:'animal.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')};
  await host.locator('[data-photo-files]').setInputFiles([file,{...file,name:'back.png'}]);
  await host.getByRole('button',{name:'上传照片',exact:true}).click();
  await expect(host.locator('[data-photo-message]')).toContainText('已保存 2 张');
  await expect(host.locator('.animal-photo-card')).toHaveCount(2);
  await expect(host.locator('.animal-photo-card').first().getByLabel('选入公开档案',{exact:true})).not.toBeChecked();
  expect(await page.evaluate(()=>photoFixture.specimen_listings[0].published)).toBe(false);
  expect(await page.evaluate(()=>photoFixture.uploads.every(x=>x.type==='image/webp'&&x.size>0))).toBe(true);
  expect(await page.evaluate(()=>photoFixture.uploads.map(x=>[x.width,x.height]))).toEqual([[1800,900],[640,320],[1800,900],[640,320]]);
  expect(await page.evaluate(()=>photoFixture.specimen_media.every(x=>x.thumbnail_path&&x.thumbnail_path!==x.storage_path))).toBe(true);
  const second=host.locator('.animal-photo-card').nth(1);
  await second.getByLabel('照片说明',{exact:true}).fill('背部特写');
  await second.getByLabel('拍摄日期',{exact:true}).fill('2026-09-30');
  await second.getByLabel('选入公开档案',{exact:true}).check();
  await second.getByRole('button',{name:'保存照片设置',exact:true}).click();
  await expect(host.locator('[data-photo-message]')).toContainText('照片设置已保存');
  expect(await page.evaluate(()=>photoFixture.specimen_media.find(x=>x.caption==='背部特写').is_public)).toBe(true);
  await host.locator('.animal-photo-card').nth(1).getByRole('button',{name:'设为封面',exact:true}).click();
  await expect(host.locator('.animal-photo-card').first().getByLabel('照片说明',{exact:true})).toHaveValue('背部特写');
  const previous=await page.evaluate(()=>photoFixture.specimen_media.find(x=>x.caption==='背部特写').storage_path);
  await host.locator('.animal-photo-card').first().locator('[data-media-replacement]').setInputFiles(file);
  await expect(host.locator('[data-photo-message]')).toContainText('照片已替换');
  expect(await page.evaluate(()=>photoFixture.specimen_media.find(x=>x.caption==='背部特写').storage_path)).not.toBe(previous);
  expect(await page.evaluate(path=>photoFixture.removed.includes(path),previous)).toBe(true);
  expect(await page.evaluate(()=>photoFixture.removed.includes(photoFixture.uploads[3].path))).toBe(true);
  await page.evaluate(()=>{photoFixture.specimen_media.find(x=>x.caption==='背部特写').thumbnail_path=null;});
  await host.getByRole('button',{name:'刷新照片',exact:true}).click();
  await expect(host).toHaveAttribute('aria-busy','false');
  await host.getByRole('button',{name:'补齐缩略图',exact:true}).click();
  await expect(host.locator('[data-photo-message]')).toContainText('已补齐 1 张缩略图');
  expect(await page.evaluate(()=>photoFixture.uploads.at(-1).width)).toBe(640);
  expect(await page.evaluate(()=>photoFixture.specimen_media.find(x=>x.caption==='背部特写').is_public)).toBe(true);
  await expect(page.locator('#editForm [name=notes]')).toHaveValue('尚未保存的个体备注');
  await expect(page.locator('#editModal .modalActions').getByRole('button',{name:'保存',exact:true})).toBeInViewport();
  expect(await page.locator('#editFormFields').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:'artifacts/photo-editor-'+test.info().project.name+'.png'});
  page.once('dialog',d=>d.accept());
  await host.locator('.animal-photo-card').first().getByRole('button',{name:'删除照片',exact:true}).click();
  await expect(host.locator('.animal-photo-card')).toHaveCount(1);
  await expect(host).toHaveAttribute('aria-busy','false');
  await page.evaluate(()=>{photoFixture.failThumbnail=true;});
  await host.locator('[data-photo-files]').setInputFiles(file);
  await host.getByRole('button',{name:'上传照片',exact:true}).click();
  await expect(host.locator('[data-photo-message]')).toContainText('缩略图上传失败');
  expect(await page.evaluate(()=>photoFixture.specimen_media.length)).toBe(1);
  expect(await page.evaluate(()=>photoFixture.removed.includes(photoFixture.uploads.at(-2).path))).toBe(true);
  await page.locator('#editModal').getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.locator('#editModal')).not.toBeVisible();
  expect(await page.evaluate(()=>photoFixture.snakes[0].notes)).toBeUndefined();
  expect(await page.evaluate(()=>photoFixture.specimen_media.length)).toBe(1);
  const nav=page.viewportSize().width<833?'.mobileNav':'.sidebar';
  await page.locator(nav+' [data-page="publishing"]').click();
  await page.locator('#workspacePublishing').getByRole('button',{name:'照片',exact:true}).click();
  await expect(page.locator('#listingPhotoEditor .animal-photo-card')).toHaveCount(1);
  await expect(page.locator('#listingPhotoEditor')).toContainText('未发布，仅内部可见');
  await page.locator('#workspaceDialog').getByRole('button',{name:'关闭',exact:true}).click();
  expect(errors).toEqual([]);
});
