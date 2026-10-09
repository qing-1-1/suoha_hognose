const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const {processNotifications,message,smtpConfig}=require('../netlify/functions/lib/admin-email');
const env={ADMIN_EMAIL_ENABLED:'true',SMTP_USER:'sender@example.com',SMTP_PASS:'test-only',SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-only',SITE_URL:'https://shop.example'};
const job={id:'11111111-1111-4111-8111-111111111111',lease_token:'lease',recipient:'admin@example.com',event_type:'payment_receipt',payload:{title:'测试个体',buyer:'buyer1',reference:'ORDER-1',amount:100,submitted_amount:'100',channel:'wechat',created_at:'2026-10-09T01:00:00Z'}};

test('SMTP uses TLS; notifications contain admin links and no payment success assertion',()=>{
 const config=smtpConfig(env);assert.equal(config.secure,true);assert.equal(config.port,465);
 const mail=message(job,env);assert.equal(mail.to.address,'admin@example.com');assert.match(mail.text,/不代表已到账/);assert.match(mail.text,/https:\/\/shop.example\/admin#payments/);assert.equal(mail.attachments,undefined);
 const won=message({...job,event_type:'auction_won'},env);assert.match(won.subject,/拍卖已成交/);assert.match(won.text,/成交金额/);assert.match(won.text,/等待买家付款/);assert.match(won.text,/订单：ORDER-1/);
 assert.throws(()=>message({...job,event_type:'auction_bid'},env),/INVALID_EVENT/);
});

test('worker records each recipient separately; SMTP failures are redacted and retried',async()=>{
 const calls=[],sent=[];
 const jobs=[job,{...job,id:'22222222-2222-4222-8222-222222222222',recipient:'second@example.com'}];
 const result=await processNotifications({env,call:async(name,args)=>{calls.push({name,args});return name==='claim_admin_emails'?jobs:true;},createTransport:()=>({
  sendMail:async mail=>{sent.push(mail);if(mail.to.address==='second@example.com')throw Object.assign(Error('secret password in SMTP message'),{code:'EAUTH'});return {accepted:['admin@example.com']};},close(){}
 })});
 assert.deepEqual(result,{enabled:true,processed:2,sent:1,retrying:1});assert.equal(sent.length,2);
 assert.equal(calls[1].args.p_sent,true);assert.equal(calls[2].args.p_error,'EAUTH');assert.ok(!JSON.stringify(calls).includes('secret password'));
});

test('disabled/misconfigured notifications do not consume queue attempts',async()=>{
 const call=async()=>{throw Error('must not claim');};
 assert.deepEqual(await processNotifications({env:{},call}),{enabled:false});
 await assert.rejects(processNotifications({env:{...env,SMTP_PASS:''},call}),/SMTP_NOT_CONFIGURED/);
});

test('transactional outbox targets all active admins, isolates permissions, handles leases/retries and rollback',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,email text);
 create table profiles(id uuid primary key,role text,active boolean);
 create table auction_buyers(id uuid primary key,username text);
 create table specimen_listings(id uuid primary key,title text);
 create table purchase_inquiries(id uuid primary key,listing_id uuid,reference text,agreed_price numeric);
 create table auctions(id uuid primary key,listing_id uuid,status text default 'open',winner_id uuid,inquiry_id uuid,current_price numeric);
 create table auction_bids(id bigint primary key,auction_id uuid,buyer_id uuid,amount numeric,created_at timestamptz default now());
 create table payment_receipts(id uuid primary key,inquiry_id uuid,buyer_id uuid,submitted_fields jsonb,channel text,created_at timestamptz default now());
 grant usage on schema public,auth to anon,authenticated,service_role;
 insert into auth.users select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=5 then '' else 'admin'||n||'@example.com' end from generate_series(1,5) n;
 insert into profiles select id,case when email='admin3@example.com' then 'editor' else 'admin' end,email<>'admin4@example.com' from auth.users;
 insert into auction_buyers values('10000000-0000-4000-8000-000000000001','buyer1');
 insert into specimen_listings values('20000000-0000-4000-8000-000000000001','Test');
 insert into purchase_inquiries values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','ORDER-1',100);
 insert into auctions(id,listing_id) values('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');`);
 await db.exec(fs.readFileSync('supabase/migrations/032_admin_email_notifications.sql','utf8'));
 const insert="insert into auction_bids(id,auction_id,buyer_id,amount) values(1,'40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',100)";
 await db.exec('begin;'+insert+';rollback;');
 assert.equal((await db.query('select count(*) n from admin_email_outbox')).rows[0].n,0);
 await db.exec(insert);await db.exec(insert+' on conflict do nothing');
 assert.equal((await db.query("select count(*) n from admin_email_outbox where event_type='auction_bid'")).rows[0].n,2);
 await db.exec(fs.readFileSync('supabase/migrations/033_auction_won_notifications.sql','utf8'));
 assert.equal((await db.query("select count(*) n from admin_email_outbox where status='cancelled'")).rows[0].n,2);
 await db.exec(insert.replace('values(1,','values(2,'));
 assert.equal((await db.query("select count(*) n from admin_email_outbox where event_type='auction_bid'")).rows[0].n,2);
 await db.exec("update auctions set status='unsold';update auctions set status='open';update auctions set status='cancelled';update auctions set status='open'");
 assert.equal((await db.query("select count(*) n from admin_email_outbox where status='pending'")).rows[0].n,0);
 const won="update auctions set status='won',winner_id='10000000-0000-4000-8000-000000000001',current_price=100";
 const link="update auctions set inquiry_id='30000000-0000-4000-8000-000000000001'";
 await db.exec('begin;'+won+';'+link+';rollback');
 assert.equal((await db.query("select count(*) n from admin_email_outbox where event_type='auction_won'")).rows[0].n,0);
 await db.exec(won);
 assert.equal((await db.query("select count(*) n from admin_email_outbox where event_type='auction_won'")).rows[0].n,0);
 await db.exec(link);await db.exec(link);await db.exec(won);
 assert.equal((await db.query("select count(*) n from admin_email_outbox where event_type='auction_won'")).rows[0].n,2);
 await db.exec("insert into payment_receipts(id,inquiry_id,buyer_id,submitted_fields,channel) values('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{\"amount\":\"100\"}','wechat')");
 assert.equal((await db.query("select count(*) n from admin_email_outbox where status='pending'")).rows[0].n,4);
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);await assert.rejects(db.query('select * from admin_email_outbox'),/permission denied/);await assert.rejects(db.query('select claim_admin_emails()'),/permission denied/);await assert.rejects(db.query("select finish_admin_email(gen_random_uuid(),gen_random_uuid(),true)"),/permission denied/);await db.exec('reset role');
 }
 await db.exec('set role service_role');
 const claim=async()=> (await db.query('select claim_admin_emails() jobs')).rows[0].jobs;
 const jobs=await claim();assert.equal(jobs.length,4);assert.deepEqual(new Set(jobs.map(j=>j.recipient)),new Set(['admin1@example.com','admin2@example.com']));assert.equal((await claim()).length,0);
 const finish=(j,ok,token=j.lease_token)=>db.query('select finish_admin_email($1,$2,$3,$4) done',[j.id,token,ok,'EAUTH']);
 assert.equal((await finish(jobs[0],true,'00000000-0000-4000-8000-000000000000')).rows[0].done,false);
 await finish(jobs[0],true);await finish(jobs[1],false);assert.equal((await claim()).length,0);
 await db.exec('reset role');
 await db.query("update admin_email_outbox set available_at=now()-interval '1 minute',lease_until=now()-interval '1 minute' where status<>'sent'");
 await db.exec("update profiles set active=false where id='00000000-0000-4000-8000-000000000002'");
 await db.exec('set role service_role');const retry=await claim();assert.ok(retry.length>0);assert.ok(retry.every(j=>j.recipient==='admin1@example.com'));assert.ok(retry.every(j=>j.attempts===2));
 await db.exec('reset role');
 await db.exec("update admin_email_outbox set attempts=8,lease_until=now()-interval '1 minute' where status='sending'");
 await claim();assert.ok((await db.query("select count(*) n from admin_email_outbox where status='failed'")).rows[0].n>0);
 }finally{await db.close();}
});
