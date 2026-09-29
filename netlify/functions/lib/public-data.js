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
  safe.photos = (row.photos || []).map(p => ({ url: `/.netlify/functions/specimen-media?path=${encodeURIComponent(p.path)}`, caption: p.caption || '', date: p.date || null }));
  return safe;
}
async function catalog(query = {}) {
  const data = await rpc('public_catalog', {
    p_slug: query.slug || null, p_page: Math.max(1, Math.min(10000, Number.parseInt(query.page, 10) || 1)),
    p_search: String(query.q || '').slice(0,100), p_series: String(query.series || '').slice(0,100),
    p_sex: ['F','M','U'].includes(query.sex) ? query.sex : '',
    p_status: ['available','reserved','sold','display'].includes(query.status) ? query.status : '',
    p_sort: ['price_asc','price_desc'].includes(query.sort) ? query.sort : 'newest'
  });
  return { items: (data.items || []).map(projectItem), total: data.total || 0, page: data.page || 1, series: data.series || [] };
}
function json(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, body: JSON.stringify(body) };
}
module.exports = { config, rpc, catalog, json, projectItem };
