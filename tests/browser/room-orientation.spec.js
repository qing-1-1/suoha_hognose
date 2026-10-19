const {test,expect}=require('@playwright/test');
const path=require('node:path');

test('plan and perspective share physical front and rear on all four walls and camera angles',async({page})=>{
  await page.setContent('<div id="scene" style="height:700px"></div>');
  for(const file of ['room-model.js','room-scene.js'])await page.addScriptTag({path:path.resolve('js',file)});
  const failures=await page.evaluate(()=>{
    const scene=new SuohaRoomScene(document.querySelector('#scene')),M=SuohaRoomModel,config=M.defaultConfig(),failures=[];
    scene.update({config});
    // +Z faces inward for the north wall; 90/180/270 face inward on east/south/west.
    for(const type of ['rack','incubator'])for(const rotation of [0,90,180,270]){
      const a=rotation*Math.PI/180,w=1000,d=600,h=1400;
      const [x,z]=rotation===0?[2500,300]:rotation===90?[4700,2000]:rotation===180?[2500,3700]:[300,2000];
      const c={...(type==='rack'?M.createCabinet({}):M.createIncubator({})),width:w,depth:d,height:h,x,z,rotation};
      const world=(u,v,y=0)=>[x+u*Math.cos(a)-v*Math.sin(a),z+u*Math.sin(a)+v*Math.cos(a),y];
      const parse=html=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.innerHTML=html;return svg;};
      if(type==='rack'){
        const plan=parse(scene.roomCabinet(c,(x,z)=>[x,z],false)),marker=plan.querySelector('.rw-cabinet-front-marker'),front=world(-w/2+20,d/2-3);
        if(Math.abs(Number(marker.getAttribute('x1'))-front[0])>.01||Math.abs(Number(marker.getAttribute('y1'))-front[1])>.01)failures.push(`plan ${rotation}`);
      }
      for(const yaw of [.3,1.9,3.5,5.1]){
        scene.orbit.yaw=yaw;
        const project=(x,z,y=0)=>[x*Math.cos(yaw)-z*Math.sin(yaw),(x*Math.sin(yaw)+z*Math.cos(yaw))*.5-y];
        const svg=parse(scene.roomCabinet(c,project,true)),back=svg.querySelector(type==='rack'?'.rw-cabinet-back':'.rw-incubator-back'),grid=svg.querySelector(type==='rack'?'.rw-cabinet-grid':'.rw-incubator-stack');
        const actual=[...back.points].map(p=>[p.x,p.y]),expected=[[-w/2,-d/2,0],[w/2,-d/2,0],[w/2,-d/2,h],[-w/2,-d/2,h]].map(p=>project(...world(...p)));
        if(actual.some((p,i)=>p.some((v,j)=>Math.abs(v-expected[i][j])>.02)))failures.push(`rear moved: ${type} ${rotation} ${yaw}`);
        const behind=Math.cos(yaw+a)<0;
        if((grid.getAttribute('visibility')==='hidden')!==behind)failures.push(`visibility ${type} ${rotation} ${yaw}`);
        if(behind&&!(back.compareDocumentPosition(grid)&Node.DOCUMENT_POSITION_PRECEDING))failures.push(`occlusion ${type} ${rotation} ${yaw}`);
      }
    }
    scene.destroy();return failures;
  });
  expect(failures).toEqual([]);
});
