// Test de fumée : active l'extension compilée contre une API vscode simulée.
// Vérifie la vue, la publication des agents, l'installation/désinstallation des hooks et le journal.
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'rpa-smoke-'));
process.env.CLAUDE_CONFIG_DIR = path.join(tmp, 'claude');
process.env.REAL_PIXEL_AGENT_DIR = path.join(tmp, 'rpa');
const projects = path.join(tmp, 'claude', 'projects', '-ws');
fs.mkdirSync(projects, { recursive: true });
fs.writeFileSync(path.join(tmp, 'claude', 'settings.json'), JSON.stringify({ model: 'opus' }));
const line = (o) => JSON.stringify(o);
fs.writeFileSync(path.join(projects, 's1.jsonl'), [
  line({ type: 'user', cwd: '/ws', message: { role: 'user', content: 'Corrige le webhook' } }),
  line({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'Edit', input: { file_path: '/ws/hook.py' } }] } }),
].join('\n') + '\n');

// ---- API vscode simulée ----
const posted = [];
const infos = [];
const commands = new Map();
let provider = null;
const disposable = { dispose() {} };
const event = () => () => disposable;
const mem = new Map();
const vscode = {
  StatusBarAlignment: { Left: 1 },
  ViewColumn: { Beside: 2, Active: -1 },
  ThemeColor: class { constructor(id) { this.id = id; } },
  ThemeIcon: class { constructor(id) { this.id = id; } },
  Uri: { joinPath: (u, ...p) => ({ fsPath: path.join(u.fsPath, ...p) }), file: (f) => ({ fsPath: f }) },
  workspace: {
    name: 'ws', workspaceFolders: [{ uri: { fsPath: '/ws' } }],
    getConfiguration: () => ({ get: (k, d) => (k === 'projectsDir' ? path.join(tmp, 'claude', 'projects') : k === 'onlyCurrentWorkspace' ? false : d) }),
    onDidChangeConfiguration: event(),
  },
  window: {
    terminals: [],
    createStatusBarItem: () => ({ show() { this.shown = true; }, hide() {}, dispose() {} }),
    registerWebviewViewProvider: (id, p) => { provider = p; return disposable; },
    showInformationMessage: async (m, ...items) => { infos.push(m); return items.includes('Installer les hooks') ? 'Plus tard' : undefined; },
    showErrorMessage: async (m) => { infos.push('ERR ' + m); },
  },
  commands: { registerCommand: (id, f) => { commands.set(id, f); return disposable; }, executeCommand: async () => {} },
};
const realLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'vscode' ? vscode : realLoad.call(this, req, ...rest); };

const ext = require('../out/extension');
const ctx = {
  subscriptions: [],
  extensionUri: { fsPath: path.join(__dirname, '..') },
  asAbsolutePath: (p) => path.join(__dirname, '..', p),
  globalState: { get: (k, d) => (mem.has(k) ? mem.get(k) : d), update: async (k, v) => { mem.set(k, v); } },
};

(async () => {
  ext.activate(ctx);
  assert.ok(provider, 'vue enregistrée');
  for (const id of ['realPixelAgent.open', 'realPixelAgent.installHooks', 'realPixelAgent.uninstallHooks', 'realPixelAgent.journal']) assert.ok(commands.has(id), id);

  // une vue s'attache et demande les données
  let onMsg = null;
  const webview = {
    cspSource: 'vscode-resource:', options: {}, html: '',
    asWebviewUri: (u) => u.fsPath,
    postMessage: (m) => { posted.push(m); return Promise.resolve(true); },
    onDidReceiveMessage: (f) => { onMsg = f; return disposable; },
  };
  provider.resolveWebviewView({ webview, visible: true, onDidChangeVisibility: event(), onDidDispose: event() });
  assert.ok(webview.html.includes('id="journalPanel"') && webview.html.includes("script-src 'nonce-"), 'HTML + CSP');
  await onMsg({ type: 'ready' });
  const last = posted.filter((m) => m.type === 'agents').pop();
  assert.strictEqual(last.agents.length, 1);
  assert.strictEqual(last.agents[0].state, 'typing');
  assert.strictEqual(last.agents[0].title, 'Corrige le webhook');
  assert.strictEqual(last.hooks, 'off');

  // installation des hooks : settings préservés + script copié
  await commands.get('realPixelAgent.installHooks')();
  const s = JSON.parse(fs.readFileSync(path.join(tmp, 'claude', 'settings.json'), 'utf8'));
  assert.strictEqual(s.model, 'opus');
  assert.ok(s.hooks.PreToolUse[0].hooks[0].command.includes('real-pixel-agent-hook'));
  assert.ok(fs.existsSync(path.join(tmp, 'rpa', 'real-pixel-agent-hook.js')));
  assert.ok(fs.existsSync(path.join(tmp, 'claude', 'settings.json.real-pixel-agent.bak')));

  // un événement de hook rend l'état exact (permission) et passe le mode à « on »
  fs.mkdirSync(path.join(tmp, 'rpa', 'events'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'rpa', 'events', 's1.jsonl'), line({ e: 'PermissionRequest', t: Date.now(), sid: 's1', tool: 'Edit', input: { file_path: '/ws/hook.py' }, pids: [123] }) + '\n');
  await commands.get('realPixelAgent.refresh')();
  const after = posted.filter((m) => m.type === 'agents').pop();
  assert.strictEqual(after.agents[0].state, 'permission');
  assert.strictEqual(after.agents[0].exact, true);
  assert.strictEqual(after.hooks, 'on');

  // journal
  await onMsg({ type: 'getJournal' });
  assert.ok(posted.some((m) => m.type === 'journal'));

  // désinstallation : retour à l'état d'origine
  await commands.get('realPixelAgent.uninstallHooks')();
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(path.join(tmp, 'claude', 'settings.json'), 'utf8')), { model: 'opus' });

  for (const d of ctx.subscriptions) d.dispose();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('ok - activation, vue, hooks, journal (extension réelle, API vscode simulée)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
