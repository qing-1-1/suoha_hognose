const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("login forms accept either username or email", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /id="gateEmail" type="text" autocomplete="username"/);
  assert.match(html, /id="loginEmail" type="text" autocomplete="username"/);
  assert.match(html, /邮箱或用户名/);
});

test("known usernames resolve to their Supabase auth emails", () => {
  const source = fs.readFileSync(path.join(root, "js", "app.js"), "utf8");
  assert.match(source, /suohama:"1442399241@qq\.com"/);
  assert.match(source, /suohayu:"569850649@qq\.com"/);
  assert.match(source, /function resolveLoginEmail\(value\)/);
  assert.match(source, /signInWithPassword\(\{email,password\}\)/);
});

test("profile display name migration updates known users", () => {
  const sql = fs.readFileSync(
    path.join(root, "supabase", "migrations", "017_profile_display_names.sql"),
    "utf8",
  );
  assert.match(sql, /display_name = 'suohama'/);
  assert.match(sql, /lower\(email\) = '1442399241@qq\.com'/);
  assert.match(sql, /display_name = 'suohayu'/);
  assert.match(sql, /lower\(email\) = '569850649@qq\.com'/);
});
