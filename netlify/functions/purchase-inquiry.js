const { createHmac } = require('node:crypto');
const { rpc, json } = require('./lib/public-data');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if ((event.body || '').length > 12000) return json(413, { error: '提交内容过长。' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: '提交格式无效。' }); }
  const name = String(body.name || '').trim(), contact = String(body.contact || '').trim(), message = String(body.message || '').trim();
  if (body.website) return json(400, { error: '无法提交，请重试。' });
  if (!UUID.test(body.request_id || '') || !UUID.test(body.listing_id || '') || !name || name.length > 80 || contact.length < 3 || contact.length > 200 || message.length > 1500 || body.consent !== true) return json(400, { error: '请填写有效称呼、联系方式，并确认联系方式的使用范围。' });
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY, hashKey = process.env.INQUIRY_HASH_SECRET;
  if (!secret || !hashKey) return json(503, { error: '购买意向服务尚未启用，请稍后再试。' });
  // Netlify supplies this header. Do not trust arbitrary x-forwarded-for values.
  const ip = event.headers?.['x-nf-client-connection-ip'];
  if (!ip) return json(503, { error: '无法验证请求来源，请稍后再试。' });
  const fingerprint = createHmac('sha256', hashKey).update(ip).digest('hex');
  try {
    return json(201, await rpc('submit_purchase_inquiry', { p_request_id: body.request_id, p_listing_id: body.listing_id, p_name: name, p_contact: contact, p_message: message, p_fingerprint: fingerprint }, secret));
  } catch (error) {
    if (/Rate limit/.test(error.message)) return json(429, { error: '提交较频繁，请一小时后重试。' });
    if (/not accepting/.test(error.message)) return json(409, { error: '该个体的销售状态已变化，请刷新详情。' });
    if (/conflict|duplicate/i.test(error.message)) return json(409, { error: '请求已变化，请刷新详情后重新提交。' });
    return json(503, { error: '暂未能确认提交结果，请使用原表单重试，不会重复创建意向。' });
  }
};
