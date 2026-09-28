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
  assert.match(appSource, /SNAKE_ID_PREFIX_BY_OWNER=Object\.freeze/);
  assert.match(appSource, /"1442399241@qq\.com":"M"/);
  assert.match(appSource, /"569850649@qq\.com":"Y"/);
  assert.match(appSource, /function snakeIdPrefixForInvestor\(value\)/);
  assert.match(appSource, /function nextSnakeId\(investor=currentInvestorName\(\)\)/);
  assert.match(appSource, /const prefix=snakeIdPrefixForInvestor\(investor\)/);
  assert.match(appSource, /REMOTE_RAW\.snakes\.map\(s=>String\(s\.id\|\|""\)\.trim\(\)\.match\(pattern\)\)/);
  assert.match(appSource, /return `\$\{prefix\}\$\{String\(max\+1\)\.padStart\(width,"0"\)\}`/);
  assert.match(appSource, /const investorValue=row\.id\?\(row\.investor\|\|""\):\(row\.investor\|\|currentInvestorName\(\)\)/);
  assert.match(appSource, /nextSnakeId\(investorValue\)/);
  assert.match(appSource, /if\(!editContext\.id&&!o\.investor\)o\.investor=currentInvestorName\(\)\|\|null/);
});

test("ledger user meta displays category counts instead of a generic manual count", () => {
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(appSource, /function ledgerMetaParts\(autoCount,categoryCounts=\{\}\)/);
  assert.match(appSource, /parts\.push\(`\$\{meta\.label\} \$\{count\} 笔`\)/);
  assert.doesNotMatch(appSource, /手工 \$\{user\.manualCount\} 笔/);
  assert.doesNotMatch(appSource, /笔手工支出/);
});

test("admin can hard delete snakes while keeping retire as a separate action", () => {
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(appSource, /data-admin-retire-snake/);
  assert.match(appSource, /data-admin-delete-snake/);
  assert.match(appSource, /\[data-admin-delete-snake\][\s\S]*deleteSnake/);
  assert.match(appSource, /function deleteSnake\(id\)/);
  assert.doesNotMatch(appSource, /async function deleteSnake\(id\)\{\s*return retireSnake\(id\);/);
  assert.match(appSource, /REMOTE_RAW\.nodes\.filter\(node=>String\(node\.snake_id\)===String\(id\)\)/);
  assert.match(appSource, /删除会同时移除相关路线节点和连线/);
  assert.match(appSource, /种群投入金额会随刷新自动扣除/);
  assert.match(appSource, /sb\.from\("route_edges"\)\.delete\(\)\.in\("from_node_id",nodeIds\)/);
  assert.match(appSource, /sb\.from\("route_edges"\)\.delete\(\)\.in\("to_node_id",nodeIds\)/);
  assert.match(appSource, /sb\.from\("route_nodes"\)\.delete\(\)\.in\("id",nodeIds\)/);
  assert.match(appSource, /sb\.from\("snake_genes"\)\.delete\(\)\.eq\("snake_id",id\)/);
  assert.match(appSource, /sb\.from\("snakes"\)\.delete\(\)\.eq\("id",id\)/);
  assert.match(appSource, /toast\("个体已删除，投资金额已更新"\)/);
});

test("admin exposes gene alias mapping controls", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  const dataSource = fs.readFileSync(path.join(root, "js", "data.js"), "utf8");
  assert.match(html, /data-admin-tab="aliases"/);
  assert.match(html, /基因黑话/);
  assert.match(dataSource, /from\("gene_aliases"\)\.select\("\*"\)/);
  assert.match(appSource, /function aliasFormHtml\(row=\{\}\)/);
  assert.match(appSource, /function openAliasForm\(alias=null\)/);
  assert.match(appSource, /function deleteAlias\(alias\)/);
  assert.match(appSource, /adminTab==="aliases"/);
  assert.match(appSource, /data-admin-edit-alias/);
  assert.match(appSource, /data-admin-del-alias/);
  assert.match(appSource, /sb\.from\("gene_aliases"\)\.delete\(\)\.eq\("alias",alias\)/);
  assert.match(appSource, /sb\.from\(t\)\.update\(o\)\.eq\("alias",editContext\.id\)/);
  assert.match(appSource, /adminTab==="aliases"\?openAliasForm\(\)/);
});

test("population overview shows total population and other investment cards", () => {
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  const cssSource = fs.readFileSync(path.join(root, "assets", "app.css"), "utf8");
  assert.match(appSource, /function ledgerInvestmentTotals\(manualRows=ledgerRows\(\)\)/);
  assert.match(appSource, /function investmentKpi\(totals\)/);
  assert.match(appSource, /investmentKpi\(investTotals\)/);
  assert.match(appSource, /<span>总投入<\/span>/);
  assert.match(appSource, /<span>种群投入<\/span>/);
  assert.match(appSource, /<span>其他投入<\/span>/);
  assert.doesNotMatch(appSource, /种群 \+ 设备 \+ 耗材/);
  assert.doesNotMatch(appSource, /个体价格与种群扩张/);
  assert.doesNotMatch(appSource, /设备购买与耗材/);
  assert.match(cssSource, /\.investmentKpi\{grid-column:span 2;display:grid;grid-template-columns:1fr 1fr/);
  assert.match(cssSource, /\.investmentKpiSide\{display:grid;grid-template-rows:1fr 1fr/);
  assert.doesNotMatch(appSource, /表内购入投入/);
});

test("population detail cards avoid stale hardcoded helper text", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const appSource = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(html, /id="sexStructureMeta"/);
  assert.match(appSource, /#sexStructureMeta/);
  assert.match(appSource, /现有 \$\{n\} 条个体/);
  assert.doesNotMatch(html, /现有 32 条个体/);
  assert.doesNotMatch(html, /按 Excel 系列字段/);
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
