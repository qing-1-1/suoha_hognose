const test=require('node:test'),assert=require('node:assert/strict');
const {collect}=require('../js/reminders');
test('reminders cover workflows, exclude completed records and avoid payment/order duplication',()=>{
 const model={inquiries:[{id:1,status:'reserved'},{id:2,status:'new'},{id:3,status:'paid'},{id:4,status:'completed'}],receipts:[{id:9,inquiry_id:1,status:'pending'}],clutches:[{id:5,status:'hatched',hatched_count:2}]};
 const tasks=collect({model,raw:{snakes:[{clutch_id:5}],plans:[{id:6,review_status:'pending'}]}});
 assert.equal(tasks.length,5);assert.ok(tasks.some(t=>t.key==='receipt:9'));assert.ok(!tasks.some(t=>t.key.startsWith('sale:1:')));assert.ok(tasks.some(t=>t.key==='hatchlings:5:1'));
});
test('dismissal keys renew when a deadline or business stage changes',()=>{
 const a=collect({breeding:[{key:'1:出壳:2:2026-10-09',days:1,title:'Test',date:'2026-10-09',stage:'出壳'}]});
 const b=collect({breeding:[{key:'1:出壳:2:2026-10-09',days:0,title:'Test',date:'2026-10-09',stage:'出壳'}]});assert.notEqual(a[0].key,b[0].key);
});
