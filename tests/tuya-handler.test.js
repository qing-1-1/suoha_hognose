const test=require('node:test'),assert=require('node:assert/strict');
const {handler}=require('../netlify/functions/room-environment');
test('cloud endpoint rejects anonymous, non-editor and cross-origin control before any device call',async()=>{
 const original=global.fetch,keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SITE_URL'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));let calls=0;
 try{
  process.env.SUPABASE_URL='https://example.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='test';process.env.SITE_URL='https://site.example';
  global.fetch=async()=>{calls++;return {ok:true,json:async()=>false};};
  assert.equal((await handler({httpMethod:'GET',headers:{}})).statusCode,401);assert.equal(calls,0);
  assert.equal((await handler({httpMethod:'GET',headers:{authorization:'Bearer test'}})).statusCode,403);assert.equal(calls,1);
  global.fetch=async(url)=>{assert.ok(url.endsWith('/can_edit_app'));calls++;return {ok:true,json:async()=>true};};
  assert.equal((await handler({httpMethod:'POST',headers:{authorization:'Bearer test',origin:'https://evil.example','content-type':'application/json'},body:'{}'})).statusCode,403);assert.equal(calls,2);
 }finally{global.fetch=original;for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});
