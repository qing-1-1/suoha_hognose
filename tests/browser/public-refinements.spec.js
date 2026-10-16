const {test,expect}=require('@playwright/test');
test.beforeEach(async({page})=>{
 await page.route('**/fonts.googleapis.com/**',r=>r.abort());
 await page.route('**/fonts.gstatic.com/**',r=>r.abort());
 await page.route('**/.netlify/functions/public-catalog*',r=>r.fulfill({json:{items:[],total:0,page:1,series:['测试系列'],years:[2025,2026],gene_options:[{id:'test',name:'测试基因'}]}}));
});
test('catalog filters survive refresh and chips clear dependent state and old pagination',async({page})=>{
 await page.goto('/collection');
 if(page.viewportSize().width<=700)await page.getByRole('button',{name:/筛选与排序/}).click();
 await page.getByRole('combobox',{name:'出生年份',exact:true}).selectOption('2025');
 await page.getByRole('combobox',{name:'原子基因',exact:true}).selectOption('test');
 await page.getByRole('combobox',{name:'基因状态',exact:true}).selectOption('possible_het');
 await page.getByRole('button',{name:'筛选',exact:true}).click();await expect(page).toHaveURL(/gene_state=possible_het/);
 await page.reload();await expect(page.locator('#activeCatalogFilters')).toContainText('出生：2025 年');await expect(page.locator('#activeCatalogFilters')).toContainText('可能携带');
 await page.getByRole('button',{name:'移除基因筛选',exact:true}).click();await expect(page).not.toHaveURL(/gene=/);await expect(page).not.toHaveURL(/gene_state=/);
 await page.getByRole('button',{name:'清空全部',exact:true}).click();await expect(page).toHaveURL(/\/collection$/);
 if(page.viewportSize().width<=700)await page.getByRole('button',{name:/筛选与排序/}).click();
 await expect(page.getByRole('combobox',{name:'出生年份',exact:true})).toHaveValue('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('fast catalog responses still initialize filters when the interaction script loads later',async({page})=>{
 await page.route('**/js/public-refinements.js',async route=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,350));await route.fulfill({response});});
 await page.goto('/collection?year=2025&gene=test&gene_state=possible_het');
 await expect(page.locator('#activeCatalogFilters')).toContainText('出生：2025 年');
 await expect(page.locator('#activeCatalogFilters')).toContainText('可能携带');
 await expect(page.locator('#catalogFilters [name=gene_state]')).toHaveValue('possible_het');
});

test('three permanent visitor categories filter server requests and retain the sold category on reset',async({page})=>{
 const requested=[];
 await page.route('**/.netlify/functions/public-catalog*',r=>{
   const status=new URL(r.request().url()).searchParams.get('status');requested.push(status);
   const items=status==='sold'?[{id:'sold-1',slug:'sold-1',snake_id:'PAST-01',title:'过往个体',sale_status:'sold',sex:'F',asking_price:888,currency:'CNY',photos:[],genes:[]}]:[];
   return r.fulfill({json:{items,total:items.length,page:1,series:[],years:[],gene_options:[]}});
 });
 await page.goto('/collection');
 const nav=page.getByRole('navigation',{name:'个体档案分类'});
 await expect(nav.getByRole('link')).toHaveCount(3);
 await expect(nav.locator('[data-catalog-section="display"]')).toHaveAttribute('aria-current','page');
 await nav.locator('[data-catalog-section="available"]').click();
 await expect(page.locator('#catalogTitle')).toHaveText('在售。');
 await nav.locator('[data-catalog-section="sold"]').click();
 await expect(page.locator('#catalogTitle')).toHaveText('过往已售。');
 await expect(page.locator('#catalogGrid')).toContainText('已售留档 · 不再出售');
 await expect(page.locator('#catalogGrid')).not.toContainText('888');
 if(page.viewportSize().width<=700)await page.getByRole('button',{name:/筛选与排序/}).click();
 await page.getByRole('searchbox',{name:'搜索编号或基因'}).fill('PAST');
 await page.getByRole('button',{name:'筛选',exact:true}).click();
 await page.getByRole('button',{name:'清空全部',exact:true}).click();
 await expect(page).toHaveURL(/status=sold/);
 await expect(page).not.toHaveURL(/q=/);
 await page.reload();
 await expect(nav.locator('[data-catalog-section="sold"]')).toHaveAttribute('aria-current','page');
 await page.locator('#catalogView').screenshot({path:`artifacts/catalog-sections-${test.info().project.name}.png`,animations:'disabled'});
 expect(requested).toEqual(expect.arrayContaining(['display','available','sold']));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
