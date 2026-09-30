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
