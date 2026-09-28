const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("investment ledger UI exposes expense entry and summary targets", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const id of [
    "ledgerExpenseForm",
    "ledgerExpenseCategory",
    "ledgerExpenseAmount",
    "ledgerExpenseNote",
    "ledgerSummary",
    "ledgerCategorySummary",
    "ledgerRows",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /value="population">种群扩张/);
  assert.match(html, /value="equipment">设备购买/);
  assert.match(html, /value="consumables">耗材/);
});

test("investment expenses are loaded and rendered by the frontend", () => {
  const dataSource = fs.readFileSync(path.join(root, "js", "data.js"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(dataSource, /from\("investment_expenses"\)/);
  assert.match(dataSource, /investmentExpenses: expenseLedger/);
  assert.match(appSource, /function renderInvestmentLedger\(\)/);
  assert.match(appSource, /sb\.from\("investment_expenses"\)\.insert/);
  assert.match(appSource, /ledgerPercent\(user\.total,total\)/);
});

test("investment expense migration creates category and owner policies", () => {
  const sql = fs.readFileSync(
    path.join(root, "supabase", "migrations", "016_investment_expense_ledger.sql"),
    "utf8",
  );
  assert.match(sql, /create table if not exists public\.investment_expenses/);
  assert.match(sql, /category in \('population', 'equipment', 'consumables'\)/);
  assert.match(sql, /alter table public\.investment_expenses enable row level security/);
  assert.match(sql, /owner_id = auth\.uid\(\)/);
  assert.match(sql, /public\.can_edit_app\(\)/);
});
