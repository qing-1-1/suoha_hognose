const test=require('node:test'),assert=require('node:assert/strict');
const {handler}=require('../netlify/functions/manual-payment');
test('manual submission never trusts client amounts and buyer responses hide legacy amounts',async()=>{
 const original=global.fetch;const saved={...process.env};
 Object.assign(process.env,{SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'test',SUPABASE_PUBLISHABLE_KEY:'test',INQUIRY_HASH_SECRET:'test'});
 const id='11111111-1111-4111-8111-111111111111';let submitted;const calls=[];
 global.fetch=async(url,opts)=>{const name=url.split('/').pop();calls.push(name);const data=JSON.parse(opts.body);
  if(name==='auction_rate')return Response.json(true);
  if(name==='read_payment_orders')return Response.json({buyer_id:id,channels:[],orders:[{id,status:'reserved',receipts:[]}]});
  if(name==='submit_payment_receipt_v2'){submitted=data;return Response.json(id);}throw Error('Unexpected request');
 };
 try{
  const result=await handler({httpMethod:'POST',headers:{'content-type':'application/json',cookie:'suoha_bidder='+'a'.repeat(64),'x-nf-client-connection-ip':'127.0.0.1'},body:JSON.stringify({action:'receipt',order_id:id,request_id:id,channel:'wechat',fields:{transaction:'MANUAL-123',amount:'9999'},amount:9999,ocr_text:'-9999.00',ocr_fields:{amount:9999},recognized_amount:9999})});
  assert.equal(result.statusCode,200,result.body);assert.equal(submitted.p_hash,null);assert.equal(submitted.p_amount,null);assert.equal(submitted.p_amount_status,'no_image');assert.equal(submitted.p_fields.amount,undefined);assert.equal(submitted.p_ocr,'');assert.deepEqual(calls,['auction_rate','read_payment_orders','submit_payment_receipt_v2']);
  global.fetch=async()=>Response.json({buyer_id:id,channels:[],orders:[{receipts:[{fields:{transaction:'TEST',amount:9999}}]}]});
  const response=JSON.parse((await handler({httpMethod:'GET',headers:{}})).body);assert.equal(response.buyer_id,undefined);assert.equal(response.orders[0].receipts[0].fields.amount,undefined);
 }finally{global.fetch=original;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
