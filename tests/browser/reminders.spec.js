const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{await page.route('**/fonts.googleapis.com/**',r=>r.abort());await page.route('**/fonts.gstatic.com/**',r=>r.abort());});
test('staff reminder count, dismissal persistence, restore and module navigation',async({page})=>{
 await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
 const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'staff@example.com'};
 const fixture={purchase_inquiries:[{id:'order1',reference:'ORDER-1',status:'new',customer_name:'Buyer'}],payment_receipts:[{id:'receipt1',inquiry_id:'order2',status:'pending',submitted_fields:{transaction:'TEST'},channel_snapshot:{label:'微信'},created_at:new Date().toISOString()}]};
 window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user,access_token:'test'}}})},from(table){return {select(){return this},order(){return this},limit(){return this},range(){return this},eq(){return this},maybeSingle:async()=>({data:{...user,role:'admin',active:true}}),then(resolve){resolve({data:fixture[table]||[],count:(fixture[table]||[]).length,error:null})}}},rpc:async(name)=>({data:name==='breeding_calendar'?[]:null,error:null})})};
 `}));
 await page.goto('/admin');await expect(page.locator('#authGate')).toBeHidden();await expect(page.locator('#reminderToggle [data-count]')).toHaveText('2');
 await page.locator('#reminderToggle').click();await expect(page.locator('#reminderPanel')).toContainText('付款待审核');await page.getByRole('button',{name:'关闭提醒：付款待审核',exact:true}).click();await expect(page.locator('#reminderToggle [data-count]')).toHaveText('1');
 await page.reload();await expect(page.locator('#reminderToggle [data-count]')).toHaveText('1');await page.locator('#reminderToggle').click();await expect(page.locator('#reminderPanel')).not.toContainText('付款待审核');
 await page.getByRole('button',{name:'恢复已关闭',exact:true}).click();await expect(page.locator('#reminderToggle [data-count]')).toHaveText('2');
 await page.screenshot({path:'artifacts/reminder-center-'+test.info().project.name+'.png'});
 await page.locator('[data-reminder-page=payments]').click();await expect(page).toHaveURL(/#payments$/);await expect(page.locator('#reminderPanel')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('shop navigation exposes buyer login on desktop and mobile',async({page})=>{
 await page.route('**/.netlify/functions/public-catalog*',r=>r.fulfill({json:{items:[],total:0,series:[]}}));
 await page.route('**/.netlify/functions/auction-api*',r=>r.fulfill({json:{username:'',items:[]}}));
 await page.goto('/collection');const login=page.locator('.site-nav .buyer-account');await expect(login).toHaveText('登录 / 注册');await expect(login).toBeInViewport();await login.click();await expect(page.locator('#buyerDialog')).toContainText('登录买家账号');
});
