// Verifies the request body shape that ai-analyze.js will send to SenseNova
// for deepseek-v4-flash (with reasoning_effort) and other models (without).

const ALLOWED_REASONING_EFFORT = new Set(["low", "medium", "high", "none"]);
function applyReasoningEffort(body, model, effort) {
  if (model === "deepseek-v4-flash" && effort != null) body.reasoning_effort = effort;
  return body;
}
function reasoningEffortFor(request) {
  const v = request.reasoning_effort;
  return v == null ? null : String(v);
}

const cases = [
  { label: "deepseek-v4-flash + toggle ON (medium)",
    request: { model: "deepseek-v4-flash", reasoning_effort: "medium" } },
  { label: "deepseek-v4-flash + toggle OFF (none)",
    request: { model: "deepseek-v4-flash", reasoning_effort: "none" } },
  { label: "deepseek-v4-flash + high (if user switches to high)",
    request: { model: "deepseek-v4-flash", reasoning_effort: "high" } },
  { label: "deepseek-v4-flash + no reasoning_effort sent (legacy client)",
    request: { model: "deepseek-v4-flash" } },
  { label: "sensenova-u1-fast + toggle ON (must NOT include reasoning_effort)",
    request: { model: "sensenova-u1-fast", reasoning_effort: "medium" } },
  { label: "glm-5.2 + toggle ON (must NOT include reasoning_effort)",
    request: { model: "glm-5.2", reasoning_effort: "medium" } }
];

for (const c of cases) {
  const model = c.request.model;
  const effort = reasoningEffortFor(c.request);
  // Validation gate (mirrors handler lines 286-289)
  if (effort != null && !ALLOWED_REASONING_EFFORT.has(effort)) {
    console.log(`\n[${c.label}] -> 400 unsupported`); continue;
  }
  // Build the same body shape the backend builds (analysis path, max_tokens 2800)
  const body = applyReasoningEffort({
    model,
    messages: [
      { role: "system", content: "..." },
      { role: "user", content: "..." }
    ],
    max_tokens: 2800,
    stream: false
  }, model, effort);
  console.log(`\n[${c.label}]`);
  console.log(JSON.stringify(body, null, 2));
}

console.log("\n--- Validation gate ---");
for (const bad of ["true", " High ", "max", undefined, 5]) {
  const v = bad == null ? null : String(bad);
  const ok = v != null && ALLOWED_REASONING_EFFORT.has(v);
  console.log(`reasoning_effort=${JSON.stringify(bad)} -> ${ok ? "accepted" : "400 rejected"}`);
}
