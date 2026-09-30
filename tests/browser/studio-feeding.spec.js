const {test, expect} = require('@playwright/test');

test.beforeEach(async ({page}) => {
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/.netlify/functions/public-catalog*', route => route.fulfill({json:{items:[],total:0,page:1,series:[]}}));
});

test('feeding scene animates real poses and pauses on request, offscreen and behind dialogs', async ({page}) => {
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const scene=page.locator('#studioScene');
  await expect(scene).toHaveAttribute('data-playing','false');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-loaded','true');
  await expect(scene).toHaveAttribute('data-playing','true');
  await expect.poll(() => scene.getAttribute('data-frame')).not.toBe('0');
  await page.getByRole('button',{name:'暂停喂食动画',exact:true}).click();
  const stopped=await scene.getAttribute('data-frame');
  await page.waitForTimeout(1700);
  await expect(scene).toHaveAttribute('data-frame',stopped);
  await page.getByRole('button',{name:'喂食动画第 5 帧',exact:true}).click();
  await expect(scene.locator('.studio-film')).toHaveAttribute('aria-label',/用小镊子/);
  await expect(scene.locator('.studio-film')).toHaveCSS('background-position','0% 50%');
  await scene.getByRole('button',{name:'重播',exact:true}).click();
  await expect(scene).toHaveAttribute('data-playing','true');
  await page.getByRole('tab',{name:'02记录'}).click();
  await page.getByRole('button',{name:'看看怎样读成长记录'}).click();
  await expect(scene).toHaveAttribute('data-playing','false');
  await page.keyboard.press('Escape');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-playing','true');
  await page.evaluate(() => scrollTo({top:0,behavior:'instant'}));
  await expect(scene).toHaveAttribute('data-playing','false');
  expect(errors).toEqual([]);
});

test('reduced motion is static, loading failure retries, and narrow screens fit', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  let reject=true;
  await page.route('**/keeper-feeding-v2.webp', route => reject ? route.abort() : route.continue());
  await page.goto('/');
  const scene=page.locator('#studioScene');
  await scene.scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'播放喂食动画',exact:true}).click();
  await expect(scene).toHaveAttribute('data-loaded','error');
  await expect(scene.locator('img')).toBeVisible();
  await expect(scene).toHaveAttribute('data-playing','false');
  reject=false;
  await page.getByRole('button',{name:'喂食动画第 10 帧',exact:true}).click();
  await expect(scene).toHaveAttribute('data-loaded','true');
  await expect(scene).toHaveAttribute('data-playing','false');
  await expect(scene.locator('.studio-film')).toHaveAttribute('aria-label',/轮到你/);
  await page.getByRole('button',{name:'播放喂食动画',exact:true}).click();
  await expect(scene).toHaveAttribute('data-playing','true');
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
