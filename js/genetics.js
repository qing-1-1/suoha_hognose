/*
 * Small, dependency-free Mendelian calculator for the normalized genetics
 * tables.  It deliberately returns "not calculated" for traits that the
 * database marks as unknown, polygenic, or line traits.
 */
(function attachSuohaGenetics(global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (global) global.SuohaGenetics = api;
})(typeof window !== "undefined" ? window : globalThis, function geneticsFactory() {
  const WILD = "__wild__";
  const MENDELIAN = new Set(["recessive", "dominant", "incomplete_dominant"]);

  const clamp = (value, fallback = 1) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
  };
  const round = value => Math.round(value * 10000) / 10000;
  const sortAlleles = alleles => [...alleles].sort((a, b) => {
    if (a === WILD) return 1;
    if (b === WILD) return -1;
    return a.localeCompare(b);
  });
  const genotypeKey = alleles => sortAlleles(alleles).join("|");
  const labelFor = (id, byId) => id === WILD ? "野生型" : (byId.get(id)?.name_zh || id);

  function doseDistribution(row, gene) {
    const state = row.state || "unknown";
    const probability = clamp(row.probability, 1);
    const inheritance = gene.inheritance_type;
    if (!MENDELIAN.has(inheritance) || ["unknown", "line_trait"].includes(state)) return null;
    if (state === "possible_het") return [{ dose: 0, probability: 1 - probability }, { dose: 1, probability }];
    if (inheritance === "recessive") {
      if (["visual", "super"].includes(state)) return [{ dose: 2, probability: 1 }];
      if (state === "het") return [{ dose: 1, probability: 1 }];
    } else {
      if (state === "super") return [{ dose: 2, probability: 1 }];
      if (["visual", "het"].includes(state)) return [{ dose: 1, probability: 1 }];
    }
    return null;
  }

  function parentGenotypes(rows, genes, byId) {
    const configurations = [{ counts: {}, probability: 1 }];
    let current = configurations;
    for (const row of rows) {
      const gene = byId.get(row.gene_id);
      const doses = gene && doseDistribution(row, gene);
      if (!doses) return { error: `${gene?.name_zh || row.gene_id} 的状态或遗传方式无法按孟德尔规则计算。` };
      const next = [];
      for (const config of current) for (const option of doses) {
        const count = (config.counts[row.gene_id] || 0) + option.dose;
        const total = Object.values(config.counts).reduce((sum, value) => sum + value, 0) + option.dose;
        if (total > 2) continue;
        next.push({
          counts: { ...config.counts, [row.gene_id]: count },
          probability: config.probability * option.probability
        });
      }
      current = next;
    }
    const totalProbability = current.reduce((sum, config) => sum + config.probability, 0);
    if (!totalProbability) return { error: "同一位点的记录无法组成合法的二倍体基因型；请检查是否把两个视觉隐性等位基因同时录入。" };
    const merged = new Map();
    current.forEach(config => {
      const alleles = [];
      Object.entries(config.counts).forEach(([id, count]) => alleles.push(...Array(count).fill(id)));
      while (alleles.length < 2) alleles.push(WILD);
      const key = genotypeKey(alleles);
      merged.set(key, (merged.get(key) || 0) + config.probability / totalProbability);
    });
    return {
      genotypes: [...merged.entries()].map(([key, probability]) => ({ alleles: key.split("|"), probability }))
    };
  }

  function gametes(genotype) {
    const counts = new Map();
    genotype.alleles.forEach(allele => counts.set(allele, (counts.get(allele) || 0) + genotype.probability / 2));
    return [...counts.entries()].map(([allele, probability]) => ({ allele, probability }));
  }

  function expressionFor(alleles, locusGenes, byId) {
    const nonWild = alleles.filter(allele => allele !== WILD);
    const stateByGene = {};
    locusGenes.forEach(gene => {
      const copies = alleles.filter(allele => allele === gene.id).length;
      if (gene.inheritance_type === "recessive") stateByGene[gene.id] = copies === 2 ? "visual" : (copies === 1 ? "het" : null);
      else if (["dominant", "incomplete_dominant"].includes(gene.inheritance_type)) stateByGene[gene.id] = copies === 2 ? "super" : (copies === 1 ? "visual" : null);
    });
    let label;
    if (!nonWild.length) label = "野生型";
    else if (nonWild.length === 1) {
      const gene = byId.get(nonWild[0]);
      label = gene.inheritance_type === "recessive" ? `${labelFor(nonWild[0], byId)} 隐性携带` : `${labelFor(nonWild[0], byId)} 表现`;
    } else if (nonWild[0] === nonWild[1]) {
      const gene = byId.get(nonWild[0]);
      label = gene.inheritance_type === "recessive" ? `${labelFor(nonWild[0], byId)} 表现` : `${labelFor(nonWild[0], byId)} 纯合 / super`;
    } else label = `${labelFor(nonWild[0], byId)} / ${labelFor(nonWild[1], byId)} 复合杂合（表现待验证）`;
    return { label, stateByGene, compound: new Set(nonWild).size > 1 };
  }

  function calculateLocus(locus, locusGenes, maternalRows, paternalRows, byId) {
    const maternal = parentGenotypes(maternalRows, locusGenes, byId);
    const paternal = parentGenotypes(paternalRows, locusGenes, byId);
    if (maternal.error || paternal.error) return { locus, genes: locusGenes, calculated: false, reason: maternal.error || paternal.error };
    const output = new Map();
    maternal.genotypes.forEach(mGenotype => paternal.genotypes.forEach(pGenotype => {
      gametes(mGenotype).forEach(mGamete => gametes(pGenotype).forEach(pGamete => {
        const alleles = sortAlleles([mGamete.allele, pGamete.allele]);
        const key = genotypeKey(alleles);
        output.set(key, (output.get(key) || 0) + mGamete.probability * pGamete.probability);
      }));
    }));
    const outcomes = [...output.entries()].map(([key, probability]) => {
      const alleles = key.split("|");
      return { alleles, probability: round(probability), ...expressionFor(alleles, locusGenes, byId) };
    }).sort((a, b) => b.probability - a.probability || a.label.localeCompare(b.label));
    return { locus, genes: locusGenes, calculated: true, outcomes };
  }

  function calculateCross({ genes = [], maternalGenes = [], paternalGenes = [], morphs = [], morphComponents = [] }) {
    const byId = new Map(genes.map(gene => [gene.id, gene]));
    const rows = [...maternalGenes, ...paternalGenes].filter(row => byId.has(row.gene_id));
    const locusKeys = [...new Set(rows.map(row => byId.get(row.gene_id).locus || `gene:${row.gene_id}`))];
    const loci = locusKeys.map(locus => {
      const locusGenes = genes.filter(gene => (gene.locus || `gene:${gene.id}`) === locus);
      const maternalRows = maternalGenes.filter(row => locusGenes.some(gene => gene.id === row.gene_id));
      const paternalRows = paternalGenes.filter(row => locusGenes.some(gene => gene.id === row.gene_id));
      return calculateLocus(locus, locusGenes, maternalRows, paternalRows, byId);
    });
    const calculated = loci.filter(locus => locus.calculated);
    const skipped = loci.filter(locus => !locus.calculated);
    const geneStateProbability = new Map();
    calculated.forEach(locus => locus.outcomes.forEach(outcome => Object.entries(outcome.stateByGene).forEach(([geneId, state]) => {
      if (!state) return;
      const key = `${geneId}:${state}`;
      geneStateProbability.set(key, (geneStateProbability.get(key) || 0) + outcome.probability);
    })));
    const derivedMorphs = morphs.map(morph => {
      const components = morphComponents.filter(component => component.morph_id === morph.id);
      if (!components.length) return null;
      const componentLoci = components.map(component => byId.get(component.gene_id)?.locus || `gene:${component.gene_id}`);
      if (new Set(componentLoci).size !== componentLoci.length) return null;
      const probabilities = components.map(component => geneStateProbability.get(`${component.gene_id}:${component.required_state}`));
      if (probabilities.some(probability => probability == null)) return null;
      return { id: morph.id, name_zh: morph.name_zh || morph.id, probability: round(probabilities.reduce((product, probability) => product * probability, 1)) };
    }).filter(Boolean).filter(morph => morph.probability > 0).sort((a, b) => b.probability - a.probability);
    return {
      loci: calculated,
      skipped,
      derivedMorphs,
      assumptions: [
        "不同位点按独立分离计算；当前数据库未保存连锁与共同亲本导致的联合携带概率。",
        "显性 visual 按杂合、super 按纯合计算；若实际剂量未知，结果应视为估算。"
      ]
    };
  }

  return { calculateCross, WILD };
});
