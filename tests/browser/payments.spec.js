const {test,expect}=require('@playwright/test');
const listing='11111111-1111-4111-8111-111111111111',orderId='22222222-2222-4222-8222-222222222222';
test.beforeEach(async({page})=>{await page.route('**/fonts.googleapis.com/**',r=>r.abort());await page.route('**/fonts.gstatic.com/**',r=>r.abort());});
test('real local Chinese OCR loads models and extracts a test payment amount',async({page})=>{
 test.setTimeout(120000);
 await page.route('**/.netlify/functions/public-catalog*',r=>r.fulfill({json:{items:[],page:1,total:0,series:[]}}));
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=1100;canvas.height=650;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,1100,650);ctx.fillStyle='black';ctx.font='36px "Microsoft YaHei", sans-serif';
  ['OCR 测试样张 — 不是真实付款凭证','微信支付','付款金额 ￥1050.00','交易单号 202610081234567890','付款时间 2026-10-08 14:30:00','收款人 测试店铺'].forEach((line,i)=>ctx.fillText(line,45,70+i*90));
  return window.SuohaPaymentOCR.recognize(canvas.toDataURL('image/png'));
 });
 expect(result.fields.amount).toBe('1050.00');expect(result.text).toContain('1050');expect(result.confidence).toBeGreaterThan(40);
});
test('fixed-price checkout displays QR and submits OCR evidence without marking paid',async({page})=>{
 const item={id:listing,slug:'payment-test',title:'测试个体',snake_id:'S1',sale_status:'available',asking_price:1050,currency:'CNY',photos:[],genes:[]};
 const order={id:orderId,title:item.title,reference:'TEST-ONLY-001',amount:1050,status:'reserved',currency:'CNY',reserved_until:new Date(Date.now()+7200000).toISOString(),receipts:[]};let submission;
 const png=await require('sharp')({create:{width:100,height:100,channels:3,background:'#fff'}}).png().toBuffer();const pixel='data:image/png;base64,'+png.toString('base64');
 await page.route('**/.netlify/functions/public-catalog*',r=>r.fulfill({json:{items:[item],page:1,total:1,series:[]}}));
 await page.route('**/.netlify/functions/manual-payment*',async r=>{const b=r.request().postDataJSON();if(b?.action==='purchase')return r.fulfill({json:{id:orderId}});if(b?.action==='receipt'){submission=b;order.receipts=[{id:b.request_id,status:'pending',fields:b.fields}];return r.fulfill({json:{id:b.request_id,status:'submitted'}});}return r.fulfill({json:{orders:[order],channels:[{id:'wechat_transfer',label:'加微信转账',payee:'测试收款人',instructions:'请备注订单号',wechat_id:'shop_test',url:null},{id:'wechat',label:'微信',payee:'测试收款人',instructions:'测试用收款配置',url:pixel}]}});});
 await page.goto('/specimens/payment-test');await page.getByRole('button',{name:'确认购买 · ¥1050.00',exact:true}).click();await page.getByRole('button',{name:'确认订单并查看收款码'}).click();
 const modal=page.locator('.payment-dialog');await expect(modal).toContainText('测试收款人');await expect(modal).toContainText('shop_test');await expect(modal).toContainText('支付详情');await expect(modal.locator('.payment-qr')).toHaveCount(0);await modal.locator('[name=channel]').selectOption('wechat');await expect(modal.locator('.payment-qr')).toBeVisible();await modal.locator('[name=channel]').selectOption('wechat_transfer');
 // Real engine is tested above; this test isolates the evidence-submission interaction.
 await modal.locator('.payment-examples summary').click();
 await expect(modal.locator('.payment-examples img')).toBeVisible();
 await expect.poll(()=>modal.locator('.payment-examples img').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 await page.evaluate(()=>{window.SuohaPaymentOCR.recognize=async()=>({text:'付款成功',confidence:85,fields:{amount:'1050.00'}});});
 await modal.locator('[name=screenshot]').setInputFiles({name:'wrong.png',mimeType:'image/png',buffer:png});
 await expect(modal.locator('[data-screenshot-warning]')).toContainText('请点击账单中本次支付记录并截图，上传包含订单号/转账单号的支付记录截图。');
 await modal.locator('[name=consent]').check();
 await modal.getByRole('button',{name:'提交付款截图，等待人工确认'}).click();
 expect(submission).toBeUndefined();
 await page.evaluate(()=>{window.SuohaPaymentOCR.recognize=async()=>({text:'付款金额 ￥1050.00',confidence:85,fields:{amount:'1050.00',transaction:'TEST-123456789',time:'2026-10-08 14:30:00',payee:'测试收款人'}});});
 await modal.locator('[name=screenshot]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(pixel.split(',')[1],'base64')});
 await expect(modal.locator('[name=amount]')).toHaveValue('1050.00');await modal.locator('[name=consent]').check();await modal.getByRole('button',{name:'提交付款截图，等待人工确认'}).click();
 await expect(modal).toContainText('等待人工确认到账');expect(order.status).toBe('reserved');expect(submission.ocr_text).toContain('1050');expect(submission.fields.amount).toBe('1050.00');expect(submission.channel).toBe('wechat_transfer');expect(submission.image).toMatch(/^data:image\/jpeg/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('staff configures a QR and explicitly verifies a receipt',async({page})=>{
 await page.route('**/cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'text/javascript',body:`
 const user={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',email:'staff@example.com'};
 const receipt={id:'44444444-4444-4444-8444-444444444444',inquiry_id:'${orderId}',status:'pending',channel:'wechat',channel_snapshot:{label:'微信',payee:'测试收款人'},screenshot_path:'receipts/test.jpg',ocr_text:'测试原文 ￥1050.00',ocr_fields:{amount:'1050.00'},ocr_confidence:85,submitted_fields:{amount:'1050.00',transaction:'TEST-TRANSACTION'},created_at:new Date().toISOString()};
 const fixture={payment_channels:[{id:'wechat',label:'微信',payee:'测试收款人',instructions:'测试说明',qr_path:'qr/test.jpg',enabled:true}],payment_receipts:[receipt],purchase_inquiries:[{id:'${orderId}',reference:'TEST-ONLY-001',agreed_price:1050,currency:'CNY',status:'reserved',customer_name:'buyer1'}]};
 window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:{user,access_token:'test'}}})},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/assets/mark.svg'}})})},from(table){const chain={select(){return this},order(){return this},limit(){return this},range(){return this},eq(){return this},single:async()=>({data:fixture[table][0]}),maybeSingle:async()=>({data:{...user,role:'admin',active:true}}),then(resolve){resolve({data:fixture[table]||[],count:(fixture[table]||[]).length,error:null})}};return chain;},rpc:async(name,args)=>{if(name==='review_payment_receipt'){window.reviewedPayment=args;receipt.status=args.p_decision;}return {data:null,error:null};}})};
 `}));
 let saved;await page.route('**/.netlify/functions/manual-payment',r=>{saved=r.request().postDataJSON();return r.fulfill({json:{ok:true}});});
 await page.goto('/admin');await expect(page.locator('#authGate')).toBeHidden();const nav=page.viewportSize().width<833?'.mobileNav':'.sidebar';await page.locator(nav+' [data-page=payments]').click();
 await page.getByRole('button',{name:'微信收款码 · 已启用',exact:true}).click();const modal=page.locator('.payment-dialog');await modal.getByLabel('收款人 / 商户名称').fill('测试收款名称');await modal.getByRole('button',{name:'保存收款设置'}).click();await expect(modal).not.toBeVisible();expect(saved.payee).toBe('测试收款名称');
 await page.getByRole('button',{name:'加微信转账 · 未启用',exact:true}).click();await modal.getByLabel('收款人 / 商户名称').fill('店铺');await modal.getByLabel('店铺微信号').fill('shop_test');await modal.getByLabel('启用此收款方式').check();await expect(modal.locator('[name=image]')).toHaveCount(0);await modal.getByRole('button',{name:'保存收款设置'}).click();await expect(modal).not.toBeVisible();expect(saved).toMatchObject({id:'wechat_transfer',wechat_id:'shop_test',enabled:true,image:null});
 await page.getByRole('button',{name:'查看 / 审核',exact:true}).click();await expect(modal).toContainText('订单应付 ¥1050');await modal.getByLabel('实际确认到账金额（元）').fill('1050');await modal.getByLabel('我已在真实收款账户核对收款人、交易单号及足额到账').check();await modal.getByRole('button',{name:'确认实际到账',exact:true}).click();await expect(modal).not.toBeVisible();
 expect(await page.evaluate(()=>window.reviewedPayment)).toMatchObject({p_decision:'confirmed',p_amount:1050,p_verified:true});await expect(page.locator('#workspacePayments')).toContainText('已确认到账');
 await page.screenshot({path:'artifacts/payments-admin-'+test.info().project.name+'.png',fullPage:true});
});
