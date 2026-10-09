const test=require('node:test'),assert=require('node:assert/strict');
const {diagnose}=require('../scripts/check-admin-email.cjs');
test('email diagnostics detect missing configuration without sending or leaking credentials',async()=>{
 let verified=false,closed=false;
 const checks=await diagnose({env:{SMTP_USER:'private@example.test',SMTP_PASS:'private-secret'},transportFactory:()=>({verify:async()=>{verified=true;throw Object.assign(Error('private-secret'),{code:'EAUTH'});},close(){closed=true;}}),fetcher:()=>{throw Error('unexpected network');}});
 assert.ok(verified&&closed);assert.ok(checks.some(c=>c.detail.includes('SUPABASE_SERVICE_ROLE_KEY')));assert.ok(checks.some(c=>c.detail==='EAUTH'));assert.ok(!JSON.stringify(checks).includes('private-secret'));
});
test('email diagnostics only read queue and recipients and flag a stalled worker',async()=>{
 const routes=[];
 const checks=await diagnose({env:{ADMIN_EMAIL_ENABLED:'true',SMTP_USER:'test',SMTP_PASS:'test',SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'test'},transportFactory:()=>({verify:async()=>{},close(){}}),fetcher:async(url,options)=>{assert.equal(options.method,undefined);routes.push(url);return Response.json(url.includes('outbox')?[{status:'pending',attempts:0,created_at:'2020-01-01'}]:url.includes('profiles')?[{id:'test'}]:{email:'admin@example.test'});}});
 assert.equal(routes.length,3);assert.ok(checks.some(c=>c.name==='发送任务'&&!c.ok));assert.ok(checks.some(c=>c.name==='管理员收件人'&&c.ok));
});
