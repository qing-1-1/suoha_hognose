const { test, expect } = require('@playwright/test');
const specimen={id:'11111111-1111-4111-8111-111111111111',slug:'test-m01',snake_id:'M01',title:'北极康达 · 测试档案',description:'仅用于自动化测试的档案。',series:'北极',sex:'F',birth:'2025-07',sale_status:'available',asking_price:3500,currency:'CNY',genes:[{id:'conda',name:'康达',state:'visual',probability:1},{id:'lavender',name:'薰衣草',state:'possible_het',probability:.5}],photos:[]};
test.beforeEach(async({page})=>{await page.route('**/fonts.googleapis.com/**',route=>route.abort());await page.route('**/fonts.gstatic.com/**',route=>route.abort());});
test('home, catalog, details and inquiry preserve uncertainty and do not require login',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/.netlify/functions/public-catalog*',route=>route.fulfill({json:{items:[specimen],total:1,page:1,series:['北极']}}));
  let submitted;
  await page.route('**/.netlify/functions/purchase-inquiry',async route=>{submitted=route.request().postDataJSON();await route.fulfill({status:201,json:{reference:'SH-TEST123'}});});
  await page.goto('/');await expect(page.getByRole('heading',{name:/野性有序/})).toBeVisible();
  await expect(page.getByRole('link',{name:/北极康达/})).toBeVisible();
  await page.screenshot({path:`artifacts/home-${test.info().project.name}.png`,fullPage:true,animations:"disabled"});
  await page.getByRole('link',{name:/探索个体档案/}).click();
  await expect(page).toHaveURL(/collection/);await page.getByRole('searchbox').fill('M01');await page.getByRole('button',{name:'筛选',exact:true}).click();
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
  await page.screenshot({path:`artifacts/admin-login-${test.info().project.name}.png`,fullPage:true,animations:"disabled"});
});

test('authenticated workspace loads and publishing and husbandry forms work',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const snakes=[{id:'M01',series:'北极',sex:'F',gene_text:'北极康达',birth_date:'2023-07-01',mature_date:'2025-12-01',status:'active',price:3500,strategic_score:85,investor:'suohama',origin:'purchased'},{id:'M02',series:'北极',sex:'M',gene_text:'康达',birth_date:'2023-07-01',mature_date:'2025-12-01',status:'active',price:2000,strategic_score:80,investor:'suohama',origin:'purchased'}];
  const fixture={snakes,breeding_routes:[{id:'flagship',name:'测试路线',status:'active'}],route_nodes:[{id:'node-1',route_id:'flagship',node_type:'snake',snake_id:'M01',x:250,y:250}],genes:[{id:'conda',name_zh:'康达',inheritance_type:'incomplete_dominant',locus:'conda'}],snake_genes:snakes.map(s=>({snake_id:s.id,gene_id:'conda',state:'visual',probability:1}))};
  await page.route('**/cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:`
    const fixture=${JSON.stringify(fixture)};const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'1442399241@qq.com'};
    window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user,access_token:'test'}}})},from(table){const chain={select(){return this},order(){return this},limit(){return this},range(){return this},eq(){return this},insert(row){(fixture[table]??=[]).push({...row,id:row.id||crypto.randomUUID()});return this},maybeSingle:async()=>({data:{...user,display_name:'suohama',role:'admin',active:true}}),then(resolve){resolve({data:fixture[table]||[],count:(fixture[table]||[]).length,error:null})}};return chain;},rpc:async()=>({data:1,error:null})})};
  `}));
  await page.goto('/admin');await expect(page.locator('#authGate')).toBeHidden();await expect(page.getByRole('heading',{name:'工作概览',exact:true})).toBeVisible();
  await page.screenshot({path:`artifacts/workspace-${test.info().project.name}.png`,fullPage:true,animations:"disabled"});
  await page.locator('.page.active [data-ws-action="publishing"]').click();await expect(page.getByRole('heading',{name:'公开展示',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'新增展示档案',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByLabel('公开标题',{exact:true}).fill('北极康达测试');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator('#workspacePublishing')).toContainText('北极康达测试');
  const nav=page.viewportSize().width<833?'.mobileNav':'.sidebar';await page.locator(`${nav} [data-page="records"]`).click();await page.getByRole('button',{name:'新增记录',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('记录实际配种');await page.getByRole('button',{name:'取消',exact:true}).click();
  await page.locator(`${nav} [data-page="lab"]`).click();
  await page.locator('#labF').selectOption('M01');
  await page.getByRole('button',{name:'加入配对比较',exact:true}).click();await expect(page.locator('#pairComparisons')).toContainText('M01 × M02');
  await page.getByRole('button',{name:'加入年度计划',exact:true}).click();await expect(page.locator('#editForm [name=female_snake_id]')).toHaveValue('M01');await expect(page.locator('#editForm [name=male_snake_id]')).toHaveValue('M02');await page.keyboard.press('Escape');
  await page.locator(`${nav} [data-page="investment"]`).click();await page.getByRole('button',{name:'实际支出台账',exact:true}).click();await expect(page.locator('#investmentLedger')).toBeVisible();await page.getByRole('button',{name:'采购与投资决策',exact:true}).click();await expect(page.locator('#investmentLedger')).toBeHidden();
  await page.locator(`${nav} [data-page="routes"]`).click();await page.locator('#routeEditBtn').click();
  const node=page.locator('.routeNode[data-node="M01"]');const before=await node.getAttribute('transform');
  const box=await node.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+25,{steps:5});await page.mouse.up();
  await expect(page.locator('#routeSaveState')).toHaveText('已保存');await expect(node).not.toHaveAttribute('transform',before);const after=await node.getAttribute('transform');
  await page.locator('#routeUndo').click();await expect(node).toHaveAttribute('transform',before);await page.locator('#routeRedo').click();await expect(node).toHaveAttribute('transform',after);
  await page.goto('/admin?snake=M01#individual');await expect(page.locator('#workspaceIndividual')).toContainText('结构化基因');await expect(page.locator('#workspaceIndividual')).toContainText('M01');
  expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
