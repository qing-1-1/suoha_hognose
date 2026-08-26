const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateCross } = require("../js/genetics.js");

const genes = [
  { id: "lavender", name_zh: "薰衣草", inheritance_type: "recessive", locus: "lavender" },
  { id: "albino", name_zh: "白化", inheritance_type: "recessive", locus: "albino" },
  { id: "skullface", name_zh: "鬼脸", inheritance_type: "dominant", locus: "skullface" },
  { id: "caramel", name_zh: "焦糖", inheritance_type: "recessive", locus: "caramel" },
  { id: "frosted", name_zh: "糖霜", inheritance_type: "unknown", locus: null },
  { id: "conda", name_zh: "康达", inheritance_type: "incomplete_dominant", locus: "conda" }
];

function outcomes(result, locus) {
  return result.loci.find(item => item.locus === locus).outcomes;
}

test("recessive visual x het yields 50% visual and 50% carrier", () => {
  const result = calculateCross({
    genes,
    maternalGenes: [{ gene_id: "lavender", state: "visual", probability: 1 }],
    paternalGenes: [{ gene_id: "lavender", state: "het", probability: 1 }]
  });
  assert.deepEqual(outcomes(result, "lavender").map(item => [item.label, item.probability]), [
    ["薰衣草 表现", 0.5], ["薰衣草 隐性携带", 0.5]
  ]);
});

test("dominant visual x wild type assumes heterozygous parent", () => {
  const result = calculateCross({
    genes,
    maternalGenes: [{ gene_id: "skullface", state: "visual", probability: 1 }],
    paternalGenes: []
  });
  assert.deepEqual(outcomes(result, "skullface").map(item => [item.label, item.probability]).sort(), [
    ["野生型", 0.5], ["鬼脸 表现", 0.5]
  ].sort());
});

test("unknown traits are surfaced as skipped instead of invented probabilities", () => {
  const result = calculateCross({
    genes,
    maternalGenes: [{ gene_id: "caramel", state: "het", probability: 1 }],
    paternalGenes: [{ gene_id: "frosted", state: "unknown", probability: 1 }]
  });
  assert.deepEqual(outcomes(result, "caramel").map(item => [item.label, item.probability]), [
    ["焦糖 隐性携带", 0.5], ["野生型", 0.5]
  ]);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /糖霜/);
});

test("named combinations are derived from independent calculated loci", () => {
  const result = calculateCross({
    genes,
    maternalGenes: [
      { gene_id: "lavender", state: "het", probability: 1 },
      { gene_id: "albino", state: "visual", probability: 1 }
    ],
    paternalGenes: [
      { gene_id: "lavender", state: "het", probability: 1 },
      { gene_id: "albino", state: "het", probability: 1 }
    ],
    morphs: [{ id: "coral", name_zh: "珊瑚" }],
    morphComponents: [
      { morph_id: "coral", gene_id: "lavender", required_state: "visual" },
      { morph_id: "coral", gene_id: "albino", required_state: "visual" }
    ]
  });
  assert.deepEqual(result.derivedMorphs, [{ id: "coral", name_zh: "珊瑚", probability: 0.125 }]);
});

test("conda homozygote uses the established Superconda display name", () => {
  const result = calculateCross({
    genes,
    maternalGenes: [{ gene_id: "conda", state: "visual", probability: 1 }],
    paternalGenes: [{ gene_id: "conda", state: "visual", probability: 1 }]
  });
  assert.deepEqual(outcomes(result, "conda").map(item => [item.label, item.probability]), [
    ["康达 表现", 0.5], ["超康", 0.25], ["野生型", 0.25]
  ]);
});

test("independent loci are combined into complete offspring genotypes", () => {
  const result = calculateCross({
    genes,
    maternalGenes: [
      { gene_id: "conda", state: "visual", probability: 1 },
      { gene_id: "lavender", state: "het", probability: 1 }
    ],
    paternalGenes: [
      { gene_id: "conda", state: "visual", probability: 1 },
      { gene_id: "lavender", state: "het", probability: 1 }
    ]
  });
  assert.equal(result.combinationLimitExceeded, false);
  assert.equal(result.combinationCount, 9);
  assert.equal(result.combinedOutcomes.reduce((total, row) => total + row.probability, 0), 1);
  assert.ok(result.combinedOutcomes.some(row => row.label === "超康薰衣草" && row.probability === 0.0625));
});
