const ALLOWED_TYPES = new Set(["pairing", "annual_plan", "investment", "strategy_score"]);
const MAX_INPUT_BYTES = 180000;

function response(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    body: JSON.stringify(body)
  };
}

function configured(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

async function supabaseJson(path, accessToken) {
  const url = configured("SUPABASE_URL");
  const key = configured("SUPABASE_PUBLISHABLE_KEY");
  const result = await fetch(`${url}${path}`, {
    headers: { apikey: key, authorization: `Bearer ${accessToken}` }
  });
  const data = await result.json().catch(() => null);
  return { ok: result.ok, status: result.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return response(405, { error: "Method not allowed" });

  const apiKey = configured("DEEPSEEK_API_KEY");
  const supabaseUrl = configured("SUPABASE_URL");
  const publishableKey = configured("SUPABASE_PUBLISHABLE_KEY");
  if (!apiKey || !supabaseUrl || !publishableKey) {
    return response(503, { error: "AI service is not configured on the server." });
  }

  const authorization = event.headers.authorization || event.headers.Authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return response(401, { error: "Authentication is required." });
  const accessToken = match[1];

  const userCheck = await supabaseJson("/auth/v1/user", accessToken);
  if (!userCheck.ok) return response(401, { error: "Invalid or expired Supabase session." });
  const profileResult = await supabaseJson(`/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(userCheck.data.id)}&limit=1`, accessToken);
  const role = Array.isArray(profileResult.data) ? profileResult.data[0]?.role : null;
  if (!profileResult.ok || !["editor", "admin"].includes(role)) {
    return response(403, { error: "Only editor or admin roles may generate AI analyses." });
  }

  if (Buffer.byteLength(event.body || "", "utf8") > MAX_INPUT_BYTES) {
    return response(413, { error: "Analysis input is too large." });
  }

  let request;
  try { request = JSON.parse(event.body || "{}"); }
  catch { return response(400, { error: "Request body must be JSON." }); }

  const analysisType = request.analysis_type;
  const input = request.input;
  if (!ALLOWED_TYPES.has(analysisType) || !input || typeof input !== "object" || Array.isArray(input)) {
    return response(400, { error: "analysis_type and a structured input object are required." });
  }

  const templateKey = {
    pairing: "pairing_lab",
    annual_plan: "annual_plan",
    investment: "investment",
    strategy_score: "strategy_score"
  }[analysisType];
  const query = `/rest/v1/ai_prompt_templates?select=id,template_key,version,system_prompt,response_schema_version&template_key=eq.${encodeURIComponent(templateKey)}&is_active=eq.true&order=version.desc&limit=1`;
  const templateResult = await supabaseJson(query, accessToken);
  if (!templateResult.ok || !Array.isArray(templateResult.data) || !templateResult.data[0]) {
    return response(503, { error: "AI prompt template is unavailable. Run the Supabase AI decision-layer migration first." });
  }
  const template = templateResult.data[0];

  const deepSeekResult = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: configured("DEEPSEEK_MODEL") || "deepseek-v4-flash",
      messages: [
        { role: "system", content: template.system_prompt },
        { role: "user", content: `以下是本次分析的结构化事实输入。请按系统要求仅输出 JSON。\n${JSON.stringify(input)}` }
      ],
      response_format: { type: "json_object" },
      max_tokens: 2200,
      stream: false
    })
  });
  const deepSeekPayload = await deepSeekResult.json().catch(() => null);
  if (!deepSeekResult.ok) {
    return response(502, { error: "DeepSeek request failed.", detail: deepSeekPayload?.error?.message || "Unknown provider error." });
  }

  const content = deepSeekPayload?.choices?.[0]?.message?.content;
  let result;
  try { result = JSON.parse(content); }
  catch { return response(502, { error: "DeepSeek returned invalid JSON." }); }
  if (!Array.isArray(result.recommendations)) {
    return response(502, { error: "DeepSeek response does not include a recommendations array." });
  }
  result.recommendations = result.recommendations.slice(0, 20);

  return response(200, {
    analysis_type: analysisType,
    as_of_at: input.as_of_at || new Date().toISOString(),
    template: { id: template.id, key: template.template_key, version: template.version, response_schema_version: template.response_schema_version },
    model: deepSeekPayload.model || configured("DEEPSEEK_MODEL") || "deepseek-v4-flash",
    usage: deepSeekPayload.usage || null,
    result
  });
};
