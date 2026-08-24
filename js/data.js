/*
 * Supabase data boundary.
 * This file intentionally contains no DOM work: it only describes how the
 * static application reads its authenticated workspace snapshot.
 */
(function attachSuohaData(global) {
  const config = Object.freeze({
    url: "https://rseztlkuuxhtuttykabx.supabase.co",
    publishableKey: "sb_publishable_8GRqMVLCc6TTZMgC636PXg_9vUMWGj-"
  });

  function throwFirstError(results) {
    const failed = results.find((result) => result.error);
    if (failed) throw failed.error;
    return results;
  }

  async function fetchBusinessTables(client) {
    const results = throwFirstError(await Promise.all([
      client.from("snakes").select("*").order("id"),
      client.from("breeding_routes").select("*").order("priority", { ascending: false }),
      client.from("route_nodes").select("*"),
      client.from("route_edges").select("*"),
      client.from("annual_breeding_plans").select("*").order("plan_year").order("priority"),
      client.from("investments").select("*").order("rank"),
      client.from("genes").select("*").order("id"),
      client.from("gene_aliases").select("*"),
      client.from("morphs").select("*"),
      client.from("morph_components").select("*"),
      client.from("snake_genes").select("*")
    ]));

    return {
      snakes: results[0].data || [], routes: results[1].data || [], nodes: results[2].data || [],
      edges: results[3].data || [], plans: results[4].data || [], investments: results[5].data || [],
      genes: results[6].data || [], aliases: results[7].data || [], morphs: results[8].data || [],
      morphComponents: results[9].data || [], snakeGenes: results[10].data || []
    };
  }

  async function fetchDecisionTables(client) {
    const results = await Promise.all([
      client.from("planning_scenarios").select("*").order("created_at", { ascending: false }),
      client.from("analysis_runs").select("*").order("created_at", { ascending: false }).limit(80),
      client.from("ai_recommendations").select("*").order("created_at", { ascending: false }).limit(160),
      client.from("ai_prompt_templates").select("*").eq("is_active", true).order("version", { ascending: false }),
      client.from("ai_conversations").select("*").order("updated_at", { ascending: false }).limit(80),
      client.from("ai_conversation_messages").select("*").order("created_at", { ascending: false }).limit(600)
    ]);
    const error = results.find((result) => result.error);
    if (error) return { ready: false, error: error.error, data: null };
    return {
      ready: true,
      data: {
        scenarios: results[0].data || [], analysisRuns: results[1].data || [],
        recommendations: results[2].data || [], promptTemplates: results[3].data || [],
        conversations: results[4].data || [], conversationMessages: results[5].data || []
      }
    };
  }

  async function fetchWorkspace(client) {
    const business = await fetchBusinessTables(client);
    const decisions = await fetchDecisionTables(client);
    return { business, decisions };
  }

  global.SuohaData = Object.freeze({ config, fetchWorkspace, fetchBusinessTables, fetchDecisionTables });
})(window);
