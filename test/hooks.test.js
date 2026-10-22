// Tests des hooks : node test/hooks.test.js (après npm run compile)
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { mergeHooks, removeHooks, hooksStatus, reduceHook, HookStore, HOOK_EVENTS, hookCommand } = require('../out/hooks');
const { Scanner } = require('../out/scanner');

let n = 0;
function t(name, fn) { fn(); n++; console.log('ok -', name); }
const tmp = () => fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'rpa-'));
const SCRIPT = path.join(__dirname, '..', 'hook', 'real-pixel-agent-hook.js');

t('fusion dans settings.json sans toucher aux hooks existants', () => {
  const user = { model: 'opus', hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-guard.sh' }] }] } };
  const cmd = hookCommand('/usr/bin/node', '/h/.real-pixel-agent/real-pixel-agent-hook.js', false);
  const s = mergeHooks(user, cmd);
  assert.strictEqual(s.model, 'opus');
  assert.strictEqual(hooksStatus(s), 'full');
  assert.strictEqual(s.hooks.PreToolUse.length, 2);
  assert.strictEqual(s.hooks.PreToolUse[0].hooks[0].command, 'my-guard.sh');
  assert.strictEqual(s.hooks.PreToolUse[1].hooks[0].async, true);
  // réinstaller ne duplique pas
  const s2 = mergeHooks(s, cmd);
  assert.strictEqual(s2.hooks.PreToolUse.length, 2);
  assert.strictEqual(Object.keys(s2.hooks).length, HOOK_EVENTS.length);
  // désinstaller rend l'état d'origine
  const s3 = removeHooks(s2);
  assert.deepStrictEqual(s3, user);
  assert.strictEqual(hooksStatus(s3), 'none');
  assert.deepStrictEqual(removeHooks(mergeHooks({}, cmd)), {});
});

t('removeHooks réversible : cas limites', () => {
  const cmd = hookCommand('/usr/bin/node', '/h/real-pixel-agent-hook.js', false);
  const cases = [
    { hooks: { Stop: [{ hooks: [] }] } },
    { hooks: { Stop: [{ matcher: 'x', hooks: [{ type: 'command', command: 'a.sh' }, { type: 'command', command: 'b.sh' }] }] } },
    { hooks: { Stop: 'invalide' } },
    { a: 1, hooks: { Custom: [{ hooks: [{ type: 'command', command: 'c.sh' }] }] } },
  ];
  for (const c of cases) {
    const merged = mergeHooks(c, cmd);
    assert.deepStrictEqual(removeHooks(merged), c, JSON.stringify(c));
    assert.deepStrictEqual(removeHooks(removeHooks(merged)), c, 'idempotent');
    assert.deepStrictEqual(mergeHooks(merged, cmd), merged, 'merge idempotent');
  }
  // un événement vide qui n'a pas reçu nos hooks n'est jamais touché
  assert.deepStrictEqual(removeHooks({ hooks: { Stop: [] } }), { hooks: { Stop: [] } });
  assert.deepStrictEqual(removeHooks({}), {});
});

t('writeSettings atomique + désinstallation complète', () => {
  const dir = tmp();
  const file = path.join(dir, 'settings.json');
  const user = { model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'mine.sh' }] }] } };
  fs.writeFileSync(file, JSON.stringify(user));
  const { writeSettings, readSettings } = require('../out/hooks');
  const script = path.join(dir, 'real-pixel-agent-hook.js');
  fs.writeFileSync(script, '//');
  writeSettings(mergeHooks(readSettings(file), hookCommand('/n', script, false)), file);
  assert.ok(fs.existsSync(file + '.real-pixel-agent.bak'));
  assert.ok(!fs.existsSync(file + '.tmp-rpa'));
  require('../out/uninstall').cleanup(file, dir);
  assert.deepStrictEqual(readSettings(file), user);
  assert.ok(!fs.existsSync(script));
  // JSON invalide : jamais écrasé
  fs.writeFileSync(file, '{ pas du json');
  require('../out/uninstall').cleanup(file, dir);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ pas du json');
  fs.rmSync(dir, { recursive: true, force: true });
});

t('commande avec runtime VS Code et chemins à espaces', () => {
  const c = hookCommand('/Applications/Visual Studio Code.app/Contents/MacOS/Electron', '/Users/a b/.real-pixel-agent/real-pixel-agent-hook.js', true);
  assert.ok(c.startsWith('ELECTRON_RUN_AS_NODE=1 "/Applications/Visual Studio Code.app'));
  assert.ok(c.includes('real-pixel-agent-hook'));
});

t('réducteur : outil, permission, résultat, fin de tour', () => {
  let s = reduceHook(undefined, { e: 'UserPromptSubmit', t: 1, sid: 's', pm: 'default' });
  s = reduceHook(s, { e: 'PreToolUse', t: 2, sid: 's', tool: 'Bash', input: { command: 'npm test', description: 'Tests' } });
  assert.strictEqual(s.tool, 'Bash'); assert.strictEqual(s.detail, 'Tests'); assert.strictEqual(s.perm, false);
  s = reduceHook(s, { e: 'PermissionRequest', t: 3, sid: 's', tool: 'Bash', input: { command: 'rm -rf build' } });
  assert.strictEqual(s.perm, true);
  s = reduceHook(s, { e: 'PostToolUse', t: 4, sid: 's', tool: 'Bash' });
  assert.strictEqual(s.perm, false); assert.strictEqual(s.tool, undefined);
  s = reduceHook(s, { e: 'Notification', t: 5, sid: 's', msg: 'Claude needs your permission to use Write' });
  assert.strictEqual(s.perm, true);
  s = reduceHook(s, { e: 'Stop', t: 6, sid: 's' });
  assert.strictEqual(s.perm, false); assert.strictEqual(s.stopped, true);
  s = reduceHook(s, { e: 'Notification', t: 7, sid: 's', nt: 'idle_prompt', msg: 'Claude is waiting for your input' });
  assert.strictEqual(s.idle, true); assert.strictEqual(s.perm, false);
});

t('script de hook : écrit l\'événement, rien sur stdout, code 0', () => {
  const dir = tmp();
  const input = JSON.stringify({ session_id: 'abc-123', hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: '/p/app.ts', old_string: 'x'.repeat(5000) }, permission_mode: 'plan', cwd: '/p' });
  const r = cp.spawnSync(process.execPath, [SCRIPT], { input, env: { ...process.env, REAL_PIXEL_AGENT_DIR: dir }, encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, '');
  const line = JSON.parse(fs.readFileSync(path.join(dir, 'events', 'abc-123.jsonl'), 'utf8').trim());
  assert.strictEqual(line.e, 'PreToolUse');
  assert.strictEqual(line.input.file_path, '/p/app.ts');
  assert.strictEqual(line.input.old_string, undefined); // contenu volumineux non recopié
  assert.strictEqual(line.pm, 'plan');
  // entrée invalide ou session suspecte : toujours code 0, rien écrit
  const bad = cp.spawnSync(process.execPath, [SCRIPT], { input: '{"session_id":"../../etc"}', env: { ...process.env, REAL_PIXEL_AGENT_DIR: dir }, encoding: 'utf8' });
  assert.strictEqual(bad.status, 0);
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'events')), ['abc-123.jsonl']);
  const garbage = cp.spawnSync(process.execPath, [SCRIPT], { input: 'pas du json', env: { ...process.env, REAL_PIXEL_AGENT_DIR: dir }, encoding: 'utf8' });
  assert.strictEqual(garbage.status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('HookStore : lecture incrémentale et sous-agents', () => {
  const dir = tmp();
  const f = path.join(dir, 's1.jsonl');
  const now = Date.now();
  fs.writeFileSync(f, JSON.stringify({ e: 'UserPromptSubmit', t: now, sid: 's1', pids: [42, 7] }) + '\n');
  const store = new HookStore(dir);
  assert.strictEqual(store.poll(now), true);
  assert.deepStrictEqual(store.get('s1').pids, [42, 7]);
  assert.strictEqual(store.poll(now), false); // rien de nouveau
  fs.appendFileSync(f, JSON.stringify({ e: 'PreToolUse', t: now + 1, sid: 's1', aid: 'x9', tool: 'Grep', input: { pattern: 'Wave' } }) + '\n');
  fs.appendFileSync(f, '{"e":"Stop","t":'); // ligne en cours d'écriture : ignorée pour l'instant
  assert.strictEqual(store.poll(now), true);
  assert.strictEqual(store.get('s1', 'agent-x9').tool, 'Grep');
  fs.appendFileSync(f, `${now + 2},"sid":"s1"}\n`);
  store.poll(now);
  assert.strictEqual(store.get('s1').stopped, true);
  assert.strictEqual(store.working, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('scanner + hooks : permission exacte, fin de session, mode plan', () => {
  const root = tmp();
  const proj = path.join(root, '-w');
  fs.mkdirSync(proj);
  const now = Date.now();
  const line = (o) => JSON.stringify(o);
  const tr = (f, lines, age) => { fs.writeFileSync(f, lines.map(line).join('\n') + '\n'); const s = (now - age) / 1000; fs.utimesSync(f, s, s); };
  const prompt = { type: 'user', message: { role: 'user', content: 'go' } };
  const bashTool = { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'make' } }] } };
  tr(path.join(proj, 'long.jsonl'), [prompt, bashTool], 60_000);   // longue commande, pas de permission
  tr(path.join(proj, 'perm.jsonl'), [prompt, bashTool], 1_000);    // permission demandée tout de suite
  tr(path.join(proj, 'gone.jsonl'), [prompt], 1_000);              // session fermée
  tr(path.join(proj, 'plan.jsonl'), [prompt], 1_000);              // mode plan selon le hook
  const states = {
    long: { t: now - 60_000, last: 'PreToolUse', tool: 'Bash', perm: false, idle: false, stopped: false, ended: false },
    perm: { t: now - 500, last: 'PermissionRequest', tool: 'Bash', detail: 'make', perm: true, idle: false, stopped: false, ended: false, pids: [99] },
    gone: { t: now, last: 'SessionEnd', perm: false, idle: false, stopped: true, ended: true },
    plan: { t: now - 800, last: 'UserPromptSubmit', pm: 'plan', perm: false, idle: false, stopped: false, ended: false },
  };
  const sc = new Scanner({ projectsDir: root, workspaceFolders: [], onlyCurrentWorkspace: false, activeWindowMs: 3600_000, permissionDelayMs: 8000 });
  sc.hooks = { get: (sid, sub) => (sub ? undefined : states[sid]) };
  const by = Object.fromEntries(sc.scan(now).map((a) => [a.id.split('/')[1], a]));
  assert.strictEqual(by.long.state, 'running');        // l'heuristique aurait dit « permission »
  assert.strictEqual(by.perm.state, 'permission');
  assert.deepStrictEqual(by.perm.pids, [99]);
  assert.strictEqual(by.perm.exact, true);
  assert.strictEqual(by.gone, undefined);
  assert.strictEqual(by.plan.state, 'planning');
  fs.rmSync(root, { recursive: true, force: true });
});

t('lecture incrémentale : seuls les octets ajoutés sont lus', () => {
  const root = tmp();
  const proj = path.join(root, '-w');
  fs.mkdirSync(proj);
  const f = path.join(proj, 's.jsonl');
  const big = { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'r0', content: 'x'.repeat(100_000) }] } };
  fs.writeFileSync(f, [{ type: 'user', message: { role: 'user', content: 'Gros fichier' } }, big].map((o) => JSON.stringify(o)).join('\n') + '\n');
  const sc = new Scanner({ projectsDir: root, workspaceFolders: [], onlyCurrentWorkspace: false, activeWindowMs: 3600_000, permissionDelayMs: 8000 });
  sc.scan();
  const before = sc.bytesRead;
  const add = JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'e', name: 'Edit', input: { file_path: '/a/b.ts' } }] } }) + '\n';
  fs.appendFileSync(f, add);
  const a = sc.scan();
  assert.strictEqual(sc.bytesRead - before, Buffer.byteLength(add));
  assert.strictEqual(a[0].state, 'typing');
  assert.strictEqual(a[0].title, 'Gros fichier');
  // ligne partielle : pas consommée tant que le saut de ligne n'est pas écrit
  const r = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'e', content: 'ok' }] } });
  fs.appendFileSync(f, r.slice(0, 20));
  assert.strictEqual(sc.scan()[0].state, 'typing');
  fs.appendFileSync(f, r.slice(20) + '\n');
  assert.strictEqual(sc.scan()[0].state, 'thinking');
  fs.rmSync(root, { recursive: true, force: true });
});

t('journal : cumul par état, résumé et CSV', () => {
  const { Journal, dayKey } = require('../out/journal');
  const mem = new Map();
  const store = { get: (k, d) => (mem.has(k) ? mem.get(k) : d), update: (k, v) => { mem.set(k, JSON.parse(JSON.stringify(v))); } };
  const j = new Journal(store);
  const now = new Date(2026, 9, 9, 10).getTime();
  const a = { id: 'p/s1', num: 1, title: 'Refactor', project: 'finapay', isSub: false, state: 'typing' };
  j.record([a], 60_000, now);
  j.record([{ ...a, state: 'waiting' }], 30_000, now);
  j.flush(now);
  const s = new Journal(store).summary();
  assert.strictEqual(s[0].day, dayKey(now));
  assert.strictEqual(s[0].agents[0].ms.typing, 60_000);
  assert.strictEqual(s[0].agents[0].total, 90_000);
  const csv = j.csv({ typing: 'écrit du code', waiting: 'attend' });
  assert.ok(csv.includes('"écrit du code";1.0'));
});

t('journal : CSV neutralise les formules et commence par un BOM', () => {
  const { Journal } = require('../out/journal');
  const store = { get: (k, d) => d, update: () => {} };
  const j = new Journal(store);
  j.record([{ id: 'p/s', num: 1, title: '=HYPERLINK("http://x")', project: '@cmd', isSub: false, state: 'typing' }], 60_000, Date.now());
  const csv = j.csv({ typing: 'écrit' });
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"")"`), csv);
  assert.ok(csv.includes(`"'@cmd"`), csv);
});

t('settings.json : lien symbolique conservé, JSON non objet refusé, hooks mal formés refusés', () => {
  const { writeSettings, readSettings } = require('../out/hooks');
  const dir = tmp();
  const real = path.join(dir, 'dotfiles-settings.json');
  const link = path.join(dir, 'settings.json');
  fs.writeFileSync(real, '{"model":"opus"}');
  fs.symlinkSync(real, link);
  writeSettings({ model: 'sonnet' }, link);
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'le lien doit rester un lien');
  assert.strictEqual(JSON.parse(fs.readFileSync(real, 'utf8')).model, 'sonnet');
  fs.writeFileSync(link, 'null');
  assert.throws(() => readSettings(link));
  fs.writeFileSync(link, '[]');
  assert.throws(() => readSettings(link));
  assert.throws(() => mergeHooks({ hooks: [] }, 'cmd'));
  fs.rmSync(dir, { recursive: true, force: true });
});

t('hook : secrets masqués et fichiers privés', () => {
  const dir = tmp();
  const input = JSON.stringify({
    session_id: 's-secret', hook_event_name: 'PreToolUse', tool_name: 'Bash',
    tool_input: { command: 'curl -H "Authorization: Bearer abcdef1234567890" https://x --token=hunter2 API_KEY=abc123' },
  });
  cp.execFileSync(process.execPath, [SCRIPT], { input, env: { ...process.env, REAL_PIXEL_AGENT_DIR: dir } });
  const f = path.join(dir, 'events', 's-secret.jsonl');
  const line = fs.readFileSync(f, 'utf8');
  for (const secret of ['abcdef1234567890', 'hunter2', 'abc123']) assert.ok(!line.includes(secret), `${secret} fuit : ${line}`);
  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(f).mode & 0o077, 0, 'fichier d\'événements privé');
    assert.strictEqual(fs.statSync(path.join(dir, 'events')).mode & 0o077, 0, 'dossier privé');
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

t('HookStore : rotation du fichier sans perdre les pids de la session', () => {
  const dir = tmp();
  const f = path.join(dir, 's1.jsonl');
  const line = (o) => JSON.stringify({ sid: 's1', t: Date.now(), ...o }) + '\n';
  fs.writeFileSync(f, line({ e: 'SessionStart', pids: [42] }) + line({ e: 'PreToolUse', tool: 'Bash' }) + line({ e: 'PostToolUse', tool: 'Bash' }));
  const store = new HookStore(dir);
  store.poll();
  assert.deepStrictEqual(store.get('s1').pids, [42]);
  fs.writeFileSync(f + '.tmp', line({ e: 'Stop' }));
  fs.renameSync(f + '.tmp', f); // rotation : nouveau fichier plus court
  store.poll();
  assert.strictEqual(store.get('s1').stopped, true);
  assert.deepStrictEqual(store.get('s1').pids, [42]);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('désinstallation : retire aussi le dossier des événements', () => {
  const { cleanup } = require('../out/uninstall');
  const dir = tmp();
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, '{}');
  fs.mkdirSync(path.join(dir, 'data', 'events'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'data', 'events', 'a.jsonl'), '{}\n');
  cleanup(file, path.join(dir, 'data'));
  assert.ok(!fs.existsSync(path.join(dir, 'data')));
  fs.rmSync(dir, { recursive: true, force: true });
});

t('updateSettings : refait la fusion si le fichier change pendant l\'écriture', () => {
  const { updateSettings } = require('../out/hooks');
  const dir = tmp();
  const file = path.join(dir, 'settings.json');
  fs.writeFileSync(file, '{"a":1}');
  let calls = 0;
  updateSettings((cur) => {
    if (++calls === 1) fs.writeFileSync(file, '{"a":1,"concurrent":true}'); // écriture concurrente
    return { ...cur, mine: true };
  }, file);
  const out = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(out, { a: 1, concurrent: true, mine: true });
  assert.strictEqual(calls, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('hook : masquage élargi (JWT, URL, en-têtes, chaînes opaques)', () => {
  const dir = tmp();
  const cmd = 'curl https://u:pw0rdsecret@h.io/x?access_token=zzz111 -H "X-Api-Key: kkk222" -H "Cookie: sid=ccc333" eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4 ' + 'A'.repeat(48);
  const input = JSON.stringify({ session_id: 's-r2', hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd } });
  cp.execFileSync(process.execPath, [SCRIPT], { input, env: { ...process.env, REAL_PIXEL_AGENT_DIR: dir } });
  const line = fs.readFileSync(path.join(dir, 'events', 's-r2.jsonl'), 'utf8');
  for (const x of ['pw0rdsecret', 'zzz111', 'kkk222', 'ccc333', 'SflKxwRJSMeKKF2QT4', 'AAAAAAAAAAAAAAAA']) assert.ok(!line.includes(x), `${x} fuit : ${line}`);
  assert.ok(line.includes('curl https://'), 'le reste de la commande reste lisible');
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\n${n} tests OK`);
