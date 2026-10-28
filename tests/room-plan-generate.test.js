'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {handler}=require('../netlify/functions/room-plan-generate');
const scheduled={body:JSON.stringify({next_run:'2026-10-15T10:15:00Z'})};

function setup(t){
  const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SERVICE_ROLE_KEY'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]])),fetch=global.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://room-test.invalid',SUPABASE_PUBLISHABLE_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'secret-service-fixture'});
  t.after(()=>{global.fetch=fetch;for(const key of keys)if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key];});
}

test('room generator is a Netlify scheduled function every 15 minutes, with no URL redirect',()=>{
  const config=fs.readFileSync(require.resolve('../netlify.toml'),'utf8');
  assert.match(config,/\[functions\."room-plan-generate"\]\s*schedule\s*=\s*"\*\/15 \* \* \* \*"/);
  assert.doesNotMatch(config,/to\s*=\s*"[^"\n]*room-plan-generate/);
});

test('scheduled generator invokes only the service RPC with database-owned default range',async t=>{
  setup(t);let calls=0;
  global.fetch=async(url,options)=>{calls++;assert.equal(url,'https://room-test.invalid/rest/v1/rpc/room_generate_plans');assert.equal(options.headers.apikey,'secret-service-fixture');assert.equal(options.headers.authorization,'Bearer secret-service-fixture');assert.deepEqual(JSON.parse(options.body),{p_from:null,p_to:null});return {ok:true,json:async()=>({inserted:4})};};
  const result=await handler({body:JSON.stringify({...JSON.parse(scheduled.body),p_from:'1900-01-01',p_to:'2200-01-01'})});
  assert.equal(calls,1);assert.equal(result.statusCode,200);assert.deepEqual(JSON.parse(result.body),{generated:{inserted:4}});assert.ok(!result.body.includes('secret-service'));
});

test('anonymous URL events and forged scheduler headers do not invoke RPC',async t=>{
  setup(t);global.fetch=()=>assert.fail('anonymous request reached RPC');
  for(const event of [{},{httpMethod:'GET',path:'/.netlify/functions/room-plan-generate'},{...scheduled,httpMethod:'POST',path:'/.netlify/functions/room-plan-generate',headers:{'x-netlify-event':'schedule'}},{...scheduled,rawUrl:'https://room-test.invalid/.netlify/functions/room-plan-generate'},{...scheduled,requestContext:{http:{method:'POST'}}},{body:'bad json'},{body:'{"next_run":"invalid"}'}]){
    assert.equal((await handler(event)).statusCode,403);
  }
});

test('missing service configuration fails scheduled invocation without network or secret output',async t=>{
  setup(t);global.fetch=()=>assert.fail('unconfigured request reached RPC');
  for(const key of ['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY']){const old=process.env[key];delete process.env[key];await assert.rejects(handler(scheduled),/^Error: Room plan generation service is not configured$/);process.env[key]=old;}
});

test('RPC failures are visible scheduled failures with sanitized error messages',async t=>{
  setup(t);global.fetch=async()=>({ok:false,status:503,json:async()=>({message:'private database details secret-service-fixture'})});
  await assert.rejects(handler(scheduled),/^Error: Room plan generation failed$/);
  global.fetch=async()=>{throw Error('network failure secret-service-fixture');};
  await assert.rejects(handler(scheduled),/^Error: Room plan generation failed$/);
});
