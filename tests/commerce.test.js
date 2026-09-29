const test=require('node:test');const assert=require('node:assert/strict');
const {projectItem}=require('../netlify/functions/lib/public-data');
const {handler}=require('../netlify/functions/purchase-inquiry');
test('invalid specimen URLs never fall back to the first catalog animal',async()=>{
  const page=require('../netlify/functions/specimen-page');
  assert.equal((await page.handler({queryStringParameters:{slug:''}})).statusCode,404);
  assert.equal((await page.handler({queryStringParameters:{slug:'../private'}})).statusCode,404);
});
test('public projection excludes costs, contact details, notes and provider snapshots',()=>{
  const value=projectItem({id:'a',title:'test',price:5000,notes:'private',investor:'private',contact:'private',source_snapshot:{secret:true},genes:[{id:'a',name:'基因',state:'possible_het',probability:.5,notes:'private'}],photos:[{path:'a/b.webp',caption:'photo',owner_id:'private'}]});
  assert.equal(value.price,undefined);assert.equal(value.notes,undefined);assert.equal(value.source_snapshot,undefined);assert.equal(value.contact,undefined);assert.equal(value.genes[0].probability,.5);assert.equal(value.genes[0].notes,undefined);assert.equal(value.photos[0].owner_id,undefined);
});
test('inquiry requires consent, validates data and never trusts forwarded-for',async()=>{
  process.env.SUPABASE_SERVICE_ROLE_KEY='server-secret';process.env.INQUIRY_HASH_SECRET='hash-secret';
  const event={httpMethod:'POST',headers:{'x-forwarded-for':'fake'},body:JSON.stringify({request_id:'11111111-1111-4111-8111-111111111111',listing_id:'22222222-2222-4222-8222-222222222222',name:'test',contact:'contact',consent:false})};
  assert.equal((await handler(event)).statusCode,400);event.body=event.body.replace('false','true');assert.equal((await handler(event)).statusCode,503);
});
test('inquiry forwards idempotency key, hashes IP and returns only a reference',async()=>{
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='public';process.env.SUPABASE_SERVICE_ROLE_KEY='server-secret';process.env.INQUIRY_HASH_SECRET='hash-secret';
  const original=global.fetch;let body,headers;
  global.fetch=async(url,options)=>{body=JSON.parse(options.body);headers=options.headers;return {ok:true,json:async()=>({reference:'SH-123'})};};
  try{const result=await handler({httpMethod:'POST',headers:{'x-nf-client-connection-ip':'127.0.0.1'},body:JSON.stringify({request_id:'11111111-1111-4111-8111-111111111111',listing_id:'22222222-2222-4222-8222-222222222222',name:' test ',contact:'contact',consent:true})});assert.equal(result.statusCode,201);assert.equal(body.p_name,'test');assert.match(body.p_fingerprint,/^[a-f0-9]{64}$/);assert.equal(headers.apikey,'server-secret');assert.deepEqual(JSON.parse(result.body),{reference:'SH-123'});}finally{global.fetch=original;}
});
