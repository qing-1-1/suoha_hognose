const test=require('node:test');
const assert=require('node:assert/strict');
const page=require('../netlify/functions/specimen-page');
const media=require('../netlify/functions/specimen-media');
function setup(t,fetch){
  t.mock.method(global,'fetch',fetch);
  for(const [name,value] of Object.entries({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-secret'})){
    const previous=process.env[name];process.env[name]=value;
    t.after(()=>{if(previous===undefined)delete process.env[name];else process.env[name]=previous;});
  }
}
test('direct and rewritten detail routes resolve the same public specimen',async t=>{
  setup(t,async(url,options)=>{assert.equal(JSON.parse(options.body).p_slug,'specimen-y005');return {ok:true,json:async()=>({items:[{title:'Y005',snake_id:'Y005',description:null,photos:[]} ]})};});
  for(const event of [{queryStringParameters:{slug:'specimen-y005'}},{path:'/specimens/specimen-y005'},{path:'/.netlify/functions/specimen-page',rawUrl:'https://example.com/specimens/specimen-y005?utm_source=share'}]){
    const result=await page.handler(event);assert.equal(result.statusCode,200);assert.match(result.body,/<title>Y005/);
  }
  assert.equal((await page.handler({path:'/specimens/../private'})).statusCode,404);
  assert.equal((await page.handler({path:'/specimens/specimen-y005',queryStringParameters:{slug:'../private'}})).statusCode,404);
});
test('private media is read only after publication check, using server credentials',async t=>{
  let published=true,reads=0;
  setup(t,async(url,options)=>{
    if(url.includes('/rpc/')){assert.equal(options.headers.apikey,'public');return {ok:true,json:async()=>published};}
    reads++;assert.equal(options.headers.apikey,'server-secret');assert.equal(options.headers.authorization,'Bearer server-secret');
    return {ok:true,headers:new Headers({'content-type':'image/webp'}),arrayBuffer:async()=>Buffer.from('image bytes')};
  });
  const event={httpMethod:'GET',queryStringParameters:{path:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp'}};
  const result=await media.handler(event);assert.equal(result.statusCode,200);assert.equal(Buffer.from(result.body,'base64').toString(),'image bytes');assert.equal(result.headers['cache-control'],'no-store');
  published=false;assert.equal((await media.handler(event)).statusCode,404);assert.equal(reads,1);
  assert.equal((await media.handler({...event,queryStringParameters:{path:'../private'}})).statusCode,404);assert.equal(reads,1);
});
