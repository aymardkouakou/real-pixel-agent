// Assemble le code du webview : media/src/*.js (dans l'ordre des préfixes) -> media/main.js
// Les modules partagent la même portée (une seule IIFE), esbuild vérifie la syntaxe et minifie en production.
'use strict';
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const SRC = path.join(__dirname, '..', 'media', 'src');
const OUT = path.join(__dirname, '..', 'media', 'main.js');
const prod = process.argv.includes('--prod');
const watch = process.argv.includes('--watch');

function build() {
  const files = fs.readdirSync(SRC).filter((f) => /^\d\d-.*\.js$/.test(f)).sort();
  const parts = files.map((f) => `// ---- ${f} ----\n` + fs.readFileSync(path.join(SRC, f), 'utf8'));
  const code = `(function () {\n'use strict';\n${parts.join('\n')}\n})();\n`;
  const res = esbuild.transformSync(code, { loader: 'js', target: 'es2020', minify: prod, legalComments: 'none' });
  const banner = '// Généré par scripts/build-webview.js depuis media/src/ — ne pas modifier directement.\n';
  fs.writeFileSync(OUT, banner + res.code);
  console.log(`webview : ${files.length} modules -> media/main.js (${(Buffer.byteLength(res.code) / 1024).toFixed(1)} Ko${prod ? ', minifié' : ''})`);
}

// Scène 3D (Three.js) : bundle séparé, chargé seulement avec le réglage renderer = 3d.
function build3d() {
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', 'media', 'src3d', 'scene3d.js')],
    outfile: path.join(__dirname, '..', 'media', 'scene3d.js'),
    bundle: true, format: 'iife', target: 'es2020', minify: prod, legalComments: 'none',
  });
  console.log(`scène 3D -> media/scene3d.js (${(fs.statSync(path.join(__dirname, '..', 'media', 'scene3d.js')).size / 1024).toFixed(0)} Ko)`);
}

build();
build3d();
if (watch) {
  fs.watch(SRC, () => { try { build(); } catch (e) { console.error(e.message); } });
  fs.watch(path.join(SRC, '..', 'src3d'), () => { try { build3d(); } catch (e) { console.error(e.message); } });
}
