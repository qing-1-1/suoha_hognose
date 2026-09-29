const { config, rpc, json } = require('./lib/public-data');
exports.handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const path = event.queryStringParameters?.path || '';
  if (!/^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path)) return json(404, { error: 'Not found' });
  try {
    if (!await rpc('is_published_specimen_media', { p_path: path })) return json(404, { error: 'Not found' });
    const { url, key } = config();
    const media = await fetch(`${url}/storage/v1/object/authenticated/specimen-media/${path}`, { headers: { apikey: key }, signal: AbortSignal.timeout(15000) });
    if (!media.ok) return json(404, { error: 'Not found' });
    return { statusCode: 200, isBase64Encoded: true, headers: { 'content-type': media.headers.get('content-type') || 'image/jpeg', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }, body: Buffer.from(await media.arrayBuffer()).toString('base64') };
  } catch { return json(503, { error: 'Image unavailable' }); }
};
