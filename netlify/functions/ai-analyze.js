const ALLOWED_TYPES = new Set(["pairing", "annual_plan", "investment", "strategy_score"]);
const MAX_INPUT_BYTES = 180000;
const MAX_RECOMMENDATIONS = 12;
const MAX_ARRAY_ITEMS = 12;
const ALLOWED_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);
const RECOMMENDATION_KEYS = new Set([
  "title", "summary", "confidence", "priority_score", "target_refs", "evidence_refs",
  "assumptions", "risk_flags", "missing_inputs", "proposal_payload"
]);

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

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireOnlyKeys(value, allowed, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} contains unsupported fields: ${unknown.join(", ")}.`);
}

function requiredText(value, label, maxLength) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new Error(`${label} must be a non-empty string up to ${maxLength} characters.`);
  }
  return value.trim();
}

function stringArray(value, label) {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS || value.some((item) => typeof item !== "string" || !item.trim() || item.length > 240)) {
    throw new Error(`${label} must be an array of at most ${MAX_ARRAY_ITEMS} short strings.`);
  }
  return value.map((item) => item.trim());
}

function optionalStringArray(value, label) {
  return value == null ? [] : stringArray(value, label);
}

function parseModelJson(content) {
  if (typeof content !== "string" || !content.trim()) throw new Error("DeepSeek response content is empty.");
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(trimmed); }
  catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error("DeepSeek response does not contain a JSON object.");
  }
}

function optionalText(value, label, maxLength) {
  if (value == null) return null;
  return requiredText(value, label, maxLength);
}

function validateProposal(value, analysisType, index) {
  const label = `recommendations[${index}].proposal_payload`;
  if (value == null) return { action: "none" };
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const action = value.action == null ? "none" : requiredText(value.action, `${label}.action`, 32);
  if (!["none", "create_annual_plan"].includes(action)) throw new Error(`${label}.action is invalid.`);
  if (["investment", "strategy_score"].includes(analysisType) && action !== "none") {
    throw new Error(`${label}.action must be none for ${analysisType}.`);
  }

  const allowed = action === "create_annual_plan"
    ? new Set(["action", "plan_year", "female_snake_id", "male_snake_id", "route_id", "priority", "project_name", "goal", "mode", "planned_clutches"])
    : new Set(["action", "target_sex", "target_gene_ids", "review_after"]);
  requireOnlyKeys(value, allowed, label);

  if (action === "none") {
    const payload = { action };
    if (value.target_sex != null) {
      if (!["F", "M", "any"].includes(value.target_sex)) throw new Error(`${label}.target_sex is invalid.`);
      payload.target_sex = value.target_sex;
    }
    if (value.target_gene_ids != null) payload.target_gene_ids = stringArray(value.target_gene_ids, `${label}.target_gene_ids`);
    if (value.review_after != null) payload.review_after = optionalText(value.review_after, `${label}.review_after`, 80);
    return payload;
  }

  if (!["pairing", "annual_plan"].includes(analysisType)) throw new Error(`${label}.action is not allowed here.`);
  if (!Number.isInteger(value.plan_year) || value.plan_year < 2000 || value.plan_year > 2200) throw new Error(`${label}.plan_year is invalid.`);
  if (!["A", "B", "R", "C", "G"].includes(value.priority)) throw new Error(`${label}.priority is invalid.`);
  if (!Number.isInteger(value.planned_clutches) || value.planned_clutches < 0 || value.planned_clutches > 20) throw new Error(`${label}.planned_clutches is invalid.`);
  return {
    action,
    plan_year: value.plan_year,
    female_snake_id: requiredText(value.female_snake_id, `${label}.female_snake_id`, 80),
    male_snake_id: requiredText(value.male_snake_id, `${label}.male_snake_id`, 80),
    route_id: optionalText(value.route_id, `${label}.route_id`, 120),
    priority: value.priority,
    project_name: requiredText(value.project_name, `${label}.project_name`, 160),
    goal: requiredText(value.goal, `${label}.goal`, 600),
    mode: requiredText(value.mode, `${label}.mode`, 80),
    planned_clutches: value.planned_clutches
  };
}

function validateResult(result, analysisType) {
  requireOnlyKeys(result, new Set(["recommendations"]), "response");
  if (!Array.isArray(result.recommendations) || result.recommendations.length > MAX_RECOMMENDATIONS) {
    throw new Error(`response.recommendations must contain at most ${MAX_RECOMMENDATIONS} items.`);
  }
  const recommendations = result.recommendations.map((item, index) => {
    const label = `recommendations[${index}]`;
    requireOnlyKeys(item, RECOMMENDATION_KEYS, label);
    if (typeof item.confidence !== "number" || item.confidence < 0 || item.confidence > 1) throw new Error(`${label}.confidence must be 0–1.`);
    if (!Number.isInteger(item.priority_score) || item.priority_score < 0 || item.priority_score > 100) throw new Error(`${label}.priority_score must be an integer 0–100.`);
    return {
      title: requiredText(item.title, `${label}.title`, 80),
      summary: requiredText(item.summary, `${label}.summary`, 500),
      confidence: item.confidence,
      priority_score: item.priority_score,
      target_refs: optionalStringArray(item.target_refs, `${label}.target_refs`),
      evidence_refs: optionalStringArray(item.evidence_refs, `${label}.evidence_refs`),
      assumptions: optionalStringArray(item.assumptions, `${label}.assumptions`),
      risk_flags: optionalStringArray(item.risk_flags, `${label}.risk_flags`),
      missing_inputs: optionalStringArray(item.missing_inputs, `${label}.missing_inputs`),
      proposal_payload: validateProposal(item.proposal_payload, analysisType, index)
    };
  });
  return { recommendations };
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
  const selectedModel = request.model || configured("DEEPSEEK_MODEL") || "deepseek-v4-flash";
  if (!ALLOWED_TYPES.has(analysisType) || !input || typeof input !== "object" || Array.isArray(input)) {
    return response(400, { error: "analysis_type and a structured input object are required." });
  }
  if (!ALLOWED_MODELS.has(selectedModel)) return response(400, { error: "Unsupported DeepSeek model." });

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
      model: selectedModel,
      messages: [
        { role: "system", content: template.system_prompt },
        { role: "user", content: `以下是本次分析的结构化事实输入。请按系统要求仅输出 JSON。\n${JSON.stringify(input)}` }
      ],
      thinking: { type: "enabled" },
      reasoning_effort: selectedModel === "deepseek-v4-pro" ? "high" : "medium",
      max_tokens: 2200,
      stream: false
    })
  });
  const deepSeekPayload = await deepSeekResult.json().catch(() => null);
  if (!deepSeekResult.ok) {
    console.error("DeepSeek provider error", { status: deepSeekResult.status, type: analysisType, model: selectedModel, message: deepSeekPayload?.error?.message || "Unknown provider error." });
    return response(502, { error: "DeepSeek request failed.", detail: deepSeekPayload?.error?.message || "Unknown provider error." });
  }

  const content = deepSeekPayload?.choices?.[0]?.message?.content;
  let result;
  try { result = parseModelJson(content); }
  catch (error) { return response(502, { error: "DeepSeek returned invalid JSON.", detail: error.message }); }
  try { result = validateResult(result, analysisType); }
  catch (error) { return response(502, { error: "DeepSeek response does not match the required schema.", detail: error.message }); }

  return response(200, {
    analysis_type: analysisType,
    as_of_at: input.as_of_at || new Date().toISOString(),
    template: { id: template.id, key: template.template_key, version: template.version, response_schema_version: template.response_schema_version },
    model: deepSeekPayload.model || selectedModel,
    usage: deepSeekPayload.usage || null,
    result
  });
};
