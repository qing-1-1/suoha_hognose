const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
  await page.route('**/fonts.googleapis.com/**',r=>r.abort());
  await page.route('**/fonts.gstatic.com/**',r=>r.abort());
  await page.route('**/.netlify/functions/public-catalog*',r=>r.fulfill({json:{items:[],total:0,page:1,series:[]}}));
});
test('hero shows a lightweight player, pause persists and its link reaches the full scene',async({page})=>{
  const errors=[],requested=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>requested.push(r.url()));
  await page.goto('/');
  const mini=page.locator('#heroStudio'),full=page.locator('#studioScene');
  await expect(mini).toBeInViewport();
  await expect(mini).toHaveAttribute('data-playing','true');
  expect(requested.some(url=>url.endsWith('/keeper-feeding-v2.webp'))).toBe(false);
  await page.getByRole('button',{name:'暂停首屏爬房动画'}).click();
  const frame=await mini.getAttribute('data-frame');
  await page.waitForTimeout(1200);
  await expect(mini).toHaveAttribute('data-frame',frame);
  await mini.getByRole('link').click();
  await expect(page).toHaveURL(/#journal$/);
  await expect(full).toHaveAttribute('data-playing','true');
  await expect(mini).toHaveAttribute('data-playing','false');
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await expect(mini).toBeInViewport();
  await expect(mini).toHaveAttribute('data-playing','false');
  expect(errors).toEqual([]);
});
test('inline snake hatches once, greets on click, and does not restart when revisited',async({page})=>{
  await page.goto('/');
  const teaser=page.locator('.pixel-invitation');
  await teaser.scrollIntoViewIfNeeded();
  await expect(teaser).toHaveAttribute('data-hatch-playing','true');
  await expect(teaser).toHaveAttribute('data-hatch-frame','3',{timeout:5000});
  await expect(teaser).toHaveAttribute('data-hatch-playing','false');
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await teaser.scrollIntoViewIfNeeded();
  await expect(teaser).toHaveAttribute('data-hatch-playing','false');
  await teaser.getByRole('button',{name:'让小蛇吐信打招呼'}).click();
  await expect(teaser).toHaveAttribute('data-hatch-playing','true');
  await expect(teaser).toHaveAttribute('data-hatch-playing','false',{timeout:3000});
  await expect(teaser).toHaveAttribute('data-hatch-frame','3');
  await teaser.getByRole('button',{name:'重播破壳预告'}).click();
  await teaser.getByRole('button',{name:'暂停破壳预告'}).click();
  const frame=await teaser.getAttribute('data-hatch-frame');
  await page.waitForTimeout(1100);
  await expect(teaser).toHaveAttribute('data-hatch-frame',frame);
});
test('reduced motion keeps both previews still and explicit replay works without layout overflow',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page.locator('#heroStudio')).toHaveAttribute('data-playing','false');
  await page.getByRole('button',{name:'播放首屏爬房动画'}).click();
  await expect(page.locator('#heroStudio')).toHaveAttribute('data-playing','true');
  const teaser=page.locator('.pixel-invitation');
  await teaser.scrollIntoViewIfNeeded();
  await expect(teaser).toHaveAttribute('data-hatch-playing','false');
  await expect(teaser).toHaveAttribute('data-hatch-frame','3');
  await page.getByRole('button',{name:'重播破壳预告'}).click();
  await expect(teaser).toHaveAttribute('data-hatch-playing','true');
  await page.getByRole('button',{name:'观看像素动画'}).click();
  await expect(teaser).toHaveAttribute('data-hatch-playing','false');
  await page.keyboard.press('Escape');
  for(const width of [320,390,768,1000,1440]){
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const overlap=await page.evaluate(()=>{
      const b=document.querySelector('#heroStudio').getBoundingClientRect();
      return [...document.querySelectorAll('.hero-actions a')].reduce((area,link)=>{
        const a=link.getBoundingClientRect();
        return area+Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));
      },0);
    });
    expect(overlap).toBe(0);
  }
});
