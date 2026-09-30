const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
  await page.route('**/fonts.googleapis.com/**',r=>r.abort());
  await page.route('**/fonts.gstatic.com/**',r=>r.abort());
  await page.route('**/.netlify/functions/public-catalog*',r=>r.fulfill({json:{items:[],total:0,page:1,series:[]}}));
});
test('home stays compact, keeps the main actions clear and presents real photos at every breakpoint',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page.locator('.hero button')).toHaveCount(0);
  await expect(page.locator('.pixel-corner button')).toHaveCount(0);
  await expect(page.getByRole('button',{name:/播放|暂停|重播/})).toHaveCount(0);
  await expect(page.locator('.story-values, .journal-intro')).toHaveCount(0);
  await expect(page.getByText('从好奇，到相识。',{exact:true})).toHaveCount(0);
  await expect(page.getByText('01 / ABOUT SUOHA',{exact:true})).toHaveCount(0);
  for(const width of [320,390,768,1000,1440]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBeLessThan(3600);
    const overlap=await page.evaluate(()=>{
      const b=document.querySelector('.hero-art').getBoundingClientRect();
      const a=document.querySelector('.hero-actions').getBoundingClientRect();
      return Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
    });
    if(width<=700)expect(overlap).toBe(0);
    const [left,hatch,right]=await Promise.all([
      page.locator('#discoveryDoors a').first().boundingBox(),
      page.locator('#hatchScene').boundingBox(),
      page.locator('#discoveryDoors a').last().boundingBox()
    ]);
    const intro=await page.locator('#philosophy').boundingBox();
    expect(hatch.y).toBeGreaterThanOrEqual(intro.y+intro.height);
    expect(hatch.y+hatch.height).toBeLessThanOrEqual(Math.min(left.y,right.y));
    expect(hatch.x+hatch.width/2).toBeCloseTo(width/2,0);
  }
  for(const img of await page.locator('.story-backdrop img, #discoveryDoors img, .founders-signature img').all()){
    await img.scrollIntoViewIfNeeded();
    await expect.poll(()=>img.evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  }
  expect(await page.locator('.founders-signature').evaluate(el=>el.getBoundingClientRect().width)).toBeLessThan(160);
  await page.getByRole('link',{name:'进入商店'}).click();
  await expect(page).toHaveURL(/collection$/);
});

test('hatching decoration finishes once and stays quiet when revisited',async({page})=>{
  await page.goto('/');
  const scene=page.locator('#hatchScene');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-loaded','true');
  await expect(scene).toHaveAttribute('data-frame','3',{timeout:5000});
  await expect(scene).toHaveAttribute('data-playing','false');
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-playing','false');
  await expect(scene).toHaveAttribute('data-frame','3');
});

test('paper story overlaps the real room photo and scrolls over it without a second introduction block',async({page})=>{
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/');
  const section=page.locator('.studio-story'), card=page.locator('.room-story-card');
  await expect(card.locator('.founders-signature img')).toHaveCount(1);
  const top=await section.evaluate(el=>el.getBoundingClientRect().top+scrollY);
  await page.evaluate(y=>scrollTo({top:y+20,behavior:'instant'}),top);
  await expect.poll(()=>page.locator('.story-backdrop').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBe(0);
  const first=await card.boundingBox();
  await page.evaluate(y=>scrollTo({top:y+90,behavior:'instant'}),top);
  await expect.poll(()=>page.locator('.story-backdrop').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBe(0);
  const second=await card.boundingBox();
  expect(first.y-second.y).toBeCloseTo(70,0);
  const backdrop=await page.locator('.story-backdrop').boundingBox();
  expect(second.y).toBeLessThan(backdrop.y+backdrop.height);
  await expect(page.locator('.studio-story button')).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(page.locator('.story-backdrop')).toHaveCSS('position','relative');
});

test('reduced motion uses still artwork without fetching the feeding sprite',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const requested=[];page.on('request',r=>requested.push(r.url()));
  await page.goto('/');
  await page.locator('#studioScene').scrollIntoViewIfNeeded();
  for(const id of ['studioScene','hatchScene']){
    await expect(page.locator('#'+id)).toHaveAttribute('data-playing','false');
    await expect.poll(()=>page.locator('#'+id+' img').evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  }
  await expect(page.locator('#hatchScene')).toHaveAttribute('data-frame','3');
  expect(requested.some(url=>/keeper-feeding-(mini|v2)/.test(url))).toBe(false);
});

test('brand home does not fetch inventory, shop doors select the right catalog, and avatar pixels are transparent',async({page})=>{
  const requests=[];page.on('request',r=>{if(r.url().includes('/public-catalog'))requests.push(r.url());});
  await page.goto('/');
  await expect(page.locator('#homeView .specimen-card')).toHaveCount(0);
  await expect(page.locator('#homeView #guide')).toHaveCount(0);
  expect(requests).toEqual([]);
  const avatar=page.locator('.founders-signature img');await avatar.scrollIntoViewIfNeeded();
  await expect.poll(()=>avatar.evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
  const alpha=await avatar.evaluate(img=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return [ctx.getImageData(0,0,1,1).data[3],ctx.getImageData(Math.floor(c.width*.31),Math.floor(c.height*.6),1,1).data[3]];});
  expect(alpha).toEqual([0,0]);
  await expect(page.locator('.founders-signature')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  for(const status of ['available','display']){
    await page.locator(`#discoveryDoors a[href$="${status}"]`).click();
    await expect(page).toHaveURL(new RegExp('collection\\?status='+status+'$'));
    await expect(page.locator('#catalogFilters [name=status]')).toHaveValue(status);
    await expect(page.locator('#catalogView')).toBeVisible();
    await page.getByRole('link',{name:'Suoha 首页',exact:true}).click();
  }
  const count=requests.length;await expect(page.locator('#homeView')).toBeVisible();expect(requests.length).toBe(count);
  await page.locator('.site-footer').getByRole('link',{name:'购买指南'}).click();
  await expect(page).toHaveURL(/collection#guide$/);
  await expect(page.locator('#catalogView #guide')).toBeVisible();
  await page.locator('#guide summary').first().click();
  await expect(page.locator('#guide details').first()).toHaveAttribute('open','');
});
