const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../js/weight-chart.js');
const row=(weight,date='2026-10-20',id='1')=>({id,snake_id:'A',weight_g:weight,measured_at:date});

test('weight chart shares actual values, sorts dates and same-day IDs, and does not mutate records',()=>{
 const records=[row('21.2','2026-10-20','10'),row(19,'2026-09-20'),row(21,'2026-10-20','2'),{...row(200),snake_id:'B'},row(null),row(''),row(' '),row('invalid'),row(-1),row(20,'bad')],before=structuredClone(records);
 assert.deepEqual(C.series(records,'A').map(p=>p.weight),[19,21,21.2]);assert.deepEqual(records,before);
 const html=C.render(records,'A');assert.match(html,/21\.2 g/);assert.match(html,/重量（g）/);assert.match(html,/weight-chart-tick/);assert.doesNotMatch(html,/200 g/);
});
test('one measurement, zero and equal weights have finite coordinates and a genuine zero-based scale',()=>{
 for(const values of [[21.2],[0],[45,45,45],[.01,.02],[1,999.99]]){
  const data=C.layout(values.map((w,i)=>row(w,'2026-10-20',String(i))),'A');
  assert.equal(data.ticks[0].value,0);assert.ok(data.ceiling>Math.max(...values));
  for(const p of data.points){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.ok(p.y>=0&&p.y<=100);assert.ok(Math.abs((100-p.y)/100*data.ceiling-p.weight)<1e-8);}
  if(values.length===1)assert.equal(data.points[0].x,50);
 }
 assert.match(C.render([row(21.2)],'A'),/21\.2 g/);assert.doesNotMatch(C.render([row(21.2)],'A'),/<polyline/);
});
test('dense charts retain every point, leave label spacing, and report missing data or load errors honestly',()=>{
 const records=Array.from({length:80},(_,i)=>row(20+i/10,'2026-10-20',String(i)));
 const data=C.layout(records,'A');assert.equal(data.points.length,80);assert.ok((data.width-100)/79>=82);
 assert.equal((C.render(records,'A').match(/data-weight=/g)||[]).length,80);
 assert.match(C.render([],'A'),/暂无有效体重记录/);assert.match(C.render(records,'A',{error:true}),/读取失败/);
 assert.doesNotMatch(C.render(records,'A',{error:true}),/data-weight=/);
 assert.match(C.render([{...row(12),snake_id:'<img onerror=x>'}],'<img onerror=x>'),/&lt;img onerror=x&gt;/);
});
