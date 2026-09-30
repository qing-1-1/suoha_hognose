const { config, rpc, json } = require('./lib/public-data');
exports.handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const path = event.queryStringParameters?.path || '';
  if (!/^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path)) return json(404, { error: 'Not found' });
  try {
    if (!await rpc('is_published_specimen_media', { p_path: path })) return json(404, { error: 'Not found' });
    const { url } = config();
    // The bucket stays private. Check publication before reading with server credentials.
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return json(503, { error: 'Image service is not configured' });
    const media = await fetch(`${url}/storage/v1/object/authenticated/specimen-media/${path}`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    if (!media.ok) return json(media.status === 404 ? 404 : 503, { error: 'Image unavailable' });
    return { statusCode: 200, isBase64Encoded: true, headers: { 'content-type': media.headers.get('content-type') || 'image/jpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, body: Buffer.from(await media.arrayBuffer()).toString('base64') };
  } catch { return json(503, { error: 'Image unavailable' }); }
};
