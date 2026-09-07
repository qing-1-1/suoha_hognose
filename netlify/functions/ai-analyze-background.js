const { handler: analyze } = require("./ai-analyze");

function configured(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

async function updateRun(runId, accessToken, values) {
  const url = configured("SUPABASE_URL");
  const key = configured("SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Supabase background result storage is not configured.");
  const result = await fetch(`${url}/rest/v1/analysis_runs?id=eq.${encodeURIComponent(runId)}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      prefer: "return=minimal"
    },
    body: JSON.stringify(values)
  });
  if (!result.ok) {
    const detail = await result.text().catch(() => "");
    throw new Error(`Unable to store background analysis result (${result.status}): ${detail.slice(0, 400)}`);
  }
}

exports.handler = async (event) => {
  let request;
  try { request = JSON.parse(event.body || "{}"); }
  catch { return; }

  const runId = Number(request.analysis_run_id);
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!Number.isInteger(runId) || runId < 1 || !match) return;
  const accessToken = match[1];

  try {
    const analysisResponse = await analyze({ ...event, body: JSON.stringify(request) });
    const payload = JSON.parse(analysisResponse.body || "{}");
    if (analysisResponse.statusCode !== 200) {
      await updateRun(runId, accessToken, {
        status: "failed",
        error_message: String(payload.detail || payload.error || "Background AI analysis failed.").slice(0, 2000),
        completed_at: new Date().toISOString()
      });
      return;
    }
    await updateRun(runId, accessToken, {
      status: "succeeded",
      as_of_at: payload.as_of_at,
      model_name: payload.model,
      prompt_template_id: payload.template?.id || null,
      prompt_version: payload.template?.version || null,
      response_schema_version: payload.template?.response_schema_version || "v2",
      response_payload: payload.result,
      error_message: null,
      completed_at: new Date().toISOString()
    });
  } catch (error) {
    console.error("Background candidate analysis failed", { runId, message: error?.message || String(error) });
    try {
      await updateRun(runId, accessToken, {
        status: "failed",
        error_message: String(error?.message || error || "Background AI analysis failed.").slice(0, 2000),
        completed_at: new Date().toISOString()
      });
    } catch (storageError) {
      console.error("Unable to persist background candidate failure", { runId, message: storageError?.message || String(storageError) });
    }
  }
};
