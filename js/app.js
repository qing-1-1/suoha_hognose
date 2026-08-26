// Business data is loaded only from Supabase after authentication.  Do not add
// fallback stock, routes, plans, or investment fixtures here.
const EMPTY_DATA=()=>({snakes:[],routes:{},investments:[]});
let DATA=EMPTY_DATA();
let snakeById={};
const state={page:"population",year:new Date().getFullYear(),route:"flagship",showFuture:true,showF2:true,high:false,selected:null,q:"",series:"",sex:""};
let routeEditorOpen=false,editingRouteNodeId=null,routeConnectMode=false,routeConnectSource=null,canvasEditing=false;
let canvasView={x:0,y:0,scale:1};
let ANNUAL_PLANS={};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const fmt=n=>"¥"+Number(n||0).toLocaleString("zh-CN"), mature=s=>Number(String(s.mature).slice(0,4)), ready=s=>mature(s)<=state.year;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function kpi(a,b,c,d,cls=""){return `<div class="kpi"><div class="kpiTop"><span>${a}</span><span class="kpiIcon">${d}</span></div><div class="kpiNum ${cls}">${b}</div><div class="kpiFoot">${c}</div></div>`}
function setPage(p){state.page=p;$$(".page").forEach(x=>x.classList.toggle("active",x.id==="page-"+p));$$(".navItem").forEach(x=>x.classList.toggle("active",x.dataset.page===p));$("#crumb").textContent=({routes:"繁殖路线",population:"种群总览",production:"年度产出",investment:"投资计划",lab:"配对实验室",admin:"数据与审核看板"})[p];window.scrollTo({top:0,left:0,behavior:"instant"});if(p==="admin")renderAdmin()}
$$(".navItem").forEach(x=>x.onclick=()=>setPage(x.dataset.page));
$$("[data-page=\"population\"]").forEach(item=>{const routes=item.parentElement?.querySelector("[data-page=\"routes\"]");if(routes)item.parentElement.insertBefore(item,routes)});
setPage(state.page);
$("#globalYear").onchange=e=>{state.year=Number(e.target.value);renderAll()};
const AI_MODEL_STORAGE_KEY="suoha.aiModel";
const savedAiModel=localStorage.getItem(AI_MODEL_STORAGE_KEY);
if(["deepseek-v4-flash","deepseek-v4-pro"].includes(savedAiModel))$("#aiModel").value=savedAiModel;
$("#aiModel").onchange=e=>{localStorage.setItem(AI_MODEL_STORAGE_KEY,e.target.value);toast(`AI 模型已切换为 ${e.target.options[e.target.selectedIndex].text}`)};
function syncYear(y){state.year=Number(y);$("#globalYear").value=String(y);renderAll()}
function planningYears(){const years=[...REMOTE_RAW.plans.map(x=>Number(x.plan_year)),...REMOTE_RAW.nodes.map(x=>Number(x.planned_year)),...DATA.snakes.map(x=>mature(x))].filter(Number.isFinite).filter(y=>y>0);return [...new Set(years)].sort((a,b)=>a-b)}
function setPlanningYears(){const years=planningYears();const selected=years.includes(state.year)?state.year:(years.includes(new Date().getFullYear())?new Date().getFullYear():years[0]||new Date().getFullYear());state.year=selected;$("#globalYear").innerHTML=years.length?years.map(y=>`<option value="${y}" ${y===selected?"selected":""}>${y}</option>`).join(""):`<option value="${selected}">${selected}</option>`}

const NS="http://www.w3.org/2000/svg";
function nodeOf(r){if(r.kind)return {...r};const s=snakeById[r.id];if(!s)return {...r,kind:"missing",label:r.id,sub:"关联个体不存在",year:0,score:0,detail:"请检查路线节点引用。"};return {...r,kind:"snake",label:s.gene,sub:`${s.series} · ${s.sex==="F"?"♀":"♂"}`,year:mature(s),score:s.score,detail:""}}
function visible(n){if(!state.showF2&&n.kind==="offspring"&&n.id.endsWith("2"))return false;if(!state.showFuture&&n.year>state.year)return false;return true}
function locked(n){return n.year>state.year}
function E(n,a={}){const x=document.createElementNS(NS,n);Object.entries(a).forEach(([k,v])=>x.setAttribute(k,v));return x}
function curve(a,b){const sx=a.x+95,sy=a.y,tx=b.x-95,ty=b.y,m=(sx+tx)/2;return `M${sx},${sy} C${m},${sy} ${m},${ty} ${tx},${ty}`}
function routeTabs(){const b=$("#routeTabs");b.innerHTML="";Object.entries(DATA.routes).forEach(([id,r])=>{const x=document.createElement("button");x.className="routeTab"+(state.route===id?" active":"");x.textContent=r.name;x.onclick=()=>{state.route=id;state.selected=null;renderRoute()};b.appendChild(x)})}
function renderRoute(){
  routeTabs();const rr=DATA.routes[state.route];
  if(!rr){
    $("#routeKpis").innerHTML="";
    $("#routeYear").textContent="等待数据库路线数据";
    $("#routeEdges").innerHTML="";$("#routeNodes").innerHTML="";
    $("#inspector").innerHTML='<div class="inspectHero"><h2>暂无路线数据</h2><p>请确认当前账号拥有已认证读取权限，并在 Supabase 中配置 breeding_routes、route_nodes 与 route_edges。</p></div>';
    renderRouteEditor();return;
  }
  const nodes=rr.nodes.map(nodeOf),map=Object.fromEntries(nodes.map(n=>[n.id,n]));
  const rs=DATA.snakes.filter(ready),rf=rs.filter(s=>s.sex==="F").length,rm=rs.filter(s=>s.sex==="M").length;
  const allF=DATA.snakes.filter(s=>s.sex==="F").length,allM=DATA.snakes.filter(s=>s.sex==="M").length,totalN=DATA.snakes.length;
  const ex=rr.edges.filter(([a,b])=>map[a]&&map[b]&&!locked(map[a])&&!locked(map[b])).length;
  $("#routeKpis").innerHTML=kpi(`${state.year} 可繁母蛇`,rf,`全库 ${allF}F · ${allF?Math.round(rf/allF*100):0}% 已成熟`,"♀","gold")+kpi(`${state.year} 可繁公蛇`,rm,`全库 ${allM}M · ${allM?Math.round(rm/allM*100):0}% 已成熟`,"♂")+kpi("当前路线可执行连接",ex,`共 ${rr.edges.length} 条规划连线`,"⌁","violet")+kpi("路线最高战略分",Math.max(...nodes.map(n=>n.score||0)),rr.subtitle,"★","gold");
  $("#routeYear").textContent=`${state.year} VIEW · ${rs.length}/${totalN} MATURE`;
  const eg=$("#routeEdges"),ng=$("#routeNodes");eg.innerHTML="";ng.innerHTML="";const viewTransform=`translate(${canvasView.x} ${canvasView.y}) scale(${canvasView.scale})`;eg.setAttribute("transform",viewTransform);ng.setAttribute("transform",viewTransform);
  rr.edges.forEach(([a,b,t])=>{const A=map[a],B=map[b];if(!A||!B||!visible(A)||!visible(B))return;eg.appendChild(E("path",{d:curve(A,B),class:`routeEdge ${t} ${(locked(A)||locked(B))?"locked":""}`,"data-edge":`${a}|${b}`,"marker-end":`url(#${t==="next"?"arrV":"arr"})`}))});
  nodes.forEach(n=>{if(!visible(n))return;const g=E("g",{transform:`translate(${n.x},${n.y})`,class:`routeNode ${locked(n)?"locked":""} ${(state.high&&(n.score||0)<92)?"dim":""}`,"data-node":n.id});drawNode(g,n);if(canvasEditing&&canWrite()){const handle=E("circle",{cx:95,cy:0,r:9,class:"routeWireHandle"});handle.onclick=e=>{e.stopPropagation();routeConnectMode=true;routeConnectSource=rawRouteNode(n);toast(`从 ${routeConnectSource?.label||n.id} 连线：请选择终点。`)};g.appendChild(handle)}g.onclick=e=>{e.stopPropagation();if(routeConnectMode)return selectRouteConnection(n);state.selected=n.id;inspect(n,map,rr);highlight(n.id)};if(routeEditorOpen&&canWrite())enableRouteDrag(g,n);ng.appendChild(g)});
  const chosen=(state.selected&&map[state.selected]&&visible(map[state.selected]))?map[state.selected]:nodes.find(visible);if(chosen){state.selected=chosen.id;inspect(chosen,map,rr);highlight(chosen.id)}renderRouteEditor();renderCanvasMode();
}
function drawNode(g,n){let fill="#2a2a2c",stroke="#777";if(n.kind==="snake")stroke="#2997ff";if(n.kind==="offspring"){fill="#252527";stroke="#2997ff"}if(n.kind==="gap"){fill="#272729";stroke="#ccc"}const r=E("rect",{x:-95,y:-40,width:190,height:80,rx:14,fill,stroke});if(n.kind==="gap")r.setAttribute("stroke-dasharray","6 5");g.appendChild(r);if(n.kind==="offspring"&&n.key)g.insertBefore(E("rect",{x:-99,y:-44,width:198,height:88,rx:17,fill:"none",stroke:"#2997ff",class:"nodePulse"}),r);let t=E("text",{x:-80,y:-13,class:"title"});t.textContent=n.label.length>24?n.label.slice(0,23)+"…":n.label;g.appendChild(t);t=E("text",{x:-80,y:7,class:"sub"});t.textContent=n.sub||"";g.appendChild(t);t=E("text",{x:-80,y:27,class:"meta"});if(n.kind==="snake"){const s=snakeById[n.id];t.textContent=`${s.id} · ${locked(n)?"LOCKED "+n.year:s.role}`}else t.textContent=`${locked(n)?"PLANNED ":""}${n.year||"TBD"} · ${n.key?"KEY NODE":"PROJECT"}`;g.appendChild(t);t=E("text",{x:77,y:-17,class:"score","text-anchor":"end"});t.textContent=n.score||"-";g.appendChild(t);t=E("text",{x:77,y:14,class:"title","text-anchor":"end"});t.textContent=n.kind==="snake"?(snakeById[n.id].sex==="F"?"♀":"♂"):(n.kind==="gap"?"◇":"◆");g.appendChild(t)}
function routeTone(n){if(n.kind==="snake")return snakeById[n.id]?.sex==="F"?"female":"male";return n.kind==="offspring"?"offspring":"gap"}
function drawNode(g,n){const tone=routeTone(n),palette={female:{fill:"#3a1d33",stroke:"#f472b6"},male:{fill:"#122c47",stroke:"#55b9f3"},offspring:{fill:"#2d2147",stroke:"#b497ff"},gap:{fill:"#443519",stroke:"#f6c35d"}}[tone];const r=E("rect",{x:-95,y:-40,width:190,height:80,rx:14,fill:palette.fill,stroke:palette.stroke});if(n.kind==="gap")r.setAttribute("stroke-dasharray","6 5");g.appendChild(r);if(n.kind==="offspring"&&n.key)g.insertBefore(E("rect",{x:-99,y:-44,width:198,height:88,rx:17,fill:"none",stroke:palette.stroke,class:"nodePulse"}),r);let t=E("text",{x:-80,y:-13,class:"title"});t.textContent=n.label.length>24?n.label.slice(0,23)+"…":n.label;g.appendChild(t);t=E("text",{x:-80,y:7,class:"sub"});t.textContent=n.sub||"";g.appendChild(t);t=E("text",{x:-80,y:27,class:"meta"});if(n.kind==="snake"){const s=snakeById[n.id];t.textContent=`${s.id} · ${locked(n)?"LOCKED "+n.year:s.role}`}else t.textContent=`${locked(n)?"PLANNED ":""}${n.year||"TBD"} · ${n.key?"KEY NODE":"PROJECT"}`;g.appendChild(t);t=E("text",{x:77,y:-17,class:"score","text-anchor":"end"});t.textContent=n.score||"-";g.appendChild(t);t=E("text",{x:77,y:14,class:"title","text-anchor":"end",fill:palette.stroke});t.textContent=n.kind==="snake"?(snakeById[n.id].sex==="F"?"♀":"♂"):(n.kind==="gap"?"◇":"◆");g.appendChild(t)}
function inspect(n,map,rr){
  let title=n.label,sub=n.sub||"",icon="◆",facts=[],note=n.detail||"",score=n.score||0;
  if(n.kind==="snake"){const s=snakeById[n.id];icon=s.sex==="F"?"♀":"♂";title=s.gene;sub=`${s.id} · ${s.series} · ${s.role}`;facts=[["Sex",s.sex==="F"?"Female":"Male"],["Mature",s.mature],["Birth",s.birth],["Cost",fmt(s.price)],["Investor",s.investor||"—"],["Status",ready(s)?`${state.year} 可繁`:`${mature(s)} 解锁`]];note=`真实库存个体。战略分衡量它在现有繁殖网络中的连接价值，不等于市场估值。${ready(s)?"当前年份已成熟。":"当前年份尚未成熟。"}`}
  else facts=[["Stage",n.kind==="gap"?"Investment":"Planned offspring"],["Earliest",n.year||"TBD"],["Route",rr.name],["Status",n.year<=state.year?"可进入此阶段":"未来阶段"]];
  const rel=[];rr.edges.forEach(([a,b])=>{if(a===n.id)rel.push([b,"下游"]);if(b===n.id)rel.push([a,"上游"])});
  $("#inspector").innerHTML=`<div class="inspectHero"><div class="inspectIcon">${icon}</div><h2>${esc(title)}</h2><p>${esc(sub)}</p><div class="scoreTrack"><i style="width:${score}%"></i></div><div class="inspectScore"><span>繁殖战略分</span><span>${score}/100</span></div></div><div class="inspectBody"><div class="factGrid">${facts.map(([a,b])=>`<div class="fact"><label>${a}</label><strong>${esc(b)}</strong></div>`).join("")}</div>${n.key?'<div class="keyBadge">◆ KEY NODE · 会解锁下一代路线</div>':""}<div class="inspectNote">${esc(note)}</div><div class="relTitle">Direct connections</div>${rel.map(([id,dir])=>{const q=map[id];const c="#0066cc";return `<div class="related" data-r="${id}"><i class="rDot" style="background:${c}"></i><div><b>${esc(q.label)}</b><span>${dir} · ${esc(q.sub||"")}</span></div></div>`}).join("")}</div>`;
  $$("#inspector [data-r]").forEach(x=>x.onclick=()=>{const q=map[x.dataset.r];state.selected=q.id;inspect(q,map,rr);highlight(q.id)})
}
function highlight(id){const rr=DATA.routes[state.route],rel=new Set([id]);rr.edges.forEach(([a,b])=>{if(a===id)rel.add(b);if(b===id)rel.add(a)});$$(".routeNode").forEach(x=>x.style.opacity=rel.has(x.dataset.node)?"1":".2");$$(".routeEdge").forEach(x=>{const [a,b]=x.dataset.edge.split("|");const hot=a===id||b===id;x.classList.toggle("hot",hot);x.style.opacity=hot?"":"0.1"})}
function showAll(){ $$(".routeNode").forEach(x=>x.style.opacity="");$$(".routeEdge").forEach(x=>{x.style.opacity="";x.classList.remove("hot")})}
$("#routeAll").onclick=showAll;$("#routeReset").onclick=()=>{state.selected=null;renderRoute()};$("#routeSvg").onclick=showAll;
$("#futureBtn").onclick=e=>{state.showFuture=!state.showFuture;e.currentTarget.classList.toggle("active",state.showFuture);renderRoute()};
$("#f2Btn").onclick=e=>{state.showF2=!state.showF2;e.currentTarget.classList.toggle("active",state.showF2);renderRoute()};
$("#highBtn").onclick=e=>{state.high=!state.high;e.currentTarget.classList.toggle("active",state.high);renderRoute()};
$("#routeEditBtn").onclick=()=>{if(!canWrite())return toast("当前账号没有路线编辑权限",true);canvasEditing=true;routeEditorOpen=true;renderRoute()};
$("#canvasDoneBtn").onclick=()=>{canvasEditing=false;routeEditorOpen=false;routeConnectMode=false;routeConnectSource=null;renderRoute()};
$("#routeConnectBtn").onclick=e=>{if(!canWrite())return toast("当前账号没有路线编辑权限",true);routeConnectMode=!routeConnectMode;routeConnectSource=null;e.currentTarget.classList.toggle("active",routeConnectMode);toast(routeConnectMode?"连线模式：依次点击起点与终点。":"已退出连线模式。");renderRoute()};
$("#routeNewBtn").onclick=async()=>{if(!canWrite())return toast("当前账号没有路线编辑权限",true);const name=prompt("新路线名称");if(!name?.trim())return;const id=(prompt("路线 ID（英文、数字、下划线）",name.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,""))||"").trim();if(!/^[a-z][a-z0-9_]{1,63}$/.test(id))return toast("路线 ID 必须为小写英文、数字或下划线。",true);try{const {error}=await sb.from("breeding_routes").insert({id,name:name.trim(),status:"active",priority:50,start_year:state.year});if(error)throw error;state.route=id;routeEditorOpen=true;toast("新路线已创建。");await refreshRemote(false)}catch(error){toast(error.message||String(error),true)}};
function rawRouteNode(uiNode){return REMOTE_RAW.nodes.find(row=>row.route_id===state.route&&(row.snake_id||row.id)===uiNode.id)}
function renderCanvasMode(){const shell=$("#routeShell"),panel=$("#canvasSidePanel"),inspector=$("#inspector"),done=$("#canvasDoneBtn");if(!shell||!panel)return;shell.classList.toggle("canvasEditing",canvasEditing);panel.hidden=!canvasEditing;inspector.hidden=canvasEditing;done.hidden=!canvasEditing;if(!canvasEditing)return;const renderList=(sex,title)=>DATA.snakes.filter(s=>s.status==="active"&&s.sex===sex).map(s=>`<button data-canvas-snake="${esc(s.id)}"><b>${esc(s.id)}</b><span>${esc(s.gene)}</span></button>`).join("")||"<p>暂无个体</p>";panel.innerHTML=`<div class="canvasSideHead"><b>添加到画板</b><input type="search" id="canvasSnakeSearch" placeholder="搜索编号、系列或基因型"></div><section><h4>母蛇</h4><div class="canvasSnakeList" data-sex="F">${renderList("F")}</div></section><section><h4>公蛇</h4><div class="canvasSnakeList" data-sex="M">${renderList("M")}</div></section>`;panel.querySelector("#canvasSnakeSearch").oninput=e=>{const q=e.target.value.toLowerCase();panel.querySelectorAll("[data-canvas-snake]").forEach(button=>button.hidden=!!q&&!button.textContent.toLowerCase().includes(q))};panel.querySelectorAll("[data-canvas-snake]").forEach(button=>button.onclick=()=>addSnakeToCanvas(button.dataset.canvasSnake))}
async function addSnakeToCanvas(snakeId){const snake=snakeById[snakeId];if(!snake)return;const existing=REMOTE_RAW.nodes.find(row=>row.route_id===state.route&&row.snake_id===snakeId);if(existing)return toast(`${snakeId} 已在当前画板中。`);const position=routeNodePosition(REMOTE_RAW.nodes.filter(row=>row.route_id===state.route).length);try{const {error}=await sb.from("route_nodes").insert({id:`${state.route}_${snakeId}`,route_id:state.route,node_type:"snake",snake_id:snakeId,label:snake.gene,subtitle:`${snake.series} · ${snake.sex==="F"?"♀":"♂"}`,planned_year:mature(snake),strategic_score:snake.score,is_key:false,x:position.x,y:position.y});if(error)throw error;await refreshRemote(false);toast(`${snakeId} 已加入画板。`)}catch(error){toast(error.message||String(error),true)}}
function applyCanvasView(){const transform=`translate(${canvasView.x} ${canvasView.y}) scale(${canvasView.scale})`;$("#routeEdges")?.setAttribute("transform",transform);$("#routeNodes")?.setAttribute("transform",transform)}
let canvasPanStart=null;$("#routeSvg").addEventListener("wheel",event=>{event.preventDefault();const scale=event.deltaY<0?1.12:.89;canvasView.scale=Math.max(.35,Math.min(2.5,canvasView.scale*scale));applyCanvasView()},{passive:false});$("#routeSvg").addEventListener("pointerdown",event=>{if(event.target!==event.currentTarget)return;canvasPanStart={x:event.clientX,y:event.clientY,viewX:canvasView.x,viewY:canvasView.y};event.currentTarget.setPointerCapture(event.pointerId)});$("#routeSvg").addEventListener("pointermove",event=>{if(!canvasPanStart)return;canvasView.x=canvasPanStart.viewX+(event.clientX-canvasPanStart.x);canvasView.y=canvasPanStart.viewY+(event.clientY-canvasPanStart.y);applyCanvasView()});$("#routeSvg").addEventListener("pointerup",event=>{canvasPanStart=null;event.currentTarget.releasePointerCapture(event.pointerId)});
function enableRouteDrag(group,node){let start=null,moved=false;group.addEventListener("pointerdown",event=>{if(routeConnectMode)return;start={x:event.clientX,y:event.clientY,nodeX:node.x,nodeY:node.y};moved=false;group.setPointerCapture(event.pointerId);event.stopPropagation()});group.addEventListener("pointermove",event=>{if(!start)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;node.x=Math.max(0,Math.min(1000,start.nodeX+dx));node.y=Math.max(0,Math.min(650,start.nodeY+dy));group.setAttribute("transform",`translate(${node.x},${node.y})`)});group.addEventListener("pointerup",async event=>{if(!start)return;group.releasePointerCapture(event.pointerId);const didMove=moved;start=null;if(!didMove)return;const raw=rawRouteNode(node);if(!raw)return;try{const {error}=await sb.from("route_nodes").update({x:Math.round(node.x),y:Math.round(node.y)}).eq("id",raw.id);if(error)throw error;await refreshRemote(false)}catch(error){toast(error.message||String(error),true)}})}
async function selectRouteConnection(node){const raw=rawRouteNode(node);if(!raw)return;if(!routeConnectSource){routeConnectSource=raw;toast(`已选择起点：${raw.label}；请点击终点。`);return}if(routeConnectSource.id===raw.id)return toast("请点击不同的终点。",true);try{const {error}=await sb.from("route_edges").insert({route_id:state.route,from_node_id:routeConnectSource.id,to_node_id:raw.id,edge_type:$("#routeConnectType")?.value||"link"});if(error)throw error;toast("连线已建立。");routeConnectSource=null;await refreshRemote(false)}catch(error){toast(error.message||String(error),true)}}

function routeNodePosition(index){return {x:130+(index%4)*245,y:130+Math.floor(index/4)*120}}
function renderRouteEditor(){const host=$("#routeEditor");if(!host)return;host.hidden=!routeEditorOpen||!canWrite();if(host.hidden)return;const route=REMOTE_RAW.routes.find(row=>row.id===state.route);if(!route){host.innerHTML='<div class="cardBody">当前没有可编辑的路线。</div>';return}const nodes=REMOTE_RAW.nodes.filter(row=>row.route_id===route.id),edges=REMOTE_RAW.edges.filter(row=>row.route_id===route.id),editing=nodes.find(row=>row.id===editingRouteNodeId)||null,occupied=new Set(nodes.map(row=>row.snake_id).filter(Boolean)),available=DATA.snakes.filter(s=>s.status==="active"&&(!occupied.has(s.id)||s.id===editing?.snake_id)),position=editing?{x:editing.x??0,y:editing.y??0}:routeNodePosition(nodes.length),selectedSnake=editing?.snake_id||available[0]?.id||"";host.innerHTML=`<div class="cardHead"><div><h3>编辑路线 · ${esc(route.name)}</h3><p>加入真实个体、定位节点并维护项目连线。删除节点会一并删除其连线。</p></div><div class="spacer"></div><button class="iconBtn" data-route-editor-close>收起</button></div><div class="cardBody routeEditorBody"><form id="routeNodeForm" class="routeEditorForm"><div class="formField"><label>现有个体</label><select name="snake_id" required ${editing?"disabled":""}>${available.length?available.map(s=>`<option value="${esc(s.id)}" ${s.id===selectedSnake?"selected":""}>${esc(s.id)} · ${esc(s.gene)}</option>`).join(""):'<option value="">没有可加入的活跃个体</option>'}</select>${editing?`<input type="hidden" name="snake_id" value="${esc(editing.snake_id||"")}">`:""}</div><div class="formField"><label>节点标题</label><input name="label" required value="${esc(editing?.label||snakeById[selectedSnake]?.gene||"")}"></div><div class="formField"><label>副标题</label><input name="subtitle" value="${esc(editing?.subtitle||"")}" placeholder="例如：极端红 · ♀"></div><div class="formField"><label>X 坐标</label><input name="x" type="number" min="0" max="1000" step="1" value="${esc(position.x)}"></div><div class="formField"><label>Y 坐标</label><input name="y" type="number" min="0" max="650" step="1" value="${esc(position.y)}"></div><div class="formField"><label>战略分</label><input name="strategic_score" type="number" min="0" max="100" step="1" value="${esc(editing?.strategic_score??snakeById[selectedSnake]?.score??0)}"></div><div class="formField routeKeyField"><label><input name="is_key" type="checkbox" ${editing?.is_key?"checked":""}> 关键节点</label></div><div class="routeEditorActions"><button class="primaryBtn" ${available.length||editing?"":"disabled"}>${editing?"保存节点":"加入路线"}</button>${editing?'<button type="button" class="topBtn" data-route-node-cancel>取消编辑</button>':""}</div></form><div class="routeEditorDivider"></div><form id="routeEdgeForm" class="routeEdgeForm"><div class="formField"><label>起点</label><select name="from_node_id" required>${nodes.map(n=>`<option value="${esc(n.id)}">${esc(n.label)} · ${esc(n.id)}</option>`).join("")}</select></div><div class="formField"><label>终点</label><select name="to_node_id" required>${nodes.map(n=>`<option value="${esc(n.id)}">${esc(n.label)} · ${esc(n.id)}</option>`).join("")}</select></div><div class="formField"><label>连线类型</label><select name="edge_type"><option value="pair">配对 / pair</option><option value="next">下一代 / next</option><option value="link">战略关联 / link</option><option value="backcross">回交 / backcross</option><option value="gap">缺口 / gap</option></select></div><div class="routeEditorActions"><button class="primaryBtn" ${nodes.length>1?"":"disabled"}>建立连线</button></div></form><div class="routeEditorList"><h4>当前节点与连线</h4><div class="routeEditorRows">${nodes.map(n=>`<div><span>${esc(n.label)} <small>${esc(n.id)}</small></span><button class="iconBtn" data-route-node-edit="${esc(n.id)}">编辑</button><button class="iconBtn danger" data-route-node-delete="${esc(n.id)}">删除</button></div>`).join("")||"<p>暂无节点。</p>"}${edges.map(e=>`<div><span>${esc(nodes.find(n=>n.id===e.from_node_id)?.label||e.from_node_id)} → ${esc(nodes.find(n=>n.id===e.to_node_id)?.label||e.to_node_id)} <small>${esc(e.edge_type)}</small></span><button class="iconBtn danger" data-route-edge-delete="${e.id}">删除连线</button></div>`).join("")}</div></div></div>`;host.querySelector("[data-route-editor-close]").onclick=()=>{routeEditorOpen=false;renderRouteEditor()};host.querySelector("[data-route-node-cancel]")?.addEventListener("click",()=>{editingRouteNodeId=null;renderRouteEditor()});host.querySelector("#routeNodeForm")?.addEventListener("submit",saveRouteNode);host.querySelector("#routeEdgeForm")?.addEventListener("submit",saveRouteEdge);host.querySelectorAll("[data-route-node-edit]").forEach(button=>button.onclick=()=>{editingRouteNodeId=button.dataset.routeNodeEdit;renderRouteEditor()});host.querySelectorAll("[data-route-node-delete]").forEach(button=>button.onclick=()=>deleteRouteNode(button.dataset.routeNodeDelete));host.querySelectorAll("[data-route-edge-delete]").forEach(button=>button.onclick=()=>deleteRouteEdge(Number(button.dataset.routeEdgeDelete)))}
async function saveRouteNode(event){event.preventDefault();if(!canWrite())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form).entries()),routeId=state.route,snake=snakeById[data.snake_id];if(!snake)return toast("请选择有效的活跃个体",true);const row={route_id:routeId,node_type:"snake",snake_id:data.snake_id,label:data.label.trim(),subtitle:data.subtitle?.trim()||null,planned_year:mature(snake),strategic_score:Number(data.strategic_score||0),is_key:form.elements.is_key.checked,x:Number(data.x),y:Number(data.y),detail:null};try{if(editingRouteNodeId){const {error}=await sb.from("route_nodes").update(row).eq("id",editingRouteNodeId);if(error)throw error;toast("路线节点已更新")}else{row.id=`${routeId}_${data.snake_id}`;const {error}=await sb.from("route_nodes").insert(row);if(error)throw error;toast("个体已加入当前路线")}editingRouteNodeId=null;await refreshRemote(false)}catch(error){toast(error.message||String(error),true)}}
async function saveRouteEdge(event){event.preventDefault();if(!canWrite())return;const data=Object.fromEntries(new FormData(event.currentTarget).entries());if(data.from_node_id===data.to_node_id)return toast("起点与终点不能相同",true);try{const {error}=await sb.from("route_edges").insert({route_id:state.route,from_node_id:data.from_node_id,to_node_id:data.to_node_id,edge_type:data.edge_type});if(error)throw error;toast("路线连线已建立");await refreshRemote(false)}catch(error){toast(error.message||String(error),true)}}
async function deleteRouteNode(id){if(!canWrite()||!confirm(`删除路线节点 ${id}？其连线也会被删除。`))return;try{const {error}=await sb.from("route_nodes").delete().eq("id",id);if(error)throw error;editingRouteNodeId=null;toast("路线节点已删除");await refreshRemote(false)}catch(error){toast(error.message||String(error),true)}}
async function deleteRouteEdge(id){if(!canWrite()||!confirm("删除这条路线连线？"))return;try{const {error}=await sb.from("route_edges").delete().eq("id",id);if(error)throw error;toast("路线连线已删除");await refreshRemote(false)}catch(error){toast(error.message||String(error),true)}}

document.addEventListener("focusin",event=>{const select=event.target;if(!select.matches?.('#routeEditor select[name="snake_id"]')||select.parentElement.querySelector(".routeSnakeSearch"))return;const search=document.createElement("input");search.type="search";search.className="routeSnakeSearch";search.placeholder="搜索编号、系列或基因型";select.parentElement.insertBefore(search,select);search.oninput=()=>{const query=search.value.trim().toLowerCase();[...select.options].forEach(option=>option.hidden=!!query&&!option.text.toLowerCase().includes(query));const first=[...select.options].find(option=>!option.hidden);if(first)select.value=first.value};setTimeout(()=>search.focus(),0)});
function counts(){const o={};DATA.snakes.forEach(s=>o[s.series]=(o[s.series]||0)+1);return o}
function renderPopulation(){
 const rs=DATA.snakes.filter(ready),rf=rs.filter(s=>s.sex==="F").length,rm=rs.filter(s=>s.sex==="M").length,total=DATA.snakes.reduce((a,s)=>a+(s.price||0),0);
 const complete=Object.keys(counts()).filter(k=>{const x=DATA.snakes.filter(s=>s.series===k&&ready(s));return x.some(s=>s.sex==="F")&&x.some(s=>s.sex==="M")}).length;
 const f=DATA.snakes.filter(s=>s.sex==="F").length,m=DATA.snakes.filter(s=>s.sex==="M").length,n=DATA.snakes.length;if($("#sideSnakeCount"))$("#sideSnakeCount").textContent=n;if($("#sideSnakeMeta"))$("#sideSnakeMeta").innerHTML=`个体已载入<br>${f}F / ${m}M · Supabase`;
 $("#popKpis").innerHTML=kpi("总个体",n,`${f} Female · ${m} Male`,"◫")+kpi(`${state.year} 可繁`,rs.length,`${rf}F / ${rm}M 已成熟`,"◎","gold")+kpi("表内购入投入",fmt(total),"不含饲养与基础设施","¥")+kpi("已形成公母结构系列",complete,`按 ${state.year} 成熟状态`,"⌁","violet");
  $("#sexChart").innerHTML=`<div class="donutWrap"><div class="donut" style="background:conic-gradient(#0066cc 0 ${n?f/n*100:0}%,#1d1d1f ${n?f/n*100:0}% 100%)"><div class="donutCenter"><strong>${n}</strong><span>TOTAL</span></div></div><div class="legendList"><div class="legendLine"><span><i class="dot" style="background:#0066cc"></i>Female</span><b>${f}</b></div><div class="legendLine"><span><i class="dot" style="background:#1d1d1f"></i>Male</span><b>${m}</b></div><div class="legendLine"><span>Female : Male</span><b>${m?(f/m).toFixed(1):"∞"} : 1</b></div></div></div>`;
 const sc=counts(),mx=Math.max(1,...Object.values(sc));$("#seriesBars").innerHTML=Object.entries(sc).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="barRow"><label>${esc(k)}</label><div class="barTrack"><i style="width:${v/mx*100}%"></i></div><span>${v}</span></div>`).join("")||'<div class="miniCard"><p>暂无个体数据。</p></div>';
 drawMaturity();const ys=planningYears();$("#maturityStrip").innerHTML=ys.map(y=>`<div class="yearTile ${y===state.year?"active":""}" data-y="${y}"><b>${y}</b><strong>${DATA.snakes.filter(s=>mature(s)<=y).length}</strong><span>累计成熟 / ${DATA.snakes.length}</span></div>`).join("")||'<div class="geneEditorEmpty">暂无可用年份数据。</div>';$$("[data-y]").forEach(x=>x.onclick=()=>syncYear(x.dataset.y));
 const sel=$("#popSeries"),keep=state.series;sel.innerHTML='<option value="">全部系列</option>'+Object.keys(sc).sort().map(k=>`<option value="${esc(k)}">${esc(k)}</option>`).join("");sel.value=keep;renderRows()
}
function drawMaturity(){const box=$("#maturityChart"),ys=planningYears(),F=ys.map(y=>DATA.snakes.filter(s=>s.sex==="F"&&mature(s)<=y).length),M=ys.map(y=>DATA.snakes.filter(s=>s.sex==="M"&&mature(s)<=y).length),w=430,h=210,p=28,max=Math.max(1,...F,...M),X=i=>ys.length>1?p+i*(w-2*p)/(ys.length-1):w/2,Y=v=>h-p-v*(h-2*p)/max,line=a=>a.map((v,i)=>(i?"L":"M")+X(i)+","+Y(v)).join(" ");box.innerHTML=ys.length?`<svg viewBox="0 0 ${w} ${h}">${[0,.25,.5,.75,1].map(i=>{const v=Math.round(max*i);return `<line x1="${p}" x2="${w-p}" y1="${Y(v)}" y2="${Y(v)}" class="gridLine"/><text x="3" y="${Y(v)+3}" class="axis">${v}</text>`}).join("")}<path d="${line(F)}" class="lineA"/><path d="${line(M)}" class="lineB"/>${ys.map((y,i)=>`<text x="${X(i)-10}" y="${h-5}" class="axis">${String(y).slice(2)}</text>`).join("")}<text x="${w-115}" y="15" class="axis">蓝：Female</text><text x="${w-55}" y="15" class="axis">黑：Male</text></svg>`:'<div class="geneEditorEmpty">暂无成熟年份数据。</div>'}
function renderRows(){const q=state.q.toLowerCase(),rows=DATA.snakes.filter(s=>(!q||[s.id,s.series,s.gene,s.role].join(" ").toLowerCase().includes(q))&&(!state.series||s.series===state.series)&&(!state.sex||s.sex===state.sex));$("#popRows").innerHTML=rows.map(s=>`<tr data-s="${s.id}"><td>${s.id}</td><td>${esc(s.series)}</td><td>${esc(s.gene)}</td><td><span class="badge ${s.sex==="F"?"sexF":"sexM"}">${s.sex==="F"?"♀ Female":"♂ Male"}</span></td><td>${s.mature}</td><td><span class="badge ${ready(s)?"ready":"future"}">${ready(s)?"READY":"LOCKED "+mature(s)}</span></td><td>${fmt(s.price)}</td><td>${esc(s.role)}</td><td><span class="badge scoreBadge">${s.score}</span></td></tr>`).join("");$$("#popRows [data-s]").forEach(x=>x.onclick=()=>openDrawer(snakeById[x.dataset.s]))}
$("#popSearch").oninput=e=>{state.q=e.target.value;renderRows()};$("#popSeries").onchange=e=>{state.series=e.target.value;renderRows()};$("#popSex").onchange=e=>{state.sex=e.target.value;renderRows()};


function planParentHTML(id,virtual,labelSex){
  if(id){
    const x=snakeById[id],sex=x.sex==="F"?"♀":"♂",cls=x.sex==="F"?"female":"male";
    return `<span class="parentChip ${cls}" data-plan-snake="${x.id}">${sex} ${x.id} · ${esc(x.gene)}</span>`;
  }
  return `<span class="parentChip virtual">${labelSex||"◇"} ${esc(virtual||"待定")}</span>`;
}
function planStatus(item){
  const ids=[item.female,item.male,item.female2].filter(Boolean);
  if(item.mode==="Investment gap"||item.mode==="Investment dependent") return ["INVESTMENT","statusGap"];
  if(item.virtualFemale||item.virtualMale||item.female2) return ["CONDITIONAL","statusFuture"];
  if(ids.length && ids.every(id=>ready(snakeById[id]))) return ["READY","statusReady"];
  const years=ids.map(id=>mature(snakeById[id]));
  return [`${Math.max(...years)} READY`,"statusFuture"];
}
function renderAnnualPlan(){
  const items=ANNUAL_PLANS[String(state.year)]||[];
  const counted=items.filter(x=>x.count).length, optional=items.filter(x=>!x.count&&x.priority!=="G"&&x.priority!=="C").length;
  const target=counted;
  const flexible=Math.max(0,target-counted);
  $("#annualPlanTitle").textContent=`${state.year} 本年度繁育计划`;
  $("#annualPlanSummary").innerHTML=
    `<div class="planSummaryChip"><label>Core routes shown</label><strong>${counted} 组</strong></div>`+
    `<div class="planSummaryChip"><label>Flexible capacity</label><strong>${flexible} 窝</strong></div>`+
    `<div class="planSummaryChip"><label>Reserve / conditional</label><strong>${items.length-counted} 项</strong></div>`;
  const preview=$("#heroPlanPreview");
  if(preview){
    const primary=items.filter(x=>x.count).slice(0,4);
    preview.innerHTML=`<div class="heroPlanPreviewHead"><b>本年度核心排配</b><span>下方查看完整计划</span></div><div class="heroPairGrid">${primary.map(x=>{
      let left=x.female?`${x.female} ${snakeById[x.female].gene}`:(x.virtualFemale||"F1 待定");
      let right=x.male?`${x.male} ${snakeById[x.male].gene}`:(x.female2?`${x.female2} ${snakeById[x.female2].gene}`:(x.virtualMale||"待定"));
      return `<div class="heroPair"><div class="heroPairTop"><i class="heroPairPr">${x.priority}</i><b>${esc(x.project)}</b></div><span>♀ ${esc(left)} × ♂ ${esc(right)}</span></div>`;
    }).join("")}</div>`;
  }
  $("#annualPlanList").innerHTML=items.map((x,i)=>{
    const st=planStatus(x);
    let parents="";
    if(x.female2){
      parents=planParentHTML(null,x.virtualFemale,"◆")+"<span class='crossTiny'>×</span>"+planParentHTML(x.female2,null);
    }else{
      parents=planParentHTML(x.female,x.virtualFemale,"♀")+"<span class='crossTiny'>×</span>"+planParentHTML(x.male,x.virtualMale,"♂");
    }
    return `<div class="breedingPlanRow">
      <div class="priorityBox priority${x.priority}">${x.priority}</div>
      <div class="pairBlock"><div class="pairProject">${esc(x.project)}</div><div class="pairParents">${parents}</div></div>
      <div class="planGoal">${esc(x.goal)}</div>
      <div class="planMode">${esc(x.mode)}</div>
      <div class="planStatus ${st[1]}">${x._status==="completed"?"已完成":st[0]}</div>
      ${canWrite()?`<div class="planInlineActions"><button class="iconBtn" data-page-edit-plan="${x._id}">编辑</button>${x._status!=="completed"?`<button class="iconBtn" data-page-complete-plan="${x._id}">设为完成</button>`:""}<button class="iconBtn danger" data-page-delete-plan="${x._id}">删除</button></div>`:""}
    </div>`;
  }).join("")||'<div class="miniCard"><p>当前年份尚未配置繁育计划。</p></div>';
  $$("#annualPlanList [data-plan-snake]").forEach(x=>x.onclick=()=>openDrawer(snakeById[x.dataset.planSnake]));
  $$("[data-page-edit-plan]").forEach(x=>x.onclick=()=>openPlanForm(Number(x.dataset.pageEditPlan)));
  $$("[data-page-complete-plan]").forEach(x=>x.onclick=()=>markRecordCompleted("annual_breeding_plans",Number(x.dataset.pageCompletePlan),"年度计划"));
  $$("[data-page-delete-plan]").forEach(x=>x.onclick=()=>deleteRecord("annual_breeding_plans",Number(x.dataset.pageDeletePlan),"年度计划 #"+x.dataset.pageDeletePlan));
}

function productionFor(year){
  const active=DATA.snakes.filter(s=>s.status==="active");
  const matureSnakes=active.filter(s=>mature(s)<=year);
  const plans=ANNUAL_PLANS[String(year)]||[];
  const counted=plans.filter(x=>x.count);
  return {f:matureSnakes.filter(s=>s.sex==="F").length,m:matureSnakes.filter(s=>s.sex==="M").length,planned:counted.length,plans,counted};
}
function renderProduction(){const p=productionFor(state.year), projects=[...new Set(p.counted.map(x=>x.project).filter(Boolean))];$("#prodHero").innerHTML=`<div class="planLabel">Selected planning year · live Supabase data</div><div class="planYear">${state.year}</div><div class="planFocus">已配置 ${p.planned} 个核心计划</div><div class="planText">容量、计划及项目名称均来自当前数据库；未配置的内容不再使用本地模拟值。</div><div class="capacity"><div class="cap"><label>Mature active female</label><strong>${p.f} ♀</strong></div><div class="cap"><label>Mature active male</label><strong>${p.m} ♂</strong></div><div class="cap"><label>Core plans</label><strong>${p.planned}</strong></div><div class="cap"><label>Plan / female</label><strong>${p.f?Math.round(p.planned/p.f*100):0}%</strong></div></div><div class="heroPlanPreview" id="heroPlanPreview"></div>`;renderAnnualPlan();
 const pipe=[];Object.values(DATA.routes).forEach(r=>r.nodes.filter(n=>n.kind==="offspring").forEach(n=>pipe.push({year:n.year,name:n.label,route:r.name})));pipe.sort((a,b)=>a.year-b.year);$("#pipeline").innerHTML=pipe.slice(0,7).map(x=>`<div class="pipe"><div class="pipeYear">${x.year}</div><div><b>${esc(x.name)}</b><span>${esc(x.route)}</span></div><div class="pipeState">${x.year<=state.year?"ACTIVE":"PLANNED"}</div></div>`).join("")||'<div class="miniCard"><p>暂无路线节点。</p></div>';drawProd();
 const grouped={};p.plans.forEach(x=>{const k=x.project||"未命名项目";grouped[k]=(grouped[k]||0)+1});const total=Math.max(1,p.plans.length);$("#quota").innerHTML=`<div class="bars">${Object.entries(grouped).map(([k,v])=>`<div class="barRow"><label>${esc(k)}</label><div class="barTrack"><i style="width:${v/total*100}%"></i></div><span>${v} 项</span></div>`).join("")||'<div class="miniCard"><p>本年度暂无计划。</p></div>'}</div>`;
 const byPriority=x=>p.plans.filter(i=>i.priority===x).map(i=>"• "+esc(i.project||"未命名项目")).join("<br>")||"• 暂无";$("#checklist").innerHTML=`<div class="miniCard"><h4>A · 高优先</h4><p>${byPriority("A")}</p></div><div class="miniCard"><h4>B · 次优先</h4><p>${byPriority("B")}</p></div><div class="miniCard"><h4>R / C / G · 备用与条件</h4><p>${p.plans.filter(i=>!["A","B"].includes(i.priority)).map(i=>"• "+esc(i.project||"未命名项目")).join("<br>")||"• 暂无"}</p></div>`;$("#annualFacts").innerHTML=`<div class="factPanel"><b>截至 ${new Date().toLocaleString("zh-CN")} 的固定检查</b><br>活跃且成熟：${p.f} 条母蛇、${p.m} 条公蛇。当前年份已有 ${p.planned} 条核心计划；这些数字仅来自 snakes、annual_breeding_plans 与状态字段。</div>`}
function drawProd(){const ys=planningYears(),F=ys.map(y=>productionFor(y).f),C=ys.map(y=>productionFor(y).planned),w=520,h=220,p=30,max=Math.max(1,...F,...C),X=i=>ys.length>1?p+i*(w-2*p)/(ys.length-1):w/2,Y=v=>h-p-v*(h-2*p)/max,line=a=>a.map((v,i)=>(i?"L":"M")+X(i)+","+Y(v)).join(" ");$("#prodChart").innerHTML=ys.length?`<svg viewBox="0 0 ${w} ${h}">${[0,.25,.5,.75,1].map(i=>{const v=Math.round(max*i);return `<line x1="${p}" x2="${w-p}" y1="${Y(v)}" y2="${Y(v)}" class="gridLine"/><text x="4" y="${Y(v)+3}" class="axis">${v}</text>`}).join("")}<path d="${line(F)}" class="lineA"/><path d="${line(C)}" class="lineB"/>${ys.map((y,i)=>`<text x="${X(i)-13}" y="${h-5}" class="axis">${y}</text><circle cx="${X(i)}" cy="${Y(F[i])}" r="3" class="pt"/>`).join("")}<text x="${w-165}" y="14" class="axis">紫：成熟活跃母蛇</text><text x="${w-80}" y="14" class="axis">金：计划项</text></svg>`:'<div class="geneEditorEmpty">暂无年度计划数据。</div>'}

function renderInvestment(){const series=Object.keys(counts()),gaps=series.filter(k=>DATA.snakes.some(s=>s.series===k&&s.sex==="F"&&s.status==="active")&&!DATA.snakes.some(s=>s.series===k&&s.sex==="M"&&s.status==="active"));const top=[...DATA.investments].sort((a,b)=>b.score-a.score)[0];$("#investKpis").innerHTML=kpi("最高优先投资",top?esc(top.name):"暂无","来自 investments 表","◇","gold")+kpi("零公系列",gaps.length,gaps.join(" / ")||"无","♂")+kpi("投资记录",DATA.investments.length,"来自 investments 表","⌁","violet")+kpi("投资原则","解锁 > 数量","以实际种群结构计算","★","gold");
 $("#investCards").innerHTML=DATA.investments.map(i=>`<div class="investCard"><div class="investTop"><div class="rank">#${i.rank}</div><div><h3>${esc(i.name)}</h3><div class="investTag">${esc(i.tag)}</div></div><div class="investScore">${i.score}</div></div><div class="investThesis">${esc(i.thesis)}</div><div class="investMeta"><div><label>Unlock</label><span>${esc(i.unlock)}</span></div><div><label>Window</label><span>${esc(i.window)}</span></div><div style="grid-column:1/-1"><label>Budget stance</label><span>${esc(i.budget)}</span></div></div><div class="criteria">${i.criteria.map(x=>`<span>${esc(x)}</span>`).join("")}</div></div>`).join("")||'<div class="miniCard"><p>暂无投资记录。</p></div>';
 const gapNodes=gaps.slice(0,2).map((name,i)=>{const female=DATA.snakes.filter(s=>s.series===name&&s.sex==="F"&&s.status==="active");return `<div class="gapNode" style="left:15%;top:${i?69:34}%"><b>${esc(name)} · ${female.length}F / 0M</b>${female.map(s=>esc(s.id)).join(" · ")}</div>`}).join("");$("#gapMap").innerHTML=gapNodes?`${gapNodes}<div class="gapNode core" style="left:51%;top:51%"><b>${esc(top?.name||"待评估投资")}</b>来自实时 investments 表</div><div class="gapNode" style="left:84%;top:51%"><b>待形成新项目</b>须由实际路线与计划确认</div><div class="gapLine" style="left:25%;top:51%;width:29%"></div><div class="gapLine" style="left:60%;top:51%;width:25%"></div>`:'<div class="miniCard"><p>当前没有“有活跃母蛇但无活跃公蛇”的系列缺口。</p></div>';
 if(canWrite())$$("#investCards .investCard").forEach((card,index)=>{const i=DATA.investments[index],actions=document.createElement("div");actions.className="planInlineActions investInlineActions";actions.innerHTML=`<button class="iconBtn" data-page-edit-invest="${esc(i.id)}">编辑</button>${i.tag!=="completed"?`<button class="iconBtn" data-page-complete-invest="${esc(i.id)}">设为完成</button>`:""}<button class="iconBtn danger" data-page-delete-invest="${esc(i.id)}">删除</button>`;card.append(actions)});
 $$("[data-page-edit-invest]").forEach(x=>x.onclick=()=>openInvestmentForm(x.dataset.pageEditInvest));
 $$("[data-page-complete-invest]").forEach(x=>x.onclick=()=>markRecordCompleted("investments",x.dataset.pageCompleteInvest,"投资计划"));
 $$("[data-page-delete-invest]").forEach(x=>x.onclick=()=>deleteRecord("investments",x.dataset.pageDeleteInvest,"投资计划 "+x.dataset.pageDeleteInvest));
 const active=DATA.snakes.filter(s=>s.status==="active"),activeF=active.filter(s=>s.sex==="F"),activeM=active.filter(s=>s.sex==="M"),readyF=activeF.filter(ready),readyM=activeM.filter(ready),uncertain=REMOTE_RAW.snakeGenes.filter(x=>active.some(s=>s.id===x.snake_id)&&["unknown","possible_het"].includes(x.state)),routedIds=new Set(REMOTE_RAW.nodes.map(n=>n.snake_id||n.id).filter(Boolean)),unrouted=active.filter(s=>!routedIds.has(s.id));const uncertainDetails=uncertain.map(row=>`${row.snake_id} · ${geneLabel(REMOTE_RAW.genes.find(g=>g.id===row.gene_id))} · ${row.state}${row.state==="possible_het"?` ${pct(row.probability)}`:""}`),routeDetails=unrouted.map(s=>`${s.id} · ${s.gene}`),diagnostics=[["种群与成熟窗口",`活跃 ${active.length} 条：${activeF.length} 母 / ${activeM.length} 公；${state.year} 年可繁 ${readyF.length} 母 / ${readyM.length} 公。`,[]],["性别结构缺口",gaps.length?`${gaps.length} 个系列有活跃母蛇但无活跃公蛇：${gaps.join(" / ")}。`:"当前未发现“有活跃母蛇但无活跃公蛇”的系列缺口。",[]],["基因数据待确认",uncertain.length?`活跃个体共有 ${uncertain.length} 条 unknown 或 possible het 记录；先补全证据再据此投入。`:"活跃个体未发现 unknown 或 possible het 的原子基因记录。",uncertainDetails],["路线覆盖",unrouted.length?`${unrouted.length} 条活跃个体尚未进入路线节点。`:"所有活跃个体均已进入至少一个路线节点。",routeDetails]];$("#investmentDiagnostics").innerHTML=diagnostics.map(([a,b,details])=>`<div class="reason"><i style="background:#0066cc"></i><div><b>${esc(a)}</b><span>${esc(b)}</span>${details.length?`<details class="diagnosticDetails"><summary>查看全部 ${details.length} 条</summary><p>${details.map(esc).join("<br>")}</p></details>`:""}</div></div>`).join("")}

function geneLabel(g){return g?.name_zh||g?.chinese_name||g?.name_cn||g?.display_name||g?.name||g?.id||"未知基因"}
function snakeGeneRows(snakeId){return REMOTE_RAW.snakeGenes.filter(x=>x.snake_id===snakeId)}
function tokenSet(s){return snakeGeneRows(s.id).map(x=>geneLabel(REMOTE_RAW.genes.find(g=>g.id===x.gene_id))).filter(Boolean)}
function match(f,m){const ft=tokenSet(f),mt=tokenSet(m),common=ft.filter(x=>mt.includes(x)),both=ready(f)&&ready(m),score=Math.max(0,Math.min(100,(both?60:30)+(f.series===m.series?15:0)+(common.length?25:0)));const rs=[];rs.push(["#0066cc",f.series===m.series?"同系列":"跨系列",f.series===m.series?"以实际路线和年度计划复核。":"请确认这是一项已记录的战略桥接。"]);if(common.length)rs.push(["#0066cc","共享原子基因",common.join(" / ")]);else rs.push(["#0066cc","无共享原子基因","基于 snake_genes 实时数据。"]);rs.push(["#0066cc",both?`${state.year} 可执行`:"尚未同时成熟",both?"双方均为当前年份的成熟活跃个体。":`最早可执行：${Math.max(mature(f),mature(m))}`]);return{score,rs,both,common}}

function nowIso(){return new Date().toISOString()}
function jsonArray(value){return Array.isArray(value)?value:[]}
function safeScore(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):null}
function safeConfidence(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(1,n)):null}
function atomicGenesFor(snakeId){return snakeGeneRows(snakeId).map(row=>({gene_id:row.gene_id,name_zh:geneLabel(REMOTE_RAW.genes.find(g=>g.id===row.gene_id)),state:row.state,probability:row.probability,source:row.source,notes:row.notes||null}))}
function derivedMorphsFor(snakeId){const byGene=Object.fromEntries(snakeGeneRows(snakeId).map(x=>[x.gene_id,x]));return REMOTE_RAW.morphs.filter(m=>{const components=REMOTE_RAW.morphComponents.filter(c=>c.morph_id===m.id);return components.length&&components.every(c=>byGene[c.gene_id]?.state===c.required_state)}).map(m=>({id:m.id,name_zh:m.name_zh,name_en:m.name_en||null}))}
function snakeFact(s){const raw=REMOTE_RAW.snakes.find(x=>x.id===s.id)||{};return {id:s.id,series:s.series,gene_text:s.gene,sex:s.sex,status:s.status,origin:s.origin,birth_date:raw.birth_date||null,mature_date:raw.mature_date||null,role:s.role||null,atomic_genes:atomicGenesFor(s.id),derived_morphs:derivedMorphsFor(s.id)}}
function pairingInput(){const f=snakeById[$("#labF").value],m=snakeById[$("#labM").value];if(!f||!m)throw new Error("请先选择真实父母个体。");const relatedPlans=acceptedPlanRows().filter(p=>[p.female_snake_id,p.male_snake_id].includes(f.id)||[p.female_snake_id,p.male_snake_id].includes(m.id));return {as_of_at:nowIso(),planning_year:state.year,female:snakeFact(f),male:snakeFact(m),existing_plans:relatedPlans,route_context:REMOTE_RAW.routes.filter(r=>REMOTE_RAW.nodes.some(n=>n.route_id===r.id&&(n.snake_id===f.id||n.snake_id===m.id))),fixed_rule_result:match(f,m)} }
function annualPlanInput(){return {as_of_at:nowIso(),planning_year:state.year,active_snakes:DATA.snakes.filter(s=>s.status==="active").map(snakeFact),existing_plans:acceptedPlanRows().filter(p=>Number(p.plan_year)===Number(state.year)),routes:REMOTE_RAW.routes.filter(r=>r.status!=="archived").map(r=>({id:r.id,name:r.name,objective:r.objective||null,status:r.status,priority:r.priority||null,start_year:r.start_year||null})),constraints:{mature_females:productionFor(state.year).f,mature_males:productionFor(state.year).m}}}
function investmentInput(){const active=DATA.snakes.filter(s=>s.status==="active");const series=Object.keys(counts()).map(name=>({series:name,females:active.filter(s=>s.series===name&&s.sex==="F").length,males:active.filter(s=>s.series===name&&s.sex==="M").length,individual_ids:active.filter(s=>s.series===name).map(s=>s.id)}));return {analysis_scope:"population",as_of_at:nowIso(),planning_year:state.year,series_structure:series,active_snakes:active.map(snakeFact),investments:REMOTE_RAW.investments,routes:REMOTE_RAW.routes.filter(r=>r.status!=="archived")}}
function candidateAtomicGenes(geneText){return inferredGenes(geneText).map(row=>({gene_id:row.gene_id,name_zh:geneLabel(REMOTE_RAW.genes.find(g=>g.id===row.gene_id)),state:row.state,probability:row.probability===""?1:Number(row.probability??1),source:"candidate_text_parser",notes:row.notes||null}))}
function renderCandidateGenePreview(){const host=$("#candidateGenePreview"),text=$("#candidateGeneText")?.value.trim()||"";if(!host)return;if(!text){host.textContent="输入基因型后会显示系统可识别的原子基因；未识别部分会作为缺失数据提醒 AI。";return}const rows=candidateAtomicGenes(text);host.innerHTML=rows.length?`<b>将作为候选蛇的已知原子基因：</b>${rows.map(row=>`<span class="candidateGeneToken">${esc(row.name_zh)} · ${esc(row.state)}${row.state==="possible_het"?` ${pct(row.probability)}`:""}</span>`).join("")}`:"<b>没有识别到已登记的原子基因。</b> AI 将只把原始文字视为待核实信息，不会据此推断基因型。"}
function candidateInvestmentInput(){const geneText=$("#candidateGeneText")?.value.trim()||"",sex=$("#candidateSex")?.value||"U",notes=$("#candidateNotes")?.value.trim()||null;if(!geneText)throw new Error("请填写候选个体的基因型。");const active=DATA.snakes.filter(s=>s.status==="active"),series=Object.keys(counts()).map(name=>({series:name,females:active.filter(s=>s.series===name&&s.sex==="F").length,males:active.filter(s=>s.series===name&&s.sex==="M").length,individual_ids:active.filter(s=>s.series===name).map(s=>s.id)}));return {analysis_scope:"candidate_investment",as_of_at:nowIso(),planning_year:state.year,candidate:{candidate_ref:"candidate",gene_text:geneText,sex,provenance_notes:notes,atomic_genes:candidateAtomicGenes(geneText)},series_structure:series,active_snakes:active.map(snakeFact),investments:REMOTE_RAW.investments,routes:REMOTE_RAW.routes.filter(r=>r.status!=="archived")}}
function pct(value){return `${(Number(value||0)*100).toFixed(2).replace(/\.00$/,"")}%`}
function renderCombinedGenotypes(result){const host=$("#mendelianCombined");if(!host)return;const genes=REMOTE_RAW.genes.filter(g=>result.combinedOutcomes.some(outcome=>outcome.stateByGene[g.id]));let expanded=false,selected="";const draw=()=>{const rows=result.combinedOutcomes.filter(outcome=>!selected||outcome.stateByGene[selected]);host.innerHTML=result.combinationLimitExceeded?`<div class="mendelianNote warning">可计算组合超过 4,096 种，未完整展开；请减少参与计算的位点后再查看综合结果。</div>`:`<section class="mendelianCombined"><div class="mendelianCombinedHead"><div><b>综合后代基因型</b><span>共 ${result.combinedOutcomes.length} 种可计算组合；默认显示前 15 种</span></div>${genes.length?`<select class="filter" data-mendelian-filter><option value="">全部基因</option>${genes.map(g=>`<option value="${esc(g.id)}" ${selected===g.id?"selected":""}>含 ${esc(geneLabel(g))}</option>`).join("")}</select>`:""}</div><div class="mendelianCombinedRows">${rows.length?rows.map((row,index)=>`<div class="mendelianOutcome ${index<15||expanded?"":"hidden"}"><span>${esc(row.label)}</span><strong>${pct(row.probability)}</strong></div>`).join(""):'<div class="analysisEmpty">没有符合此筛选条件的组合。</div>'}</div>${rows.length>15?`<button class="miniBtn ghost" data-mendelian-expand>${expanded?"收起其余组合":`展开全部 ${rows.length} 种组合`}</button>`:""}</section>`;host.querySelector("[data-mendelian-filter]")?.addEventListener("change",event=>{selected=event.target.value;expanded=false;draw()});host.querySelector("[data-mendelian-expand]")?.addEventListener("click",()=>{expanded=!expanded;draw()})};draw()}
function renderMendelianCross(f,m){
  const host=$("#mendelianResult");if(!host)return;
  if(!window.SuohaGenetics){host.innerHTML='<div class="analysisEmpty">孟德尔计算模块未载入。</div>';return}
  const result=window.SuohaGenetics.calculateCross({genes:REMOTE_RAW.genes,maternalGenes:snakeGeneRows(f.id),paternalGenes:snakeGeneRows(m.id),morphs:REMOTE_RAW.morphs,morphComponents:REMOTE_RAW.morphComponents});
  const loci=result.loci.map(locus=>`<section class="mendelianLocus"><div class="mendelianLocusHead"><b>${esc(locus.genes.map(g=>geneLabel(g)).join(" / "))}</b><span>${esc(locus.locus)}</span></div>${locus.outcomes.map(outcome=>`<div class="mendelianOutcome"><span>${esc(outcome.label)}</span><strong>${pct(outcome.probability)}</strong></div>`).join("")}</section>`).join("");
  const skipped=result.skipped.map(locus=>`<div class="mendelianNote warning"><b>${esc(locus.genes.map(g=>geneLabel(g)).join(" / "))}</b>：${esc(locus.reason)}</div>`).join("");
  const morphs=result.derivedMorphs.length?`<div class="mendelianMorphs"><b>可派生组合形态</b><div>${result.derivedMorphs.map(morph=>`<span>${esc(morph.name_zh)} <strong>${pct(morph.probability)}</strong></span>`).join("")}</div></div>`:"";
  const assumptions=result.assumptions.map(note=>`<div class="mendelianNote">${esc(note)}</div>`).join("");
  host.innerHTML=(loci?`<div class="mendelianGrid">${loci}</div><div id="mendelianCombined"></div>`:'<div class="analysisEmpty">这对亲本没有可计算的单基因位点。请在 genes 中定义遗传方式，并在 snake_genes 中录入基因状态。</div>')+morphs+`<div class="mendelianFoot">${skipped}${assumptions}</div>`;renderCombinedGenotypes(result);
}
function renderLab(){const fs=DATA.snakes.filter(s=>s.sex==="F"),ms=DATA.snakes.filter(s=>s.sex==="M"),F=$("#labF"),M=$("#labM");const keepF=F.value,keepM=M.value;F.innerHTML=fs.map(s=>`<option value="${s.id}">${s.id} · ${esc(s.gene)}</option>`).join("");M.innerHTML=ms.map(s=>`<option value="${s.id}">${s.id} · ${esc(s.gene)}</option>`).join("");F.value=fs.some(s=>s.id===keepF)?keepF:(fs.some(s=>s.id==="S26")?"S26":fs[0]?.id||"");M.value=ms.some(s=>s.id===keepM)?keepM:(ms.some(s=>s.id==="S27")?"S27":ms[0]?.id||"");if(!F.value||!M.value){$("#labResult").innerHTML='<div class="analysisEmpty">需要至少一条母蛇与一条公蛇才能进行固定规则检查。</div>';const mendelian=$("#mendelianResult");if(mendelian)mendelian.innerHTML='<div class="analysisEmpty">选择一对真实亲本后显示计算结果。</div>';return}const f=snakeById[F.value],m=snakeById[M.value],r=match(f,m);$("#labYear").textContent=`${state.year} VIEW`;$("#pairVisual").innerHTML=`<div class="pairSnake"><b>♀ ${esc(f.gene)}</b><span>${f.id} · ${esc(f.series)}<br>${ready(f)?"READY":"mature "+mature(f)}</span></div><div class="cross">×</div><div class="pairSnake"><b>♂ ${esc(m.gene)}</b><span>${m.id} · ${esc(m.series)}<br>${ready(m)?"READY":"mature "+mature(m)}</span></div>`;$("#labResult").innerHTML=`<div class="matchGauge"><div class="gauge" style="background:conic-gradient(#0066cc 0 ${r.score}%,#f0f0f0 ${r.score}% 100%)"><div class="gaugeIn"><strong>${r.score}</strong><span>RULE CHECK</span></div></div><div class="reasons">${r.rs.map(([c,a,b])=>`<div class="reason"><i style="background:${c}"></i><div><b>${esc(a)}</b><span>${esc(b)}</span></div></div>`).join("")}</div></div>`;
 renderMendelianCross(f,m);
 const A=[];fs.forEach(f=>ms.forEach(m=>A.push({f,m,...match(f,m)})));A.sort((a,b)=>b.score-a.score);$("#labRows").innerHTML=A.slice(0,14).map(x=>`<tr><td>${x.f.id} · ${esc(x.f.gene)}</td><td>${x.m.id} · ${esc(x.m.gene)}</td><td>${x.f.series===x.m.series?"同系列":"战略跨系"}</td><td><span class="badge ${x.both?"ready":"future"}">${x.both?"READY":"FUTURE"}</span></td><td><span class="badge scoreBadge">${x.score}</span></td><td>${x.common.length?x.common.join(" / "):(x.f.series===x.m.series?"同系强化":"人工复核")}</td></tr>`).join("");renderAiPanelV4("pairingAi","pairing")}
$("#labF").onchange=renderLab;$("#labM").onchange=renderLab;
async function applyRecommendation(id){if(!canWrite())return;const rec=REMOTE_RAW.recommendations.find(r=>Number(r.id)===Number(id));if(!rec)return toast("找不到 AI 建议",true);const proposal=rec.proposal_payload||{},hasPlan=proposal.action==="create_annual_plan";try{const existing=REMOTE_RAW.plans.find(p=>Number(p.ai_recommendation_id)===Number(id));if(existing)return toast("该建议已经在年度审核表中");const year=Number(hasPlan?proposal.plan_year:state.year),scenario=await ensureAiDraftScenario(year);const row={scenario_id:scenario.id,plan_year:year,priority:hasPlan?(proposal.priority||"B"):"C",route_id:hasPlan?(proposal.route_id||null):null,project_name:hasPlan?(proposal.project_name||rec.title):rec.title,female_snake_id:hasPlan?(proposal.female_snake_id||null):null,male_snake_id:hasPlan?(proposal.male_snake_id||null):null,female_node_id:null,male_node_id:null,goal:hasPlan?(proposal.goal||rec.summary||null):(rec.summary||null),mode:hasPlan?(proposal.mode||"AI draft"):"AI review",status:"planned",planned_clutches:hasPlan?Number(proposal.planned_clutches??1):0,notes:`AI 建议 #${rec.id}；${hasPlan?"配对草案":"复核事项"}，提交后需人工审核。`,source_type:"ai",review_status:"pending",ai_recommendation_id:rec.id,submitted_at:nowIso()};const {error}=await sb.from("annual_breeding_plans").insert(row);if(error)throw error;const {error:reviewError}=await sb.from("ai_recommendations").update({status:"accepted",reviewed_at:nowIso()}).eq("id",id);if(reviewError)throw reviewError;await refreshRemote(false);toast(hasPlan?"已进入年度审核；通过后会自动显示在年度规划中。":"已作为年度复核事项进入审核表；通过后会显示在年度规划中。") }catch(err){toast(err.message||String(err),true)}}

function openDrawer(s){const geneText=tokenSet(s);$("#drawerContent").innerHTML=`<div class="eyebrow">Individual profile</div><h2>${esc(s.gene)}</h2><p>${esc(s.id)} · ${esc(s.series)} · ${esc(s.role)}</p><div class="drawerFacts"><div class="drawerFact"><label>Sex</label><strong>${s.sex==="F"?"♀ Female":"♂ Male"}</strong></div><div class="drawerFact"><label>Strategic score</label><strong>${s.score}/100</strong></div><div class="drawerFact"><label>Birth</label><strong>${s.birth}</strong></div><div class="drawerFact"><label>Mature</label><strong>${s.mature}</strong></div><div class="drawerFact"><label>Cost</label><strong>${fmt(s.price)}</strong></div><div class="drawerFact"><label>${state.year} status</label><strong>${ready(s)?"READY":"LOCKED"}</strong></div></div><div class="drawerSection"><b>当前系统理解</b><div>${esc(s.role)}。原始 gene text 用于人工可读展示；遗传状态以 Supabase 的 snake_genes 原子基因记录为准。</div></div><div class="drawerSection"><b>已关联原子基因</b><div>${geneText.length?geneText.map(esc).join(" · "):"尚未关联原子基因"}</div></div><div class="drawerActions writeOnly"><button class="primaryBtn" data-edit-snake="${esc(s.id)}">编辑个体与子基因</button><button class="dangerBtn" data-retire-snake="${esc(s.id)}">标记退役</button></div>`;$("#drawer").classList.add("open");const eb=$("#drawer [data-edit-snake]"),rb=$("#drawer [data-retire-snake]");if(eb)eb.onclick=()=>openSnakeForm(s.id);if(rb)rb.onclick=()=>retireSnake(s.id)}
$("#drawerClose").onclick=()=>$("#drawer").classList.remove("open");$("#topSnake").onclick=()=>{const snake=[...DATA.snakes].sort((a,b)=>b.score-a.score)[0];if(snake)openDrawer(snake);else toast("暂无已载入个体",true)};


/* =========================
   Supabase configuration
   Fill these two values only.
   The publishable key is intentionally browser-safe when RLS is configured.
   NEVER put a secret/service_role key here.
========================= */
const SUPABASE_URL=window.SuohaData.config.url;
const SUPABASE_PUBLISHABLE_KEY=window.SuohaData.config.publishableKey;

let sb=null;
let currentUser=null;
let currentProfile=null;
let workspaceUnlockInProgress=false;
let adminTab="snakes";
let editContext=null;
let editGenes=[];
let AI_LAYER_READY=false;
let REMOTE_RAW={snakes:[],routes:[],nodes:[],edges:[],plans:[],investments:[],genes:[],aliases:[],morphs:[],morphComponents:[],snakeGenes:[],scenarios:[],analysisRuns:[],recommendations:[],promptTemplates:[],conversations:[],conversationMessages:[]};
function acceptedPlanRows(){if(!AI_LAYER_READY)return REMOTE_RAW.plans.filter(p=>p.review_status!=="pending"&&p.review_status!=="returned");const accepted=new Set(REMOTE_RAW.scenarios.filter(s=>s.status==="accepted").map(s=>Number(s.id)));return REMOTE_RAW.plans.filter(p=>{if(p.review_status==="pending"||p.review_status==="returned")return false;if(p.source_type==="ai")return p.review_status==="approved";return !p.scenario_id||accepted.has(Number(p.scenario_id))})}
function defaultScenarioId(){const baseline=REMOTE_RAW.scenarios.find(s=>s.scenario_type==="baseline"&&s.status==="accepted");return baseline?baseline.id:""}

function supabaseConfigured(){
  return SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("YOUR_") &&
    SUPABASE_PUBLISHABLE_KEY &&
    !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_");
}
function canWrite(){
  return !!(currentProfile && currentProfile.active && ["editor","admin"].includes(currentProfile.role));
}
function startIntro(){
  const intro=$("#appIntro");if(!intro)return;
  const gate=$("#authGate");
  // The original intro mark becomes the left-hand login mark and stays there
  // while authentication/data loading is in progress.
  window.setTimeout(()=>{intro.classList.add("leave");gate?.classList.add("reveal")},840);
}
function showSuccess(message="操作已完成"){
  const pulse=$("#successPulse");if(!pulse)return;
  $("#successMessage").textContent=message;
  pulse.classList.remove("show");
  void pulse.offsetWidth;
  pulse.classList.add("show");
  clearTimeout(pulse._timer);pulse._timer=setTimeout(()=>pulse.classList.remove("show"),1150);
}
function toast(msg,isError=false){
  const t=$("#toast"); if(!t)return;
  t.textContent=msg;t.classList.toggle("error",!!isError);t.classList.add("show");
  clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove("show"),2800);
  if(!isError)showSuccess(msg);
}
function openModal(id){$("#"+id)?.classList.add("open")}
function closeModal(id){$("#"+id)?.classList.remove("open")}
$$("[data-close-modal]").forEach(x=>x.onclick=()=>closeModal(x.dataset.closeModal));
$$(".modalBackdrop").forEach(x=>x.addEventListener("click",e=>{if(e.target===x)x.classList.remove("open")}));


let workspaceWasRevealed=false;
function setGate(locked,message=""){
  document.body.classList.toggle("auth-locked",locked);
  $("#authGate")?.classList.toggle("hidden",!locked);
  if(locked){workspaceWasRevealed=false;document.body.classList.remove("workspace-revealing");$("#workspaceReveal")?.classList.remove("active")}
  if(message!==undefined && $("#gateMessage"))$("#gateMessage").textContent=message||"";
}
function revealAuthenticatedWorkspace(){const reveal=$("#workspaceReveal");if(workspaceWasRevealed||!reveal){setGate(false,"");$("#appIntro")?.remove();return}workspaceWasRevealed=true;reveal.classList.remove("active");void reveal.offsetWidth;document.body.classList.remove("workspace-revealing");void document.body.offsetWidth;document.body.classList.add("workspace-revealing");reveal.classList.add("active");setGate(false,"");setTimeout(()=>{reveal.classList.remove("active");document.body.classList.remove("workspace-revealing");$("#appIntro")?.remove()},2100)}
function setGateConnection(ok,text){
  $("#gateDbDot")?.classList.toggle("online",!!ok);
  if($("#gateDbText"))$("#gateDbText").textContent=text;
}

function updateAuthUI(){
  const logged=!!currentUser,write=canWrite();
  document.body.classList.toggle("can-write",write);
  document.body.classList.toggle("can-admin",!!(currentProfile&&currentProfile.active&&currentProfile.role==="admin"));
  $("#authBtn")?.classList.toggle("hidden",logged);
  $("#logoutBtn")?.classList.toggle("hidden",!logged);
  $("#authBadge")?.classList.toggle("hidden",!logged);
  if(logged){
    $("#authName").textContent=currentProfile?.display_name||currentUser.email||"User";
    $("#authRole").textContent=currentProfile?.role||"viewer";
  }
  if($("#adminUser"))$("#adminUser").textContent=currentUser?.email||"未登录";
  if($("#adminUserId"))$("#adminUserId").textContent=currentUser?.id||"—";
  if($("#adminRole"))$("#adminRole").textContent=currentProfile?.role||"viewer";
  const st=$("#adminDbStatus");
  if(st){st.classList.toggle("online",!!sb);st.querySelector("span").textContent=sb?"Connected":"Not configured"}
  if(state.page==="admin"&&!write)setPage("population");
}
async function loadProfile(){
  currentProfile=null;
  if(!sb||!currentUser)return;
  const {data,error}=await sb.from("profiles").select("id,email,display_name,role,active").eq("id",currentUser.id).maybeSingle();
  if(error){console.warn("Profile load:",error.message);return}
  currentProfile=data||{id:currentUser.id,email:currentUser.email,display_name:"",role:"viewer",active:false};
}
async function applySession(session){
  currentUser=session?.user||null;
  await loadProfile();
  updateAuthUI();
  if(currentUser){
    setGate(true,"正在读取业务数据…");
  }else{
    setGate(true,"");
  }
  renderAdmin();
}
async function login(email,password){
  if(!sb)throw new Error("Supabase 尚未配置。");
  const {data,error}=await sb.auth.signInWithPassword({email,password});
  if(error)throw error;
  return data.session;
}
async function validateAndOpenWorkspace(session){
  if(!session?.user)throw new Error("没有可用登录会话，请输入邮箱和密码后重试。");
  if(workspaceUnlockInProgress)return;
  workspaceUnlockInProgress=true;
  try{
    setGate(true,"正在校验账号权限…");
    await applySession(session);
    if(!currentProfile?.active)throw new Error("此账号尚未被授权访问该工作区。");
    setGate(true,"正在读取业务数据…");
    await loadRemoteData();
    renderAll();
    renderAdmin();
    revealAuthenticatedWorkspace();
  }finally{
    workspaceUnlockInProgress=false;
  }
}
async function logout(){
  if(!sb)return;
  const {error}=await sb.auth.signOut();
  if(error)toast(error.message,true);
}
$("#authBtn").onclick=()=>{if(!supabaseConfigured())$("#configWarning").classList.remove("hidden");else $("#configWarning").classList.add("hidden");$("#loginMessage").textContent="";openModal("loginModal")};
$("#logoutBtn").onclick=logout;
$("#loginForm").onsubmit=async e=>{
  e.preventDefault();$("#loginMessage").textContent="正在登录…";
  try{const session=await login($("#loginEmail").value.trim(),$("#loginPassword").value);await validateAndOpenWorkspace(session);$("#loginMessage").textContent="";closeModal("loginModal")}
  catch(err){$("#loginMessage").textContent="登录失败：请确认该邮箱已在 Supabase Authentication > Users 中完成账号设置，并确认密码正确。"}
};


$("#gateLoginForm").onsubmit=async e=>{
  e.preventDefault();
  const email=$("#gateEmail").value.trim(),password=$("#gatePassword").value;
  $("#gateMessage").classList.remove("ok");
  $("#gateMessage").textContent="正在验证账号…";
  try{
    // A persisted Supabase session is deliberately not opened on page load.
    // It is only validated after the user explicitly presses this button.
    let session=null;
    if(password){
      session=await login(email,password);
    }else{
      const {data:{session:storedSession},error}=await sb.auth.getSession();
      if(error)throw error;
      session=storedSession;
    }
    await validateAndOpenWorkspace(session);
    $("#gateMessage").textContent="";
  }catch(err){
    console.warn("Login:",err);
    $("#gateMessage").textContent="登录失败。请先确认该邮箱存在于 Authentication > Users，并且已经完成邀请/密码设置；如果不确定，点“首次登录 / 忘记密码”。";
  }
};

$("#gateResetBtn").onclick=async()=>{
  const email=$("#gateEmail").value.trim();
  $("#gateMessage").classList.remove("ok");
  if(!email){$("#gateMessage").textContent="先填写邮箱地址，再发送密码设置邮件。";return}
  if(!sb){$("#gateMessage").textContent="Supabase 尚未连接。";return}
  $("#gateMessage").textContent="正在发送邮件…";
  try{
    const redirectTo=window.location.origin+window.location.pathname;
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
    if(error)throw error;
    $("#gateMessage").classList.add("ok");
    $("#gateMessage").textContent="如果该邮箱可接收本项目的 Auth 邮件，密码设置/恢复链接已发送。请检查收件箱和垃圾邮件。";
  }catch(err){
    console.error("Password reset:",err);
    $("#gateMessage").textContent="发送失败："+(err.message||err);
  }
};

$("#passwordForm").onsubmit=async e=>{
  e.preventDefault();
  const p1=$("#newPassword").value,p2=$("#confirmPassword").value;
  if(p1!==p2){$("#passwordMessage").textContent="两次密码不一致。";return}
  $("#passwordMessage").textContent="正在保存…";
  try{
    const {error}=await sb.auth.updateUser({password:p1});
    if(error)throw error;
    $("#passwordMessage").textContent="";
    closeModal("passwordModal");
    await sb.auth.signOut();
    // Remove the one-time recovery token from the URL before showing the login gate.
    history.replaceState({},document.title,window.location.pathname);
    setGate(true,"密码已重置，请使用新密码登录。");
    $("#gatePassword").value="";
    toast("密码设置成功，请重新登录。");
  }catch(err){
    $("#passwordMessage").textContent=err.message||String(err);
  }
};

function dbSnakeToUi(r){
  const ym=d=>d?String(d).slice(0,7).replace("-","/"):"";
  return {
    id:r.id,series:r.series||"",gene:r.gene_text||"",sex:r.sex||"U",
    birth:ym(r.birth_date),mature:ym(r.mature_date),price:Number(r.price||0),
    investor:r.investor||"",score:Number(r.strategic_score||0),role:r.role||"",
    status:r.status||"active",origin:r.origin||"purchased",notes:r.notes||""
  };
}
function buildRoutes(routeRows,nodeRows,edgeRows){
  const out={},nodeLabel={};
  nodeRows.forEach(n=>nodeLabel[n.id]=n.label);
  routeRows.forEach(r=>{
    const ns=nodeRows.filter(n=>n.route_id===r.id);
    const idMap={};
    const uiNodes=ns.filter(n=>n.node_type!=="snake"||n.snake_id).map(n=>{
      const uiId=n.snake_id||n.id;idMap[n.id]=uiId;
      if(n.node_type==="snake"){
        return {id:n.snake_id,x:Number(n.x||0),y:Number(n.y||0)};
      }
      return {
        id:uiId,kind:n.node_type==="investment_gap"?"gap":"offspring",
        label:n.label||"",sub:n.subtitle||"",x:Number(n.x||0),y:Number(n.y||0),
        year:Number(n.planned_year||0),key:!!n.is_key,score:Number(n.strategic_score||0),
        detail:n.detail||""
      };
    });
    const es=edgeRows.filter(e=>e.route_id===r.id&&idMap[e.from_node_id]&&idMap[e.to_node_id]).map(e=>[
      idMap[e.from_node_id],
      idMap[e.to_node_id],
      e.edge_type
    ]);
    out[r.id]={name:r.name,subtitle:r.notes||r.objective||"",nodes:uiNodes,edges:es};
  });
  return {routes:out,nodeLabel};
}
function buildAnnualPlans(rows,nodeLabel){
  const out={};
  rows.forEach(r=>{
    const y=String(r.plan_year);if(!out[y])out[y]=[];
    const x={
      _id:r.id,_status:r.status||"planned",priority:r.priority||"B",project:r.project_name||"",
      goal:r.goal||"",mode:r.mode||"",count:Number(r.planned_clutches||0)>0
    };
    if(r.female_snake_id)x.female=r.female_snake_id;
    if(r.male_snake_id)x.male=r.male_snake_id;
    if(r.female_node_id)x.virtualFemale=nodeLabel[r.female_node_id]||"未来节点";
    if(r.male_node_id){
      if(r.female_snake_id&&!r.male_snake_id){
        x.virtualFemale=nodeLabel[r.male_node_id]||"未来节点";x.female2=r.female_snake_id;delete x.female;
      }else x.virtualMale=nodeLabel[r.male_node_id]||"未来节点";
    }
    out[y].push(x);
  });
  Object.values(out).forEach(a=>a.sort((a,b)=>String(a.priority).localeCompare(String(b.priority))));
  return out;
}
function dbInvestmentToUi(r){
  const criteria=Array.isArray(r.criteria)?r.criteria:[];
  let budget="待定";
  if(r.budget_min||r.budget_max)budget=`${r.budget_min||0}–${r.budget_max||"?"}`;
  return {
    id:r.id,rank:r.rank||0,name:r.name||"",tag:r.status||"planned",
    score:Number(r.strategic_score||0),
    unlock:r.target_sex?`目标性别 ${r.target_sex}`:"系统投资",
    window:r.planned_year?String(r.planned_year):"待定",
    budget,thesis:r.thesis||"",criteria
  };
}
async function loadRemoteData(){
  if(!sb)return;
  const qs=[
    sb.from("snakes").select("*").order("id"),
    sb.from("breeding_routes").select("*").order("priority",{ascending:false}),
    sb.from("route_nodes").select("*"),
    sb.from("route_edges").select("*"),
    sb.from("annual_breeding_plans").select("*").order("plan_year").order("priority"),
    sb.from("investments").select("*").order("rank"),
    sb.from("genes").select("*").order("id"),
    sb.from("gene_aliases").select("*"),
    sb.from("morphs").select("*"),
    sb.from("morph_components").select("*"),
    sb.from("snake_genes").select("*")
  ];
  const res=await Promise.all(qs);
  const bad=res.find(x=>x.error);
  if(bad)throw bad.error;
  REMOTE_RAW={
    snakes:res[0].data||[],routes:res[1].data||[],nodes:res[2].data||[],
    edges:res[3].data||[],plans:res[4].data||[],investments:res[5].data||[],
    genes:res[6].data||[],aliases:res[7].data||[],morphs:res[8].data||[],
    morphComponents:res[9].data||[],snakeGenes:res[10].data||[],scenarios:[],analysisRuns:[],recommendations:[],promptTemplates:[],conversations:[],conversationMessages:[]
  };
  const decisionRes=await Promise.all([
    sb.from("planning_scenarios").select("*").order("created_at",{ascending:false}),
    sb.from("analysis_runs").select("*").order("created_at",{ascending:false}).limit(80),
    sb.from("ai_recommendations").select("*").order("created_at",{ascending:false}).limit(160),
    sb.from("ai_prompt_templates").select("*").eq("is_active",true).order("version",{ascending:false}),
    sb.from("ai_conversations").select("*").order("updated_at",{ascending:false}).limit(80),
    sb.from("ai_conversation_messages").select("*").order("created_at",{ascending:false}).limit(600)
  ]);
  const decisionError=decisionRes.find(x=>x.error);
  AI_LAYER_READY=!decisionError;
  if(AI_LAYER_READY){
    REMOTE_RAW.scenarios=decisionRes[0].data||[];
    REMOTE_RAW.analysisRuns=decisionRes[1].data||[];
    REMOTE_RAW.recommendations=decisionRes[2].data||[];
    REMOTE_RAW.promptTemplates=decisionRes[3].data||[];
    REMOTE_RAW.conversations=decisionRes[4].data||[];
    REMOTE_RAW.conversationMessages=decisionRes[5].data||[];
  }else console.warn("AI decision layer unavailable:",decisionError.error);
  DATA=EMPTY_DATA();
  DATA.snakes=REMOTE_RAW.snakes.map(dbSnakeToUi);
  snakeById=Object.fromEntries(DATA.snakes.map(s=>[s.id,s]));
  setPlanningYears();
  const built=buildRoutes(REMOTE_RAW.routes,REMOTE_RAW.nodes,REMOTE_RAW.edges);
  DATA.routes=built.routes;
  ANNUAL_PLANS=buildAnnualPlans(acceptedPlanRows(),built.nodeLabel);
  DATA.investments=REMOTE_RAW.investments.filter(r=>r.review_status!=="pending"&&r.review_status!=="returned").map(dbInvestmentToUi);
  if(!DATA.routes[state.route])state.route=Object.keys(DATA.routes)[0]||"flagship";
}
async function loadRemoteData(){
  if(!sb)return;
  const snapshot=await window.SuohaData.fetchWorkspace(sb);
  REMOTE_RAW={...snapshot.business,scenarios:[],analysisRuns:[],recommendations:[],promptTemplates:[],conversations:[],conversationMessages:[]};
  AI_LAYER_READY=snapshot.decisions.ready;
  if(AI_LAYER_READY)Object.assign(REMOTE_RAW,snapshot.decisions.data);
  else console.warn("AI decision layer unavailable:",snapshot.decisions.error);
  DATA=EMPTY_DATA();
  DATA.snakes=REMOTE_RAW.snakes.map(dbSnakeToUi);
  snakeById=Object.fromEntries(DATA.snakes.map(s=>[s.id,s]));
  setPlanningYears();
  const built=buildRoutes(REMOTE_RAW.routes,REMOTE_RAW.nodes,REMOTE_RAW.edges);
  DATA.routes=built.routes;
  ANNUAL_PLANS=buildAnnualPlans(acceptedPlanRows(),built.nodeLabel);
  DATA.investments=REMOTE_RAW.investments.filter(r=>r.review_status!=="pending"&&r.review_status!=="returned").map(dbInvestmentToUi);
  if(!DATA.routes[state.route])state.route=Object.keys(DATA.routes)[0]||"flagship";
}
async function refreshRemote(showMessage=true){
  if(!sb)return;
  try{await loadRemoteData();renderAll();renderAdmin();if(showMessage)toast("数据库已刷新")}
  catch(err){console.error(err);toast("读取 Supabase 失败："+(err.message||err),true)}
}

const GENE_STATES=["visual","het","possible_het","super","line_trait","unknown"];
function geneOptionHtml(selected){return `<option value="">选择原子基因</option>${REMOTE_RAW.genes.map(g=>`<option value="${esc(g.id)}" ${g.id===selected?"selected":""}>${esc(geneLabel(g))} · ${esc(g.id)}</option>`).join("")}`}
function currentGeneRows(snakeId){return snakeId?snakeGeneRows(snakeId).map(x=>({gene_id:x.gene_id,state:x.state||"visual",probability:x.probability??1,source:x.source||"manual",notes:x.notes||""})):[]}
function aliasText(a){return String(a.alias||a.alias_text||a.name||"").trim()}
function aliasState(a,token){return a.state_hint||a.default_state||a.state||(/^超/.test(token)?"super":"visual")}
function inferredGenes(geneText){
  const text=String(geneText||"");const out=new Map();
  const add=(geneId,state="visual",probability="",source="parser")=>{if(geneId&&!out.has(geneId))out.set(geneId,{gene_id:geneId,state,probability,source,notes:""})};
  REMOTE_RAW.aliases.map(a=>({...a,_alias:aliasText(a)})).filter(a=>a._alias).sort((a,b)=>b._alias.length-a._alias.length).forEach(a=>{
    if(!text.includes(a._alias))return;
    const escaped=a._alias.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const possible=new RegExp(`(?:50|66)\\s*%?\\s*(?:隐\\s*)?${escaped}`).test(text);
    const het=new RegExp(`隐\\s*${escaped}`).test(text);
    add(a.gene_id,possible?"possible_het":het?"het":aliasState(a,a._alias),possible?(text.includes("66")?0.66:0.5):(a.probability_hint??1));
  });
  REMOTE_RAW.morphs.forEach(m=>{
    const labels=[m.name_zh,m.chinese_name,m.name_cn,m.display_name,m.name,m.id].filter(Boolean).map(String);
    const label=labels.find(x=>text.includes(x));if(!label)return;
    const hidden=new RegExp(`隐\\s*${label.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}`).test(text);
    REMOTE_RAW.morphComponents.filter(c=>c.morph_id===m.id).forEach(c=>add(c.gene_id,hidden?"het":(c.required_state||"visual"),1));
  });
  return [...out.values()];
}
function renderGeneEditor(){
  const host=$("#geneEditor");if(!host)return;
  const rowHtml=(g,i)=>g.isNew?`<div class="geneEditorRow geneEditorNew" data-gene-row="${i}"><input data-gene-field="gene_id" value="${esc(g.gene_id||"")}" placeholder="新基因 ID，如 caramel"><input data-gene-field="name_zh" value="${esc(g.name_zh||"")}" placeholder="中文名称"><input data-gene-field="name_en" value="${esc(g.name_en||"")}" placeholder="English name"><select data-gene-field="inheritance_type">${["recessive","incomplete_dominant","dominant","polygenic","line_trait","unknown"].map(x=>`<option value="${x}" ${g.inheritance_type===x?"selected":""}>${x}</option>`).join("")}</select><select data-gene-field="state">${GENE_STATES.map(x=>`<option value="${x}" ${g.state===x?"selected":""}>${x}</option>`).join("")}</select><input data-gene-field="probability" type="number" min="0" max="1" step="0.01" value="${g.probability??""}" placeholder="概率"><button type="button" data-remove-gene="${i}" title="删除子基因">×</button></div>`:`<div class="geneEditorRow" data-gene-row="${i}"><div class="geneExisting">${esc(geneLabel(REMOTE_RAW.genes.find(x=>x.id===g.gene_id)))} <small>${esc(g.gene_id)}</small></div><select data-gene-field="state">${GENE_STATES.map(x=>`<option value="${x}" ${g.state===x?"selected":""}>${x}</option>`).join("")}</select><input data-gene-field="probability" type="number" min="0" max="1" step="0.01" value="${g.probability??""}" placeholder="概率"><input class="geneSource" data-gene-field="source" value="${esc(g.source||"manual")}" placeholder="来源"><button type="button" data-remove-gene="${i}" title="删除子基因">×</button></div>`;
  host.innerHTML=`<div class="geneEditorHead"><div><h4>原子子基因（snake_genes）</h4><p>“添加子基因”会新建 genes 字典记录并自动关联当前蛇；已有的原子基因只会由基因文本解析自动带出。</p></div><div class="spacer"></div><button type="button" class="pillBtn" id="inferGenesBtn">从基因文本补全</button><button type="button" class="pillBtn" id="addGeneBtn">＋ 新建子基因</button></div><div class="geneEditorRows">${editGenes.map(rowHtml).join("")||'<div class="geneEditorEmpty">尚未关联原子子基因。填写 Gene text 后点击“从基因文本补全”，或新建一个原子子基因。</div>'}</div><div class="geneEditorHelp">新基因 ID 必须是稳定的小写英文/数字/下划线标识；保存时先写入 genes，再同步 snake_genes。</div>`;
  $("#addGeneBtn").onclick=()=>{editGenes.push({isNew:true,gene_id:"",name_zh:"",name_en:"",inheritance_type:"unknown",state:"visual",probability:1,source:"manual",notes:""});renderGeneEditor()};
  const mergeInferred=()=>{const inferred=inferredGenes($("#editForm [name=gene_text]")?.value);const existing=new Set(editGenes.map(x=>x.gene_id).filter(Boolean));const additions=inferred.filter(x=>!existing.has(x.gene_id));editGenes.push(...additions);return additions.length};
  $("#inferGenesBtn").onclick=()=>{const added=mergeInferred();renderGeneEditor();$("#editMessage").textContent=added?`已补全 ${added} 条原子子基因，请复核状态与概率。`:"没有发现可新增的原子子基因。"};
  const geneTextInput=$("#editForm [name=gene_text]");if(!editContext?.id&&geneTextInput)geneTextInput.onchange=()=>{const added=mergeInferred();if(added){renderGeneEditor();$("#editMessage").textContent=`已自动带出 ${added} 条原子子基因，请复核状态与概率。`}};
  $$('[data-gene-row]').forEach(row=>{const i=Number(row.dataset.geneRow);[...row.querySelectorAll('[data-gene-field]')].forEach(input=>input.onchange=()=>{editGenes[i][input.dataset.geneField]=input.value})});
  $$('[data-remove-gene]').forEach(btn=>btn.onclick=()=>{editGenes.splice(Number(btn.dataset.removeGene),1);renderGeneEditor()});
}
function nextSnakeId(){const max=Math.max(0,...REMOTE_RAW.snakes.map(s=>{const m=String(s.id||"").match(/^S(\d+)$/i);return m?Number(m[1]):0}));return `S${String(max+1).padStart(2,"0")}`}
function snakeFormHtml(row={}){
  return `<div class="formGrid">
    <div class="formField"><label>ID</label><input name="id" value="${esc(row.id||nextSnakeId())}" ${row.id?"readonly":""} required placeholder="S33"></div>
    <div class="formField"><label>Series</label><input name="series" value="${esc(row.series||"")}" required></div>
    <div class="formField full"><label>Gene text</label><input name="gene_text" value="${esc(row.gene_text||"")}" required></div>
    <div class="formField"><label>Sex</label><select name="sex"><option value="F" ${row.sex==="F"?"selected":""}>Female</option><option value="M" ${row.sex==="M"?"selected":""}>Male</option><option value="U" ${row.sex==="U"?"selected":""}>Unknown</option></select></div>
    <div class="formField"><label>Status</label><select name="status">${["active","sold","deceased","retired","planned"].map(x=>`<option ${row.status===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="formField"><label>Birth date</label><input name="birth_date" type="date" value="${esc(row.birth_date||"")}"></div>
    <div class="formField"><label>Mature date</label><input name="mature_date" type="date" value="${esc(row.mature_date||"")}"></div>
    <div class="formField"><label>Price</label><input name="price" type="number" min="0" step="0.01" value="${row.price??0}"></div>
    <div class="formField"><label>Strategic score</label><input name="strategic_score" type="number" min="0" max="100" value="${row.strategic_score??""}"></div>
    <div class="formField"><label>Investor</label><input name="investor" value="${esc(row.investor||"")}"></div>
    <div class="formField"><label>Origin</label><select name="origin">${["purchased","produced","other"].map(x=>`<option ${row.origin===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="formField full"><label>Role</label><input name="role" value="${esc(row.role||"")}"></div>
    <div class="formField full"><label>Notes</label><textarea name="notes">${esc(row.notes||"")}</textarea></div>
  </div><div id="geneEditor"></div>`;
}
function planFormHtml(row={}){
  const snakeOpts=`<option value="">—</option>`+DATA.snakes.map(s=>`<option value="${s.id}" ${row.female_snake_id===s.id||row.male_snake_id===s.id?"":""}>${s.id} · ${esc(s.gene)}</option>`).join("");
  const selectedScenario=row.scenario_id||defaultScenarioId();
  const scenarioField=AI_LAYER_READY?`<div class="formField full"><label>规划场景</label><select name="scenario_id"><option value="">未归属（兼容旧数据）</option>${REMOTE_RAW.scenarios.map(s=>`<option value="${s.id}" ${String(selectedScenario)===String(s.id)?"selected":""}>${esc(s.name)} · ${esc(s.status)}</option>`).join("")}</select></div>`:"";
  return `<div class="formGrid">
    <div class="formField"><label>Year</label><input name="plan_year" type="number" min="2020" max="2200" value="${row.plan_year||state.year}" required></div>
    <div class="formField"><label>Priority</label><select name="priority">${["A","B","R","G","C"].map(x=>`<option ${row.priority===x?"selected":""}>${x}</option>`).join("")}</select></div>
    ${scenarioField}
    <div class="formField full"><label>Project name</label><input name="project_name" value="${esc(row.project_name||"")}" required></div>
    <div class="formField"><label>Female snake</label><select name="female_snake_id"><option value="">—</option>${DATA.snakes.filter(s=>s.sex==="F").map(s=>`<option value="${s.id}" ${row.female_snake_id===s.id?"selected":""}>${s.id} · ${esc(s.gene)}</option>`).join("")}</select></div>
    <div class="formField"><label>Male snake</label><select name="male_snake_id"><option value="">—</option>${DATA.snakes.filter(s=>s.sex==="M").map(s=>`<option value="${s.id}" ${row.male_snake_id===s.id?"selected":""}>${s.id} · ${esc(s.gene)}</option>`).join("")}</select></div>
    <div class="formField"><label>Mode</label><input name="mode" value="${esc(row.mode||"")}"></div>
    <div class="formField"><label>Status</label><select name="status">${["planned","ready","conditional","completed","cancelled","investment_gap"].map(x=>`<option ${row.status===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="formField"><label>Planned clutches</label><input name="planned_clutches" type="number" min="0" value="${row.planned_clutches??1}"></div>
    <div class="formField full"><label>Goal</label><textarea name="goal">${esc(row.goal||"")}</textarea></div>
    <div class="formField full"><label>Notes</label><textarea name="notes">${esc(row.notes||"")}</textarea></div>
  </div>`;
}
function investmentFormHtml(row={}){
  let criteria=Array.isArray(row.criteria)?row.criteria.join("\n"):"";
  return `<div class="formGrid">
    <div class="formField"><label>ID</label><input name="id" value="${esc(row.id||"")}" ${row.id?"readonly":""} required placeholder="I05"></div>
    <div class="formField"><label>Name</label><input name="name" value="${esc(row.name||"")}" required></div>
    <div class="formField"><label>Category</label><select name="category">${["snake","infrastructure","data","other"].map(x=>`<option ${row.category===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="formField"><label>Status</label><select name="status">${["planned","watching","purchased","rejected","completed"].map(x=>`<option ${row.status===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="formField"><label>Rank</label><input name="rank" type="number" value="${row.rank??""}"></div>
    <div class="formField"><label>Strategic score</label><input name="strategic_score" type="number" min="0" max="100" value="${row.strategic_score??""}"></div>
    <div class="formField"><label>Target sex</label><select name="target_sex"><option value="">—</option>${["F","M","U"].map(x=>`<option ${row.target_sex===x?"selected":""}>${x}</option>`).join("")}</select></div>
    <div class="formField"><label>Planned year</label><input name="planned_year" type="number" value="${row.planned_year??state.year}"></div>
    <div class="formField"><label>Budget min</label><input name="budget_min" type="number" min="0" step="0.01" value="${row.budget_min??""}"></div>
    <div class="formField"><label>Budget max</label><input name="budget_max" type="number" min="0" step="0.01" value="${row.budget_max??""}"></div>
    <div class="formField full"><label>Thesis</label><textarea name="thesis">${esc(row.thesis||"")}</textarea></div>
    <div class="formField full"><label>Criteria (one per line)</label><textarea name="criteria">${esc(criteria)}</textarea></div>
    <div class="formField full"><label>Notes</label><textarea name="notes">${esc(row.notes||"")}</textarea></div>
  </div>`;
}
function formObject(form){
  const o=Object.fromEntries(new FormData(form).entries());
  for(const k of Object.keys(o))if(o[k]==="")o[k]=null;
  return o;
}
function openSnakeForm(id=null){
  if(!canWrite())return toast("当前账号没有写权限",true);
  const row=id?REMOTE_RAW.snakes.find(x=>x.id===id)||{}:{};
  editGenes=currentGeneRows(id);
  editContext={table:"snakes",id:id||null};
  $("#editModalTitle").textContent=id?`编辑 ${id}`:"新增个体";
  $("#editModalSub").textContent="public.snakes";
  $("#editFormFields").innerHTML=snakeFormHtml(row);renderGeneEditor();$("#editMessage").textContent="";openModal("editModal");
}
function openPlanForm(id=null){
  if(!canWrite())return toast("当前账号没有写权限",true);
  const row=id?REMOTE_RAW.plans.find(x=>String(x.id)===String(id))||{}:{};
  editContext={table:"annual_breeding_plans",id:id||null};
  $("#editModalTitle").textContent=id?`编辑年度计划 #${id}`:"新增年度计划";
  $("#editModalSub").textContent="public.annual_breeding_plans";
  $("#editFormFields").innerHTML=planFormHtml(row);$("#editMessage").textContent="";openModal("editModal");
}
function openInvestmentForm(id=null){
  if(!canWrite())return toast("当前账号没有写权限",true);
  const row=id?REMOTE_RAW.investments.find(x=>x.id===id)||{}:{};
  editContext={table:"investments",id:id||null};
  $("#editModalTitle").textContent=id?`编辑 ${id}`:"新增投资项";
  $("#editModalSub").textContent="public.investments";
  $("#editFormFields").innerHTML=investmentFormHtml(row);$("#editMessage").textContent="";openModal("editModal");
}
async function saveEdit(){
  if(!sb||!canWrite())throw new Error("没有写权限");
  const o=formObject($("#editForm"));
  const t=editContext.table;
  if(t==="snakes"){
    ["price","strategic_score"].forEach(k=>{if(o[k]!=null)o[k]=Number(o[k])});
  }else if(t==="annual_breeding_plans"){
    ["plan_year","planned_clutches"].forEach(k=>{if(o[k]!=null)o[k]=Number(o[k])});
    if("scenario_id" in o)o.scenario_id=o.scenario_id?Number(o.scenario_id):null;
  }else if(t==="investments"){
    ["rank","strategic_score","planned_year","budget_min","budget_max"].forEach(k=>{if(o[k]!=null)o[k]=Number(o[k])});
    o.criteria=o.criteria?String(o.criteria).split(/\r?\n/).map(x=>x.trim()).filter(Boolean):[];
  }
  let q;
  if(editContext.id){
    const pk=t==="annual_breeding_plans"?"id":"id";
    delete o.id;
    q=sb.from(t).update(o).eq(pk,editContext.id);
  }else q=sb.from(t).insert(o);
  const {error}=await q;if(error)throw error;
  if(t==="snakes"){
    const snakeId=editContext.id||o.id;
    try{await materializeNewGenes();await syncSnakeGenes(snakeId)}
    catch(geneError){
      if(!editContext.id){
        const {error:rollbackError}=await sb.from("snakes").delete().eq("id",snakeId);
        if(rollbackError)console.error("Could not roll back snake after gene sync failure:",rollbackError);
      }
      throw geneError;
    }
  }
}
async function materializeNewGenes(){
  const drafts=editGenes.filter(g=>g.isNew);if(!drafts.length)return;
  const ids=new Set(REMOTE_RAW.genes.map(g=>g.id));
  const rows=drafts.map((g,i)=>{
    const id=String(g.gene_id||"").trim();
    if(!/^[a-z][a-z0-9_]{1,63}$/.test(id))throw new Error(`新子基因 #${i+1} 的 ID 必须为小写英文、数字或下划线，例如 caramel。`);
    if(ids.has(id))throw new Error(`新子基因 ID 已存在：${id}`);ids.add(id);
    const nameZh=String(g.name_zh||"").trim();if(!nameZh)throw new Error(`新子基因 ${id} 必须填写中文名称。`);
    const inheritance=["recessive","incomplete_dominant","dominant","polygenic","line_trait","unknown"].includes(g.inheritance_type)?g.inheritance_type:"unknown";
    return {id,code:null,name_zh:nameZh,name_en:String(g.name_en||"").trim()||null,inheritance_type:inheritance};
  });
  const {data,error}=await sb.from("genes").insert(rows).select();if(error)throw error;
  REMOTE_RAW.genes.push(...(data||rows));
  editGenes.forEach(g=>{if(g.isNew)delete g.isNew});
}
function normalizedEditGenes(){
  const seen=new Set();
  return editGenes.map((g,i)=>({gene_id:String(g.gene_id||"").trim(),state:g.state||"visual",probability:g.probability===""||g.probability==null?1:Number(g.probability),source:String(g.source||"manual").trim()||"manual",notes:g.notes||""})).filter(g=>g.gene_id).map((g,i)=>{
    if(!REMOTE_RAW.genes.some(x=>x.id===g.gene_id))throw new Error(`第 ${i+1} 条子基因不存在于 genes 表：${g.gene_id}`);
    if(seen.has(g.gene_id))throw new Error(`子基因重复：${g.gene_id}`);
    if(!GENE_STATES.includes(g.state))throw new Error(`无效子基因状态：${g.state}`);
    if(g.probability!==null&&(!Number.isFinite(g.probability)||g.probability<0||g.probability>1))throw new Error(`子基因概率必须在 0 到 1 之间：${g.gene_id}`);
    seen.add(g.gene_id);return g;
  });
}
async function syncSnakeGenes(snakeId){
  const desired=normalizedEditGenes().map(g=>({...g,snake_id:snakeId}));
  const before=snakeGeneRows(snakeId).map(x=>x.gene_id);
  if(desired.length){const {error}=await sb.from("snake_genes").upsert(desired,{onConflict:"snake_id,gene_id"});if(error)throw error;}
  const retained=new Set(desired.map(x=>x.gene_id));
  const removed=before.filter(id=>!retained.has(id));
  if(removed.length){const {error}=await sb.from("snake_genes").delete().eq("snake_id",snakeId).in("gene_id",removed);if(error)throw error;}
}
$("#editForm").onsubmit=async e=>{
  e.preventDefault();$("#editMessage").textContent="正在保存…";
  try{await saveEdit();closeModal("editModal");toast("保存成功");await refreshRemote(false)}
  catch(err){$("#editMessage").textContent=err.message||String(err)}
};
async function deleteRecord(table,id,label){
  if(!canWrite())return toast("当前账号没有写权限",true);
  if(!confirm(`确定删除 ${label||id}？这个操作会受数据库外键约束。`))return;
  const {error}=await sb.from(table).delete().eq("id",id);
  if(error)return toast(error.message,true);
  $("#drawer").classList.remove("open");toast("已删除");await refreshRemote(false);
}
async function markRecordCompleted(table,id,label){if(!canWrite())return toast("当前账号没有写权限",true);try{const {error}=await sb.from(table).update({status:"completed"}).eq("id",id);if(error)throw error;await refreshRemote(false);toast(`${label}已设为完成`)}catch(err){toast(err.message||String(err),true)}}
async function deleteSnake(id){
  return retireSnake(id);
}
async function retireSnake(id){
  if(!canWrite())return toast("当前账号没有写权限",true);
  if(!confirm(`确定将 ${id} 标记为 retired？这会保留其路线、计划、血缘和子基因记录。`))return;
  const {error}=await sb.from("snakes").update({status:"retired"}).eq("id",id);
  if(error)return toast(error.message,true);
  $("#drawer").classList.remove("open");toast("已标记为 retired");await refreshRemote(false);
}

function reviewStatusLabel(row){return row.review_status==="pending"?"待审核":row.review_status==="returned"?"已退回":"已通过"}
async function approveInvestmentReview(id){if(!canWrite())return;const row=REMOTE_RAW.investments.find(r=>String(r.id)===String(id));if(!row)return toast("找不到投资记录",true);try{const {error}=await sb.from("investments").update({review_status:"approved",reviewed_at:nowIso()}).eq("id",id);if(error)throw error;if(row.ai_recommendation_id){const {error:recError}=await sb.from("ai_recommendations").update({status:"applied",reviewed_at:nowIso(),applied_at:nowIso()}).eq("id",row.ai_recommendation_id);if(recError)throw recError}await refreshRemote(false);toast("投资审核已通过，已显示在投资计划页面。") }catch(err){toast(err.message||String(err),true)}}
async function approveAnnualReview(id){if(!canWrite())return;const row=REMOTE_RAW.plans.find(r=>Number(r.id)===Number(id));if(!row)return toast("找不到年度计划",true);try{const {error}=await sb.from("annual_breeding_plans").update({review_status:"approved",reviewed_at:nowIso()}).eq("id",id);if(error)throw error;if(row.ai_recommendation_id){const {error:recError}=await sb.from("ai_recommendations").update({status:"applied",reviewed_at:nowIso(),applied_at:nowIso()}).eq("id",row.ai_recommendation_id);if(recError)throw recError}const related=REMOTE_RAW.plans.filter(p=>Number(p.scenario_id)===Number(row.scenario_id)&&Number(p.id)!==Number(id));if(row.scenario_id&&related.every(p=>p.review_status==="approved")){const {error:scenarioError}=await sb.from("planning_scenarios").update({status:"accepted"}).eq("id",row.scenario_id);if(scenarioError)throw scenarioError}await refreshRemote(false);toast("年度计划审核已通过，已显示在年度产出页面。") }catch(err){toast(err.message||String(err),true)}}
function renderAdmin(){
  if(!$("#adminTable"))return;
  updateAuthUI();
  $$(".adminTab").forEach(x=>x.classList.toggle("active",x.dataset.adminTab===adminTab));
  if(!sb){$("#adminTable").innerHTML='<div class="configWarning">Supabase 尚未配置，无法读取业务数据。</div>';return}
  if(!canWrite()){$("#adminTable").innerHTML='<div class="configWarning">当前账号没有 editor/admin 权限。请在 public.profiles 中为该用户分配角色。</div>';return}
  let html="";
  if(adminTab==="snakes"){
    html=`<div class="tableWrap"><table class="dataTable"><thead><tr><th>ID</th><th>系列</th><th>基因</th><th>性别</th><th>状态</th><th>战略分</th><th>操作</th></tr></thead><tbody>${REMOTE_RAW.snakes.map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(r.series)}</td><td>${esc(r.gene_text)}</td><td>${esc(r.sex)}</td><td>${esc(r.status)}</td><td>${r.strategic_score??""}</td><td><div class="rowActions"><button class="iconBtn" data-admin-edit-snake="${esc(r.id)}">编辑</button><button class="iconBtn danger" data-admin-retire-snake="${esc(r.id)}">停用</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }else if(adminTab==="plans"){
    html=`<div class="tableWrap"><table class="dataTable"><thead><tr><th>Year</th><th>Priority</th><th>Project</th><th>Female</th><th>Male</th><th>Status</th><th>操作</th></tr></thead><tbody>${REMOTE_RAW.plans.map(r=>`<tr><td>${r.plan_year}</td><td>${r.priority}</td><td>${esc(r.project_name)}</td><td>${r.female_snake_id||"—"}</td><td>${r.male_snake_id||"—"}</td><td>${r.status}</td><td><div class="rowActions"><button class="iconBtn" data-admin-edit-plan="${r.id}">编辑</button><button class="iconBtn danger" data-admin-del-plan="${r.id}">删除</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }else if(adminTab==="investments"){
    html=`<div class="tableWrap"><table class="dataTable"><thead><tr><th>ID</th><th>Name</th><th>Category</th><th>Year</th><th>Score</th><th>Status</th><th>操作</th></tr></thead><tbody>${REMOTE_RAW.investments.map(r=>`<tr><td>${r.id}</td><td>${esc(r.name)}</td><td>${r.category}</td><td>${r.planned_year||"—"}</td><td>${r.strategic_score??""}</td><td>${r.status}</td><td><div class="rowActions"><button class="iconBtn" data-admin-edit-invest="${r.id}">编辑</button><button class="iconBtn danger" data-admin-del-invest="${r.id}">删除</button></div></td></tr>`).join("")}</tbody></table></div>`;
  }else if(adminTab==="annual-review"){
    const rows=REMOTE_RAW.plans.filter(r=>r.source_type==="ai");
    html=`<div class="factPanel"><b>年度计划审核</b><br>通过后保留在本表并灰显，同时自动出现在年度产出页面。</div><div class="tableWrap"><table class="dataTable"><thead><tr><th>Year</th><th>项目</th><th>父本 × 母本</th><th>目标</th><th>来源</th><th>操作</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr class="${r.review_status==="approved"?"reviewedRow":""}"><td>${r.plan_year}</td><td>${esc(r.project_name)}</td><td>${esc(r.female_snake_id||"—")} × ${esc(r.male_snake_id||"—")}</td><td>${esc(r.goal||"—")}</td><td>AI · ${reviewStatusLabel(r)}</td><td><div class="rowActions">${r.review_status==="pending"?`<button class="iconBtn" data-approve-annual="${r.id}">审核通过</button>`:`<span class="reviewedBadge">审核已通过</span>`}<button class="iconBtn" data-admin-edit-plan="${r.id}">编辑</button></div></td></tr>`).join(""):`<tr><td colspan="6">当前没有 AI 年度计划记录。</td></tr>`}</tbody></table></div>`;
  }else{
    const rows=REMOTE_RAW.investments.filter(r=>r.source_type==="ai");
    html=`<div class="factPanel"><b>投资审核</b><br>通过后保留在本表并灰显，同时自动出现在投资计划页面。</div><div class="tableWrap"><table class="dataTable"><thead><tr><th>ID</th><th>建议</th><th>年份</th><th>战略分</th><th>依据</th><th>操作</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr class="${r.review_status==="approved"?"reviewedRow":""}"><td>${esc(r.id)}</td><td>${esc(r.name)}</td><td>${r.planned_year||"—"}</td><td>${r.strategic_score??"—"}</td><td>${esc(r.thesis||"—")}</td><td><div class="rowActions">${r.review_status==="pending"?`<button class="iconBtn" data-approve-investment="${esc(r.id)}">审核通过</button>`:`<span class="reviewedBadge">审核已通过</span>`}<button class="iconBtn" data-admin-edit-invest="${esc(r.id)}">编辑</button></div></td></tr>`).join(""):`<tr><td colspan="6">当前没有 AI 投资建议记录。</td></tr>`}</tbody></table></div>`;
  }
  $("#adminTable").innerHTML=html;
  $$("[data-admin-edit-snake]").forEach(x=>x.onclick=()=>openSnakeForm(x.dataset.adminEditSnake));
  $$("[data-admin-retire-snake]").forEach(x=>x.onclick=()=>retireSnake(x.dataset.adminRetireSnake));
  $$("[data-admin-edit-plan]").forEach(x=>x.onclick=()=>openPlanForm(x.dataset.adminEditPlan));
  $$("[data-admin-del-plan]").forEach(x=>x.onclick=()=>deleteRecord("annual_breeding_plans",x.dataset.adminDelPlan,"年度计划 #"+x.dataset.adminDelPlan));
  $$("[data-admin-edit-invest]").forEach(x=>x.onclick=()=>openInvestmentForm(x.dataset.adminEditInvest));
  $$("[data-admin-del-invest]").forEach(x=>x.onclick=()=>deleteRecord("investments",x.dataset.adminDelInvest,x.dataset.adminDelInvest));
  $$("[data-approve-annual]").forEach(x=>x.onclick=()=>submitAiCard(x,()=>approveAnnualReview(Number(x.dataset.approveAnnual)),"正在审核…"));
  $$("[data-approve-investment]").forEach(x=>x.onclick=()=>submitAiCard(x,()=>approveInvestmentReview(x.dataset.approveInvestment),"正在审核…"));
}
$$(".adminTab").forEach(x=>x.onclick=()=>{adminTab=x.dataset.adminTab;renderAdmin()});
$("#adminRefreshBtn").onclick=()=>refreshRemote();
$("#adminAddBtn").onclick=()=>adminTab==="snakes"?openSnakeForm():adminTab==="plans"?openPlanForm():adminTab==="investments"?openInvestmentForm():toast("审核队列仅接收 AI 提交的业务记录。",true);
$("#addSnakeBtn").onclick=()=>openSnakeForm();
$("#runPairingAiBtn").onclick=async()=>{try{await runAiSafely("pairing",pairingInput())}catch(err){toast(err.message||String(err),true)}};
$("#runAnnualAiBtn").onclick=async()=>{try{await runAiSafely("annual_plan",annualPlanInput())}catch(err){toast(err.message||String(err),true)}};
$("#runInvestmentAiBtn").onclick=async()=>{try{await runAiSafely("investment",investmentInput())}catch(err){toast(err.message||String(err),true)}};
$("#candidateGeneText").oninput=renderCandidateGenePreview;
$("#candidateSex").onchange=renderCandidateGenePreview;
$("#runCandidateInvestmentAiBtn").onclick=async()=>{try{await runCandidateInvestmentAi(candidateInvestmentInput())}catch(err){toast(err.message||String(err),true)}};
$("#aiChatForm").onsubmit=sendAiFollowUp;

async function initApp(){
  startIntro();
  setGate(true,"");
  updateAuthUI();

  if(!supabaseConfigured()){
    setGateConnection(false,"Supabase configuration missing");
    $("#gateMessage").textContent="Supabase URL / publishable key 未配置。";
    return;
  }

  try{
    sb=supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{
      // Explicit browser storage keeps a password login available across refreshes.
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}
    });
    setGateConnection(true,"Supabase connected");

    sb.auth.onAuthStateChange((event,session)=>{
      setTimeout(async()=>{
        // 浏览器重新聚焦时 Supabase 会静默刷新 token。它不是一次登录，不能重新打开 Gate 或重拉全量数据。
        if(event==="TOKEN_REFRESHED"||event==="USER_UPDATED"){
          currentUser=session?.user||currentUser;
          updateAuthUI();
          return;
        }
        // 初始会话只用于提示用户。页面不能因为有本地 session 自动进入工作区。
        if(event==="INITIAL_SESSION")return;
        // 登录请求由登录按钮显式调用 validateAndOpenWorkspace() 完成。
        if(event==="SIGNED_IN"&&session){
          currentUser=session.user;
          updateAuthUI();
          return;
        }
        if(event==="PASSWORD_RECOVERY"){
          setGate(false,"");
          openModal("passwordModal");
          return;
        }
        if(!session){
          DATA=EMPTY_DATA();
          ANNUAL_PLANS={};
          snakeById={};
          currentUser=null;
          currentProfile=null;
          setGate(true,"");
        }
      },0);
    });

    const {data:{session},error}=await sb.auth.getSession();
    if(error)throw error;
    if(session){
      // Supabase has already validated this browser session. Resume the workspace on refresh.
      try{await validateAndOpenWorkspace(session)}catch(err){
        setGate(true,"登录状态校验失败，请重新登录。");
      }
    }else{
      setGate(true,"");
    }
  }catch(err){
    console.error("Supabase init:",err);
    setGateConnection(false,"Supabase connection failed");
    $("#gateMessage").textContent="Supabase 初始化失败："+(err.message||err);
  }
}

function renderAll(){renderRoute();renderPopulation();renderProduction();renderInvestment();renderLab();renderAiViews()}
function drawMaturity(){const box=$("#maturityChart"),ys=planningYears(),F=ys.map(y=>DATA.snakes.filter(s=>s.sex==="F"&&mature(s)<=y).length),M=ys.map(y=>DATA.snakes.filter(s=>s.sex==="M"&&mature(s)<=y).length),w=430,h=210,p=28,max=Math.max(1,...F,...M),X=i=>ys.length>1?p+i*(w-2*p)/(ys.length-1):w/2,Y=v=>h-p-v*(h-2*p)/max,line=a=>a.map((v,i)=>(i?"L":"M")+X(i)+","+Y(v)).join(" ");box.innerHTML=ys.length?`<div class="chartLegend"><span><i class="chartSwatch female"></i>成熟母蛇</span><span><i class="chartSwatch male"></i>成熟公蛇</span></div><svg viewBox="0 0 ${w} ${h}">${[0,.25,.5,.75,1].map(i=>{const v=Math.round(max*i);return `<line x1="${p}" x2="${w-p}" y1="${Y(v)}" y2="${Y(v)}" class="gridLine"/><text x="3" y="${Y(v)+3}" class="axis">${v}</text>`}).join("")}<path d="${line(F)}" class="lineA"/><path d="${line(M)}" class="lineB"/>${ys.map((y,i)=>`<text x="${X(i)-10}" y="${h-5}" class="axis">${String(y).slice(2)}</text>`).join("")}</svg>`:'<div class="geneEditorEmpty">暂无成熟年份数据。</div>'}
function drawProd(){const ys=planningYears(),F=ys.map(y=>productionFor(y).f),C=ys.map(y=>productionFor(y).planned),w=520,h=220,p=30,max=Math.max(1,...F,...C),X=i=>ys.length>1?p+i*(w-2*p)/(ys.length-1):w/2,Y=v=>h-p-v*(h-2*p)/max,line=a=>a.map((v,i)=>(i?"L":"M")+X(i)+","+Y(v)).join(" ");$("#prodChart").innerHTML=ys.length?`<div class="chartLegend"><span><i class="chartSwatch female"></i>成熟活跃母蛇</span><span><i class="chartSwatch plan"></i>已录入计划项</span></div><svg viewBox="0 0 ${w} ${h}">${[0,.25,.5,.75,1].map(i=>{const v=Math.round(max*i);return `<line x1="${p}" x2="${w-p}" y1="${Y(v)}" y2="${Y(v)}" class="gridLine"/><text x="4" y="${Y(v)+3}" class="axis">${v}</text>`}).join("")}<path d="${line(F)}" class="lineA"/><path d="${line(C)}" class="lineB"/>${ys.map((y,i)=>`<text x="${X(i)-13}" y="${h-5}" class="axis">${y}</text><circle cx="${X(i)}" cy="${Y(F[i])}" r="3" class="pt"/>`).join("")}</svg>`:'<div class="geneEditorEmpty">暂无年度计划数据。</div>'}
const drawNodeWithColor=drawNode;
drawNode=function(g,n){drawNodeWithColor(g,n);const tone=routeTone(n);g.classList.add(`tone-${tone}`);$$("#routeEdges [data-edge]").filter(edge=>edge.dataset.edge.endsWith(`|${n.id}`)).forEach(edge=>edge.classList.add(`tone-${tone}`))};
var analysis_type=null;
const runAIAnalysisWithMotionCore=runAIAnalysisWithMotion;
runAIAnalysisWithMotion=async(analysisType,input)=>{const previous=analysis_type;analysis_type=analysisType;try{return await runAIAnalysisWithMotionCore(analysisType,input)}finally{analysis_type=previous}};
const runAIAnalysisCore=runAIAnalysis;
runAIAnalysis=async(analysisType,input)=>{const previous=analysis_type;analysis_type=analysisType;try{return await runAIAnalysisCore(analysisType,input)}finally{analysis_type=previous}};
initApp();


