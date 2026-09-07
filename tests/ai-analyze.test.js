const test = require("node:test");
const assert = require("node:assert/strict");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

function sseResponse(events) {
  const chunks = events.map((event) => new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: chunks[index++] };
          }
        };
      }
    }
  };
}

test("candidate investment uses DeepSeek Responses API web search and preserves citations", async () => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/v1/user")) return jsonResponse({ id: "user-1" });
    if (String(url).includes("/rest/v1/profiles")) return jsonResponse([{ role: "editor" }]);
    if (String(url).includes("/rest/v1/ai_prompt_templates")) {
      return jsonResponse([{ id: 6, template_key: "investment", version: 6, system_prompt: "candidate prompt", response_schema_version: "v2" }]);
    }
    if (String(url) === "https://api.deepseek.com/responses") {
      const response = {
        model: "deepseek-v4-flash",
        output: [{ type: "message", content: [{ type: "output_text", text: "有条件适合采购。", annotations: [{ type: "url_citation", title: "Market listing", url: "https://example.com/listing" }] }] }],
        usage: { total_tokens: 42 }
      };
      return sseResponse([
        { type: "response.output_text.delta", delta: "有条件适合" },
        { type: "response.output_text.delta", delta: "采购。" },
        { type: "response.completed", response }
      ]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    delete require.cache[require.resolve("../netlify/functions/ai-analyze.js")];
    const { handler } = require("../netlify/functions/ai-analyze.js");
    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer session-token" },
      body: JSON.stringify({
        analysis_type: "investment",
        model: "deepseek-v4-flash",
        input: { analysis_scope: "candidate_investment", candidate: { candidate_ref: "candidate", atomic_genes: [] } }
      })
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.result.candidate_advice, "有条件适合采购。");
    assert.deepEqual(body.result.web_sources, [{ title: "Market listing", url: "https://example.com/listing" }]);

    const providerCall = calls.find((call) => call.url === "https://api.deepseek.com/responses");
    assert.ok(providerCall);
    const providerBody = JSON.parse(providerCall.options.body);
    assert.deepEqual(providerBody.tools, [{ type: "web_search" }]);
    assert.equal(providerBody.tool_choice, "required");
    assert.equal(providerBody.stream, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("candidate follow-up keeps its snapshot and performs another web search", async () => {
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/auth/v1/user")) return jsonResponse({ id: "user-1" });
    if (String(url).includes("/rest/v1/profiles")) return jsonResponse([{ role: "editor" }]);
    if (String(url).includes("/rest/v1/ai_conversations")) {
      return jsonResponse([{
        id: 9,
        analysis_run_id: 7,
        analysis_type: "investment",
        model_name: "deepseek-v4-flash",
        prompt_template_id: 6,
        prompt_version: 6,
        source_snapshot: { analysis_scope: "candidate_investment", candidate: { candidate_ref: "candidate" } }
      }]);
    }
    if (String(url).includes("/rest/v1/ai_prompt_templates")) {
      return jsonResponse([{ id: 6, template_key: "investment", version: 6, system_prompt: "candidate prompt", response_schema_version: "v2" }]);
    }
    if (String(url).includes("/rest/v1/ai_conversation_messages")) {
      return jsonResponse([{ role: "assistant", content: "首次评估", structured_payload: null }]);
    }
    if (String(url) === "https://api.deepseek.com/responses") {
      return jsonResponse({
        model: "deepseek-v4-flash",
        output_text: "最新报价仍需议价。",
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: "最新报价仍需议价。",
            annotations: [{ type: "url_citation", title: "Updated listing", url: "https://example.com/updated" }]
          }]
        }]
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    delete require.cache[require.resolve("../netlify/functions/ai-analyze.js")];
    const { handler } = require("../netlify/functions/ai-analyze.js");
    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer session-token" },
      body: JSON.stringify({ mode: "follow_up", conversation_id: 9, message: "现在市场价如何？", model: "deepseek-v4-flash" })
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.answer, "最新报价仍需议价。");
    assert.deepEqual(body.web_sources, [{ title: "Updated listing", url: "https://example.com/updated" }]);

    const providerCall = calls.find((call) => call.url === "https://api.deepseek.com/responses");
    const providerBody = JSON.parse(providerCall.options.body);
    assert.equal(providerBody.tool_choice, "required");
    assert.equal(providerBody.input.at(-1).content, "现在市场价如何？");
    assert.match(providerBody.instructions, /candidate_investment/);
  } finally {
    global.fetch = originalFetch;
  }
});
