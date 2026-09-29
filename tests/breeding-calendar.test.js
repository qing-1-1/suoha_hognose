const test=require('node:test');const assert=require('node:assert/strict');
const {reminders}=require('../js/breeding-calendar');
const plan=extra=>({id:1,title:'计划',status:'planned',review_status:'approved',reminders_enabled:true,reminder_days:3,expected_pairing_date:'2026-10-01',events:[],clutches:[],...extra});
test('reminders include upcoming, today and overdue dates without time-zone drift',()=>{
 assert.equal(reminders([plan()], '2026-09-27').length,0);
 assert.equal(reminders([plan()], '2026-09-28')[0].days,3);
 assert.equal(reminders([plan()], '2026-10-01')[0].days,0);
 assert.equal(reminders([plan()], '2026-10-03')[0].days,-2);
});
test('disabled, cancelled, completed and unapproved plans do not notify',()=>{
 for(const change of [{reminders_enabled:false},{status:'cancelled'},{status:'completed'},{review_status:'pending'},{review_status:'returned'}])assert.equal(reminders([plan(change)],'2026-10-01').length,0);
});
test('actual mating resolves pairing; failed mating suppresses laying and hatching expectations',()=>{
 const p=plan({expected_laying_date:'2026-10-02',expected_hatching_date:'2026-10-03',events:[{date:'2026-10-01',status:'unsuccessful'}]});
 assert.equal(reminders([p],'2026-10-03').length,0);
});
test('each incubating clutch has its own date and started/completed hatches stop notifying',()=>{
 const p=plan({expected_laying_date:'2026-10-02',expected_hatching_date:'2026-10-10',events:[{date:'2026-10-01',status:'successful'}],clutches:[{id:1,laid:'2026-10-02',expected_hatch:'2026-10-09',status:'incubating'},{id:2,laid:'2026-10-02',status:'incubating',hatch_start:'2026-10-08'},{id:3,laid:'2026-10-02',status:'failed'}]});
 const result=reminders([p],'2026-10-09');assert.equal(result.length,1);assert.equal(result[0].clutch,1);assert.equal(result[0].stage,'出壳');
});
