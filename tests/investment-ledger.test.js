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
  assert.match(appSource, /function deleteLedgerExpense\(id\)/);
  assert.match(appSource, /data-ledger-delete/);
  assert.match(appSource, /sb\.from\("investment_expenses"\)\.delete\(\)\.eq\("id",id\)/);
  assert.match(appSource, /ledgerPercent\(user\.total,total\)/);
});

test("snake purchase prices are counted into the matching user's population investment", () => {
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(appSource, /SNAKE_INVESTMENT_PREFIX_OWNERS=Object\.freeze/);
  assert.match(appSource, /M:"1442399241@qq\.com"/);
  assert.match(appSource, /Y:"569850649@qq\.com"/);
  assert.match(appSource, /function investmentOwnerFromIdentity\(value\)/);
  assert.match(appSource, /const explicitOwner=investmentOwnerFromIdentity\(snake\?\.investor\)/);
  assert.match(appSource, /function snakeInvestmentRows\(\)/);
  assert.match(appSource, /Number\(snake\.price\|\|0\)/);
  assert.match(appSource, /category:"population"/);
  assert.match(appSource, /source:"snake_inventory"/);
  assert.match(appSource, /const statRows=ledgerStatRows\(rows\)/);
  assert.match(appSource, /statRows\.filter\(row=>row\.category===key\)/);
});

test("new snakes default their investor to the current logged in user", () => {
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(appSource, /function currentInvestorName\(\)/);
  assert.match(appSource, /const investorValue=row\.id\?\(row\.investor\|\|""\):\(row\.investor\|\|currentInvestorName\(\)\)/);
  assert.match(appSource, /if\(!editContext\.id&&!o\.investor\)o\.investor=currentInvestorName\(\)\|\|null/);
});

test("ledger user meta displays category counts instead of a generic manual count", () => {
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(appSource, /function ledgerMetaParts\(autoCount,categoryCounts=\{\}\)/);
  assert.match(appSource, /parts\.push\(`\$\{meta\.label\} \$\{count\} 笔`\)/);
  assert.doesNotMatch(appSource, /手工 \$\{user\.manualCount\} 笔/);
  assert.doesNotMatch(appSource, /笔手工支出/);
});

test("population overview shows total population and other investment cards", () => {
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(appSource, /function ledgerInvestmentTotals\(manualRows=ledgerRows\(\)\)/);
  assert.match(appSource, /kpi\("总投入",fmt\(investTotals\.total\)/);
  assert.match(appSource, /kpi\("种群投入",fmt\(investTotals\.population\)/);
  assert.match(appSource, /kpi\("其他投入",fmt\(investTotals\.other\)/);
  assert.doesNotMatch(appSource, /表内购入投入/);
});

test("investment ledger maps known emails to display usernames", () => {
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(appSource, /USER_DISPLAY_NAMES=Object\.freeze/);
  assert.match(appSource, /"569850649@qq\.com":"suohayu"/);
  assert.match(appSource, /"1442399241@qq\.com":"suohama"/);
  assert.match(appSource, /function ledgerOwnerName\(row\)/);
  assert.match(appSource, /displayNameForEmail\(email\)\|\|displayNameForEmail\(name\)/);
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
