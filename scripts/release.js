// Prépare une version : npm run release -- <patch|minor|major|x.y.z> [--push]
// 1. calcule la nouvelle version  2. vérifie l'entrée du CHANGELOG
// 3. met à jour package.json / package-lock.json  4. commit + tag vX.Y.Z  5. (--push) pousse branche et tag
// Le push du tag déclenche la CI, qui teste, empaquette et publie la release GitHub avec le .vsix.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const run = (cmd) => cp.execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
const fail = (msg) => { console.error('✗ ' + msg); process.exit(1); };

const arg = process.argv[2];
const push = process.argv.includes('--push');
if (!arg) fail('usage : npm run release -- <patch|minor|major|x.y.z> [--push]');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const [M, m, p] = pkg.version.split('.').map(Number);
const next = { patch: `${M}.${m}.${p + 1}`, minor: `${M}.${m + 1}.0`, major: `${M + 1}.0.0` }[arg] || arg;
if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`version invalide : ${next}`);

if (run('git status --porcelain')) fail('des modifications ne sont pas commitées');
if (run(`git tag -l v${next}`)) fail(`le tag v${next} existe déjà`);
try { run(`node scripts/release-notes.js ${next}`); } catch { fail(`ajoute d'abord une section « ## ${next} » dans CHANGELOG.md (et commite-la)`); }

run(`npm version ${next} --no-git-tag-version --allow-same-version`);
run('git add package.json package-lock.json');
run(`git commit -m "Version ${next}"`);
run(`git tag -a v${next} -m "Version ${next}"`);
console.log(`✓ version ${next} : commit et tag v${next} créés`);
if (push) {
  run('git push origin HEAD');
  run(`git push origin v${next}`);
  console.log('✓ poussé : la CI publie la release dans quelques minutes');
} else {
  console.log(`→ pour publier : git push origin HEAD && git push origin v${next}`);
}
