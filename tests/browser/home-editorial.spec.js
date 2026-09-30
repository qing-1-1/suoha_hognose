const {test, expect} = require('@playwright/test');

test.beforeEach(async ({page}) => {
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  await page.route('**/fonts.gstatic.com/**', route => route.abort());
  await page.route('**/.netlify/functions/public-catalog*', route => route.fulfill({json:{items:[],total:0,page:1,series:[]}}));
});

test('home scenes, reading dialogs and category links form a working browsing flow', async ({page}) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const scene = page.locator('#studioScene');
  await scene.scrollIntoViewIfNeeded();
  await expect.poll(() => scene.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  const observe = page.getByRole('tab', {name:'01观察'});
  const record = page.getByRole('tab', {name:'02记录'});
  await observe.focus();
  await page.keyboard.press('ArrowRight');
  await expect(record).toBeFocused();
  await expect(record).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel')).toContainText('今天的日常');
  const trigger = page.getByRole('button', {name:'看看怎样读成长记录'});
  await trigger.click();
  const dialog = page.getByRole('dialog', {name:'把一次观察，放回成长的时间里。'});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('区分计划日期与实际日期');
  await expect(page.getByRole('button', {name:'关闭手记'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.locator('html')).not.toHaveClass(/note-reading/);
  for (const note of ['archive','growth','connect']) {
    await page.locator(`#fieldNotes [data-note="${note}"]`).click();
    await expect(page.locator('#fieldNoteDialog')).toBeVisible();
    await page.getByRole('button', {name:'关闭手记'}).click();
    await expect(page.locator(`#fieldNotes [data-note="${note}"]`)).toBeFocused();
  }
  await page.locator('#discoveryDoors a[href*="available"]').click();
  await expect(page).toHaveURL(/collection\?status=available$/);
  await expect(page.getByRole('combobox', {name:'状态',exact:true,includeHidden:true})).toHaveValue('available');
  await page.goBack();
  await expect(page.locator('#homeView')).toBeVisible();
  await page.locator('#discoveryDoors a[href*="display"]').click();
  await expect(page.getByRole('combobox', {name:'状态',exact:true,includeHidden:true})).toHaveValue('display');
  await page.goto('/#journal');
  await page.locator('#fieldNotes [data-note="connect"]').click();
  await page.getByRole('link', {name:'前往真实个体档案'}).click();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.locator('#fieldNoteDialog')).toBeHidden();
  await expect(page.locator('html')).not.toHaveClass(/note-reading/);
  await page.getByRole('link', {name:'Suoha 首页',exact:true}).click();
  await page.locator('#fieldNotes [data-note="archive"]').click();
  await page.goBack();
  await expect(page).toHaveURL(/\/collection$/);
  await expect(page.locator('#fieldNoteDialog')).toBeHidden();
  await expect(page.locator('html')).not.toHaveClass(/note-reading/);
  expect(errors).toEqual([]);
});

test('small-screen navigation, image loading and reduced motion remain usable', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:320,height:650});
  await page.goto('/');
  const menu = page.locator('#mobileMenu');
  await menu.locator('summary').click();
  await menu.getByRole('link', {name:'繁育手记'}).click();
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(page).toHaveURL(/#journal$/);
  await page.locator('#studioScene').scrollIntoViewIfNeeded();
  await expect(page.locator('#studioScene')).toHaveAttribute('data-motion', 'paused');
  expect(await page.locator('.studio-glow').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
  await page.getByRole('tab', {name:'03繁育'}).click();
  await expect(page.getByRole('tabpanel')).toContainText('为下一段故事');
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const selector of ['#discoveryDoors img','#studioScene img']) {
    for (const img of await page.locator(selector).all()) {
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
    }
  }
});
