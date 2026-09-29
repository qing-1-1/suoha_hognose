const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
if (path.dirname(out) !== root || path.basename(out) !== 'dist') throw new Error('Invalid build destination');
if (fs.existsSync(out)) {
  if (fs.lstatSync(out).isSymbolicLink()) throw new Error('Build destination must not be a symlink');
  fs.rmSync(out, {recursive:true,force:true});
}
fs.mkdirSync(out, { recursive: true });
// Only explicit public assets are published. No .env, migrations or tests.
for (const name of ['index.html', 'admin.html', 'assets', 'js', 'robots.txt']) {
  fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
}
console.log('Built public site and private workspace in dist/');
