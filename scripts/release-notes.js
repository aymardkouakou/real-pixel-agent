// Extrait la section d'une version du CHANGELOG.md : node scripts/release-notes.js 0.4.0
'use strict';
const fs = require('fs');
const path = require('path');

const version = (process.argv[2] || require('../package.json').version).replace(/^v/, '');
const text = fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
const re = new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b.*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
const m = text.match(re);
if (!m || !m[1].trim()) {
  console.error(`Aucune entrée « ## ${version} » dans CHANGELOG.md`);
  process.exit(1);
}
process.stdout.write(`${m[1].trim()}\n\n---\nInstallation : télécharge \`real-pixel-agent-${version}.vsix\` ci-dessous, puis \`code --install-extension real-pixel-agent-${version}.vsix\`.\n`);
