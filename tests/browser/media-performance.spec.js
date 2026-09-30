const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"><rect width="640" height="320" fill="tan"/></svg>';
const photo={url:'/assets/test-original.webp',thumbnail_url:'/assets/test-thumbnail.webp',fallback_url:'/.netlify/functions/specimen-media?path=aaaa/bbbb.webp'};
const item={id:'a',slug:'media-test',snake_id:'TEST',title:'测试个体',sale_status:'display',photos:[photo],genes:[]};
const catalog={items:[item],total:1,page:1,series:[],years:[],gene_options:[]};
test.beforeEach(async({page})=>{
  await page.route('**/fonts.googleapis.com/**',r=>r.abort());
  await page.route('**/fonts.gstatic.com/**',r=>r.abort());
  await page.route('**/.netlify/functions/public-catalog*',r=>r.fulfill({json:catalog}));
});
test('catalog downloads a thumbnail; detail and lightbox use the full photo',async({page})=>{
  const images=[];
  await page.route('**/assets/test-*.webp',r=>{images.push(r.request().url());return r.fulfill({contentType:'image/svg+xml',body:svg});});
  await page.goto('/collection');
  const card=page.locator('.specimen-card');
  await expect.poll(()=>card.locator('img').evaluate(img=>img.naturalWidth)).toBe(640);
  expect(images.some(url=>url.endsWith('test-thumbnail.webp'))).toBe(true);
  expect(images.some(url=>url.endsWith('test-original.webp'))).toBe(false);
  await card.click();
  await expect(page.locator('#detailPhoto img')).toHaveAttribute('src',photo.url);
  await expect(page.locator('#detailPhoto img')).toHaveAttribute('loading','eager');
  await expect(page.locator('.detail-thumbnails img')).toHaveAttribute('src',photo.thumbnail_url);
  await page.locator('#detailPhoto').click();
  await expect(page.locator('#lightbox img')).toHaveAttribute('src',/test-original.webp$/);
});
test('broken thumbnail and expired signature fall back once to a fresh checked image',async({page})=>{
  const calls=[];
  await page.route('**/assets/test-*.webp',r=>{calls.push(r.request().url());return r.fulfill({status:403,body:'expired'});});
  await page.route('**/.netlify/functions/specimen-media**',r=>{calls.push(r.request().url());return r.fulfill({contentType:'image/svg+xml',body:svg});});
  await page.goto('/collection');
  const img=page.locator('.specimen-card img');
  await expect(img).toHaveAttribute('src',photo.fallback_url);
  await expect.poll(()=>img.evaluate(el=>el.naturalWidth)).toBe(640);
  expect(calls.length).toBe(3);
});
test('direct detail reuses server data without a duplicate catalog request',async({page})=>{
  let requests=0;
  await page.route('**/.netlify/functions/public-catalog*',r=>{requests++;return r.fulfill({json:catalog});});
  await page.route('**/assets/test-*.webp',r=>r.fulfill({contentType:'image/svg+xml',body:svg}));
  const template=fs.readFileSync('index.html','utf8');
  await page.route('**/specimens/media-test',r=>r.fulfill({contentType:'text/html',body:template.replace('</head>',`<script id="specimenInitialData" type="application/json">${JSON.stringify({slug:item.slug,createdAt:Date.now(),catalog})}</script></head>`)}));
  await page.goto('/specimens/media-test');
  await expect(page.locator('#detailView h1')).toHaveText(item.title);
  expect(requests).toBe(0);
  await expect(page.locator('#specimenInitialData')).toHaveCount(0);
});
