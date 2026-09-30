const PUBLIC_KEYS = ['id','slug','snake_id','title','description','series','sex','birth','gene_text','sale_status','asking_price','currency','featured','husbandry_summary','pedigree_summary'];
function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw Object.assign(new Error('Catalog is not configured'), { status: 503 });
  return { url: url.replace(/\/$/, ''), key };
}
async function rpc(name, body, secret) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: secret || key, ...(secret ? { authorization: `Bearer ${secret}` } : {}), 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(result?.message || 'Catalog unavailable'), { status: response.status >= 500 ? 503 : 400 });
  return result;
}
function projectItem(row) {
  const safe = Object.fromEntries(PUBLIC_KEYS.map(key => [key, row[key] ?? null]));
  safe.genes = (row.genes || []).map(g => ({ id: g.id, name: g.name, state: g.state, probability: g.probability }));
  safe.photos = (row.photos || []).map(p => ({ url: mediaUrl(p.path), fallback_url: mediaUrl(p.path), ...(p.thumbnail_path ? {thumbnail_url: mediaUrl(p.thumbnail_path)} : {}), caption: p.caption || '', date: p.date || null }));
  return safe;
}
const mediaUrl = path => `/.netlify/functions/specimen-media?path=${encodeURIComponent(path)}`;
async function signPhotos(rows, items, detail) {
  // Only sign paths from the public RPC. Never accept paths supplied by a visitor.
  const selected = rows.flatMap((row,i) => (row.photos || []).slice(0, detail ? undefined : 1).map((photo,j) => ({photo,target:items[i].photos[j]})));
  const paths = [...new Set(selected.flatMap(({photo}) => [photo.path,photo.thumbnail_path]).filter(path => /^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path || '')))];
  if (!paths.length) return;
  const {url,key} = config();
  // The publishable key also enforces Storage RLS; no service-role bypass here.
  const signed = new Map();
  try {
    for (let start=0;start<paths.length;start+=100) {
      const batch=paths.slice(start,start+100);
      const response=await fetch(`${url}/storage/v1/object/sign/specimen-media`, {
        method:'POST',headers:{apikey:key,'content-type':'application/json'},
        body:JSON.stringify({paths:batch,expiresIn:60}),signal:AbortSignal.timeout(3000)
      });
      if (!response.ok) continue;
      const data=await response.json();
      if (!Array.isArray(data)) continue;
      for (const entry of data) {
        if (entry.error || !entry.signedURL || !batch.includes(entry.path)) continue;
        const location=new URL(entry.signedURL, `${url}/storage/v1/`);
        if (entry.signedURL.startsWith('/object/sign/')) location.pathname='/storage/v1'+location.pathname;
        if (location.origin===new URL(url).origin && location.pathname===`/storage/v1/object/sign/specimen-media/${entry.path}` && location.searchParams.get('token')) signed.set(entry.path,location.href);
      }
    }
  } catch { /* The checked image endpoint remains available if batch signing fails. */ }
  for (const {photo,target} of selected) {
    if (signed.has(photo.path)) target.url=signed.get(photo.path);
    if (signed.has(photo.thumbnail_path)) target.thumbnail_url=signed.get(photo.thumbnail_path);
  }
}
async function catalog(query = {}) {
  const advanced = Boolean(query.year || query.gene);
  const params = {
    p_slug: query.slug || null, p_page: Math.max(1, Math.min(10000, Number.parseInt(query.page, 10) || 1)),
    p_search: String(query.q || '').slice(0,100), p_series: String(query.series || '').slice(0,100),
    p_sex: ['F','M','U'].includes(query.sex) ? query.sex : '',
    p_status: ['available','reserved','sold','display'].includes(query.status) ? query.status : '',
    p_sort: ['price_asc','price_desc'].includes(query.sort) ? query.sort : 'newest'
  };
  let data;
  try {
    data = await rpc('public_catalog_v2', {...params,
      p_year: /^\d{4}$/.test(String(query.year || '')) ? Number(query.year) : null,
      p_gene: String(query.gene || '').slice(0,100),
      p_gene_state: ['visual','het','possible_het','super','line_trait','unknown'].includes(query.gene_state) ? query.gene_state : ''
    });
  } catch (error) {
    // Only an absent v2 RPC may use the old contract; never silently drop a requested filter.
    if (advanced || !/public_catalog_v2|PGRST202/.test(error.message)) throw error;
    data = await rpc('public_catalog', params);
  }
  const items=(data.items || []).map(projectItem);
  await signPhotos(data.items || [],items,Boolean(params.p_slug));
  return { items, total: data.total || 0, page: data.page || 1, series: data.series || [], years: data.years || [], gene_options: data.gene_options || [] };
}
function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, body: JSON.stringify(body) };
}
module.exports = { config, rpc, catalog, json, projectItem };
