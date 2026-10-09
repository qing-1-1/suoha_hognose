const {test,expect}=require('@playwright/test');
const listing='11111111-1111-4111-8111-111111111111',auction='22222222-2222-4222-8222-222222222222';
test.beforeEach(async({page})=>{await page.route('**/fonts.googleapis.com/**',r=>r.abort());await page.route('**/fonts.gstatic.com/**',r=>r.abort());});
test('buyer login, bid retry, leading status and private account view',async({page})=>{
 let logged=false,bid=null,attempts=[];
 const a={id:auction,listing_id:listing,title:'测试拍卖蛇',slug:'auction-test',status:'open',start_price:1000,increment:50,idle_minutes:30,starts_at:new Date(Date.now()-60000).toISOString(),ends_at:new Date(Date.now()+1800000).toISOString(),hard_ends_at:new Date(Date.now()+86400000).toISOString(),bid_count:0,current_price:null,leading:false,payment_hours:2,bids:[]};
 const item={id:listing,slug:a.slug,title:a.title,snake_id:'S1',sale_status:'available',asking_price:2000,currency:'CNY',photos:[],genes:[],auction:a};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/.netlify/functions/public-catalog*',r=>r.fulfill({json:{items:[item],page:1,total:1,series:[]}}));
 await page.route('**/.netlify/functions/auction-api*',async r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{items:[a],server_time:new Date().toISOString(),username:logged?'buyer1':null}});
  const b=r.request().postDataJSON();
  if(b.action==='login'){logged=true;return r.fulfill({json:{username:'buyer1'}});}
  if(b.action==='bid'){attempts.push(b);if(attempts.length===1)return r.fulfill({status:503,json:{error:'网络异常，请重试'}});bid=b;a.current_price=b.amount;a.leading=true;a.bid_count=1;a.bids=[{number:1,amount:b.amount,at:new Date().toISOString(),mine:true}];return r.fulfill({json:{accepted:true}});}
 });
 await page.goto('/specimens/auction-test');
 await expect(page.locator('#auctionPanel')).toContainText('竞拍中');await expect(page.locator('#openInquiry')).toHaveCount(0);
 await page.locator('.site-nav .buyer-account').click();
 await page.getByLabel('账号',{exact:true}).fill('buyer1');await page.getByLabel('密码',{exact:true}).fill('long-password');await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.locator('#buyerDialog')).toContainText('已登录：buyer1');await page.locator('#buyerDialog [data-buyer-close]').click();
 await page.locator('#auctionPanel [name=amount]').fill('1050');await page.locator('#auctionPanel [name=consent]').check();await page.getByRole('button',{name:'确认出价',exact:true}).click();
 await expect(page.locator('#auctionPanel [role=status]')).toContainText('网络异常');await page.getByRole('button',{name:'确认出价',exact:true}).click();
 await expect(page.locator('#auctionPanel')).toContainText('你已领先');expect(bid.amount).toBe(1050);expect(attempts[0].request_id).toBe(attempts[1].request_id);
 await expect(page.getByRole('button',{name:'确认出价',exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:`artifacts/auction-${test.info().project.name}.png`,fullPage:true});
});
for(const entry of ['management','publishing'])test(`staff can configure an auction from ${entry}`,async({page})=>{
 await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
 const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'staff@example.com'};
 const fixture={snakes:[{id:'S1',series:'测试',sex:'F',gene_text:'测试蛇',status:'active',price:1000}],specimen_listings:[{id:'${listing}',snake_id:'S1',slug:'auction-test',title:'测试拍卖蛇',published:true,sale_status:'available',currency:'CNY'}]};
 window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user,access_token:'test'}}})},from(table){const chain={select(){return this},order(){return this},limit(){return this},range(){return this},eq(){return this},maybeSingle:async()=>({data:{...user,role:'admin',active:true,display_name:'staff'}}),then(resolve){resolve({data:fixture[table]||[],count:(fixture[table]||[]).length,error:null})}};return chain;},rpc:async(name,args)=>{if(name==='create_auction'){window.createdAuction=args;fixture.auctions=[{id:'${auction}',listing_id:args.p_listing,status:'open',start_price:args.p_price,increment:args.p_increment,idle_minutes:args.p_idle,starts_at:args.p_starts,ends_at:new Date(Date.now()+86400000).toISOString(),hard_ends_at:new Date(Date.now()+259200000).toISOString(),payment_hours:args.p_payment_hours,bid_count:0}];return {data:'${auction}',error:null};}return {data:[],error:null};}})};` }));
 await page.goto('/admin');await expect(page.locator('#authGate')).toBeHidden();
 const nav=page.viewportSize().width<833?'.mobileNav':'.sidebar';
 for(const name of ['auctions','payments']){
  await expect(page.locator(nav+' [data-page='+name+'] .navIcon svg')).toHaveCount(1);
  if(nav==='.sidebar')await expect(page.locator(nav+' [data-page='+name+'] .navIcon svg')).toBeVisible();
  else await expect(page.locator('.mobile-nav-group[aria-label="经营"] [data-page='+name+']')).toHaveCount(1);
 }
 if(entry==='publishing'){
  await page.locator(nav+' [data-page=publishing]').click();
  await page.locator('#workspacePublishing').getByRole('button',{name:'配置拍卖',exact:true}).click();
  await expect(page.getByLabel('拍卖个体',{exact:true})).toHaveValue(listing);
 }else{
  await page.locator(nav+' [data-page=auctions]').click();
  await page.getByRole('button',{name:'创建拍卖',exact:true}).click();await page.getByLabel('拍卖个体',{exact:true}).selectOption(listing);
 }
 await page.getByLabel('起拍价（元）',{exact:true}).fill('1500');await page.getByLabel('无人继续出价结束间隔（分钟）',{exact:true}).fill('10');await page.getByRole('button',{name:'确认创建拍卖',exact:true}).click();
 await expect(page.locator('.auction-dialog[open]')).toHaveCount(0);
 if(entry==='publishing'){
  await expect(page.locator('#workspacePublishing')).toContainText('起拍');
  await expect(page.locator('#workspacePublishing').getByRole('button',{name:'配置拍卖',exact:true})).toHaveCount(0);
  await page.locator('#workspacePublishing').getByRole('button',{name:'编辑',exact:true}).click();
  await expect(page.locator('#workspaceDialog [name=asking_price]')).toBeDisabled();
  await expect(page.locator('#workspaceDialog [name=published]')).toBeDisabled();
  await expect(page.locator('#workspaceDialog [name=currency]')).toBeDisabled();
  await page.locator('#workspaceDialog').getByRole('button',{name:'取消',exact:true}).click();
  await page.screenshot({path:`artifacts/publishing-auction-${test.info().project.name}.png`,fullPage:true});
  await page.locator('#workspacePublishing').getByRole('button',{name:'管理拍卖',exact:true}).click();
  await expect(page.getByRole('button',{name:'查看全部场次',exact:true})).toBeVisible();
 }
 await expect(page.locator('#workspaceAuctions')).toContainText('10 分钟无人出价结束');
 const created=await page.evaluate(()=>window.createdAuction);expect(created.p_price).toBe(1500);expect(created.p_idle).toBe(10);expect(created.p_max_hours).toBe(null);
});
