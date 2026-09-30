const test=require('node:test');const assert=require('node:assert/strict');const {catalog}=require('../netlify/functions/lib/public-data');
function configure(t){for(const [key,value] of Object.entries({SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public'})){const prior=process.env[key];process.env[key]=value;t.after(()=>{if(prior===undefined)delete process.env[key];else process.env[key]=prior;});}}
test('catalog forwards structured filters and publishes only projected fields',async t=>{
 configure(t);t.mock.method(global,'fetch',async(url,options)=>{assert.match(url,/public_catalog_v2$/);const body=JSON.parse(options.body);assert.equal(body.p_year,2025);assert.equal(body.p_gene,'lavender');assert.equal(body.p_gene_state,'possible_het');return{ok:true,json:async()=>({items:[{id:'a',title:'公开',notes:'内部',photos:[]}],total:35,page:2,years:[2025],gene_options:[{id:'lavender',name:'薰衣草'}]})};});
 const data=await catalog({year:'2025',gene:'lavender',gene_state:'possible_het',page:'2'});assert.equal(data.total,35);assert.equal(data.page,2);assert.equal(data.items[0].notes,undefined);assert.deepEqual(data.years,[2025]);
});
test('legacy catalog fallback never silently ignores a requested advanced filter',async t=>{
 configure(t);let oldCalls=0;t.mock.method(global,'fetch',async url=>{if(url.endsWith('public_catalog_v2'))return{ok:false,status:404,json:async()=>({message:'Could not find the function public.public_catalog_v2 in schema cache'})};oldCalls++;return{ok:true,json:async()=>({items:[],total:0,page:1})};});
 await catalog({});assert.equal(oldCalls,1);await assert.rejects(catalog({year:'2025'}),/public_catalog_v2/);assert.equal(oldCalls,1);
});
