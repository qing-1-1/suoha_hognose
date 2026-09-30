const { test, expect } = require('@playwright/test');
const specimen={id:'11111111-1111-4111-8111-111111111111',slug:'test-m01',snake_id:'M01',title:'北极康达 · 测试档案',description:'仅用于自动化测试的档案。',series:'北极',sex:'F',birth:'2025-07',sale_status:'available',asking_price:3500,currency:'CNY',genes:[{id:'conda',name:'康达',state:'visual',probability:1},{id:'lavender',name:'薰衣草',state:'possible_het',probability:.5}],photos:[]};
test.beforeEach(async({page})=>{await page.route('**/fonts.googleapis.com/**',route=>route.abort());await page.route('**/fonts.gstatic.com/**',route=>route.abort());});
test('home, catalog, details and inquiry preserve uncertainty and do not require login',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/.netlify/functions/public-catalog*',route=>route.fulfill({json:{items:[specimen],total:1,page:1,series:['北极']}}));
  let submitted;
  await page.route('**/.netlify/functions/purchase-inquiry',async route=>{submitted=route.request().postDataJSON();await route.fulfill({status:201,json:{reference:'SH-TEST123'}});});
  await page.goto('/');await expect(page.getByRole('heading',{name:/野性有序/})).toBeVisible();
  await expect(page.locator('#homeView .specimen-card')).toHaveCount(0);await expect(page.locator('#fieldCanvas')).toHaveAttribute('data-art-ready','true');
  await page.screenshot({path:`artifacts/home-${test.info().project.name}.png`,fullPage:true,animations:"disabled"});
  await page.getByRole('link',{name:/进入商店/}).click();
  await expect(page).toHaveURL(/collection/);if(page.viewportSize().width<=700)await page.getByRole('button',{name:/筛选与排序/}).click();await page.getByRole('searchbox').fill('M01');await page.getByRole('button',{name:'筛选',exact:true}).click();
  await expect(page).toHaveURL(/q=M01/);await page.getByRole('link',{name:/北极康达/}).click();
  await expect(page).toHaveURL(/specimens\/test-m01/);await expect(page.getByText('薰衣草 · 可能携带 50%',{exact:true})).toBeVisible();await expect(page.locator('#detailView').getByText('2025-07',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/咨询购买/}).click();await page.getByLabel('你的称呼').fill('测试客户');await page.getByLabel('联系方式',{exact:true}).fill('test@example.com');await page.getByRole('checkbox').check();await page.getByRole('button',{name:/提交购买意向/}).click();
  await expect(page.getByRole('status')).toContainText('SH-TEST123');expect(submitted.consent).toBe(true);expect(submitted.listing_id).toBe(specimen.id);expect(submitted.request_id).toMatch(/^[a-f0-9-]{36}$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('unavailable catalog shows honest retry state, with no fabricated animals',async({page})=>{
  await page.route('**/.netlify/functions/public-catalog*',route=>route.fulfill({status:503,json:{error:'Unavailable'}}));
  await page.goto('/collection');await expect(page.getByRole('heading',{name:'档案暂时无法连接。'})).toBeVisible();await expect(page.getByRole('button',{name:/重新连接/})).toBeVisible();await expect(page.locator('.specimen-card')).toHaveCount(0);
});
test('private workspace remains gated and contains no public customer login',async({page})=>{
  await page.route('**/cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};'}));
  await page.goto('/admin');await expect(page.getByLabel('邮箱或用户名',{exact:true})).toBeVisible();
  await expect(page.locator('#gateEmail')).toBeVisible();await expect(page.locator('.main')).toBeHidden();
  await expect(page.locator('[data-room-art] svg')).toBeVisible();
  await page.getByLabel('密码',{exact:true}).fill('example-password');await page.getByRole('button',{name:'显示密码',exact:true}).click();await expect(page.locator('#gatePassword')).toHaveAttribute('type','text');await expect(page.locator('#gatePassword')).toHaveValue('example-password');await page.getByRole('button',{name:'隐藏密码',exact:true}).click();await expect(page.locator('#gatePassword')).toHaveAttribute('type','password');await page.locator('#gatePassword').clear();
  expect(await page.getByRole('button',{name:'登录系统',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/admin-login-${test.info().project.name}.png`,fullPage:true,animations:"disabled"});
});

test('authenticated workspace loads and publishing and husbandry forms work',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const snakes=[{id:'M01',series:'北极',sex:'F',gene_text:'北极康达',birth_date:'2023-07-01',mature_date:'2025-12-01',status:'active',price:3500,strategic_score:85,investor:'suohama',origin:'purchased'},{id:'M02',series:'北极',sex:'M',gene_text:'康达',birth_date:'2023-07-01',mature_date:'2025-12-01',status:'active',price:2000,strategic_score:80,investor:'suohama',origin:'purchased'}];
  snakes.push({id:'M03',series:'北极',sex:'U',gene_text:'自繁幼体测试',birth_date:'2026-09-01',status:'active',origin:'produced',inventory_library:'nursery',dam_id:'M01',sire_id:'M02',clutch_id:1});
  const fixture={snakes,analysis_runs:[{id:1,analysis_type:'pairing',status:'succeeded',created_at:'2026-09-29',source_snapshot:{female:{id:'M01'},male:{id:'M02'}},model_name:'test'}],ai_conversations:[{id:1,analysis_run_id:1,analysis_type:'pairing',title:'测试配对对话'}],ai_conversation_messages:[{id:1,conversation_id:1,role:'assistant',content:'这是测试分析，基因仍需核实。'}],breeding_routes:[{id:'flagship',name:'测试路线',status:'active'}],route_nodes:[{id:'node-1',route_id:'flagship',node_type:'snake',snake_id:'M01',x:250,y:250}],genes:[{id:'conda',name_zh:'康达',inheritance_type:'incomplete_dominant',locus:'conda'}],snake_genes:snakes.map(s=>({snake_id:s.id,gene_id:'conda',state:'visual',probability:1}))};
  await page.route('**/cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:`
    const fixture=${JSON.stringify(fixture)};const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'1442399241@qq.com'};
    window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user,access_token:'test'}}})},from(table){const chain={select(){return this},order(){return this},limit(){return this},range(){return this},eq(key,value){if(this.patch){for(const row of fixture[table]||[])if(row[key]===value)Object.assign(row,this.patch);}return this},update(row){this.patch=row;return this},insert(row){(fixture[table]??=[]).push({...row,id:row.id||(table==='annual_breeding_plans'?fixture[table].length+1:crypto.randomUUID()),...(table==='annual_breeding_plans'?{review_status:'approved'}:{})});return this},maybeSingle:async()=>({data:{...user,display_name:'suohama',role:'admin',active:true}}),then(resolve){resolve({data:fixture[table]||[],count:(fixture[table]||[]).length,error:null})}};return chain;},rpc:async(name,args)=>{if(name==='breeding_calendar')return {data:(fixture.annual_breeding_plans||[]).map(p=>({...p,title:p.project_name,year:p.plan_year,female:p.female_snake_id,male:p.male_snake_id,events:(fixture.breeding_events||[]).filter(e=>e.plan_id===p.id).map(e=>({id:e.id,date:e.paired_at,status:e.status})),clutches:(fixture.clutches||[]).filter(c=>(fixture.breeding_events||[]).some(e=>e.id===c.breeding_event_id&&e.plan_id===p.id)).map(c=>({id:c.id,code:c.clutch_code,laid:c.laid_date,hatch_start:c.hatch_start_date,hatch_end:c.hatch_end_date,expected_hatch:c.expected_hatch_date,status:c.status}))})),error:null};if(name==='record_breeding_event'){const row={id:args.p_id||1,plan_id:args.p_plan_id,female_snake_id:args.p_female,male_snake_id:args.p_male,paired_at:args.p_date,status:args.p_status};(fixture.breeding_events??=[]).push(row);return {data:row.id,error:null};}if(name==='record_clutch_dates'){const row={id:args.p_id||1,breeding_event_id:args.p_event_id,clutch_code:args.p_code,laid_date:args.p_date,hatch_start_date:args.p_hatch_start,hatch_end_date:args.p_hatch_end,expected_hatch_date:args.p_expected_hatch,status:args.p_status,egg_count:args.p_eggs,hatched_count:args.p_hatched};row.female_snake_id='M01';row.male_snake_id='M02';fixture.clutches=(fixture.clutches||[]).filter(c=>c.id!==row.id);fixture.clutches.push(row);return {data:row.id,error:null};} if(name==='register_hatchling'){fixture.snakes.push({id:args.p_id,sex:args.p_sex,birth_date:args.p_birth,series:args.p_series,gene_text:args.p_gene_text,clutch_id:args.p_clutch,origin:'produced',inventory_library:'nursery',status:'active',dam_id:'M01',sire_id:'M02'});return {data:args.p_id,error:null};}if(name==='inventory_sale_states')return {data:fixture.snakes.map(s=>{const listing=(fixture.specimen_listings||[]).find(l=>l.snake_id===s.id);return {snake_id:s.id,sale_state:listing?.published&&listing.sale_status==='available'?'available':'normal'};}),error:null};if(name==='delete_specimen_listing'){const l=fixture.specimen_listings.find(l=>l.id===args.p_id);l.deleted_at='2026-09-29';l.published=false;l.sale_status='display';return {error:null};}if(name==='transfer_inventory_animal'||name==='retain_inventory_animal'){fixture.snakes.find(s=>s.id===args.p_id).inventory_library=args.p_target||'stock';return {error:null};}return {data:1,error:null};}})};
  `}));
  await page.goto('/admin');await expect(page.locator('#authGate')).toBeHidden();await expect(page.getByRole('heading',{name:'工作概览',exact:true})).toBeVisible();
  await page.screenshot({path:`artifacts/workspace-${test.info().project.name}.png`,fullPage:true,animations:"disabled"});
  await page.locator('.page.active [data-ws-action="publishing"]').click();await expect(page.getByRole('heading',{name:'公开展示',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'新增展示档案',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('从哪个库选择',{exact:true}).selectOption('nursery');await expect(page.getByLabel('真实个体',{exact:true})).toHaveValue('M03');await expect(page.locator('#listingAnimalPreview')).toContainText('2026-09-01');await expect(page.locator('#listingAnimalPreview')).toContainText('暂无照片');expect(await page.getByRole('button',{name:'保存',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})).toBe(true);await page.screenshot({path:`artifacts/listing-form-${test.info().project.name}.png`,animations:'disabled'});await page.getByLabel('从哪个库选择',{exact:true}).selectOption('stock');await page.getByLabel('公开标题',{exact:true}).fill('北极康达测试');await page.getByLabel('销售状态',{exact:true}).selectOption('available');await page.getByLabel('公开发布（未勾选为私有草稿）').check();await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator('#workspacePublishing')).toContainText('北极康达测试');
  const nav=page.viewportSize().width<833?'.mobileNav':'.sidebar';await page.locator(`${nav} [data-page="records"]`).click();await page.getByRole('button',{name:'新增记录',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('记录实际配种');await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator(`${nav} [data-page="population"]`).click();await expect(page.locator('#popRows')).not.toContainText('M03');await expect(page.locator('#popRows [data-s="M01"]')).toContainText('待出售');
  await page.locator(`${nav} [data-page="publishing"]`).click();await page.locator('#workspacePublishing').getByRole('button',{name:'编辑',exact:true}).click();await page.getByLabel('销售状态',{exact:true}).selectOption('display');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
  await page.locator(`${nav} [data-page="population"]`).click();await expect(page.locator('#popRows [data-s="M01"]')).toContainText('正常');
  await page.locator(`${nav} [data-page="publishing"]`).click();await page.locator('#workspacePublishing').getByRole('button',{name:'删除',exact:true}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();await expect(page.locator('#workspacePublishing tbody tr')).toHaveCount(0);
  await page.locator(`${nav} [data-page="population"]`).click();await expect(page.locator('#popRows [data-s="M01"]')).toHaveCount(1);
  await page.locator(`${nav} [data-page="nursery"]`).click();await expect(page.locator('#nurseryWorkspace')).toContainText('M03');await page.screenshot({path:`artifacts/nursery-${test.info().project.name}.png`,fullPage:true,animations:"disabled"});
  await page.getByRole('button',{name:'从窝次登记幼体',exact:true}).click();await expect(page.locator('[data-record-tab="clutches"]')).toHaveClass('active');await page.locator(`${nav} [data-page="nursery"]`).click();
  await page.getByRole('button',{name:'留存',exact:true}).click();await page.getByRole('button',{name:'确认留存',exact:true}).click();await expect(page.locator('.nursery-card')).toHaveCount(1);await expect(page.locator('.nursery-card')).toContainText('已留存');
  await page.getByRole('button',{name:'上架',exact:true}).click();await expect(page.getByLabel('真实个体',{exact:true})).toHaveValue('M03');await expect(page.locator('#listingAnimalPreview')).toContainText('2026-09-01');await expect(page.locator('#listingAnimalPreview')).toContainText('暂无照片');expect(await page.getByRole('button',{name:'保存',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})).toBe(true);await page.screenshot({path:`artifacts/listing-form-${test.info().project.name}.png`,animations:'disabled'});await expect(page.getByLabel('销售状态',{exact:true})).toHaveValue('available');await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator(`${nav} [data-page="population"]`).click();await expect(page.locator('#popRows [data-s="M03"]')).toHaveCount(1);
  await page.locator(`${nav} [data-page="lab"]`).click();
  await page.locator('#labF').selectOption('M01');
  const chatButton=page.locator('#pairingAi .aiOpenChatBtn');await expect(chatButton).toBeVisible();
  const contrast=await chatButton.evaluate(el=>{const style=getComputedStyle(el),lum=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};const a=lum(style.color),b=lum(style.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.locator('#pairingAi').screenshot({path:`artifacts/ai-panel-${test.info().project.name}.png`,animations:'disabled'});
  await chatButton.click();await expect(page.locator('#aiChatMessages')).toContainText('这是测试分析');
  await page.evaluate(()=>{for(let i=0;i<20;i++)REMOTE_RAW.conversationMessages.push({id:100+i,conversation_id:1,role:'assistant',content:'成长记录测试消息 '+i+'。请确认实际观察后再记录。'});renderAiChat(true);});
  await page.locator('#aiChatMessages').evaluate(el=>el.scrollTop=100);
  await page.evaluate(()=>{REMOTE_RAW.conversationMessages.push({id:999,conversation_id:1,role:'assistant',content:'新的回复'});renderAiChat();});
  await expect.poll(()=>page.locator('#aiChatMessages').evaluate(el=>el.scrollTop)).toBe(100);await page.getByRole('button',{name:'查看最新消息 ↓',exact:true}).click();await expect(page.locator('#aiChatLatest')).toBeHidden();await page.keyboard.press('Escape');

  await page.getByRole('button',{name:'加入配对比较',exact:true}).click();await expect(page.locator('#pairComparisons')).toContainText('M01 × M02');
  await page.getByRole('button',{name:'加入年度计划',exact:true}).click();await expect(page.locator('#editForm [name=female_snake_id]')).toHaveValue('M01');await expect(page.locator('#editForm [name=male_snake_id]')).toHaveValue('M02');await page.keyboard.press('Escape');
  await page.locator(`${nav} [data-page="investment"]`).click();await page.getByRole('button',{name:'实际支出台账',exact:true}).click();await expect(page.locator('#investmentLedger')).toBeVisible();await page.getByRole('button',{name:'采购与投资决策',exact:true}).click();await expect(page.locator('#investmentLedger')).toBeHidden();
  await page.locator(`${nav} [data-page="routes"]`).click();await page.locator('#routeEditBtn').click();
  const node=page.locator('.routeNode[data-node="M01"]');const before=await node.getAttribute('transform');
  const box=await node.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+25,{steps:5});await page.mouse.up();
  await expect(page.locator('#routeSaveState')).toHaveText('已保存');await expect(node).not.toHaveAttribute('transform',before);const after=await node.getAttribute('transform');
  await page.locator('#routeUndo').click();await expect(node).toHaveAttribute('transform',before);await page.locator('#routeRedo').click();await expect(node).toHaveAttribute('transform',after);
  await page.goto('/admin?snake=M01#individual');await expect(page.locator('#workspaceIndividual')).toContainText('结构化基因');await expect(page.locator('#workspaceIndividual')).toContainText('M01');await page.screenshot({path:`artifacts/individual-${test.info().project.name}.png`,animations:'disabled'});
  await page.locator(`${nav} [data-page="production"]`).click();await page.getByRole('button',{name:'新增繁育计划',exact:true}).click();
  const today=await page.evaluate(()=>new Date().toLocaleDateString('en-CA'));
  await page.locator('#editForm [name=project_name]').fill('手动繁育日程测试');await page.locator('#editForm [name=female_snake_id]').selectOption('M01');await page.locator('#editForm [name=male_snake_id]').selectOption('M02');
  for(const name of ['expected_pairing_date','expected_laying_date','expected_hatching_date'])await page.locator(`#editForm [name=${name}]`).fill(today);
  await page.locator('#editForm').getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('#editModal')).toBeHidden();await expect(page.locator('#breedingCalendar')).toContainText('手动繁育日程测试');
  await page.locator(`${nav} [data-page="overview"]`).click();await expect(page.getByRole('dialog',{name:/繁育日程提醒/})).toBeVisible();await expect(page.getByRole('dialog',{name:/繁育日程提醒/})).toContainText('今天到期');await page.screenshot({path:`artifacts/breeding-reminder-${test.info().project.name}.png`,animations:'disabled'});
  await page.getByRole('button',{name:'今天不再提醒',exact:true}).click();await page.locator(`${nav} [data-page="production"]`).click();await page.locator(`${nav} [data-page="overview"]`).click();await expect(page.locator('.breeding-reminder-dialog')).not.toBeVisible();
  await page.locator(`${nav} [data-page="production"]`).click();await page.locator('#breedingCalendar').getByRole('button',{name:'记录交配',exact:true}).click();await expect(page.getByLabel('母蛇',{exact:true})).toHaveValue('M01');await page.getByLabel('事件状态',{exact:true}).selectOption('successful');await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator('#breedingCalendar')).toContainText('交配成功');
  await page.locator('#breedingCalendar').getByRole('button',{name:'记录产蛋',exact:true}).click();await page.getByLabel('总蛋数',{exact:true}).fill('2');await page.getByLabel('受精蛋数（未确认留空）',{exact:true}).fill('2');await page.getByLabel('已孵化数（幼体入库前必填）',{exact:true}).fill('2');const future=new Date();future.setDate(future.getDate()+60);const futureDate=future.toLocaleDateString('en-CA');await page.getByLabel('预计出壳日期（可选未来）',{exact:true}).fill(futureDate);expect(await page.getByLabel('预计出壳日期（可选未来）',{exact:true}).evaluate(el=>el.validity.valid)).toBe(true);await page.getByLabel('实际开始出壳日期',{exact:true}).fill(today);await page.getByLabel('实际结束出壳日期（未结束留空）',{exact:true}).fill(today);await page.getByLabel('窝次状态',{exact:true}).selectOption('hatched');await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator('#breedingCalendar')).toContainText('开始出壳 '+today);await expect(page.locator('#breedingCalendar .calendar-milestones .recorded')).toHaveCount(3);await page.locator('#breedingCalendar').screenshot({path:`artifacts/calendar-${test.info().project.name}.png`,animations:'disabled'});
  await page.locator(`${nav} [data-page="overview"]`).click();await expect(page.locator('#breedingReminderSummary')).toContainText('暂无临近');
  await page.evaluate(async()=>{fixture.clutches[0].hatched_count=null;await SuohaWorkspace.load(true);SuohaWorkspace.showClutches();});
  await page.getByRole('button',{name:'幼体入库',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('请先填写本窝实际已孵化数');
  await page.getByLabel('已孵化数（幼体入库前必填）',{exact:true}).fill('2');await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button',{name:'幼体入库',exact:true}).click();await page.getByLabel('个体编号',{exact:true}).fill('TEST01');await page.getByRole('dialog').getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
  await page.locator(`${nav} [data-page="nursery"]`).click();await expect(page.locator('.nursery-card').filter({hasText:'TEST01'})).toContainText('待确认');
  expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('failed public photos show a readable fallback and a working alternative',async({page})=>{
  const photos=[{url:'/.netlify/functions/specimen-media?path=bad/photo.webp',caption:'暂不可读'},{url:'/.netlify/functions/specimen-media?path=good/photo.webp',caption:'可读取照片'}];
  await page.route('**/.netlify/functions/public-catalog*',route=>route.fulfill({json:{items:[{...specimen,photos}],total:1}}));
  await page.route('**/.netlify/functions/specimen-media**',route=>route.request().url().includes('bad/')?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="green"/></svg>'}));
  await page.goto('/specimens/test-m01');
  await expect(page.locator('#detailPhoto')).toContainText('照片暂时无法加载');await expect(page.locator('#detailPhoto')).toBeDisabled();
  await page.getByRole('button',{name:'照片 2',exact:true}).click();await expect(page.locator('#detailPhoto')).toBeEnabled();
  await expect.poll(()=>page.locator('#detailPhoto img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
  await page.locator('#detailPhoto').click();await expect(page.locator('#lightbox')).toBeVisible();
});


test('reduced motion keeps the room illustration static and small login screens scroll',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};'}));
  await page.setViewportSize({width:360,height:560});await page.goto('/admin');
  const art=page.locator('[data-room-art]');await expect(art.locator('svg')).toBeVisible();
  await expect(art).toHaveAttribute('data-motion','paused');
  expect(await art.locator('.room-light').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.mouse.move(280,150);await page.getByLabel('邮箱或用户名',{exact:true}).fill('test');
  await page.getByRole('button',{name:'登录系统',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'登录系统',exact:true})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('breeding stock is display-only in cards and detail even if it has a stored asking price',async({page})=>{
  await page.route('**/.netlify/functions/public-catalog*',r=>r.fulfill({json:{items:[{...specimen,sale_status:'display'}],total:1,page:1,series:['北极']}}));
  await page.goto('/collection?status=display');
  const card=page.locator('.specimen-card');
  await expect(card).toContainText('仅展示 · 不出售');
  await expect(card).not.toContainText('3,500');
  await card.click();
  await expect(page.locator('.detail-price')).toHaveText('留种展示 · 不出售');
  await expect(page.locator('.detail-purchase')).toContainText('留种个体仅作展示，不提供售卖或预留。');
  await expect(page.locator('#openInquiry')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/咨询购买|提交候补咨询/})).toHaveCount(0);
  await page.getByRole('link',{name:'探索其他在售个体'}).click();
  await expect(page).toHaveURL(/collection\?status=available$/);
});
