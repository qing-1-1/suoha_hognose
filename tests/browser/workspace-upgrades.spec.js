const {test,expect}=require('@playwright/test');
test('cards, clutch groups, retry-safe batch registration and private growth records work',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/fonts.googleapis.com/**',r=>r.abort());
 await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
 const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'1442399241@qq.com'};
 const mother={id:'MOTHER',sex:'F',series:'测试系列 / 白化',series_names:['测试系列','白化'],gene_text:'母本',status:'active',birth_date:'2024-01-01',inventory_library:'stock'};
 window.upgradeFixture={profiles:[{...user,display_name:'suohama',role:'admin',active:true}],snakes:[mother,{...mother,id:'FATHER',sex:'M'},...Array.from({length:28},(_,i)=>({...mother,id:'S'+String(i).padStart(2,'0')})),{...mother,id:'BABY01',sex:'U',origin:'produced',inventory_library:'nursery',clutch_id:1,dam_id:'MOTHER',sire_id:'FATHER',birth_date:'2026-06-01'}],breeding_events:[{id:1,female_snake_id:'MOTHER',male_snake_id:'FATHER',status:'successful',paired_at:'2026-02-01'}],clutches:[{id:1,clutch_code:'TEST-CLUTCH',breeding_event_id:1,female_snake_id:'MOTHER',male_snake_id:'FATHER',status:'hatched',laid_date:'2026-04-01',hatched_count:4,hatch_start_date:'2026-06-01',hatch_end_date:'2026-06-03'}],snake_measurements:[{id:'w1',snake_id:'BABY01',record_kind:'measurement',measured_at:'2026-06-03',weight_g:7,created_at:'2026-06-03'},{id:'w2',snake_id:'BABY01',record_kind:'measurement',measured_at:'2026-07-03',weight_g:10,created_at:'2026-07-03'}],specimen_listings:[],specimen_media:[],inventory_transfers:[],batchCalls:[],batches:{}};
 window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user,access_token:'test'}}})},
 from(table){let filters=[],mode='',values,range=null,cached;const q={select(){return this},order(){return this},limit(){return this},range(a,b){range=[a,b];return this},eq(k,v){filters.push([k,v]);return this},insert(v){mode='insert';values=v;return this},update(v){mode='update';values=v;return this},delete(){mode='delete';return this},execute(){if(cached)return cached;const list=upgradeFixture[table]||[],match=r=>filters.every(([k,v])=>r[k]===v);let selected=list.filter(match);if(mode==='insert'){selected=[{id:crypto.randomUUID(),created_at:new Date().toISOString(),...values}];(upgradeFixture[table]??=[]).push(...selected);}if(mode==='update')selected.forEach(r=>Object.assign(r,values));if(mode==='delete')upgradeFixture[table]=list.filter(r=>!match(r));const count=selected.length;if(range)selected=selected.slice(range[0],range[1]+1);return cached={data:structuredClone(selected),count,error:null};},maybeSingle(){const r=this.execute();return Promise.resolve({...r,data:r.data[0]||null});},single(){return this.maybeSingle();},then(resolve,reject){return Promise.resolve(this.execute()).then(resolve,reject)}};return q;},
 rpc:async(name,args)=>{if(name==='delete_nursery_animal'){upgradeFixture.snakes=upgradeFixture.snakes.filter(s=>s.id!==args.p_id);return {data:null,error:null};}if(name==='inventory_sale_states')return {data:upgradeFixture.snakes.map(s=>({snake_id:s.id,sale_state:'normal'})),error:null};if(name==='breeding_calendar')return {data:[],error:null};if(name==='register_hatchlings_batch'){upgradeFixture.batchCalls.push(args.p_request);if(upgradeFixture.batches[args.p_request])return {data:upgradeFixture.batches[args.p_request],error:null};const ids=args.p_rows.map(row=>row.id);for(const row of args.p_rows)upgradeFixture.snakes.push({id:row.id,sex:row.sex,birth_date:row.birth,series:row.series_names.join(" / "),series_names:row.series_names,gene_text:row.gene_text,clutch_id:args.p_clutch,origin:'produced',inventory_library:'nursery',status:'active',dam_id:'MOTHER',sire_id:'FATHER'});upgradeFixture.batches[args.p_request]=ids;return {error:{message:'模拟响应中断，请重试'}};}if(name==='retain_inventory_animal'){upgradeFixture.snakes.find(s=>s.id===args.p_id).inventory_library='stock';upgradeFixture.inventory_transfers.push({id:1,individual_id:args.p_id,to_library:'stock',assessment:args.p_assessment,created_at:'2026-09-30'});return {data:null,error:null};}return {data:[],error:null};},storage:{from(){return {createSignedUrl:async()=>({data:{signedUrl:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50"><rect width="50" height="50" fill="tan"/></svg>'}})}}}
 })};` }));
 await page.goto('/admin#population');await expect(page.locator('#authGate')).toBeHidden();
 const nav=page.viewportSize().width<833?'.mobileNav':'.sidebar';const go=async p=>{const target=page.locator(nav+' [data-page="'+p+'"]');if(nav==='.mobileNav'&&!await target.isVisible())await page.locator('#mobileMore').click();await target.click();};
 await go('population');
 await page.locator('#popRows [data-s="MOTHER"]').click();
 const profile=page.getByRole('complementary',{name:'简略档案'});
 await expect(profile.getByRole('button',{name:'关闭简略档案'})).toBeInViewport();
 const layout=await page.evaluate(()=>{const panel=document.getElementById('drawer').getBoundingClientRect(),header=document.querySelector('.topbar').getBoundingClientRect(),content=document.querySelector('.main .content').getBoundingClientRect();return innerWidth>760?Math.abs(content.right-panel.left)<1&&Math.abs(header.right-panel.right)<1&&Math.abs(header.bottom-panel.top)<1&&getComputedStyle(document.querySelector('.content')).paddingRight==='0px':content.top>=panel.bottom;});expect(layout).toBe(true);
 await page.screenshot({path:`artifacts/profile-panel-${test.info().project.name}.png`});
 await profile.getByRole('button',{name:'关闭简略档案'}).click();await expect(profile).toBeHidden();
 await expect(page.locator('.main')).not.toHaveClass(/has-profile/);
 await page.getByRole('button',{name:'卡片',exact:true}).click();
 await expect(page.locator('.stock-profile-card:visible')).toHaveCount(24);
 await page.locator('[data-page-control="stock-cards"]').getByRole('button',{name:'下一页',exact:true}).click();
 await expect(page.locator('.stock-profile-card:visible')).toHaveCount(6);
 await page.screenshot({path:`artifacts/stock-cards-${test.info().project.name}.png`});
 await go('nursery');
 await expect(page.locator('.nursery-clutch-group')).toContainText('未登记 3');
 await page.getByRole('button',{name:'批量登记幼体',exact:true}).click();
 const batch=page.locator('#upgradeDialog');await expect(batch.locator('[data-batch-row]')).toHaveCount(3);
 await batch.getByRole('button',{name:'确认整批入库',exact:true}).click();await expect(batch.getByRole('status')).toContainText('模拟响应中断');
 await batch.getByRole('button',{name:'确认整批入库',exact:true}).click();await expect(batch).toBeHidden();
 expect(await page.evaluate(()=>new Set(upgradeFixture.batchCalls).size)).toBe(1);expect(await page.evaluate(()=>upgradeFixture.snakes.filter(s=>s.clutch_id===1&&s.id!=='BABY01').every(s=>s.series_names.length===2))).toBe(true);
 await expect(page.locator('.nursery-card')).toHaveCount(4);await expect(page.locator('.nursery-clutch-group')).toContainText('未登记 0');
 const baby=page.locator('.nursery-card').filter({has:page.locator('[data-nursery-open="BABY01"]')});
 await baby.getByRole('button',{name:'留存',exact:true}).click();await batch.getByLabel('留存评估（可选）').fill('持续观察体重，保留育种方向。');await batch.getByRole('button',{name:'确认留存',exact:true}).click();await expect(batch).toBeHidden();
 await baby.getByRole('button',{name:'查看档案 ↗',exact:true}).click();await expect(page.locator('#retentionHistory')).toContainText('持续观察体重');
 await expect(page.locator('.weight-trend')).toContainText('2 次测量');
 await page.getByRole('button',{name:'新增成长记录',exact:true}).click();await batch.getByRole('combobox',{name:'记录类型',exact:true}).selectOption('shedding');await batch.getByRole('textbox',{name:'观察与备注',exact:true}).fill('记录本次完整蜕皮，日期已核对。');await batch.getByRole('button',{name:'保存',exact:true}).click();await expect(batch).toBeHidden();
 await page.getByRole('combobox',{name:'成长记录类型',exact:true}).selectOption('shedding');await expect(page.locator('.growth-event')).toHaveCount(1);
 await page.locator('.growth-event').getByRole('button',{name:'编辑记录',exact:true}).click();await batch.getByRole('textbox',{name:'观察与备注',exact:true}).fill('更正后的观察记录');await batch.getByRole('button',{name:'保存',exact:true}).click();await expect(batch).toBeHidden();
 await expect(page.locator('.growth-event')).toContainText('更正后的观察记录');
 await page.screenshot({path:`artifacts/growth-timeline-${test.info().project.name}.png`,fullPage:true});
 await go('nursery');
 const removedId=await page.locator('.nursery-card [data-nursery-delete]').last().getAttribute('data-nursery-delete');
 await page.locator('.nursery-card [data-nursery-delete]').last().click();await expect(page.locator('#workflowModal')).toContainText('删除子代档案');
 await page.locator('#workflowModal').getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(id=>upgradeFixture.snakes.some(s=>s.id===id),removedId)).toBe(true);
 await page.locator('.nursery-card [data-nursery-delete]').last().click();await page.locator('#workflowModal').getByRole('button',{name:'确认删除子代',exact:true}).click();
 await expect(page.locator('.nursery-card')).toHaveCount(3);expect(await page.evaluate(id=>upgradeFixture.snakes.some(s=>s.id===id),removedId)).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
