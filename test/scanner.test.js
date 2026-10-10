// Tests du lecteur de transcriptions : node test/scanner.test.js (après npm run compile)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Scanner, parseTail, parseHead, encodeProjectPath, isPlanWork, isPlannerAgent, stateForTool } = require('../out/scanner');

const j = (o) => JSON.stringify(o);
const user = (text) => j({ type: 'user', cwd: '/home/a/monprojet', message: { role: 'user', content: text } });
const result = (id) => j({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const tool = (id, name, input) => j({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
const say = (text) => j({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok -', name); }

t('outil en cours', () => {
  const p = parseTail([user('corrige le bug'), tool('t1', 'Edit', { file_path: '/x/src/app.ts' })].join('\n'));
  assert.deepStrictEqual(p, { kind: 'tool', tool: 'Edit', detail: 'app.ts', planMode: false });
});
t('outil terminé -> réfléchit', () => {
  const p = parseTail([user('go'), tool('t1', 'Read', { file_path: '/a/b.py' }), result('t1')].join('\n'));
  assert.strictEqual(p.kind, 'toolResult');
});
t('outils parallèles : un seul résolu', () => {
  const p = parseTail([user('go'), tool('a', 'Read', { file_path: '/a.py' }), tool('b', 'Bash', { command: 'npm test', description: 'Lance les tests' }), result('a')].join('\n'));
  assert.deepStrictEqual(p, { kind: 'tool', tool: 'Bash', detail: 'Lance les tests', planMode: false });
});
t('réponse finale -> attend', () => {
  const p = parseTail([user('go'), tool('t1', 'Read', {}), result('t1'), say('Terminé !')].join('\n'));
  assert.strictEqual(p.kind, 'assistantText');
});
t('interruption', () => {
  assert.strictEqual(parseTail([say('...'), user('[Request interrupted by user]')].join('\n')).kind, 'interrupted');
});
t('mode plan via permissionMode', () => {
  const u = j({ type: 'user', permissionMode: 'plan', message: { role: 'user', content: 'prépare un plan' } });
  const p = parseTail([u, tool('r', 'Read', { file_path: '/a.ts' })].join('\n'));
  assert.strictEqual(p.planMode, true);
  const u2 = j({ type: 'user', permissionMode: 'default', message: { role: 'user', content: 'go' } });
  assert.strictEqual(parseTail([u, say('plan'), u2].join('\n')).planMode, false);
});
t('mode plan via rappel système puis validation', () => {
  const meta = j({ type: 'user', isMeta: true, message: { role: 'user', content: '<system-reminder>Plan mode is active. …</system-reminder>' } });
  assert.strictEqual(parseTail([meta, say('Voici le plan')].join('\n')).planMode, true);
  const ok = result('x').replace('"ok"', '"User has approved your plan. You can now start coding."');
  assert.strictEqual(parseTail([meta, tool('x', 'ExitPlanMode', {}), ok].join('\n')).planMode, false);
});
t('sous-agent Plan', () => {
  const p = parseTail([user('go'), tool('t', 'Task', { description: 'Concevoir', subagent_type: 'Plan' })].join('\n'));
  assert.strictEqual(p.subType, 'Plan');
});
t('titre et cwd', () => {
  const h = parseHead([user('<command-name>/clear</command-name>'), user('Ajoute la pagination à /users\net des tests')].join('\n'));
  assert.strictEqual(h.title, 'Ajoute la pagination à /users');
  assert.strictEqual(h.cwd, '/home/a/monprojet');
});
t('encodage chemins', () => {
  assert.strictEqual(encodeProjectPath('/home/a/mon_projet'), '-home-a-mon-projet');
  assert.strictEqual(encodeProjectPath('C:\\Users\\a\\proj'), 'C--Users-a-proj');
});

t('scanner complet', () => {
  const root = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'pa-'));
  const proj = path.join(root, '-home-a-monprojet');
  const other = path.join(root, '-home-a-autre');
  fs.mkdirSync(path.join(proj, 'sess1', 'subagents'), { recursive: true });
  fs.mkdirSync(other);
  const now = Date.now();
  const write = (f, lines, ageMs) => {
    fs.writeFileSync(f, lines.join('\n') + '\n');
    const tm = (now - ageMs) / 1000;
    fs.utimesSync(f, tm, tm);
  };
  write(path.join(proj, 'sess1.jsonl'), [user('Refactor du module paiement'), tool('t', 'Task', { description: 'Explorer le code' })], 30_000);
  write(path.join(proj, 'sess1', 'subagents', 'agent-x.jsonl'), [user('Explore'), tool('g', 'Grep', { pattern: 'Wave' })], 1_000);
  write(path.join(proj, 'sess2.jsonl'), [user('Écris les tests'), tool('e', 'Write', { file_path: '/x/test_api.py' })], 20_000);
  write(path.join(proj, 'sess3.jsonl'), [user('Salut'), say('Bonjour !')], 2_000);
  write(path.join(proj, 'sess4.jsonl'), [user('Plan migration'), tool('p', 'ExitPlanMode', { plan: '...' })], 30_000);
  write(path.join(proj, 'vieux.jsonl'), [user('ancien')], 3 * 3600_000);
  write(path.join(other, 'z.jsonl'), [user('autre projet')], 1_000);

  const sc = new Scanner({
    projectsDir: root, workspaceFolders: ['/home/a/monprojet'], onlyCurrentWorkspace: true,
    activeWindowMs: 20 * 60_000, permissionDelayMs: 8_000,
  });
  const agents = sc.scan(now);
  const by = Object.fromEntries(agents.map((a) => [a.title, a]));
  assert.strictEqual(agents.length, 5, JSON.stringify(agents.map((a) => a.title)));
  assert.strictEqual(by['Plan migration'].state, 'planning');
  assert.strictEqual(by['Refactor du module paiement'].state, 'delegating');
  assert.strictEqual(by['Explore'].state, 'reading');
  assert.strictEqual(by['Explore'].isSub, true);
  assert.strictEqual(by['Explore'].parentId, by['Refactor du module paiement'].id);
  assert.strictEqual(by['Écris les tests'].state, 'permission');
  assert.strictEqual(by['Salut'].state, 'waiting');
  assert.strictEqual(by['Salut'].project, 'monprojet');

  // numéros stables entre deux scans
  const again = sc.scan(now);
  assert.deepStrictEqual(again.map((a) => a.num), agents.map((a) => a.num));

  // un nouveau sous-agent apparu après coup est bien vu malgré le cache de dossiers
  const later = now + 2000;
  fs.writeFileSync(path.join(proj, 'sess1', 'subagents', 'agent-y.jsonl'), [user('Nouveau'), tool('r', 'Read', { file_path: '/z.ts' })].join('\n') + '\n');
  fs.utimesSync(path.join(proj, 'sess1', 'subagents'), later / 1000, later / 1000);
  assert.ok(sc.scan(Date.now()).some((a) => a.title === 'Nouveau'));
  fs.rmSync(root, { recursive: true, force: true });
});

t('plan rédigé hors mode plan (mode auto)', () => {
  assert.ok(isPlanWork('Skill', 'superpowers:writing-plans'));
  assert.ok(isPlanWork('Write', '2026-10-09-migration-plan.md'));
  assert.ok(!isPlanWork('Write', 'explanation.md'));
  assert.ok(!isPlanWork('Skill', 'commit'));
  assert.ok(!isPlanWork('Read', 'plan.md'));
});

t('skill : réfléchit (le skill plan reste traité à part)', () => {
  assert.strictEqual(stateForTool('Skill'), 'thinking');
  assert.strictEqual(parseTail([user('go'), tool('s', 'Skill', { skill: 'test-driven-development' })].join('\n')).detail, 'test-driven-development');
});

t('planification par skills (superpowers) : détection', () => {
  assert.ok(isPlanWork('Skill', 'superpowers:brainstorming'));
  assert.ok(isPlanWork('Skill', 'superpowers:writing-plans'));
  assert.ok(isPlanWork('Skill', 'engineering:architecture'));
  assert.ok(!isPlanWork('Skill', 'superpowers:executing-plans'));
  assert.ok(!isPlanWork('Skill', 'frontend-design:frontend-design'));
  const f = '/p/docs/superpowers/plans/2026-10-10-feature.md';
  assert.strictEqual(parseTail([user('go'), tool('w', 'Write', { file_path: f })].join('\n')).detail, 'plans/2026-10-10-feature.md');
  assert.ok(isPlanWork('Write', 'plans/2026-10-10-feature.md'));
  assert.ok(isPlanWork('Write', 'specs/2026-10-10-feature-design.md'));
  assert.ok(!isPlanWork('Edit', 'app.ts'));
  assert.ok(isPlannerAgent('Plan') && isPlannerAgent('architect') && !isPlannerAgent('explorer'));
});
t('planification par skills : persiste pendant le brainstorming, s\'arrête au premier code', () => {
  const um = (text) => j({ type: 'user', permissionMode: 'auto', message: { role: 'user', content: text } });
  const brain = [um('on conçoit X'), tool('s', 'Skill', { skill: 'superpowers:brainstorming' }), result('s'), say('Question 1 ?'), um('réponse 1'), say('Question 2 ?')];
  const p1 = parseTail(brain.join('\n'));
  assert.strictEqual(p1.planSkill, true);
  assert.strictEqual(p1.planMode, false);
  const p2 = parseTail([...brain, tool('e', 'Edit', { file_path: '/p/src/app.ts' }), result('e'), say('fait')].join('\n'));
  assert.ok(!p2.planSkill);
  // écrire le plan lui-même ne l'arrête pas
  const p3 = parseTail([...brain, tool('w', 'Write', { file_path: '/p/docs/superpowers/plans/x.md' }), result('w'), say('plan écrit')].join('\n'));
  assert.strictEqual(p3.planSkill, true);
});

console.log(`\n${n} tests OK`);
