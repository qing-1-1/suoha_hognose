const {test, expect} = require('@playwright/test');

test.beforeEach(async ({page}) => {
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/.netlify/functions/public-catalog*', route => route.fulfill({json:{items:[],total:0,page:1,series:[]}}));
});

test('feeding decoration loops, pauses behind dialogs and resumes when revisited',async({page})=>{
  const errors=[],requested=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requested.push(r.url()));
  await page.goto('/');
  expect(requested.some(url=>url.includes('keeper-feeding'))).toBe(false);
  const scene=page.locator('#studioScene');
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-loaded','true');
  await expect(scene).toHaveAttribute('data-playing','true');
  await page.locator('#fieldNotes [data-note="archive"]').click();
  await expect(scene).toHaveAttribute('data-playing','false');
  const frame=await scene.getAttribute('data-frame');
  await page.waitForTimeout(400);await expect(scene).toHaveAttribute('data-frame',frame);
  await page.keyboard.press('Escape');
  await scene.scrollIntoViewIfNeeded();
  await expect.poll(()=>scene.getAttribute('data-frame'),{timeout:6500,intervals:[50]}).toBe('11');
  await expect.poll(()=>scene.getAttribute('data-frame'),{timeout:2000,intervals:[50]}).toBe('0');
  await expect(scene).toHaveAttribute('data-playing','true');
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
  await expect(scene).toHaveAttribute('data-playing','false');
  const paused=await scene.getAttribute('data-frame');
  await page.waitForTimeout(400);await expect(scene).toHaveAttribute('data-frame',paused);
  await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-playing','true');
  await expect(scene).not.toHaveAttribute('data-frame',paused);
  expect(requested.some(url=>url.endsWith('/keeper-feeding-v2.webp'))).toBe(true);
  expect(errors).toEqual([]);
});

test('unavailable decoration falls back quietly while reading and navigation still work',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/keeper-feeding-v2.webp',r=>r.abort());
  await page.goto('/');
  const scene=page.locator('#studioScene');await scene.scrollIntoViewIfNeeded();
  await expect(scene).toHaveAttribute('data-loaded','error');
  await expect(scene).toHaveAttribute('data-playing','false');
  await expect.poll(()=>scene.locator('img').evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
  await expect(scene.locator('.studio-film')).toBeHidden();
  await page.locator('#fieldNotes [data-note="growth"]').click();
  await expect(page.locator('#fieldNoteDialog')).toBeVisible();
  await page.getByRole('link',{name:'前往真实个体档案'}).click();
  await expect(page).toHaveURL(/collection$/);
  await expect(page.locator('#homeView')).toBeHidden();
  expect(errors).toEqual([]);
});
