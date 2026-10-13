/* Parametric room renderer. Millimetres are world units; x/z locate cabinet centres. */
(function (global) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const colors = ['#2563EB','#15803D','#C2410C','#7C3AED','#0E7490','#BE185D','#946200'];
  const dayIndex = date => (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
  const points = vertices => vertices.map(p => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const poly = (vertices, attrs = '') => `<polygon points="${points(vertices)}" ${attrs}/>`;
  const line = (a,b,attrs='') => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${attrs}/>`;
  const ellipsize=(text,width,font)=>{const chars=Array.from(text),units=chars.map(c=>c.codePointAt(0)<256?.58:1),limit=width/font;if(units.reduce((a,b)=>a+b,0)<=limit)return text;let used=0,index=0;while(index<chars.length&&used+units[index]<=limit-1){used+=units[index++];}return chars.slice(0,index).join('')+'…';};
  class RoomScene {
    constructor(host, callbacks = {}) {
      this.host = host; this.callbacks = callbacks; this.state = {view:'plan',config:{width:5000,depth:4000,cabinets:[]}};
      this.camera = {zoom:1,x:0,y:0}; this.cameras={};this.animations=[];this.overlays=[];this.pointer = null; this.pointers = new Map(); this.uid = `rw${Math.random().toString(36).slice(2,9)}`;
      this.host.classList.add('rw-scene-host');
      this.host.innerHTML = '<div class="rw-scene-caption"></div><svg class="rw-scene" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="可缩放的爬房空间"><defs></defs><g class="rw-scene-world"></g></svg><div class="rw-scene-hint"></div><div class="rw-scene-scale"></div>';
      this.svg = host.querySelector('svg'); this.world = host.querySelector('.rw-scene-world');
      this.events = {click:e=>this.activate(e),keydown:e=>this.keydown(e),focusin:e=>{const target=e.target.closest('[data-slot],[data-cabinet]');if(target?.dataset.slot)this.lastFocusedSlot=target.dataset.slot;if(target)this.ensureVisible(target);},wheel:e=>this.wheel(e),pointerdown:e=>this.down(e),pointermove:e=>this.move(e),pointerup:e=>this.up(e),pointercancel:e=>this.up(e)};
      Object.entries(this.events).forEach(([name,handler])=>this.svg.addEventListener(name,handler,{passive:false}));
      this.lastSize=[host.clientWidth,host.clientHeight];this.resize = new ResizeObserver(()=>{const size=[host.clientWidth,host.clientHeight],changed=size.some((v,i)=>Math.abs(v-this.lastSize[i])>1);this.lastSize=size;if(changed&&this.bounds)this.render();else this.applyCamera();}); this.resize.observe(host);
    }
    update(next) {
      const oldView = this.state.view, oldCabinet = this.state.cabinetId;
      const changed=(next.view&&next.view!==oldView)||(next.cabinetId&&next.cabinetId!==oldCabinet);
      if(changed){this.animations.forEach(a=>a.cancel());this.overlays.forEach(el=>el.remove());this.animations=[];this.overlays=[];}
      let snapshot=null;
      if(next.view&&next.view!==oldView&&(next.view==='cabinet'||oldView==='cabinet')&&!global.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
        const source=oldView==='cabinet'?this.world:[...this.world.querySelectorAll('[data-cabinet]')].find(el=>el.dataset.cabinet===String(next.cabinetId));
        if(source){const rect=source.getBoundingClientRect(),clone=this.svg.cloneNode(true);clone.setAttribute('aria-hidden','true');clone.removeAttribute('role');clone.querySelectorAll('[tabindex],button').forEach(el=>el.setAttribute('tabindex','-1'));if(oldView!=='cabinet'){const world=clone.querySelector('.rw-scene-world');[...world.children].forEach(el=>{if(el.dataset.cabinet!==String(next.cabinetId))el.remove();});}snapshot={rect,clone,cabinetId:next.cabinetId||oldCabinet};}
      }
      this.pulseNow=next.highlightPulse===true||(next.highlightPulse!==false&&next.hoverDate&&next.hoverDate!==this.state.hoverDate);
      this.state = {...this.state,...next,...(next.config?{config:structuredClone(next.config)}:{})};
      if(oldView!==this.state.view){this.cameras[oldView]={...this.camera};this.camera={...(this.cameras[this.state.view]||{zoom:1,x:0,y:0})};}
      if(this.state.view==='cabinet'&&oldCabinet!==this.state.cabinetId)this.camera={zoom:1,x:0,y:0};
      this.render();
      if(oldView!==this.state.view||oldCabinet!==this.state.cabinetId) this.transition(oldView,snapshot);
    }
    setView(view,cabinetId) {this.update({view,cabinetId});this.callbacks.onViewChange?.({view,cabinetId});}
    transition(oldView,snapshot) {
      if(global.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
      if(snapshot){
        const target=this.state.view==='cabinet'?this.world:[...this.world.querySelectorAll('[data-cabinet]')].find(el=>el.dataset.cabinet===String(snapshot.cabinetId));
        if(target){const end=target.getBoundingClientRect(),start=snapshot.rect,host=this.host.getBoundingClientRect(),scale=Math.min(end.width/start.width,end.height/start.height),cx=start.left+start.width/2,cy=start.top+start.height/2;
          Object.assign(snapshot.clone.style,{position:'absolute',inset:'0',zIndex:'3',pointerEvents:'none',transformOrigin:`${cx-host.left}px ${cy-host.top}px`});this.host.append(snapshot.clone);this.overlays.push(snapshot.clone);
          const animation=snapshot.clone.animate([{transform:'translate(0,0) scale(1)',opacity:1},{transform:`translate(${end.left+end.width/2-cx}px,${end.top+end.height/2-cy}px) scale(${scale})`,opacity:0}],{duration:620,easing:'cubic-bezier(.22,.75,.15,1)'});this.animations.push(animation);animation.finished.then(()=>snapshot.clone.remove()).catch(()=>snapshot.clone.remove());
        }
      }
      this.animations.push(this.world.animate([{opacity:.1,transform:`scale(${this.state.view==='cabinet'?.88:1.07}) translateY(12px)`},{opacity:1,transform:'scale(1) translateY(0)'}],{duration:560,easing:'cubic-bezier(.16,1,.3,1)'}));
    }
    zoomBy(factor) {this.camera.zoom=Math.max(.5,Math.min(4,this.camera.zoom*factor));if(this.state.view==='cabinet')this.render();else this.applyCamera();}
    fit() {this.camera={zoom:1,x:0,y:0};if(this.state.view==='cabinet')this.render();else this.applyCamera();}
    applyCamera() {
      if(!this.bounds)return;
      const [x,y,w,h]=this.bounds, ratio=(this.host.clientWidth||800)/(this.host.clientHeight||600), bh=Math.max(h,w/ratio),bw=bh*ratio;
      this.fitted=[x+w/2-bw/2,y+h/2-bh/2,bw,bh];
      const fw=bw/this.camera.zoom,fh=bh/this.camera.zoom;
      this.svg.setAttribute('viewBox',`${x+w/2-fw/2+this.camera.x} ${y+h/2-fh/2+this.camera.y} ${fw} ${fh}`);
      this.host.querySelector('.rw-scene-scale').textContent=`${Math.round(this.camera.zoom*100)}% · ${this.state.view==='cabinet'?'柜体正面':this.state.view==='perspective'?'空间视角':'俯视平面'}`;
    }
    wheel(e) {e.preventDefault();const old=this.camera.zoom;this.camera.zoom=Math.max(.5,Math.min(4,old*Math.exp(-e.deltaY*.001)));const rect=this.svg.getBoundingClientRect();if(this.fitted){this.camera.x+=(e.clientX-rect.left-rect.width/2)/rect.width*this.fitted[2]*(1/old-1/this.camera.zoom);this.camera.y+=(e.clientY-rect.top-rect.height/2)/rect.height*this.fitted[3]*(1/old-1/this.camera.zoom);}if(this.state.view==='cabinet')this.render();else this.applyCamera();}
    down(e) {
      if(e.button!==0)return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      const cab=e.target.closest('[data-cabinet]');
      this.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,panX:this.camera.x,panY:this.camera.y,target:e.target.closest('[data-slot],[data-cabinet]'),cab:this.state.build&&this.state.view==='plan'?cab?.dataset.cabinet:null,moved:false};
      if(this.pointer.cab){const c=this.cabinets.find(c=>String(c.id)===this.pointer.cab);this.pointer.start={...c};}
      this.svg.setPointerCapture?.(e.pointerId);
      if(this.pointers.size===2){const p=[...this.pointers.values()];this.pinch={distance:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),zoom:this.camera.zoom};}
    }
    move(e) {
      if(!this.pointers.has(e.pointerId))return;this.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(this.pointers.size===2&&this.pinch){const p=[...this.pointers.values()];this.camera.zoom=Math.max(.5,Math.min(4,this.pinch.zoom*Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y)/this.pinch.distance));if(this.pointer)this.pointer.moved=true;this.applyCamera();return;}
      const p=this.pointer;if(!p||p.id!==e.pointerId||!this.fitted)return;
      const dx=e.clientX-p.x,dy=e.clientY-p.y;if(Math.hypot(dx,dy)>4)p.moved=true;if(!p.moved)return;
      const sx=this.fitted[2]/this.svg.clientWidth/this.camera.zoom,sy=this.fitted[3]/this.svg.clientHeight/this.camera.zoom;
      if(p.cab){const c=this.cabinets.find(c=>String(c.id)===p.cab), rotated=Math.abs(num(c.rotation)%180)===90,hw=(rotated?c.depth:c.width)/2,hd=(rotated?c.width:c.depth)/2;c.x=Math.round(Math.max(hw,Math.min(this.room.width-hw,p.start.x+dx*sx))/10)*10;c.z=Math.round(Math.max(hd,Math.min(this.room.depth-hd,p.start.z+dy*sy))/10)*10;this.render();}
      else {this.camera.x=p.panX-dx*sx;this.camera.y=p.panY-dy*sy;this.applyCamera();}
    }
    up(e) {this.pointers.delete(e.pointerId);if(this.pointers.size<2)this.pinch=null;const p=this.pointer;if(!p)return;if(p.cab&&p.moved){const c=this.cabinets.find(c=>String(c.id)===p.cab);this.callbacks.onMove?.({cabinetId:c.id,x:c.x,z:c.z,rotation:c.rotation});}this.preventClick=p.moved;this.clickTarget=p.moved?null:p.target;this.pointer=null;}
    activate(e) {if(this.preventClick){this.preventClick=false;return;}const target=e.target.closest('[data-slot],[data-cabinet]')||this.clickTarget;this.clickTarget=null;const slot=target?.closest('[data-slot]');if(slot){this.callbacks.onSlot?.(slot.dataset.slot);return;}const cab=target?.closest('[data-cabinet]');if(cab)this.callbacks.onCabinet?.(cab.dataset.cabinet);}
    focusSlot(slotId) {const target=[...this.world.querySelectorAll('[data-slot]')].find(el=>el.dataset.slot===String(slotId));target?.focus({preventScroll:true});return !!target;}
    ensureVisible(target) {
      if(!this.fitted)return;const host=this.host.getBoundingClientRect(),rect=target.getBoundingClientRect(),margin=16;
      const dx=rect.width>host.width-2*margin?rect.left+rect.width/2-host.left-host.width/2:rect.left<host.left+margin?rect.left-host.left-margin:rect.right>host.right-margin?rect.right-host.right+margin:0;
      const dy=rect.height>host.height-2*margin?rect.top+rect.height/2-host.top-host.height/2:rect.top<host.top+margin?rect.top-host.top-margin:rect.bottom>host.bottom-margin?rect.bottom-host.bottom+margin:0;
      if(dx||dy){this.camera.x+=dx*this.fitted[2]/this.camera.zoom/host.width;this.camera.y+=dy*this.fitted[3]/this.camera.zoom/host.height;this.applyCamera();}
    }
    keydown(e) {
      if(e.key==='Enter'||e.key===' '){e.preventDefault();this.activate(e);return;}
      const slot=e.target.closest('[data-slot]');if(!slot||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
      const cells=[...this.world.querySelectorAll('[data-slot]')],row=Number(slot.dataset.row),column=Number(slot.dataset.column);let target;
      if(e.key==='ArrowLeft'||e.key==='ArrowRight')target=cells.find(el=>Number(el.dataset.row)===row&&Number(el.dataset.column)===column+(e.key==='ArrowLeft'?-1:1));
      else if(e.key==='ArrowUp'||e.key==='ArrowDown'){const nextRow=row+(e.key==='ArrowUp'?1:-1),next=cells.filter(el=>Number(el.dataset.row)===nextRow);target=next[Math.min(column,next.length-1)];}
      else {const same=e.ctrlKey?[...cells].sort((a,b)=>Number(b.dataset.row)-Number(a.dataset.row)||Number(a.dataset.column)-Number(b.dataset.column)):cells.filter(el=>Number(el.dataset.row)===row);target=e.key==='Home'?same[0]:same.at(-1);}
      e.preventDefault();target?.focus({preventScroll:true});
    }
    slotTasks(id) {const state=this.state,dates=state.selectedDates instanceof Set?[...state.selectedDates]:state.selectedDates;return (state.tasks||[]).filter(t=>String(t.slotId??t.slot_id)===String(id)&&(!t.status||t.status==='pending')&&(state.hoverDate?t.date===state.hoverDate:!dates?.length||dates.includes(t.date)));}
    face(id) {
      const tasks=this.slotTasks(id), dates=[...new Set(tasks.map(t=>t.date))].sort();
      if(!dates.length)return {fill:`url(#${this.uid}-glass)`,stroke:'#9faeac',dates:[],pulse:''};
      const palette=global.SuohaRoomModel?.dayColors||colors;
      const dateColors=dates.map(d=>palette[dayIndex(d)]||colors[dayIndex(d)]),gradient=`${this.uid}-slot-${this.faceCounter++}`;
      this.extraDefs+=`<linearGradient id="${gradient}" x1="0" x2="1" y1="0" y2="0">${dateColors.map((c,i)=>`<stop offset="${i/dateColors.length}" stop-color="${escape(c)}"/><stop offset="${(i+1)/dateColors.length}" stop-color="${escape(c)}"/>`).join('')}</linearGradient>`;
      return {fill:`url(#${gradient})`,stroke:dateColors[0],dates,pulse:this.state.hoverDate&&this.pulseNow?' rw-day-pulse':''};
    }
    snake(id) {
      const assignments=this.state.assignments||[], a=Array.isArray(assignments)?assignments.find(a=>String(a.slotId??a.slot_id)===String(id)):assignments[id];
      const snakeId=typeof a==='string'?a:a?.snakeId??a?.snake_id;
      return (this.state.snakes||[]).find(s=>String(s.id)===String(snakeId));
    }
    render() {
      const active=document.activeElement,inScene=this.host.contains(active),focus=inScene?{slot:active.dataset?.slot,cabinet:active.dataset?.cabinet,row:active.dataset?.row,column:active.dataset?.column}:null;
      this.room=this.state.config||{};this.room={width:5000,depth:4000,...this.room};this.cabinets=this.room.cabinets||[];this.extraDefs='';this.faceCounter=0;
      this.host.dataset.view=this.state.view;this.host.classList.toggle('is-building',!!this.state.build);
      const c=this.cabinets.find(c=>String(c.id)===String(this.state.cabinetId));
      this.world.innerHTML=this.state.view==='cabinet'&&c?this.front(c):this.roomView();
      this.svg.querySelector('defs').innerHTML=`<linearGradient id="${this.uid}-metal" x1="0" x2="1"><stop stop-color="#8b9798"/><stop offset=".22" stop-color="#edf1ed"/><stop offset=".5" stop-color="#c3cdca"/><stop offset=".8" stop-color="#f7f8f4"/><stop offset="1" stop-color="#879497"/></linearGradient><linearGradient id="${this.uid}-glass" x1="0" y1="0" x2=".2" y2="1"><stop stop-color="#e9efeb" stop-opacity=".94"/><stop offset=".3" stop-color="#d6e1dc" stop-opacity=".8"/><stop offset="1" stop-color="#afbfba" stop-opacity=".95"/></linearGradient><pattern id="${this.uid}-floor" width="500" height="140" patternUnits="userSpaceOnUse"><rect width="500" height="140" fill="#eee8db"/><path d="M0 0H500M0 0V140M240 65H485M12 100H230" stroke="#dfd5c4" stroke-width="3"/></pattern><filter id="${this.uid}-shadow" x="-40%" y="-40%" width="190%" height="200%"><feDropShadow dx="12" dy="25" stdDeviation="20" flood-color="#344939" flood-opacity=".2"/></filter>${this.extraDefs}`;
      this.host.querySelector('.rw-scene-caption').innerHTML=`<span>${this.state.view==='cabinet'?'CABINET / DETAIL':'HABITAT / '+(this.state.view==='plan'?'FLOOR PLAN':'SPATIAL VIEW')}</span><strong>${escape(this.state.view==='cabinet'&&c?c.name:this.room.name||'我的爬房')}</strong>`;
      this.host.querySelector('.rw-scene-hint').textContent=this.state.view==='cabinet'?'点击盒子查看完整标签 · 方向键切换格位':this.state.build?'拖动柜体调整位置 · 点击柜体配置层数':'点击柜体展开 · 拖动画布 · 滚轮缩放';
      this.applyCamera();
      if(focus){const cells=[...this.world.querySelectorAll('[data-slot]')],cabinets=[...this.world.querySelectorAll('[data-cabinet]')];const restored=cells.find(el=>el.dataset.slot===focus.slot)||cells.find(el=>el.dataset.slot===this.lastFocusedSlot)||cells.find(el=>el.dataset.row===focus.row&&el.dataset.column===focus.column)||cabinets.find(el=>el.dataset.cabinet===(focus.cabinet||this.state.cabinetId))||cells[0]||cabinets[0];restored?.focus({preventScroll:true});}
      this.pulseNow=false;
    }
    roomView() {
      const w=num(this.room.width,5000),d=num(this.room.depth,4000),iso=this.state.view==='perspective';
      const project=(x,z,h=0)=>iso?[(x-z)*.82,(x+z)*.39-h*.85]:[x,z];
      this.project=project;
      const corners=[[0,0],[w,0],[w,d],[0,d]].map(([x,z])=>project(x,z));
      let out=poly(corners,`fill="url(#${this.uid}-floor)" stroke="#b7bbae" stroke-width="16"`);
      if(iso){out+=poly([project(0,0),project(w,0),project(w,0,650),project(0,0,650)],'fill="#f9faf5" stroke="#d2d9cc" stroke-width="8"');out+=poly([project(0,0),project(0,d),project(0,d,650),project(0,0,650)],'fill="#e5eadd" stroke="#c7d1c0" stroke-width="8"');}
      else {
        out+=`<path d="M${w*.19} ${d}H0V0H${w}V${d}H${w*.4}" fill="none" stroke="#506052" stroke-width="72" stroke-linejoin="miter"/><path d="M${w*.19} ${d}V${d-w*.21}A${w*.21} ${w*.21} 0 0 1 ${w*.4} ${d}" fill="none" stroke="#849581" stroke-width="10"/><path d="M${w*.38} 0H${w*.75}" stroke="#d8eee8" stroke-width="90"/><path d="M${w*.38} -22H${w*.75}M${w*.38} 22H${w*.75}" stroke="#8eb6ac" stroke-width="7"/>`;
        out+=`<path d="M0 -180H${w}M0 -230V-130M${w} -230V-130M${w+180} 0V${d}M${w+130} 0H${w+230}M${w+130} ${d}H${w+230}" stroke="#a4b09e" stroke-width="5" fill="none"/><text x="${w/2}" y="-220" text-anchor="middle" class="rw-dimension">${(w/1000).toFixed(2)} m</text><text x="${w+230}" y="${d/2}" class="rw-dimension" transform="rotate(90 ${w+230} ${d/2})">${(d/1000).toFixed(2)} m</text>`;
      }
      const ordered=[...this.cabinets].sort((a,b)=>num(a.x)+num(a.z)-num(b.x)-num(b.z));
      out+=ordered.map(c=>this.roomCabinet(c,project,iso)).join('');
      const center=project(w*.5,d*.56);out+=`<text x="${center[0]}" y="${center[1]}" text-anchor="middle" class="rw-floor-name">单间爬房</text><text x="${center[0]}" y="${center[1]+145}" text-anchor="middle" class="rw-floor-area">${(w*d/1000000).toFixed(1)} m² · ${this.cabinets.length} 组爬柜</text>`;
      const all=iso?[...corners,project(0,0,1000),...this.cabinets.flatMap(c=>[project(num(c.x)-num(c.width)/2,num(c.z)-num(c.depth)/2,num(c.height)),project(num(c.x)+num(c.width)/2,num(c.z)+num(c.depth)/2,num(c.height))])]:corners;
      const xs=all.map(p=>p[0]),ys=all.map(p=>p[1]);this.bounds=[Math.min(...xs)-420,Math.min(...ys)-450,Math.max(...xs)-Math.min(...xs)+950,Math.max(...ys)-Math.min(...ys)+950];
      return out;
    }
    roomCabinet(c,p,iso) {
      const w=num(c.width,1000),d=num(c.depth,600),height=num(c.height,1600),angle=num(c.rotation)*Math.PI/180;
      const q=(x,z,h=0)=>p(num(c.x)+x*Math.cos(angle)-z*Math.sin(angle),num(c.z)+x*Math.sin(angle)+z*Math.cos(angle),h);
      const base=[q(-w/2,-d/2),q(w/2,-d/2),q(w/2,d/2),q(-w/2,d/2)];
      const levels=c.levels||[],slots=levels.flatMap(l=>l.slots||[]),occupied=slots.filter(s=>this.snake(s.id)).length;
      let out=`<g data-cabinet="${escape(c.id)}" class="rw-model-cabinet" role="button" tabindex="0" aria-label="${escape(c.name)}，${occupied}/${slots.length} 个盒子，点击展开"><title>${escape(c.name)} · ${w} × ${d} × ${height} mm</title>`;
      if(!iso){out+=poly(base,`fill="#c9d2c9" stroke="#7e9085" stroke-width="12" filter="url(#${this.uid}-shadow)"`);
        const count=Math.max(1,...levels.map(l=>(l.slots||[]).length));
        for(let i=0;i<count;i++){out+=poly([q(-w/2+i*w/count+14,-d/2+22),q(-w/2+(i+1)*w/count-14,-d/2+22),q(-w/2+(i+1)*w/count-14,d/2-28),q(-w/2+i*w/count+14,d/2-28)],`fill="url(#${this.uid}-glass)" stroke="#97a69d" stroke-width="5"`);}
        // The full layer map is visible in plan, so lower shelf feeding remains legible.
        const rowH=Math.min(52,(d-60)/Math.max(1,levels.length)),gridZ=-rowH*levels.length/2;
        levels.forEach((l,li)=>(l.slots||[]).forEach((s,si,arr)=>{const f=this.face(s.id),x=-w/2+25+si*(w-50)/arr.length,z=gridZ+(levels.length-1-li)*rowH;out+=poly([q(x,z),q(x+(w-50)/arr.length-10,z),q(x+(w-50)/arr.length-10,z+rowH-9),q(x,z+rowH-9)],`class="rw-box-face${f.pulse}" data-plan-slot="${escape(s.id)}" fill="${f.dates.length?f.fill:'#f2f4ed'}" stroke="${f.stroke}" stroke-width="4"`);}));
        out+=line(q(-w/2+20,d/2-3),q(w/2-20,d/2-3),'stroke="#466b56" stroke-width="19"');
      } else {
        out+=poly([q(-w/2,-d/2),q(-w/2,d/2),q(-w/2,d/2,height),q(-w/2,-d/2,height)],'fill="#a6b2ae" stroke="#869792" stroke-width="7"');
        out+=poly([q(w/2,-d/2),q(w/2,d/2),q(w/2,d/2,height),q(w/2,-d/2,height)],'fill="#bbc6c2" stroke="#869792" stroke-width="7"');
        out+=poly([q(-w/2,-d/2,height),q(w/2,-d/2,height),q(w/2,d/2,height),q(-w/2,d/2,height)],'fill="#e4e9df" stroke="#96a59d" stroke-width="10"');
        let bottom=0;
        levels.forEach(l=>{const h=num(l.height,150);(l.slots||[]).forEach((s,i,arr)=>{const x=-w/2+25+i*(w-50)/arr.length,bw=(w-50)/arr.length-12,f=this.face(s.id);out+=poly([q(x,d/2,bottom+10),q(x+bw,d/2,bottom+10),q(x+bw,d/2,bottom+h-17),q(x,d/2,bottom+h-17)],`class="rw-box-face${f.pulse}" fill="${f.fill}" stroke="${f.stroke}" stroke-width="5"`);out+=line(q(x+bw*.32,d/2+1,bottom+h*.64),q(x+bw*.68,d/2+1,bottom+h*.64),'stroke="#7d9189" stroke-width="9"');});out+=line(q(-w/2,d/2,bottom),q(w/2,d/2,bottom),`stroke="url(#${this.uid}-metal)" stroke-width="24"`);bottom+=h;});
        [-w/2,w/2].forEach(x=>{out+=line(q(x,d/2,30),q(x,d/2,height),'stroke="#e5e9e4" stroke-width="30"');const foot=q(x,d/2,0);out+=`<circle cx="${foot[0]}" cy="${foot[1]}" r="30" fill="#66766e"/>`;});
      }
      const label=q(0,iso?d/2+150:d/2+115);out+=`<text x="${label[0]}" y="${label[1]}" text-anchor="middle" class="rw-cab-name">${escape(c.name)}</text><text x="${label[0]}" y="${label[1]+100}" text-anchor="middle" class="rw-cab-count">${occupied} / ${slots.length} 已入住</text></g>`;return out;
    }
    front(c) {
      const w=num(c.width,1000),h=num(c.height,1600),levels=c.levels||[],renderScale=Math.min((this.host.clientWidth||800)/(w+280),(this.host.clientHeight||640)/(h+280))*this.camera.zoom,compact=(this.host.clientWidth||800)<650;let out='',bottom=h;
      out+=`<ellipse cx="${w/2}" cy="${h+25}" rx="${w*.6}" ry="35" fill="#879280" opacity=".14"/><rect x="-24" y="0" width="${w+48}" height="${h}" fill="#d1dad4" fill-opacity=".28" stroke="#97a59a" stroke-width="3"/><rect x="12" y="24" width="${w-24}" height="${h-60}" fill="#d7dfd7" fill-opacity=".25"/><path d="M8 6V${h-25}H${w-8}V6" stroke="#a5b4aa" stroke-width="13" fill="none"/>`;
      levels.forEach((l,li)=>{const lh=num(l.height,150),top=bottom-lh,slots=l.slots||[];
        out+=`<text x="-70" y="${top+lh/2}" text-anchor="end" class="rw-level-label">${String(li+1).padStart(2,'0')}</text>`;
        slots.forEach((s,i)=>{const cellW=(w-36)/Math.max(1,slots.length),bw=Math.min(cellW-12,num(l.boxWidth,cellW-12)||cellW-12),bh=Math.min(lh-22,num(l.boxHeight,lh-22)||lh-22),x=18+i*cellW+(cellW-bw)/2,y=bottom-bh-8,f=this.face(s.id),snake=this.snake(s.id),font=Math.min(bh*.24,Math.max(12/renderScale,Math.min(36,bw/10,bh/4))),name=snake?.code||snake?.name||snake?.id||'空盒';
          const tasks=this.slotTasks(s.id),pending=(this.state.tasks||[]).filter(t=>String(t.slotId??t.slot_id)===String(s.id)&&(!t.status||t.status==='pending')).sort((a,b)=>String(a.dueAt||a.plannedAt||a.date+(a.time||'')).localeCompare(String(b.dueAt||b.plannedAt||b.date+(b.time||'')))),mouseTask=tasks[0]||pending[0];let mouse=mouseTask?(mouseTask.mouseMin!=null&&mouseTask.mouseMax!=null?`${mouseTask.mouseMin}–${mouseTask.mouseMax}g`:'待确认'):null;
          const fields=this.state.labels||{},show=key=>Array.isArray(fields)?fields.includes(key):fields[key]!==false;
          const sex=snake?.sex==='male'||snake?.sex==='M'?'♂':snake?.sex==='female'||snake?.sex==='F'?'♀':snake?.sex||'';
          const weight=global.SuohaRoomModel?.latestWeight(snake?.id,this.state.measurements||[])?.weight??tasks[0]?.weight;
          if(!mouseTask&&weight!=null){const rule=global.SuohaRoomModel?.matchMouse(weight,this.state.config.rules||[]);if(rule)mouse=`${rule.mouseMin}–${rule.mouseMax}g`;}
          const gene=snake?.gene_text||snake?.gene_description||snake?.genetics||snake?.morph||snake?.genes||'';
          const details=[show('sex')?sex:'',show('weight')&&weight!=null?`${weight}g`:'',show('gene')&&typeof gene==='string'?gene:''].filter(Boolean).join(' · ');
          const nextTask=pending[0];let nextText=nextTask?`${nextTask.date} ${nextTask.time||''}`:'';
          if(nextTask?.dueAt&&Number.isFinite(Date.parse(nextTask.dueAt))){try{nextText=new Intl.DateTimeFormat('sv-SE',{timeZone:this.state.config.timezone||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(nextTask.dueAt));}catch(_){/* Validated configuration normally supplies a valid IANA timezone. */}}
          const values={id:name,sex,gene:typeof gene==='string'?gene:'',weight:weight!=null?`${weight}g`:'',mouse:mouse||'',next:nextText,note:String(this.state.config.slotNotes?.[s.id]??'')};
          const label=global.SuohaRoomLabels?.renderLabel({template:c.labelTemplate??this.state.config.labelTemplate,labels:this.state.labels??this.state.config.labels,values,compact})||{lines:(compact?[name,mouse]:[name,details,mouse]).filter(Boolean),fontSize:12,align:'left',ariaLabel:[name,details,mouse,values.note].filter(Boolean).join('；')};
          out+=`<g class="rw-model-slot"><title>${escape(label.ariaLabel)}</title><rect class="rw-box-face${f.pulse}" x="${x}" y="${y}" width="${bw}" height="${bh}" rx="8" fill="${f.fill}" stroke="${f.stroke}" stroke-width="3"/><path d="M${x+8} ${y+bh*.15}H${x+bw-8}M${x+10} ${y+bh-10}H${x+bw-10}" stroke="#fff" stroke-opacity=".6" stroke-width="4"/><path d="M${x+8} ${y+bh-15}L${x+17} ${y+bh*.15}H${x+bw-17}L${x+bw-8} ${y+bh-15}" stroke="#fff" stroke-opacity=".38" stroke-width="4" fill="none"/><rect x="${x+bw*.32}" y="${y+9}" width="${bw*.36}" height="7" rx="3" fill="#70867a" opacity=".6"/>`;
          if(snake)out+=`<path d="M${x+bw*.2} ${y+bh*.8}C${x+bw*.65} ${y+bh*.3},${x+bw*.84} ${y+bh*.98},${x+bw*.45} ${y+bh*.8}S${x+bw*.32} ${y+bh*.44},${x+bw*.72} ${y+bh*.68}" stroke="#617b62" stroke-width="${Math.max(5,bh*.07)}" fill="none" opacity=".13" stroke-linecap="round"/>`;
          const labelFont=label.fontSize/renderScale,lineHeight=labelFont*1.2,availableLines=Math.max(0,Math.floor(bh*.7/lineHeight)),visibleLines=label.lines.slice(0,availableLines),anchor={left:'start',center:'middle',right:'end'}[label.align]||'start',labelX=label.align==='center'?x+bw/2:label.align==='right'?x+bw-20:x+20;
          out+=`<rect x="${x+10}" y="${y+bh*.2}" width="${bw-20}" height="${bh*.72}" rx="3" fill="#fffff7" fill-opacity=".82"/>`;
          visibleLines.forEach((text,index)=>{const more=index===visibleLines.length-1&&label.lines.length>visibleLines.length,short=ellipsize(text+(more?'…':''),bw-40,labelFont);out+=`<text class="rw-label-line" x="${labelX}" y="${y+bh*.2+labelFont+index*lineHeight}" font-size="${labelFont}" text-anchor="${anchor}" fill="${index===0?'#263e2d':'#59705c'}" font-weight="${index===0?600:400}">${escape(short)}</text>`;});
          if(f.dates.length){out+=`<text x="${x+bw-15}" y="${y+font*.85}" font-size="${Math.min(font*.75,10/renderScale,(bw-30)/Math.max(1,f.dates.length))}" text-anchor="end" fill="#163d29" font-weight="600">${escape(f.dates.map(d=>'一二三四五六日'[dayIndex(d)]).join(''))}</text>`;}
          out+=`<foreignObject x="${x}" y="${y}" width="${bw}" height="${bh}"><button xmlns="http://www.w3.org/1999/xhtml" type="button" class="rw-slot-hit" data-slot="${escape(s.id)}" data-row="${li}" data-column="${i}" title="${escape(label.ariaLabel)}" aria-label="${escape(`${c.name} 第${li+1}层 第${i+1}格，${name}；${label.ariaLabel}；点击查看完整详情`)}"></button></foreignObject></g>`;
        });out+=`<rect x="-20" y="${bottom}" width="${w+40}" height="16" fill="url(#${this.uid}-metal)"/>`;bottom=top;});
      [-21,w-3].forEach(x=>{out+=`<rect x="${x}" y="-15" width="25" height="${h+12}" rx="3" fill="url(#${this.uid}-metal)"/><circle cx="${x+12}" cy="${h+8}" r="20" fill="#53665c"/><circle cx="${x+12}" cy="${h+8}" r="11" fill="#c0c9bf"/>`;});
      out+=`<rect x="-26" y="-20" width="${w+52}" height="26" rx="4" fill="url(#${this.uid}-metal)"/><text x="${w/2}" y="${h+100}" text-anchor="middle" font-size="27" fill="#7c8d77">${w} × ${num(c.depth)} × ${h} mm · ${levels.length} 层</text>`;
      if(!levels.length)out+=`<text x="${w/2}" y="${h/2}" text-anchor="middle" font-size="35" fill="#f3f6ee">空框架 · 在搭建模式添加第一层</text>`;
      this.bounds=[-140,-100,w+280,h+280];return out;
    }
    destroy() {this.animations.forEach(a=>a.cancel());this.overlays.forEach(el=>el.remove());this.resize.disconnect();Object.entries(this.events).forEach(([n,h])=>this.svg.removeEventListener(n,h));this.host.replaceChildren();}
  }
  global.SuohaRoomScene=RoomScene;
})(window);
