const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {handler,imageBuffer}=require('../netlify/functions/manual-payment');
const {parse}=require('../js/payment-ocr');
test('manual payment: ownership, reservation races, receipt retries and staff-only settlement',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);create table profiles(id uuid primary key,role text,active boolean);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function can_edit_app() returns boolean language sql security definer as $$select exists(select 1 from profiles where id=auth.uid() and active and role='admin')$$;
 create table snakes(id text primary key,series text,sex text,birth_date date,gene_text text,status text);
 create table genes(id text primary key,name_zh text);create table snake_genes(snake_id text,gene_id text,state text,probability numeric);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key,bucket_id text,name text);alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 insert into auth.users values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');insert into profiles values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin',true);
 insert into snakes values('S1','test','F','2025-01-01','test','active'),('S2','test','M','2025-01-01','test','active');`);
 for(const name of ['019_public_catalog_and_sales.sql','024_listing_removal.sql','029_auctions.sql','030_manual_payments.sql','031_wechat_transfer.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8'));
 const listing='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222',request='33333333-3333-4333-8333-333333333333',receipt='44444444-4444-4444-8444-444444444444';
 await db.query("insert into specimen_listings(id,snake_id,slug,title,published,sale_status,asking_price) values($1,'S1','s1','Test',true,'available',1000),($2,'S2','s2','Test2',true,'available',2000)",[listing,second]);
 await db.query("select auction_identity('register','buyer1','salt:hash','contact-1','token1'),auction_identity('register','buyer2','salt:hash','contact-2','token2')");
 const buy=(token,id=listing,key=request)=>db.query('select purchase_now($1,$2,$3) id',[token,id,key]);
 await assert.rejects(buy('token1'),/尚未配置付款渠道/);
 await db.exec("set request.jwt.claim.sub='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';set role authenticated");
 await db.query("select save_payment_channel('wechat','微信','测试收款人','订单备注','qr/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',true)");
 await assert.rejects(db.query("select save_payment_channel('wechat_transfer','加微信转账','店铺','',null,true,'')"),/payment_channel_destination/);
 await db.query("select save_payment_channel('wechat_transfer','加微信转账','店铺','请备注订单编号',null,true,'shop_test')");
 await assert.rejects(buy('token1'),/permission denied/);await db.exec('reset role');
 const order=(await buy('token1')).rows[0].id;assert.equal((await buy('token1')).rows[0].id,order);
 await assert.rejects(buy('token2'),/编号冲突/);
 await assert.rejects(buy('token2',listing,'55555555-5555-4555-8555-555555555555'),/不可直接购买/);
 await assert.rejects(db.query('select read_payment_orders($1,$2)',['token2',order]),/无权查看/);
 const context=(await db.query('select read_payment_orders($1,$2) data',['token1',order])).rows[0].data;assert.equal(context.orders[0].amount,1000);
 assert.equal(context.channels.find(c=>c.id==='wechat_transfer').wechat_id,'shop_test');
 assert.equal(context.channels.find(c=>c.id==='wechat_transfer').qr_path,null);
 const fields={amount:'999',transaction:'TEST-TRANSACTION-123',payee:'测试收款人'};
 const submit=(id=receipt,digest='a'.repeat(64))=>db.query("select submit_payment_receipt('token1',$1,$2,'wechat_transfer',$3,'测试截图 OCR',$4,80,$4)",[id,order,digest,fields]);
 await submit();await submit();assert.equal((await db.query('select count(*) n from payment_receipts')).rows[0].n,1);
 assert.equal((await db.query('select status from purchase_inquiries where id=$1',[order])).rows[0].status,'reserved');
 await assert.rejects(submit(receipt,'b'.repeat(64)),/编号冲突/);
 await db.exec('set role anon');await assert.rejects(db.query('select * from payment_receipts'),/permission denied/);await assert.rejects(db.query('select * from payment_channels'),/permission denied/);
 await db.exec('reset role;set role authenticated');
 await assert.rejects(db.query("select manage_specimen_sale($1,'cancel','测试取消')",[order]),/待核实/);
 await assert.rejects(db.query("select manage_specimen_sale($1,'paid')",[order]),/待核实/);
 await assert.rejects(db.query("select review_payment_receipt($1,'confirmed','',1000,false)",[receipt]),/真实收款账户/);
 await assert.rejects(db.query("select review_payment_receipt($1,'confirmed','',999,true)",[receipt]),/金额须与订单一致/);
 await assert.rejects(db.query("select review_payment_receipt($1,'rejected','',null,false)",[receipt]),/退回原因/);
 await db.query("select review_payment_receipt($1,'rejected','截图不清晰',null,false)",[receipt]);
 await db.exec('reset role');
 const retry='66666666-6666-4666-8666-666666666666';await submit(retry);
 await db.exec('set role authenticated');
 await db.query("select review_payment_receipt($1,'confirmed','已核实实际到账 1000 元，修正截图误识别',1000,true)",[retry]);
 await db.query("select review_payment_receipt($1,'confirmed','重复提交',1000,true)",[retry]);
 assert.equal((await db.query('select status from purchase_inquiries where id=$1',[order])).rows[0].status,'paid');
 assert.equal((await db.query("select count(*) n from sales_activity where action='receipt_confirmed'")).rows[0].n,1);
 // The auction winner automatically receives ownership and a payment order.
 const auction=(await db.query("select create_auction($1,2000,50,30,clock_timestamp()-interval '1 minute',1,null,2) id",[second])).rows[0].id;
 await db.exec('reset role');
 await db.query("select place_auction_bid('token2',$1,2000,gen_random_uuid())",[auction]);
 assert.equal((await db.query('select hard_ends_at from auctions where id=$1',[auction])).rows[0].hard_ends_at,null);
 await db.query("update auctions set ends_at=clock_timestamp()+interval '1 minute' where id=$1",[auction]);
 await db.query("select place_auction_bid('token1',$1,2050,gen_random_uuid())",[auction]);
 assert.equal((await db.query("select ends_at>clock_timestamp()+interval '29 minutes' extended from auctions where id=$1",[auction])).rows[0].extended,true);
 await db.query("update auctions set ends_at=clock_timestamp()-interval '1 second' where id=$1",[auction]);await db.query('select settle_auction($1)',[auction]);
 const mine=(await db.query("select read_payment_orders('token1') data")).rows[0].data.orders;assert.equal(mine.length,2);assert.equal(mine.find(o=>o.amount===2050).status,'reserved');
 await db.exec("set request.jwt.claim.sub='';set role authenticated");await assert.rejects(db.query("select review_payment_receipt($1,'confirmed','',1000,true)",[receipt]),/Not authorized/);
 }finally{await db.close();}
});
test('OCR fields are evidence, and unknown text never invents an amount',()=>{
 assert.deepEqual(parse('微信支付\n付款金额 ￥1,050.00\n交易单号 202610081234567890\n付款时间 2026-10-08 14:30:00\n收款人 测试店铺'),{amount:'1050.00',transaction:'202610081234567890',time:'2026-10-08 14:30:00',payee:'测试店铺',channel:'wechat'});
 assert.equal(parse('这是一张蛇的照片 2026').amount,'');
});
test('image processing rejects disguised files and removes metadata',async()=>{
 const sharp=require('sharp');const input=await sharp({create:{width:40,height:40,channels:3,background:'#fff'}}).png().toBuffer();const result=await imageBuffer('data:image/png;base64,'+input.toString('base64'));assert.equal((await sharp(result).metadata()).format,'jpeg');
 await assert.rejects(imageBuffer('data:image/png;base64,'+Buffer.from('<svg/>').toString('base64')),/图片无法读取/);
});

test('bill details parse signed amounts and platform numbers without mistaking merchant IDs or remarks',()=>{
 const wechat=parse('扫二维码付款\n-0.01\n当前状态 支付成功\n收款方备注 二维码收款\n付款方留言 测试\n转账时间 2026年10月8日 17:38:30\n转账单号 1000107301202610080000000000000');
 assert.equal(wechat.amount,'0.01');assert.equal(wechat.transaction,'1000107301202610080000000000000');assert.equal(wechat.payee,'');assert.equal(wechat.time,'2026年10月8日 17:38:30');
 const alipay=parse('账单详情\n−0.01\n交易成功\n支付时间 2026-10-08 17:39:15\n收款方全称 **测(个人)\n商家订单号 4791000000000000\n订 单 号\n2026100823000000000000000000');
 assert.equal(alipay.amount,'0.01');assert.equal(alipay.payee,'**测(个人)');assert.equal(alipay.transaction,'2026100823000000000000000000');
 assert.equal(parse('商家订单号 4791000000000000').transaction,'');
 assert.equal(parse('付款成功\n-1.00').transaction,'');
});
test('payment API rejects cross-site posts and authenticates before image storage',async()=>{
 process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='secret';process.env.SUPABASE_PUBLISHABLE_KEY='public';
 const e={httpMethod:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'receipt'})};
 assert.equal((await handler({...e,headers:{...e.headers,'sec-fetch-site':'cross-site'}})).statusCode,403);
 assert.equal((await handler(e)).statusCode,401);
 assert.equal((await handler({...e,body:JSON.stringify({action:'save_channel'})})).statusCode,401);
});
