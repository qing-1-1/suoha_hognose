const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

test("candidate investment form exposes price, currency, breeding-ready month and reference notes", () => {
  const html = fs.readFileSync(path.join(root, "admin.html"), "utf8");
  for (const id of ["candidatePrice", "candidateCurrency", "candidateBreedingReadyMonth", "candidateBreedingReadyYear", "candidateBreedingReadyMonthSelect", "candidateReferenceNotes"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /id="candidateBreedingReadyMonth" type="hidden"/);
  assert.match(html, /class="candidateMonthPicker"/);
});

test("candidate investment snapshot carries the additional form values", () => {
  const source = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(source, /asking_price:price===null\?null:\{amount:price,currency\}/);
  assert.match(source, /breeding_ready_at:breedingReadyAt/);
  assert.match(source, /reference_notes:referenceNotes/);
  assert.match(source, /breedingReadyAt\.year<2000\|\|breedingReadyAt\.year>2200/);
  assert.match(source, /breedingReadyAt\.month<1\|\|breedingReadyAt\.month>12/);
});

test("candidate breeding-ready month accepts localized browser display values", () => {
  const source = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  const helper = source.match(/function parseCandidateBreedingReadyMonth\(value\)\{[\s\S]*?\n\}/)[0];
  const context = {};
  vm.runInNewContext(`${helper};this.parseCandidateBreedingReadyMonth=parseCandidateBreedingReadyMonth;`, context);

  // VM objects have a different prototype; compare the actual parsed fields.
  for (const input of ["2028-12", "2028年12月", "2028/12", "2028-12-01"]) {
    const { year, month } = context.parseCandidateBreedingReadyMonth(input);
    assert.deepEqual({ year, month }, { year: 2028, month: 12 });
  }
  assert.throws(() => context.parseCandidateBreedingReadyMonth("2028年13月"), /2000-01 至 2200-12/);
});

test("candidate investment uses a background function and polls its saved run", () => {
  const source = fs.readFileSync(path.join(root, "js", "ai.js"), "utf8");
  assert.match(source, /\/\.netlify\/functions\/ai-analyze-background/);
  assert.match(source, /status:"running"/);
  assert.match(source, /waitForCandidateAnalysis\(created\.id,host\)/);
});
