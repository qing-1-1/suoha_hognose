const test=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function api(){const context={window:{},console};vm.runInNewContext(fs.readFileSync('js/data.js','utf8'),context);return context.window.SuohaData;}
test('ranged reads include older records even when server cap is smaller than requested page',async()=>{
 const rows=Array.from({length:1105},(_,id)=>({id})),calls=[];
 const client={from(){return{select(){return this},order(){return this},range(start,end){calls.push([start,end]);return Promise.resolve({data:rows.slice(start,Math.min(end+1,start+200)),count:rows.length,error:null});}};}};
 const r=await api().fetchAll(client,'snakes');assert.equal(r.data.length,1105);assert.equal(r.count,1105);assert.equal(r.data.at(-1).id,1104);assert.equal(calls.length,6);
});
test('partial read errors do not become a successful truncated collection',async()=>{
 let calls=0;const client={from(){return{select(){return this},order(){return this},range(){return Promise.resolve(++calls===1?{data:Array.from({length:500},(_,id)=>({id})),count:501}:{error:{message:'network failure'}});}};}};
 const r=await api().fetchAll(client,'snakes');assert.equal(r.data.length,0);assert.equal(r.error.message,'network failure');
});
