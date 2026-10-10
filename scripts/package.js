// Prépare et empaquette une version : npm run package -- [patch|minor|major|x.y.z] [--push] [--dry-run]
// 1. calcule la nouvelle version (patch par défaut)
// 2. ajoute une section « ## x.y.z » en tête de CHANGELOG.md (si absente) à partir des commits depuis la dernière version, puis la commite
// 3. lance scripts/release.js (version dans package.json / package-lock.json + commit « Version x.y.z »)
// 4. construit le .vsix (vsce package)
// L'arbre git doit être propre. --push pousse main à la fin (la CI publie alors la release). Sans version
// à publier, utiliser « npm run package:dev » : simple .vsix, aucune version ni commit.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.join(__dirname, '..');
const sh = (cmd) => cp.execSync(cmd, { cwd: root, stdio: 'pipe', encoding: 'utf8' }).trim();
const fail = (msg) => { console.error('✗ ' + msg); process.exit(1); };

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const push = args.includes('--push');
const bump = args.find((a) => !a.startsWith('--')) || 'patch';

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const [M, m, p] = pkg.version.split('.').map(Number);
const next = { patch: `${M}.${m}.${p + 1}`, minor: `${M}.${m + 1}.0`, major: `${M + 1}.0.0` }[bump] || bump;
if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`version invalide : ${next}`);
if (next === pkg.version) fail(`la version est déjà ${next}`);
if (!dry && sh('git status --porcelain')) fail('des modifications ne sont pas commitées : commite-les d\'abord');

// commits depuis la dernière version, sans le bruit (versions, changelog, fusions)
const lastVersion = sh('git log -1 --format=%H --grep="^Version [0-9]"');
const range = lastVersion ? `${lastVersion}..HEAD` : 'HEAD';
const subjects = sh(`git log ${range} --no-merges --reverse --format=%s`).split('\n')
  .map((s) => s.trim())
  .filter((s) => s && !/^(Version \d|Changelog\b|Merge\b)/i.test(s));

const changelogPath = path.join(root, 'CHANGELOG.md');
let changelog = fs.readFileSync(changelogPath, 'utf8');
const hasSection = new RegExp(`^## ${next.replace(/\./g, '\\.')}\\b`, 'm').test(changelog);
if (!hasSection && !subjects.length) fail('aucun changement à publier depuis la dernière version');

const section = `## ${next}\n${subjects.map((s) => `- ${s}`).join('\n')}\n\n`;
if (dry) {
  console.log(`version : ${pkg.version} → ${next}`);
  console.log(hasSection ? 'section CHANGELOG déjà présente : conservée' : `section CHANGELOG ajoutée :\n\n${section}`);
  process.exit(0);
}

if (!hasSection) {
  changelog = changelog.replace(/^(# [^\n]*\n\n)/, `$1${section}`);
  fs.writeFileSync(changelogPath, changelog);
  sh('git add CHANGELOG.md');
  sh(`git commit -m "Changelog ${next}"`);
  console.log(`✓ section ${next} ajoutée au CHANGELOG (${subjects.length} entrée(s)) : relis-la, puis amende-la si besoin`);
}

const out = cp.spawnSync(process.execPath, [path.join(__dirname, 'release.js'), next, ...(push ? ['--push'] : [])], { cwd: root, stdio: 'inherit' });
if (out.status) process.exit(out.status);
const pk = cp.spawnSync('npx', ['vsce', 'package'], { cwd: root, stdio: 'inherit' });
process.exit(pk.status || 0);
