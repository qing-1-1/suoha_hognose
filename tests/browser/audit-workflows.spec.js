const {test,expect}=require('@playwright/test'),fs=require('node:fs');
test('audit fixes keep population, plans, review states and task filters consistent',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=fs.readFileSync('tests/browser/snake-entry.spec.js','utf8').match(/body:`([\s\S]*?)`\}\)\);/)[1];
 await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:fixture}));await page.route('**/fonts.googleapis.com/**',r=>r.abort());
 await page.goto('/admin');await expect(page.locator('#authGate')).toBeHidden();
 await page.evaluate(async()=>{
  const common={series:'Red',series_names:['Red'],gene_text:'已记录',birth_date:'2020-01-01',mature_date:'2022-01-01',inventory_library:'stock'};
  fixture.snakes=[{...common,id:'F',sex:'F',status:'active'},{...common,id:'M',sex:'M',status:'active'},{...common,id:'SOLD',sex:'F',status:'sold'},{...common,id:'RETIRED',sex:'M',status:'retired'},{...common,id:'BABY',sex:'U',status:'active',inventory_library:'nursery',origin:'produced'}];
  fixture.annual_breeding_plans=[{id:1,plan_year:2026,project_name:'有效计划',female_snake_id:'F',male_snake_id:'M',planned_clutches:3,review_status:'approved',status:'planned',priority:'A'},{id:2,plan_year:2026,project_name:'取消计划',female_snake_id:'F',male_snake_id:'M',planned_clutches:2,review_status:'approved',status:'cancelled',priority:'A'},{id:3,plan_year:2026,project_name:'退回的计划',source_type:'ai',review_status:'returned',review_reason:'核对亲本',status:'planned'}];
  state.year=2026;await refreshRemote(false);setPage('population');renderRows();
 });
 await expect(page.locator('#popRows tr')).toHaveCount(2);await page.getByLabel('生命周期',{exact:true}).selectOption('sold');await expect(page.locator('#popRows tr')).toHaveCount(1);await expect(page.locator('#popRows')).toContainText('SOLD');
 await page.evaluate(()=>setPage('overview'));await page.locator('[data-all-active]').click();await expect(page.locator('#popRows tr')).toHaveCount(3);await expect(page.getByLabel('档案范围')).toHaveValue('all');
 await page.evaluate(()=>{setPage('production');renderProduction();});await expect(page.locator('#prodHero')).toContainText('1 项计划 · 3 个计划窝次');await expect(page.locator('#prodHero')).toContainText('100%');await expect(page.locator('#annualPlanList')).not.toContainText('取消计划');
 await page.locator('#actualProduction .ws-metric').first().click();await expect(page.locator('#actualDetails')).toContainText('本年度没有符合条件的记录');await page.locator('#actualDetails').getByRole('button',{name:'关闭',exact:true}).click();
 await page.evaluate(()=>{setPage('lab');renderLab();});await expect(page.locator('#labF')).not.toContainText('SOLD');await expect(page.locator('#labM')).not.toContainText('RETIRED');
 await page.evaluate(()=>{adminTab='annual-review';setPage('admin');renderAdmin();});await expect(page.locator('#adminTable')).toContainText('已退回');await expect(page.locator('#adminTable')).not.toContainText('审核已通过');await expect(page.locator('[data-review-status=pending]')).toBeVisible();
 await page.evaluate(()=>openPlanForm());await page.locator('#editForm [name=project_name]').fill('未保存的计划');await page.locator('#editForm [name=project_name]').press('Enter');await expect(page.locator('#editModal')).toHaveClass(/open/);await page.locator('#editForm').getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('#workflowModal')).toHaveClass(/open/);await page.locator('#workflowModal').getByRole('button',{name:'取消',exact:true}).click();await expect(page.locator('#editForm [name=project_name]')).toHaveValue('未保存的计划');
 await page.evaluate(()=>{closeModal('editModal');SuohaWorkspace.snapshot().errors.inquiries='模拟读取失败';setPage('overview');});await expect(page.locator('.ws-metric').filter({hasText:'待联系意向'})).toContainText('暂不可用');
 await page.evaluate(()=>setPage('sales'));const search=page.locator('[name=salesQuery]');await search.fill('正在输入的订单');await page.evaluate(()=>SuohaWorkspace.load(true));await expect(search).toHaveValue('正在输入的订单');await expect(search).toBeFocused();
 expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
