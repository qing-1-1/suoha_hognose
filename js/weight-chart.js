/* Shared, read-only chart for authenticated individual and room workspaces. */
(function(root,factory){'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.SuohaWeightChart=api;})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>String(Number(Number(value).toPrecision(12)));
  function series(records,snakeId){
    return (records||[]).filter(r=>String(r.snake_id)===String(snakeId)&&r.weight_g!=null&&String(r.weight_g).trim()!==''&&Number.isFinite(Number(r.weight_g))&&Number(r.weight_g)>=0&&/^\d{4}-\d{2}-\d{2}$/.test(r.measured_at)&&Number.isFinite(Date.parse(r.measured_at)))
      .slice().sort((a,b)=>a.measured_at.localeCompare(b.measured_at)||String(a.id??'').localeCompare(String(b.id??''),undefined,{numeric:true}))
      .map(r=>({date:r.measured_at,weight:Number(r.weight_g),id:r.id}));
  }
  function layout(records,snakeId){
    const rows=series(records,snakeId);if(!rows.length)return {points:[],ticks:[]};
    const max=Math.max(...rows.map(r=>r.weight)),rough=Math.max(max*1.15,1)/4,power=10**Math.floor(Math.log10(rough));
    const step=([1,2,5,10].find(n=>n*power>=rough)||10)*power,ceiling=Math.ceil(Math.max(max*1.15,1)/step)*step;
    const ticks=Array.from({length:Math.round(ceiling/step)+1},(_,i)=>({value:Number(number(i*step)),y:100-i*step/ceiling*100}));
    const points=rows.map((r,i)=>({...r,x:rows.length===1?50:i/(rows.length-1)*100,y:100-r.weight/ceiling*100}));
    return {points,ticks,ceiling,width:Math.max(260,(rows.length-1)*82+100)};
  }
  function render(records,snakeId,{error=false}={}){
    if(error)return '<p class="weight-chart-empty" role="status">体重记录读取失败，请刷新重试。</p>';
    const chart=layout(records,snakeId),points=chart.points;
    if(!points.length)return '<p class="weight-chart-empty">暂无有效体重记录，称重后将在这里显示。</p>';
    const description=points.map(p=>p.date+'，'+number(p.weight)+' 克').join('；');
    return `<figure class="weight-trend weight-chart"><figcaption>实际体重 · ${points.length} 次测量</figcaption><div class="weight-chart-frame"><div class="weight-chart-axis" aria-hidden="true"><span class="weight-chart-unit">重量（g）</span><div class="weight-chart-axis-ticks">${chart.ticks.map(t=>`<div style="top:${t.y}%"><span class="weight-chart-tick">${number(t.value)}</span></div>`).join('')}</div></div><div class="weight-chart-scroll" role="region" aria-label="体重记录坐标图，可横向滚动" tabindex="0"><div class="weight-chart-canvas" style="min-width:${chart.width-12}px" role="img" aria-label="${escape(snakeId)} 体重趋势；${escape(description)}"><div class="weight-chart-plot" aria-hidden="true">${chart.ticks.map(t=>`<div class="weight-chart-grid" style="top:${t.y}%"></div>`).join('')}${points.length>1?`<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${points.map(p=>p.x+','+p.y).join(' ')}" fill="none" stroke="#718953" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`:''}${points.map(p=>`<span class="weight-chart-point" data-weight="${p.weight}" style="left:${p.x}%;top:${p.y}%" title="${escape(p.date)} · ${number(p.weight)} g"><span class="weight-chart-value">${number(p.weight)} g</span><i></i></span><time class="weight-chart-date" style="left:${p.x}%" datetime="${escape(p.date)}">${escape(p.date)}</time>`).join('')}</div></div></div></div><p class="weight-chart-note">横轴按测量记录顺序排列${points.length>2?' · 可横向滑动查看全部记录':''}</p></figure>`;
  }
  return {series,layout,render};
});
