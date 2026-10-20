const {test,expect}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');

async function scene(page){
  await page.setContent('<meta name="viewport" content="width=device-width, initial-scale=1"><div id="workspaceRoom"><div id="scene" style="width:100%;height:600px"></div></div>');
  for(const file of ['assets/room-workspace.css','assets/room-controls.css'])await page.addStyleTag({path:path.join(root,file)});
  await page.addScriptTag({path:path.join(root,'js/room-model.js')});
  if(process.env.SCENE_BASELINE)await page.addScriptTag({content:execFileSync('git',['show',`${process.env.SCENE_BASELINE}:js/room-scene.js`],{cwd:root,encoding:'utf8'})});
  else await page.addScriptTag({path:path.join(root,'js/room-scene.js')});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>{
    const M=SuohaRoomModel,config=M.defaultConfig();
    const c=M.createCabinet({id:'rack',width:1200,height:1900,levels:Array.from({length:11},()=>({height:143,count:6,boxWidth:180,boxDepth:500,boxHeight:140}))});config.cabinets=[c];
    window.opened=[];window.scene=new SuohaRoomScene(document.querySelector('#scene'),{onSlot:id=>opened.push(id)});
    scene.update({config,view:'cabinet',cabinetId:'rack'});
    window.centerSlot=()=>{
      const slot=scene.world.querySelectorAll('[data-slot]')[1],rect=slot.getBoundingClientRect(),host=scene.svg.getBoundingClientRect();
      scene.camera.x+=(rect.x+rect.width/2-host.x-host.width/2)*scene.fitted[2]/scene.camera.zoom/host.width;
      scene.camera.y+=(rect.y+rect.height/2-host.y-host.height/2)*scene.fitted[3]/scene.camera.zoom/host.height;
      scene.applyCamera();
    };centerSlot();
  });
  return page.locator('.rw-scene-world [data-slot]').nth(1);
}

async function touch(page,slot,{dx=0,cancel=false}={}){
  const box=await slot.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  expect(await slot.evaluate((el,{x,y})=>document.elementFromPoint(x,y)===el,{x,y})).toBe(true);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  if(dx)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
  await cdp.detach();
}

test('finger jitter still opens a box on the first short tap',async({page},info)=>{
  test.skip(info.project.name!=='mobile');
  const slot=await scene(page);
  await touch(page,slot,{dx:6});
  await expect.poll(()=>page.evaluate(()=>opened.length),{timeout:1500}).toBe(1);
});

test('quick taps work once each; drag, cancel and pinch never activate a box',async({page},info)=>{
  test.skip(info.project.name!=='mobile');
  const slot=await scene(page);
  for(let i=0;i<4;i++){await slot.tap();await expect.poll(()=>page.evaluate(()=>opened.length)).toBe(i+1);}
  await touch(page,slot,{cancel:true});await touch(page,slot,{dx:35});
  expect(await page.evaluate(()=>opened.length)).toBe(4);
  await page.evaluate(()=>centerSlot());
  await slot.tap();await expect.poll(()=>page.evaluate(()=>opened.length)).toBe(5);
  const box=await slot.boundingBox(),p={x:box.x+box.width/2,y:box.y+box.height/2},cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1},{x:p.x+25,y:p.y,id:2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  expect(await page.evaluate(()=>opened.length)).toBe(5);
});
