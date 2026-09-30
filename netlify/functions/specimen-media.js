const { config, rpc, json } = require('./lib/public-data');
exports.handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  const path = event.queryStringParameters?.path || '';
  if (!/^[a-f0-9-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(path)) return json(404, { error: 'Not found' });
  try {
    if (await rpc('is_published_specimen_media', { p_path: path }) !== true) return json(404, { error: 'Not found' });
    const { url, key: publicKey } = config();
    // Publication is checked on every request. Without a server key, the existing
    // Storage SELECT policy permits only media attached to published listings.
    // New sb_publishable keys belong in apikey, not in the JWT bearer header.
    const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = serverKey ? { apikey: serverKey, authorization: `Bearer ${serverKey}` } : { apikey: publicKey };
    // Do not base64-proxy originals: a 5 MB PNG exceeds the buffered function
    // response limit after encoding. Storage delivers the file directly instead.
    const media = await fetch(`${url}/storage/v1/object/sign/specimen-media/${path}`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: 60 }), signal: AbortSignal.timeout(15000)
    });
    if (!media.ok) return json(media.status === 404 ? 404 : 503, { error: 'Image unavailable' });
    const data = await media.json();
    const location = new URL(data.signedURL, `${url}/storage/v1/`);
    // Supabase returns /object/sign/... relative to the Storage API root.
    if (data.signedURL?.startsWith('/object/sign/')) location.pathname = '/storage/v1' + location.pathname;
    if (location.origin !== new URL(url).origin || location.pathname !== `/storage/v1/object/sign/specimen-media/${path}` || !location.searchParams.get('token')) return json(503, { error: 'Image unavailable' });
    return { statusCode: 302, headers: { location: location.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' }, body: '' };
  } catch { return json(503, { error: 'Image unavailable' }); }
};
