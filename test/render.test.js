// Tests de rendu : captures comparées à des références (test/__screenshots__).
//   npm run compile && npm run test:render          -> compare
//   UPDATE_SNAPSHOTS=1 npm run test:render          -> régénère les références
// L'horloge de la page est figée (Date, rAF, timers) : les animations sont déterministes.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const { BODY } = require('../out/webviewBody');

const ROOT = path.join(__dirname, '..');
const SNAP = path.join(__dirname, '__screenshots__');
const OUT = path.join(ROOT, 'test-results');
const UPDATE = !!process.env.UPDATE_SNAPSHOTS;
const MAX_DIFF = 0.004; // 0,4 % de pixels différents tolérés (anticrénelage du texte)

const LABELS = {
  typing: 'écrit du code', reading: 'lit des fichiers', running: 'exécute une commande', searching: 'cherche',
  delegating: 'délègue à un sous-agent', thinking: 'réfléchit', planning: 'rédige un plan', waiting: 'attend ta réponse',
  permission: 'attend une permission', sleeping: 'en pause',
};
const T0 = new Date('2026-10-09T10:30:00').getTime();
const ag = (i, title, state, extra = {}) => ({
  id: `p/s${i}`, num: i, file: 'x', project: 'finapay', title, state, isSub: false, lastActivity: T0 - 4000, exact: true, ...extra,
});
const TEAM = [
  ag(1, 'Refactor paiement Wave', 'delegating', { tool: 'Task', detail: 'Explorer le code' }),
  ag(2, 'Tests API transferts', 'typing', { tool: 'Edit', detail: 'test_api.py' }),
  ag(3, 'Déploiement PM2', 'running', { tool: 'Bash', detail: 'npm run build' }),
  ag(4, 'Migration MongoDB', 'permission', { tool: 'Write', detail: 'migrate.py' }),
  ag(5, 'Doc README', 'waiting'),
  ag(6, 'Explorer le code', 'reading', { tool: 'Grep', detail: 'Wave', isSub: true, parentId: 'p/s1' }),
  ag(7, 'Veille BCEAO', 'searching', { tool: 'WebSearch', detail: 'bceao' }),
  ag(8, 'Bug webhook MTN', 'sleeping'),
];
const msg = (agents, extra = {}) => ({
  type: 'agents', agents, labels: LABELS, scale: 3, workspace: 'finapay-backend', meetingMode: 'all',
  hooks: 'on', sound: false, timeOfDay: 'day', looks: {}, ...extra,
});

function harness(dir) {
  for (const f of ['main.js', 'style.css']) fs.copyFileSync(path.join(ROOT, 'media', f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'index.html'), `<!DOCTYPE html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="style.css"><style>body{--vscode-font-family:"DejaVu Sans",Arial,sans-serif}#hint{display:none}</style></head>
<body>${BODY}<script>window.__posted=[];window.acquireVsCodeApi=()=>({postMessage:m=>window.__posted.push(m),getState:()=>null,setState:()=>{}});</script>
<script src="main.js"></script></body></html>`);
}

const cases = [
  { name: 'campus-jour', size: [1000, 560], steps: async (p) => { await send(p, msg(TEAM)); await p.clock.runFor(1500); await p.keyboard.press('f'); await p.clock.runFor(800); } },
  {
    name: 'reunion-plan', size: [1000, 560], steps: async (p) => {
      await send(p, msg(TEAM));
      await p.clock.runFor(500);
      const planning = TEAM.map((a) => (a.num === 1 ? { ...a, state: 'planning', tool: undefined, detail: 'rédige le plan' } : a));
      await send(p, msg(planning));
      await p.click('[data-zone=war]');
      await p.clock.runFor(16000);
    },
  },
  {
    name: 'nuit-annexe', size: [1100, 600], steps: async (p) => {
      const ext = [ag(20, 'Bot Telegram', 'typing', { external: true, project: 'lidar' }), ag(21, 'ETL ventes', 'thinking', { external: true, project: 'welloo' })];
      await send(p, msg([...TEAM, ...ext], { timeOfDay: 'night' }));
      await p.clock.runFor(1500);
      await p.keyboard.press('f');
      await p.clock.runFor(800);
    },
  },
  {
    name: 'journal', size: [1000, 560], steps: async (p) => {
      await send(p, msg(TEAM));
      await p.clock.runFor(800);
      await p.click('#journal');
      const day = { day: '2026-10-09', agents: TEAM.map((a, i) => ({ id: a.id, title: a.title, num: a.num, project: a.project, sub: a.isSub, ms: { typing: 600000 * (i + 1), thinking: 300000 * (8 - i), waiting: 240000, permission: i === 3 ? 180000 : 0 }, total: 600000 * (i + 1) + 300000 * (8 - i) + 240000 + (i === 3 ? 180000 : 0) })).sort((x, y) => y.total - x.total) };
      await p.evaluate((m) => window.postMessage(m, '*'), { type: 'journal', days: [day], labels: LABELS });
      await p.clock.runFor(300);
    },
  },
];

async function send(page, m) {
  await page.evaluate((x) => window.postMessage(x, '*'), m);
  await page.clock.runFor(50);
}

(async () => {
  fs.mkdirSync(SNAP, { recursive: true });
  fs.mkdirSync(OUT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'rpa-render-'));
  harness(dir);
  const browser = await chromium.launch();
  let failures = 0;
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: c.size[0], height: c.size[1] }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.clock.install({ time: T0 });
    await page.goto('file://' + path.join(dir, 'index.html'));
    await page.clock.runFor(100);
    await c.steps(page);
    const shot = PNG.sync.read(await page.screenshot());
    await page.close();
    assert.deepStrictEqual(errors, [], `${c.name} : erreurs JS`);
    const ref = path.join(SNAP, c.name + '.png');
    if (UPDATE || !fs.existsSync(ref)) {
      fs.writeFileSync(ref, PNG.sync.write(shot));
      console.log(`ref  - ${c.name} (référence ${UPDATE ? 'mise à jour' : 'créée'})`);
      continue;
    }
    const exp = PNG.sync.read(fs.readFileSync(ref));
    if (exp.width !== shot.width || exp.height !== shot.height) {
      failures++; console.log(`FAIL - ${c.name} : taille ${shot.width}x${shot.height} ≠ ${exp.width}x${exp.height}`); continue;
    }
    const diff = new PNG({ width: exp.width, height: exp.height });
    const n = pixelmatch(exp.data, shot.data, diff.data, exp.width, exp.height, { threshold: 0.15 });
    const ratio = n / (exp.width * exp.height);
    if (ratio > MAX_DIFF) {
      failures++;
      fs.writeFileSync(path.join(OUT, c.name + '.actual.png'), PNG.sync.write(shot));
      fs.writeFileSync(path.join(OUT, c.name + '.diff.png'), PNG.sync.write(diff));
      console.log(`FAIL - ${c.name} : ${(ratio * 100).toFixed(2)} % de pixels différents (voir test-results/)`);
    } else console.log(`ok   - ${c.name} (${(ratio * 100).toFixed(3)} %)`);
  }
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  if (failures) { console.log(`\n${failures} capture(s) différente(s)`); process.exit(1); }
  console.log(`\n${cases.length} captures OK`);
})().catch((e) => { console.error(e); process.exit(1); });
