const test=require('node:test');
const assert=require('node:assert/strict');
const {catalog}=require('../netlify/functions/lib/public-data');
const page=require('../netlify/functions/specimen-page');
const paths=['aaaa/bbbb.webp','aaaa/cccc.webp','aaaa/dddd.webp'];
const row={slug:'test',title:'test',photos:[{path:paths[0],thumbnail_path:paths[1]},{path:paths[2]}]};
function setup(t,fetch){
  for(const [key,value] of Object.entries({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'})){
    const previous=process.env[key];process.env[key]=value;
    t.after(()=>{if(previous===undefined)delete process.env[key];else process.env[key]=previous;});
  }
  t.mock.method(global,'fetch',fetch);
}
test('catalog signs only covers in one batch; detail signs all photos with public credentials',async t=>{
  const calls=[];
  setup(t,async(url,options)=>{
    calls.push(url);
    if(url.endsWith('/auction_catalog'))return {ok:true,json:async()=>({})};
    if(url.includes('/rpc/'))return {ok:true,json:async()=>({items:[row],total:1})};
    assert.equal(options.headers.apikey,'public');assert.equal(options.headers.authorization,undefined);
    const body=JSON.parse(options.body);assert.equal(body.expiresIn,60);
    assert.deepEqual(body.paths,calls.length===3?paths.slice(0,2):paths);
    return {ok:true,json:async()=>body.paths.map(path=>({path,signedURL:`/object/sign/specimen-media/${path}?token=valid`}))};
  });
  const list=await catalog();assert.equal(calls.length,3);
  assert.match(list.items[0].photos[0].thumbnail_url,/https:\/\/example.supabase.co\/storage\/v1\/object\/sign\/specimen-media\/aaaa\/cccc.webp/);
  assert.match(list.items[0].photos[0].fallback_url,/^\/\.netlify\/functions\/specimen-media/);
  assert.match(list.items[0].photos[1].url,/^\/\.netlify/);
  const detail=await catalog({slug:'test'});assert.equal(calls.length,6);
  assert.match(detail.items[0].photos[1].url,/^https:/);
});
test('failed or untrusted signatures retain the checked media endpoint',async t=>{
  let variant=0;
  setup(t,async url=>{
    if(url.includes('/rpc/'))return {ok:true,json:async()=>({items:[row]})};
    if(variant===0)throw Error('timeout');
    return {ok:true,json:async()=>[
      {path:paths[0],signedURL:`https://evil.example/storage/v1/object/sign/specimen-media/${paths[0]}?token=x`},
      {path:paths[1],signedURL:`/object/sign/specimen-media/${paths[2]}?token=x`},
      {path:'aaaa/private.webp',signedURL:'/object/sign/specimen-media/aaaa/private.webp?token=x'}
    ]};
  });
  for(variant=0;variant<2;variant++){
    const result=await catalog();assert.match(result.items[0].photos[0].url,/^\/\.netlify/);
    assert.match(result.items[0].photos[0].thumbnail_url,/^\/\.netlify/);
  }
});
test('direct detail embeds reusable public data and safely escapes script markup',async t=>{
  setup(t,async()=>({ok:true,json:async()=>({items:[{slug:'test',title:'</script><script>alert(1)</script>',photos:[]}]})}));
  const result=await page.handler({queryStringParameters:{slug:'test'}});
  assert.equal(result.statusCode,200);
  const payload=result.body.match(/<script id="specimenInitialData" type="application\/json">(.*?)<\/script>/s)[1];
  assert.equal(payload.includes('<'),false);
  assert.equal(JSON.parse(payload).catalog.items[0].title,'</script><script>alert(1)</script>');
});
