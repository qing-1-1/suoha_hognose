/* Original generative brand artwork. Never presented as a real animal photo. */
(() => {
  const canvas = document.getElementById('fieldCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true, frame = 0, phase = 0, width, height;
  function draw() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    width = canvas.clientWidth; height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== width*dpr || canvas.height !== height*dpr) { canvas.width=width*dpr;canvas.height=height*dpr; }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const scale = Math.min(width/760,height/760);
    ctx.save();ctx.translate(width*.51,height*.53);ctx.scale(scale,scale);ctx.rotate(-.28);
    const glow=ctx.createRadialGradient(0,20,40,0,20,330);glow.addColorStop(0,'rgba(163,185,111,.09)');glow.addColorStop(1,'rgba(163,185,111,0)');ctx.fillStyle=glow;ctx.fillRect(-420,-420,840,840);
    // An undulating 3D coil constructed from elliptical cross-sections.
    const segments=245;
    for(let i=0;i<segments;i++){
      const t=i/(segments-1), a=t*Math.PI*4.25-.7;
      const radius=195*(1-.36*t), x=Math.cos(a)*radius, y=Math.sin(a)*radius*.58+(t-.5)*-225;
      const next=t+.002, na=next*Math.PI*4.25-.7, nr=195*(1-.36*next);
      const angle=Math.atan2(Math.sin(na)*nr*.58+(next-.5)*-225-y,Math.cos(na)*nr-x);
      const body=8+Math.sin(Math.PI*Math.min(t*1.25,1)*.83)*36;
      const light=(Math.sin(a+.8)+1)/2;
      ctx.save();ctx.translate(x,y);ctx.rotate(angle);
      ctx.beginPath();ctx.ellipse(0,0,8,body,0,0,Math.PI*2);
      ctx.fillStyle=`rgb(${Math.round(49+light*62)},${Math.round(58+light*61)},${Math.round(39+light*42)})`;ctx.fill();
      for(let k=-3;k<=3;k++){
        const v=k/3, sy=v*body*.85;
        ctx.beginPath();ctx.ellipse((i%2)*3,sy,3.5,3,Math.PI*.2,0,Math.PI*2);
        ctx.strokeStyle=`rgba(211,216,163,${.09+light*.19+Math.sin(phase+t*9)*.02})`;ctx.lineWidth=.65;ctx.stroke();
      }
      ctx.beginPath();ctx.ellipse(-1,-body*.2,3.5,body*.45,0,0,Math.PI*2);ctx.fillStyle='rgba(15,26,14,.26)';ctx.fill();ctx.restore();
    }
    const a=Math.PI*4.25-.7, r=195*.64,x=Math.cos(a)*r,y=Math.sin(a)*r*.58-112.5;
    ctx.save();ctx.translate(x,y);ctx.rotate(a+Math.PI/2);
    const head=ctx.createLinearGradient(0,-36,0,36);head.addColorStop(0,'#b7bd85');head.addColorStop(.45,'#858e5d');head.addColorStop(1,'#3e4d2f');
    ctx.fillStyle=head;ctx.beginPath();ctx.moveTo(-18,-29);ctx.bezierCurveTo(9,-39,39,-21,47,-8);ctx.quadraticCurveTo(57,-3,46,9);ctx.bezierCurveTo(25,34,-4,38,-22,21);ctx.closePath();ctx.fill();
    for(let i=0;i<7;i++){ctx.strokeStyle='#d5d8a32e';ctx.beginPath();ctx.moveTo(-13+i*6,-22);ctx.quadraticCurveTo(-3+i*6,0,-14+i*6,24);ctx.stroke();}
    ctx.fillStyle='#131e10';ctx.beginPath();ctx.ellipse(26,-17,5,6,-.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#cfd3a6';ctx.beginPath();ctx.arc(27,-19,1.4,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.restore();
  }
  let previous=0;
  function animate(now){if(now-previous>65){phase+=.014;draw();previous=now;}if(visible&&!reduced.matches)frame=requestAnimationFrame(animate);}
  new ResizeObserver(draw).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;cancelAnimationFrame(frame);if(visible&&!reduced.matches)frame=requestAnimationFrame(animate);else draw();}).observe(canvas);
  reduced.addEventListener('change',()=>{cancelAnimationFrame(frame);if(visible&&!reduced.matches)frame=requestAnimationFrame(animate);else draw();});
  draw();
})();
