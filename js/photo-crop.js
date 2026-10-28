/* Local crop selection. Original files stay private and can be cropped again. */
(() => {
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  async function open(blob,saved){
    const bitmap=await createImageBitmap(blob),W=bitmap.width,H=bitmap.height,url=URL.createObjectURL(blob);
    const dialog=document.createElement('dialog');dialog.className='photo-crop-dialog';dialog.setAttribute('aria-labelledby','photo-crop-title');
    dialog.innerHTML='<header><h2 id="photo-crop-title">选择展示范围</h2><button type="button" data-crop-cancel aria-label="关闭裁剪">×</button></header><p>拖动选框移动位置，拖动右下角或调整滑块缩放。原图保留，可再次调整。</p><label>固定比例 <select data-crop-ratio><option value="1">1:1 方形 · 档案与展示</option><option value="1.5">3:2 横向 · 个体照片</option></select></label><div class="photo-crop-stage"><img draggable="false" alt="待裁剪原图"><div class="photo-crop-selection" tabindex="0" role="group" aria-label="裁剪选框，方向键移动"><span></span><button type="button" data-crop-resize aria-label="拖动缩放裁剪框">↘</button></div></div><label>选框缩放 <input data-crop-zoom aria-label="选框缩放" type="range" min="1" max="5" step="0.01" value="1"></label><footer><button type="button" data-crop-reset>重置选框</button><button type="button" data-crop-cancel>取消</button><button type="button" data-crop-save>保存展示范围</button></footer>';
    document.body.append(dialog);const img=dialog.querySelector('img'),box=dialog.querySelector('.photo-crop-selection'),stage=dialog.querySelector('.photo-crop-stage'),ratio=dialog.querySelector('[data-crop-ratio]'),zoom=dialog.querySelector('[data-crop-zoom]');img.src=url;
    let rect,drag,done=false;ratio.value=saved?.ratio===1.5?'1.5':'1';
    const maxWidth=()=>Math.min(W,H*Number(ratio.value));
    const reset=()=>{const w=maxWidth(),h=w/Number(ratio.value);rect={x:(W-w)/2,y:(H-h)/2,w,h};zoom.value=1;paint();};
    const paint=()=>{Object.assign(box.style,{left:rect.x/W*100+'%',top:rect.y/H*100+'%',width:rect.w/W*100+'%',height:rect.h/H*100+'%'});box.querySelector('span').textContent=`${Math.round(rect.w)} × ${Math.round(rect.h)}`;zoom.value=clamp(maxWidth()/rect.w,1,5);};
    reset();if(saved&&[saved.x,saved.y,saved.w,saved.h].every(Number.isFinite)&&saved.w>0&&saved.h>0&&saved.x>=0&&saved.y>=0&&saved.x+saved.w<=W&&saved.y+saved.h<=H){rect={x:saved.x,y:saved.y,w:saved.w,h:saved.h};paint();}
    stage.style.aspectRatio=`${W}/${H}`;stage.style.width=`min(100%, ${Math.round(48*W/H)}dvh)`;
    ratio.onchange=reset;dialog.querySelector('[data-crop-reset]').onclick=reset;
    zoom.oninput=()=>{const w=maxWidth()/Number(zoom.value),h=w/Number(ratio.value),cx=rect.x+rect.w/2,cy=rect.y+rect.h/2;rect={x:clamp(cx-w/2,0,W-w),y:clamp(cy-h/2,0,H-h),w,h};paint();};
    box.onpointerdown=e=>{e.preventDefault();const bounds=stage.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,rect:{...rect},scale:W/bounds.width,resize:!!e.target.closest('[data-crop-resize]')};box.setPointerCapture(e.pointerId);};
    box.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const dx=(e.clientX-drag.x)*drag.scale,dy=(e.clientY-drag.y)*drag.scale;
      if(drag.resize){const r=Number(ratio.value),delta=Math.abs(dx)>Math.abs(dy*r)?dx:dy*r,w=clamp(drag.rect.w+delta,maxWidth()/5,Math.min(W-drag.rect.x,(H-drag.rect.y)*r));rect={...drag.rect,w,h:w/r};}
      else rect={...drag.rect,x:clamp(drag.rect.x+dx,0,W-rect.w),y:clamp(drag.rect.y+dy,0,H-rect.h)};paint();};
    box.onpointerup=box.onpointercancel=()=>drag=null;
    box.onkeydown=e=>{const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]},m=moves[e.key];if(!m)return;e.preventDefault();const n=(e.shiftKey?10:1)*W/200;rect.x=clamp(rect.x+m[0]*n,0,W-rect.w);rect.y=clamp(rect.y+m[1]*n,0,H-rect.h);paint();};
    return new Promise(resolve=>{
      const finish=value=>{if(done)return;done=true;dialog.close();dialog.remove();bitmap.close();URL.revokeObjectURL(url);resolve(value);};
      dialog.querySelectorAll('[data-crop-cancel]').forEach(b=>b.onclick=()=>finish(null));dialog.oncancel=e=>{e.preventDefault();finish(null);};
      dialog.querySelector('[data-crop-save]').onclick=async()=>{const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(rect.w));canvas.height=Math.max(1,Math.round(rect.h));canvas.getContext('2d').drawImage(bitmap,rect.x,rect.y,rect.w,rect.h,0,0,canvas.width,canvas.height);const output=await new Promise(r=>canvas.toBlob(r,'image/webp',.94));finish(output?{blob:output,crop:{...rect,ratio:Number(ratio.value)}}:null);};
      dialog.showModal();
    });
  }
  window.SuohaPhotoCrop={open};
})();
