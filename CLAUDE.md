# Real Pixel Agent

Extension VS Code (TypeScript, Node 22) : campus pixel art où chaque session Claude Code est un personnage, suivi via les hooks Claude Code. Textes utilisateur en français.

## Structure
- `src/` : `extension.ts`, `hooks.ts`, `scanner.ts`, `journal.ts`, `uninstall.ts`, `webviewBody.ts`
- `hook/real-pixel-agent-hook.js` : script de hook installé chez l'utilisateur
- `scripts/` : build webview, package, release
- `test/` : tests Node simples (`assert`), exécutés sur `out/` (compilé)

## Commandes rapides
- Compiler (requis avant les tests, ils lisent `out/`) : `npm run compile 2>&1 | tail -15`
- Typecheck seul : `npx tsc -p . --noEmit`
- Test ciblé : `node test/scanner.test.js | tail -5` · `node test/hooks.test.js | tail -5`
- Smoke extension : `node test/extension.smoke.js | tail -10`
- Rendu (lent, seulement si le webview change) : `npm run test:render`
- Suite complète (avant livraison) : `npm test`

Boucle rapide (~4 s) : `npm run compile 2>&1 | tail -15 && node test/hooks.test.js | tail -5`

## Conventions
- Tests : fonction `t(nom, fn)` + `assert`, noms en français, dossiers temporaires via `fs.mkdtempSync`.
- Pas de linter configuré ; `tsc` fait foi.
- Pas de nouvelle dépendance sans validation.
- Ne pas committer les `.vsix`.
- La CI est en déclenchement manuel (`workflow_dispatch`).
