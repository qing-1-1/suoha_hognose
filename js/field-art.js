/* Original hognose engraving, shared by the public hero and private sign-in. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('#fieldCanvas, [data-hognose-art]').forEach(canvas => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const stage = canvas.closest('.hero, .login-art');
    let visible = false, frame = 0, elapsed = 0, previous = 0;
    let targetX = 0, targetY = 0, lookX = 0, lookY = 0;
    const point = t => {
      const a = t * Math.PI * 4.25 - .7, r = 195 * (1 - .36 * t);
      return {x: Math.cos(a) * r, y: Math.sin(a) * r * .58 - (t - .5) * 225};
    };
    const tangent = t => {const a = point(t), b = point(t + .001); return Math.atan2(b.y - a.y, b.x - a.x);};
    function path(points) {
      ctx.beginPath();points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));ctx.stroke();
    }
    function drawHead() {
      const p = point(1);
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(tangent(1));
      // A short, rounded head with a raised, shovel-shaped rostral edge.
      const outline = new Path2D('M -27 -27 C -10 -27 -5 -36 12 -35 C 31 -34 43 -23 53 -15 Q 61 -14 67 -22 Q 73 -24 75 -18 Q 76 -11 69 -5 C 55 8 39 29 19 32 C 1 35 -10 25 -27 27');
      ctx.fillStyle = '#1c281f';ctx.fill(outline);
      ctx.strokeStyle = 'rgba(207,222,164,.72)';ctx.lineWidth = 1.05;ctx.stroke(outline);
      ctx.save();ctx.clip(outline);
      // Contour hatching gives the head the same woven line weight as the coil.
      for(let i=-28;i<72;i+=4){
        ctx.beginPath();ctx.moveTo(i,-43);ctx.bezierCurveTo(i+15,-15,i+12,11,i-3,40);
        ctx.strokeStyle='rgba(195,214,153,.3)';ctx.lineWidth=.65;ctx.stroke();
      }
      ctx.strokeStyle='rgba(208,222,167,.55)';ctx.lineWidth=.8;
      const shields=[
        [[-19,-17],[-4,-25],[12,-24],[19,-9],[3,-2],[-15,-5],[-19,-17]],
        [[-15,-5],[3,-2],[15,11],[7,24],[-9,19],[-15,-5]],
        [[12,-24],[30,-19],[36,-8],[19,-9]],
        [[19,-9],[36,-8],[42,3],[29,14],[15,11]],
        [[7,24],[24,26],[29,14]],[[36,-8],[51,-10],[57,-2],[42,3]],
        [[51,-10],[65,-19],[70,-15],[65,-5],[57,-2]]
      ];
      shields.forEach(path);
      // Lower jaw and small labial scales, without glossy cartoon highlights.
      ctx.strokeStyle='rgba(213,225,176,.65)';
      ctx.beginPath();ctx.moveTo(-4,23);ctx.bezierCurveTo(20,29,45,12,65,-2);ctx.stroke();
      for(let i=0;i<6;i++)path([[i*7+7,24-i*2.7],[i*7+9,29-i*3.1]]);
      ctx.restore();
      // Near eye is round; the far eye recedes in the three-quarter view.
      for(const [x,y,r,alpha] of [[34,13,4.4,.85],[32,-22,2.5,.45]]){
        ctx.fillStyle='#142018';ctx.beginPath();ctx.arc(x,y,r+2,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle=`rgba(216,229,179,${alpha})`;ctx.lineWidth=.9;ctx.stroke();
        ctx.beginPath();ctx.arc(x,y,r*.52,0,Math.PI*2);ctx.stroke();
      }
      ctx.beginPath();ctx.ellipse(56,-7,1.8,1.1,-.5,0,Math.PI*2);ctx.strokeStyle='#b6c991';ctx.stroke();
      path([[64,-20],[70,-23],[74,-18]]);
      ctx.restore();
    }
    function draw() {
      const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(devicePixelRatio||1,2);
      if(!width||!height)return;
      if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      const progress=reduced.matches?1:Math.min(1,.18+elapsed/1350);
      ctx.save();ctx.translate(width*.5,height*.53);ctx.scale(Math.min(width/660,height/660),Math.min(width/660,height/660));
      ctx.translate(lookX*14,lookY*9+(reduced.matches?0:Math.sin(elapsed/3000)*2));ctx.rotate(-.28+lookX*.02);
      const glow=ctx.createRadialGradient(0,0,30,0,0,300);glow.addColorStop(0,'rgba(163,185,111,.055)');glow.addColorStop(1,'rgba(163,185,111,0)');ctx.fillStyle=glow;ctx.fillRect(-360,-360,720,720);
      for(let i=0;i<265;i++){
        const t=i/264,p=point(t),a=t*Math.PI*4.25-.7;
        const body=(8+Math.sin(Math.PI*Math.min(t*1.25,1)*.83)*36)*(1-.13*Math.max(0,(t-.87)/.13));
        const light=(Math.sin(a+.8)+1)/2;
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(tangent(t));
        ctx.beginPath();ctx.ellipse(0,0,7,body,0,0,Math.PI*2);
        ctx.fillStyle='#1c281f';ctx.fill();
        ctx.strokeStyle=`rgba(193,212,151,${(.23+light*.36)*Math.min(1,Math.max(.12,(progress-t)*5))})`;ctx.lineWidth=.65;ctx.stroke();
        for(let k=-3;k<=3;k++){
          const sy=k/3*body*.86;
          ctx.beginPath();ctx.ellipse((i%2)*3-1,sy,3.7,2.7,.2,0,Math.PI*2);
          ctx.strokeStyle=`rgba(210,224,172,${(.22+light*.36)*Math.min(1,progress*1.5)})`;ctx.lineWidth=.65;ctx.stroke();
        }
        ctx.restore();
      }
      ctx.globalAlpha=Math.min(1,.25+progress);drawHead();ctx.restore();
      canvas.dataset.artReady=progress===1?'true':'false';
    }
    function animate(now){
      if(!previous)previous=now;
      const delta=now-previous;
      if(delta>=32){elapsed+=Math.min(delta,80);previous=now;lookX+=(targetX-lookX)*.09;lookY+=(targetY-lookY)*.09;draw();}
      frame=requestAnimationFrame(animate);
    }
    function sync(){cancelAnimationFrame(frame);previous=0;if(visible&&!document.hidden&&!reduced.matches)frame=requestAnimationFrame(animate);else draw();}
    stage?.addEventListener('pointermove',event=>{if(reduced.matches||event.pointerType==='touch')return;const box=stage.getBoundingClientRect();targetX=(event.clientX-box.left)/box.width-.5;targetY=(event.clientY-box.top)/box.height-.5;});
    stage?.addEventListener('pointerleave',()=>{targetX=targetY=0;});
    new ResizeObserver(draw).observe(canvas);
    new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();}).observe(canvas);
    document.addEventListener('visibilitychange',sync);
    reduced.addEventListener('change',()=>{if(reduced.matches){lookX=lookY=0;}sync();});
    draw();
  });
})();
