/* Standalone renderer acceptance: node tests/scene/room-incubator.check.cjs.
 * Uses setContent; does not launch the app, a port, or production services. */
'use strict';
const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
(async()=>{
  const browser=await chromium.launch({channel:process.env.ROOM_BROWSER_CHANNEL||'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<style>body{margin:0;background:#f4f6ef}#scene{height:720px}</style><div id="scene"></div>');
    await page.addStyleTag({content:fs.readFileSync(path.join(root,'assets/room-workspace.css'),'utf8')});
    for(const file of ['room-model.js','room-labels.js','room-scene.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,'js',file),'utf8')});
    await page.evaluate(()=>{
      const M=SuohaRoomModel,config=M.defaultConfig();config.width=5000;config.depth=4000;
      const egg=M.createIncubator({name:'孵化箱 · 示例',purpose:'eggs',levels:[{count:3},{count:1},{count:3}],x:800,z:400});
      const winter=M.createIncubator({name:'冬化箱 · 示例',purpose:'brumation',levels:[{count:2},{count:2}],x:2600,z:400});
      const rack=M.createCabinet({name:'银架对照',x:3900,z:700});config.cabinets=[egg,winter,rack];
      window.fixture={config,egg,winter,rack};window.clickCount=0;
      const first=egg.levels[0].slots[0].id,winterSlot=winter.levels[0].slots[0].id;
      window.scene=new SuohaRoomScene(document.querySelector('#scene'),{onSlot:()=>clickCount++,onViewChange:value=>scene.update(value)});
      scene.update({config,snakes:[{id:'F-01',sex:'F',gene_text:'Albino'},{id:'M-01',sex:'M'},{id:'WINTER',sex:'F',gene_text:'Conda'},{id:'INVALID-EGG-SNAKE'}],assignments:[{slot_id:winterSlot,snake_id:'WINTER'},{slot_id:first,snake_id:'INVALID-EGG-SNAKE'}],measurements:[{id:'m',snake_id:'WINTER',weight_g:120,measured_at:'2026-10-12'}],incubations:[{slot_id:first,clutch_id:'clutch-1',clutch_code:'CL-026',plan_id:'P-001',egg_count:7,female_snake_id:'F-01',male_snake_id:'M-01',status:'incubating',expected_on:'2026-11-10',notes:'<img src=x onerror=alert(1)>'}],tasks:[{slotId:first,date:'2026-10-13',time:'18:00',mouseMin:3,mouseMax:4,status:'pending'}]});
    });
    assert.equal(await page.evaluate(()=>scene.state.view),'perspective');
    assert.equal(await page.locator('.rw-incubator-model').count(),2);
    await page.screenshot({path:path.join(root,'artifacts/room-incubator-scene-perspective.png')});
    await page.evaluate(()=>scene.setView('cabinet',fixture.egg.id));await page.waitForTimeout(700);
    assert.equal(await page.locator('.rw-slot-hit').count(),7);
    assert.equal(await page.locator('.rw-rack-shelf').count(),0);
    assert.equal(await page.locator('.rw-incubator-back[fill-opacity="1"]').count(),1);
    const first=page.locator('.rw-slot-hit').first(),aria=await first.getAttribute('aria-label');
    for(const value of ['CL-026','7 枚','母 F-01 × 父 M-01','P-001','2026-11-10'])assert(aria.includes(value),value);
    assert(!aria.includes('INVALID-EGG-SNAKE'));assert(!aria.includes('3–4g'));
    assert.equal(await page.locator('#scene img').count(),0);
    assert.equal(await page.locator('.rw-box-days').count(),0);
    const geometry=await page.evaluate(()=>{const c=fixture.egg,s=c.levels[2].slots[1];const button=[...scene.world.querySelectorAll('[data-slot]')].find(e=>e.dataset.slot===s.id);return Number(button.closest('.rw-model-slot').dataset.stackY);});
    assert.equal(geometry,240,'column absent in logical middle row must stack at 240mm, without floating');
    await first.focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>clickCount),1);
    await page.screenshot({path:path.join(root,'artifacts/room-incubator-scene-eggs.png')});
    await page.evaluate(()=>scene.highlightSlot(fixture.winter.levels[0].slots[0].id));
    assert.equal(await page.evaluate(()=>scene.state.cabinetId),await page.evaluate(()=>fixture.winter.id));
    assert.equal(await page.locator('[data-located="true"]').count(),1);
    assert.equal(await page.locator('[data-located="true"].rw-day-pulse').count(),1);
    assert((await page.locator('.rw-slot-hit').first().getAttribute('aria-label')).includes('WINTER'));
    assert((await page.locator('.rw-slot-hit').first().getAttribute('aria-label')).includes('冬化暂停喂食'));
    await page.waitForTimeout(1050);
    assert.equal(await page.locator('[data-located="true"]').evaluate(el=>getComputedStyle(el).opacity),'1');
    await page.screenshot({path:path.join(root,'artifacts/room-incubator-scene-brumation.png')});
    await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>scene.highlightSlot(fixture.egg.levels[2].slots[2].id));
    assert.equal(await page.locator('[data-located="true"].rw-day-pulse').count(),0);
    const visible=await page.evaluate(()=>{const el=document.activeElement,b=el.getBoundingClientRect(),s=scene.svg.getBoundingClientRect();return b.top>=s.top-1&&b.bottom<=s.bottom+1;});assert(visible);
    const minFont=await page.locator('.rw-model-slot .rw-label-line').evaluateAll(nodes=>Math.min(...nodes.map(e=>Number(e.getAttribute('font-size'))*Math.abs(e.getScreenCTM().a))));assert(minFont>=9.99);
    assert.equal(await page.locator('.rw-room-minimap:not([hidden])').count(),1);
    await page.screenshot({path:path.join(root,'artifacts/room-incubator-scene-mobile.png')});
    await page.evaluate(()=>scene.setView('cabinet',fixture.rack.id));assert.equal(await page.locator('.rw-rack-shelf').count(),5);
    // Saving or relocating while the camera entrance is still animating must not
    // push a short bottom-up stack out of the viewport on subsequent repaints.
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
      await page.evaluate(()=>{
        const c=SuohaRoomModel.createIncubator({name:'Two-level transfer',purpose:'eggs',height:1800,levels:[{count:3},{count:3}],x:800,z:400});
        fixture.short=c;scene.update({config:{...fixture.config,cabinets:[c]},view:'perspective',focusSlotId:null});
        scene.setView('cabinet',c.id);
        const source=c.levels[0].slots[0].id,target=c.levels[0].slots[1].id;
        scene.highlightSlot(source);
        for(let i=0;i<8;i++)scene.update({incubations:[{slot_id:i<4?source:target,clutch_code:'TRANSFER-5',egg_count:5,status:'incubating'}],focusSlotId:source});
      });
      await page.waitForTimeout(700);
      const result=await page.evaluate(()=>{
        const viewport=scene.svg.getBoundingClientRect(),button=scene.world.querySelector('[data-slot]'),rect=button.getBoundingClientRect();
        return {visible:rect.left>=viewport.left-1&&rect.right<=viewport.right+1&&rect.top>=viewport.top-1&&rect.bottom<=viewport.bottom+1,camera:scene.camera,faces:scene.world.querySelectorAll('.rw-box-face').length};
      });
      assert(result.visible,`source box remains visible after entrance/save/transfer at ${width}px: ${JSON.stringify(result)}`);assert.equal(result.faces,6);
    }
    assert.deepEqual(errors,[]);console.log('PASS incubator shells, bottom-up sparse stacking, no internal shelves, egg/animal isolation, native interactions, locate pulse and reduced motion, 10px mobile labels, minimap, rack regression and animated save/transfer camera stability');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
