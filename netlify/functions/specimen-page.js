const { catalog } = require('./lib/public-data');
const fs = require('node:fs');
const path = require('node:path');
const escape = s => String(s || '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
exports.handler = async event => {
  // Netlify rewrites can preserve the original path without forwarding :splat.
  let slug = event.queryStringParameters?.slug;
  if (slug == null) {
    const rawPath = (() => { try { return new URL(event.rawUrl).pathname; } catch { return ''; } })();
    slug = [event.path, rawPath].map(pathname => /^\/specimens\/([a-z0-9][a-z0-9-]{0,79})\/?$/.exec(pathname || '')?.[1]).find(Boolean) || '';
  }
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return {statusCode:404,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'},body:'档案不存在'};
  let template;
  try { template = fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8'); }
  catch { template = fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8'); }
  try {
    const data = await catalog({slug});const item=data.items[0];
    if(!item)return {statusCode:404,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'},body:template};
    const title=escape(`${item.title} · ${item.snake_id} · SUOHA`), description=escape((item.description || '').slice(0,180)||`${item.snake_id} 的公开个体档案`);
    template=template.replace(/<title>.*?<\/title>/,()=>`<title>${title}</title>`).replace(/(<meta name="description" content=")[^"]*(">)/,(_,a,b)=>a+description+b).replace(/(<meta property="og:title" content=")[^"]*(">)/,(_,a,b)=>a+title+b).replace(/(<meta property="og:description" content=")[^"]*(">)/,(_,a,b)=>a+description+b);
    const url=process.env.URL;
    if(url&&item.photos[0])template=template.replace('</head>',`<meta property="og:image" content="${escape(new URL(item.photos[0].fallback_url || item.photos[0].url,url).href)}"></head>`);
    const initial=JSON.stringify({slug,createdAt:Date.now(),catalog:data}).replace(/</g,'\\u003c');
    template=template.replace('</head>',()=>`<script id="specimenInitialData" type="application/json">${initial}</script></head>`);
    template=template.replace('<main id="main">',`<main id="main"><noscript><article><h1>${title}</h1><p>${description}</p><p>编号：${escape(item.snake_id)} · 基因：${escape(item.gene_text)}</p><a href="/collection">查看目录（需要 JavaScript）</a></article></noscript>`);
    return {statusCode:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'},body:template};
  } catch { return {statusCode:503,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'},body:template}; }
};
