const {test,expect}=require('@playwright/test');
test('all sold animals return across libraries, retry safely, and can be listed again',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/fonts.googleapis.com/**',r=>r.abort());
 await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
 const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'1442399241@qq.com'};
 const animal={sex:'F',series:'测试系列',gene_text:'原始基因',birth_date:'2024-01-01',inventory_library:'stock',origin:'purchased'};
 window.returnFixture={profiles:[{...user,display_name:'suohama',role:'admin',active:true}],snakes:[{...animal,id:'SOLD01',status:'sold'},{...animal,id:'SOLD02',status:'sold',origin:'produced',inventory_library:'nursery'},{...animal,id:'STALE01',status:'active'},{...animal,id:'ACTIVE01',status:'active'}],specimen_listings:[{id:'listing-1',snake_id:'SOLD01',slug:'sold01',title:'原个体',sale_status:'sold',published:true,currency:'CNY'},{id:'listing-3',snake_id:'STALE01',slug:'stale01',title:'残留销售标记',sale_status:'sold',published:true,currency:'CNY'}],calls:[],requests:{},interrupt:true};
 returnFixture.purchase_inquiries=[{id:'sale-1',listing_id:'listing-1',reference:'SALE-OLD',status:'completed',customer_name:'历史客户',contact:'私有联系方式',created_at:'2026-10-01'}];returnFixture.sales_activity=[];
 window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user,access_token:'test'}}})},
 from(table){let filters=[],mode='',values,range=null,cached;return {select(){return this},order(){return this},limit(){return this},range(a,b){range=[a,b];return this},eq(k,v){filters.push([k,v]);return this},insert(v){mode='insert';values=v;return this},update(v){mode='update';values=v;return this},execute(){if(cached)return cached;const list=returnFixture[table]||[],match=r=>filters.every(([k,v])=>r[k]===v);let selected=list.filter(match);if(mode==='insert'){selected=[{id:crypto.randomUUID(),...values}];(returnFixture[table]??=[]).push(...selected);}if(mode==='update')selected.forEach(r=>Object.assign(r,values));const count=selected.length;if(range)selected=selected.slice(range[0],range[1]+1);return cached={data:structuredClone(selected),count,error:null};},maybeSingle(){const r=this.execute();return Promise.resolve({...r,data:r.data[0]||null});},single(){return this.maybeSingle();},then(resolve,reject){return Promise.resolve(this.execute()).then(resolve,reject)}};},
 rpc:async(name,args)=>{if(name==='inventory_sale_states')return {data:returnFixture.snakes.map(s=>({snake_id:s.id,sale_state:s.status==='sold'?'sold':returnFixture.specimen_listings.find(l=>l.snake_id===s.id)?.sale_status==='sold'?'sold':'normal'})),error:null};
 if(name==='return_sold_animals'){returnFixture.calls.push(args);if(returnFixture.requests[args.p_request])return {data:returnFixture.requests[args.p_request],error:null};for(const id of args.p_ids){Object.assign(returnFixture.snakes.find(s=>s.id===id),{status:'active',inventory_library:'stock'});const l=returnFixture.specimen_listings.find(l=>l.snake_id===id);if(l)Object.assign(l,{sale_status:'display',published:false});}returnFixture.purchase_inquiries[0].returned_at='2026-10-14';returnFixture.sales_activity.push({id:1,inquiry_id:'sale-1',action:'returned_to_stock',note:args.p_reason,created_at:'2026-10-14'});const data={returned_ids:args.p_ids,count:args.p_ids.length};returnFixture.requests[args.p_request]=data;if(returnFixture.interrupt){returnFixture.interrupt=false;return {error:{message:'模拟响应中断，请重试'}};}return {data,error:null};}
 return {data:[],error:null};},storage:{from(){return {createSignedUrl:async()=>({data:null})}}}
 })};` }));
 await page.goto('/admin#population');await expect(page.locator('#authGate')).toBeHidden();
 await expect(page.locator('[data-return-all-sold]')).toHaveText('全部已售回库（3）');
 await page.locator('#popLifecycle').selectOption('sold');await page.locator('#popSearch').fill('SOLD01');
 await page.locator('#popRows [data-s="SOLD01"]').click();
 const profile=page.getByRole('complementary',{name:'简略档案'});
 await expect(profile.locator('[data-return-sold="SOLD01"]')).toBeVisible();
 await profile.locator('[data-return-sold="SOLD01"]').click();
 const modal=page.locator('#workflowModal');await expect(modal).toContainText('放回种群库');
 await modal.getByRole('button',{name:'取消',exact:true}).click();
 expect(await page.evaluate(()=>returnFixture.calls.length)).toBe(0);
 await profile.getByRole('button',{name:'关闭简略档案'}).click();
 await page.locator('[data-return-all-sold]').click();await expect(modal).toContainText('将 3 条已售个体放回种群库');
 await modal.locator('[name="reason"]').fill('历史误标，全部回库');
 await page.screenshot({path:'artifacts/sold-return-'+test.info().project.name+'.png'});
 await modal.getByRole('button',{name:'确认回库',exact:true}).click();await expect(modal).toContainText('模拟响应中断');
 await modal.getByRole('button',{name:'确认回库',exact:true}).click();await expect(modal).toBeHidden();
 expect(await page.evaluate(()=>new Set(returnFixture.calls.map(c=>c.p_request)).size)).toBe(1);
 expect(await page.evaluate(()=>returnFixture.calls[0].p_ids.sort())).toEqual(['SOLD01','SOLD02','STALE01']);
 await expect(page.locator('#popLifecycle')).toHaveValue('active');await expect(page.locator('#popLibrary')).toHaveValue('stock');await expect(page.locator('#popSearch')).toHaveValue('');
 await expect(page.locator('#popRows [data-s]')).toHaveCount(4);await expect(page.locator('[data-return-all-sold]')).toBeHidden();
 expect(await page.evaluate(()=>returnFixture.snakes.every(s=>s.status==='active'&&s.inventory_library==='stock'))).toBe(true);
 expect(await page.evaluate(()=>returnFixture.specimen_listings.every(l=>!l.published&&l.sale_status==='display'))).toBe(true);
 await page.locator('#popRows [data-s="SOLD01"]').click();await expect(profile.locator('[data-return-sold]')).toHaveCount(0);
 await profile.getByRole('button',{name:'上架',exact:true}).click();
 const dialog=page.locator('#workspaceDialog');await expect(dialog).toBeVisible();await expect(dialog.locator('[name="sale_status"]')).toHaveValue('available');
 await expect(dialog.locator('[name="published"]')).toBeChecked();
 await dialog.locator('button[type="submit"]').click();await expect(dialog).toBeHidden();
 expect(await page.evaluate(()=>returnFixture.specimen_listings.find(l=>l.snake_id==='SOLD01').sale_status)).toBe('available');
 expect(await page.evaluate(()=>returnFixture.snakes.length)).toBe(4);
 await profile.getByRole('button',{name:'关闭简略档案'}).click();
 await page.evaluate(async()=>{await SuohaWorkspace.load(true);SuohaWorkspace.navigate({page:'sales',id:'sale-1'});});
 await expect(page.locator('#workspaceSales')).toContainText('已回库');
 await page.locator('[data-ws-action="sale-detail"]').click();await expect(dialog).toContainText('已回种群库');await expect(dialog).toContainText('历史误标，全部回库');
 await expect(dialog).toContainText('已成交');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
