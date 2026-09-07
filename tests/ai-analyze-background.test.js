const test = require("node:test");
const assert = require("node:assert/strict");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function completedResponse() {
  const events = [
    { type: "response.output_text.delta", delta: "真实后台评估完成。" },
    { type: "response.completed", response: { status: "completed", model: "deepseek-v4-flash", output: [{ type: "web_search_call", status: "completed" }, { type: "message", content: [{ type: "output_text", text: "真实后台评估完成。", annotations: [] }] }] } }
  ];
  const chunks = events.map((event) => new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: { getReader: () => ({ read: async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true } }) }
  };
}

test("background candidate analysis stores the completed result in analysis_runs", async () => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-key";
  const originalFetch = global.fetch;
  let saved = null;

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes("/rest/v1/analysis_runs") && options.method === "PATCH") {
      saved = JSON.parse(options.body);
      return jsonResponse(null, 204);
    }
    if (target.endsWith("/auth/v1/user")) return jsonResponse({ id: "user-1" });
    if (target.includes("/rest/v1/profiles")) return jsonResponse([{ role: "editor" }]);
    if (target.includes("/rest/v1/ai_prompt_templates")) return jsonResponse([{ id: 6, template_key: "investment", version: 6, system_prompt: "candidate prompt", response_schema_version: "v2" }]);
    if (target === "https://api.deepseek.com/responses") return completedResponse();
    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    delete require.cache[require.resolve("../netlify/functions/ai-analyze.js")];
    delete require.cache[require.resolve("../netlify/functions/ai-analyze-background.js")];
    const { handler } = require("../netlify/functions/ai-analyze-background.js");
    await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer session-token" },
      body: JSON.stringify({ analysis_run_id: 42, analysis_type: "investment", model: "deepseek-v4-flash", input: { analysis_scope: "candidate_investment", candidate: { gene_text: "Axanthic" } } })
    });

    assert.equal(saved.status, "succeeded");
    assert.equal(saved.model_name, "deepseek-v4-flash");
    assert.equal(saved.response_payload.candidate_advice, "真实后台评估完成。");
    assert.ok(saved.completed_at);
  } finally {
    global.fetch = originalFetch;
  }
});
