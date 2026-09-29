const { catalog, json } = require('./lib/public-data');
exports.handler = async event => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try { return json(200, await catalog(event.queryStringParameters || {})); }
  catch { return json(503, { error: '公开目录暂时无法连接，请稍后重试。' }); }
};
