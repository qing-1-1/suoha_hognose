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

  // Stable ranged reads include older rows beyond Supabase's response cap.
  async function fetchAll(client, table, orders = [['id', true]]) {
    const rows = []; let count = null;
    for (let offset = 0; ; ) {
      let query = client.from(table).select('*', {count:'exact'});
      for (const [field, ascending] of orders) query = query.order(field, {ascending});
      const result = await query.range(offset, offset + 499);
      if (result.error) return {...result, data:[]};
      const page = result.data || [];
      count = result.count ?? count;
      rows.push(...page); offset += page.length;
      if (!page.length || (count !== null ? rows.length >= count : page.length < 500)) return {data:rows, count:count ?? rows.length, error:null};
    }
  }

  async function fetchBusinessTables(client) {
    const expenseLedger = await fetchInvestmentExpenses(client);
    const morphAliases = await fetchMorphAliases(client);
    const acquisitionCosts = await fetchAcquisitionCosts(client);
    const results = throwFirstError(await Promise.all([
      fetchAll(client, 'snakes'),
      fetchAll(client, 'breeding_routes', [['priority',false],['id',true]]),
      fetchAll(client, 'route_nodes'),
      fetchAll(client, 'route_edges'),
      fetchAll(client, 'annual_breeding_plans', [['plan_year',true],['priority',true],['id',true]]),
      fetchAll(client, 'investments', [['rank',true],['id',true]]),
      fetchAll(client, 'genes'),
      fetchAll(client, 'gene_aliases', [['alias',true]]),
      fetchAll(client, 'morphs'),
      fetchAll(client, 'morph_components', [['morph_id',true],['gene_id',true]]),
      fetchAll(client, 'snake_genes', [['snake_id',true],['gene_id',true]])
    ]));

    return {
      snakes: results[0].data || [], routes: results[1].data || [], nodes: results[2].data || [],
      edges: results[3].data || [], plans: results[4].data || [], investments: results[5].data || [],
      genes: results[6].data || [], aliases: results[7].data || [], morphs: results[8].data || [],
      morphComponents: results[9].data || [], snakeGenes: results[10].data || [],
      investmentExpenses: expenseLedger, morphAliases, acquisitionCosts
    };
  }

  async function fetchInvestmentExpenses(client) {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from("investment_expenses").select("*").order("spent_at", {ascending:false}).order("id").range(offset,offset+999);
      if(error) { console.warn("investment_expenses unavailable:",error.message); return []; }
      rows.push(...(data || []));
      if((data || []).length < 1000) return rows;
    }
  }

  async function fetchAcquisitionCosts(client) {
    const rows = [];
    for(let offset=0; ; offset+=1000) {
      const {data,error}=await client.from("snake_acquisition_costs").select("*").order("id").range(offset,offset+999);
      if(error) { console.warn("acquisition cost history unavailable:",error.message); return null; }
      rows.push(...(data||[]));
      if((data||[]).length<1000)return rows;
    }
  }

  async function fetchMorphAliases(client) {
    const { data, error } = await client
      .from("morph_aliases")
      .select("*")
      .order("alias");

    if (error) {
      console.warn("morph_aliases unavailable:", error.message);
      return [];
    }
    return data || [];
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

  global.SuohaData = Object.freeze({ config, fetchAll, fetchWorkspace, fetchBusinessTables, fetchDecisionTables });
})(window);
