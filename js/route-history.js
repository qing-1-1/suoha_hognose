/* Position-only undo/redo. Deleting a node or changing its genetics is never undone implicitly. */
(() => {
  const history=new Map(),pending=new Set();
  const toolbar=document.querySelector('.routeTools');if(!toolbar)return;
  const controls=document.createElement('span');controls.className='routeHistoryControls';
  controls.innerHTML='<button class="routeChip" id="routeFit">适应画布</button><button class="routeChip" id="routeUndo">撤销移动</button><button class="routeChip" id="routeRedo">重做移动</button><span class="routeSaveState" id="routeSaveState" role="status">拖动后自动保存</span>';
  toolbar.appendChild(controls);
  function stack(){if(!history.has(state.route))history.set(state.route,{undo:[],redo:[]});return history.get(state.route);}
  function update(message){const current=stack();document.getElementById('routeUndo').disabled=!canWrite()||pending.size>0||!current.undo.length;document.getElementById('routeRedo').disabled=!canWrite()||pending.size>0||!current.redo.length;document.getElementById('routeUndo').hidden=!canWrite();document.getElementById('routeRedo').hidden=!canWrite();if(message)document.getElementById('routeSaveState').textContent=message;}
  async function persist(id,position,expected){
    pending.add(id);update('保存中…');
    try {const {error}=await sb.rpc('move_route_node',{p_id:id,p_x:position.x,p_y:position.y,p_expected_x:expected.x,p_expected_y:expected.y});if(error)throw error;update('已保存');}
    finally{pending.delete(id);update();}
  }
  enableRouteDrag=function(group,node){
    let start=null,raf=0;
    const paint=()=>{raf=0;group.setAttribute('transform',`translate(${node.x},${node.y})`);syncRouteEdges();};
    function restore(){if(!start)return;node.x=start.ui.x;node.y=start.ui.y;const raw=rawRouteNode(node);if(raw){raw.x=start.before.x;raw.y=start.before.y;}paint();}
    group.addEventListener('pointerdown',event=>{const raw=rawRouteNode(node);if(!canWrite()||!raw||pending.has(raw.id)||routeConnectMode||event.target.closest?.('.routeWireHandle,.routeNodeDelete'))return;event.preventDefault();event.stopPropagation();start={point:canvasPoint(event),ui:{x:node.x,y:node.y},before:{x:raw.x??null,y:raw.y??null},moved:false,route:state.route};group.setPointerCapture(event.pointerId);});
    group.addEventListener('pointermove',event=>{if(!start)return;const point=canvasPoint(event),dx=point.x-start.point.x,dy=point.y-start.point.y;start.moved||=Math.hypot(dx,dy)>2;node.x=Math.max(0,Math.min(1000,start.ui.x+dx));node.y=Math.max(0,Math.min(650,start.ui.y+dy));const raw=rawRouteNode(node);if(raw){raw.x=node.x;raw.y=node.y;}if(!raf)raf=requestAnimationFrame(paint);});
    group.addEventListener('pointercancel',()=>{if(raf)cancelAnimationFrame(raf);restore();start=null;});
    group.addEventListener('pointerup',async event=>{if(!start)return;const saved=start,raw=rawRouteNode(node);if(group.hasPointerCapture(event.pointerId))group.releasePointerCapture(event.pointerId);if(raf){cancelAnimationFrame(raf);raf=0;}if(!saved.moved||!raw){start=null;return;}const after={x:Math.round(node.x),y:Math.round(node.y)};node.x=after.x;node.y=after.y;Object.assign(raw,after);paint();start=null;
      try{await persist(raw.id,after,saved.before);const st=history.get(saved.route)||{undo:[],redo:[]};st.undo.push({id:raw.id,before:saved.before,after});st.undo=st.undo.slice(-30);st.redo=[];history.set(saved.route,st);redrawRouteCanvas();update();}
      catch(error){Object.assign(raw,saved.before);node.x=saved.ui.x;node.y=saved.ui.y;paint();update('保存失败，已恢复原位置');toast(error.message||String(error),true);}
    });
  };
  async function travel(direction){if(!canWrite()||pending.size)return;const st=stack(),source=st[direction],entry=source.at(-1);if(!entry)return;const raw=REMOTE_RAW.nodes.find(n=>n.id===entry.id);if(!raw)return toast('节点已不存在，请刷新路线',true);const target=direction==='undo'?entry.before:entry.after,expected=direction==='undo'?entry.after:entry.before;
    // Null initial positions cannot be persisted as coordinates; no ambiguous undo.
    if(target.x==null||target.y==null)return toast('原节点没有保存坐标，无法撤销这次移动。');
    try{await persist(entry.id,target,expected);Object.assign(raw,target);source.pop();st[direction==='undo'?'redo':'undo'].push(entry);redrawRouteCanvas();update('已保存');}catch(error){update('位置已变化，请刷新后重试');toast(error.message||String(error),true);}}
  document.getElementById('routeUndo').onclick=()=>travel('undo');document.getElementById('routeRedo').onclick=()=>travel('redo');
  document.getElementById('routeFit').onclick=()=>{const nodes=(DATA.routes[state.route]?.nodes||[]).map(nodeOf).filter(visible);if(!nodes.length)return;const minX=Math.min(...nodes.map(n=>n.x))-115,maxX=Math.max(...nodes.map(n=>n.x))+115,minY=Math.min(...nodes.map(n=>n.y))-65,maxY=Math.max(...nodes.map(n=>n.y))+65;const scale=Math.min(2,960/(maxX-minX),610/(maxY-minY));canvasView={x:500-(minX+maxX)*scale/2,y:325-(minY+maxY)*scale/2,scale};applyCanvasView();};
  addEventListener('keydown',event=>{if(state.page!=='routes'||!canvasEditing||event.target.closest?.('input,textarea,select,[contenteditable=true]'))return;if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();travel(event.shiftKey?'redo':'undo');}});
  const previous=renderRoute;renderRoute=function(){previous();update();};
  addEventListener('suoha:logout',()=>{history.clear();pending.clear();});
  update();
})();
