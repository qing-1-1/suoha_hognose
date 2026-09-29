/* Original generative brand artwork. Never presented as a real animal photo. */
(() => {
  const canvas = document.getElementById('fieldCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let visible = true, frame = 0, phase = 0, width, height;
  let targetX=0,targetY=0,lookX=0,lookY=0;
  const hero=canvas.closest('.hero');
  hero.addEventListener('pointermove',event=>{if(reduced.matches||event.pointerType==='touch')return;const box=hero.getBoundingClientRect();targetX=(event.clientX-box.left)/box.width-.5;targetY=(event.clientY-box.top)/box.height-.5;hero.style.setProperty('--pointer-x',targetX);hero.style.setProperty('--pointer-y',targetY);});
  hero.addEventListener('pointerleave',()=>{targetX=targetY=0;hero.style.setProperty('--pointer-x',0);hero.style.setProperty('--pointer-y',0);});
  function draw() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    width = canvas.clientWidth; height = canvas.clientHeight;
    if (!width || !height) return;
    if (canvas.width !== width*dpr || canvas.height !== height*dpr) { canvas.width=width*dpr;canvas.height=height*dpr; }
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const scale = Math.min(width/760,height/760);
    ctx.save();ctx.translate(width*.51,height*.53);ctx.scale(scale,scale);ctx.translate(lookX*20,lookY*12+(reduced.matches?0:Math.sin(phase)*3));ctx.rotate(-.28+lookX*.025);
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
    const angle=Math.atan2(Math.cos(a)*r*.58-225/(Math.PI*4.25),-Math.sin(a)*r);
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    // Broad neck, tapered cheeks and a distinctly raised rostral (hog-nose) scale.
    const head=ctx.createLinearGradient(0,-34,0,34);head.addColorStop(0,'#aeb57b');head.addColorStop(.42,'#929e66');head.addColorStop(1,'#3c4b30');
    ctx.beginPath();ctx.moveTo(-19,-30);ctx.bezierCurveTo(6,-39,30,-29,47,-17);ctx.quadraticCurveTo(58,-14,67,-18);ctx.quadraticCurveTo(79,-6,68,7);ctx.quadraticCurveTo(60,11,48,14);ctx.bezierCurveTo(30,28,8,36,-19,28);ctx.quadraticCurveTo(-8,0,-19,-30);ctx.closePath();ctx.fillStyle=head;ctx.fill();
    ctx.strokeStyle='rgba(220,228,171,.26)';ctx.lineWidth=1;ctx.stroke();
    // Shield-like head scales rather than ribbing across the face.
    const plates=[[[0,-17],[15,-23],[29,-13],[23,0],[4,1]],[[4,1],[23,0],[31,14],[13,23],[-1,17]],[[29,-13],[45,-9],[48,2],[23,0]],[[23,0],[48,2],[44,12],[31,14]]];
    plates.forEach(points=>{ctx.beginPath();points.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();ctx.fillStyle='rgba(192,204,143,.08)';ctx.fill();ctx.stroke();});
    ctx.fillStyle='#b2ba7e';ctx.beginPath();ctx.moveTo(57,-12);ctx.quadraticCurveTo(71,-23,73,-9);ctx.lineTo(66,5);ctx.lineTo(56,3);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#263723';ctx.lineWidth=1.6;ctx.beginPath();ctx.moveTo(8,23);ctx.quadraticCurveTo(38,22,65,7);ctx.stroke();
    for(const side of [-1,1]){ctx.save();ctx.translate(34,side*18);ctx.rotate(side*.2);ctx.fillStyle='#26331e';ctx.beginPath();ctx.ellipse(0,0,8,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#b3a960';ctx.beginPath();ctx.arc(1,0,3.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='#111c13';ctx.beginPath();ctx.arc(1,0,2.6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#eef2cf';ctx.beginPath();ctx.arc(2,-1.3,.9,0,Math.PI*2);ctx.fill();ctx.restore();}
    ctx.fillStyle='#34452b';for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(56,side*8,2.1,1.3,side*.3,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    ctx.restore();
  }
  let previous=0;
  function animate(now){if(now-previous>65){phase+=.014;lookX+=(targetX-lookX)*.12;lookY+=(targetY-lookY)*.12;draw();previous=now;}if(visible&&!reduced.matches)frame=requestAnimationFrame(animate);}
  new ResizeObserver(draw).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;cancelAnimationFrame(frame);if(visible&&!reduced.matches)frame=requestAnimationFrame(animate);else draw();}).observe(canvas);
  reduced.addEventListener('change',()=>{cancelAnimationFrame(frame);if(visible&&!reduced.matches)frame=requestAnimationFrame(animate);else draw();});
  draw();
})();
