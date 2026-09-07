const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("candidate investment form exposes price, currency, breeding-ready month and reference notes", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const id of ["candidatePrice", "candidateCurrency", "candidateBreedingReadyMonth", "candidateReferenceNotes"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /id="candidateBreedingReadyMonth" type="month"/);
});

test("candidate investment snapshot carries the additional form values", () => {
  const source = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(source, /asking_price:price===null\?null:\{amount:price,currency\}/);
  assert.match(source, /breeding_ready_at:breedingReadyAt/);
  assert.match(source, /reference_notes:referenceNotes/);
  assert.match(source, /breedingReadyAt\.year<2000\|\|breedingReadyAt\.year>2200/);
  assert.match(source, /breedingReadyAt\.month<1\|\|breedingReadyAt\.month>12/);
});
