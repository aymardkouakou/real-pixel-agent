import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { AgentInfo, AgentState, Scanner, ScannerOptions, defaultProjectsDir } from './scanner';
import {
  HookStore, claudeSettingsPath, dataDir, eventsDir, hookCommand, hooksStatus, mergeHooks, readSettings, removeHooks, writeSettings,
} from './hooks';
import { Journal } from './journal';
import { BODY } from './webviewBody';

const STATE_LABEL: Record<AgentState, string> = {
  typing: 'écrit du code',
  reading: 'lit des fichiers',
  running: 'exécute une commande',
  searching: 'cherche',
  delegating: 'délègue à un sous-agent',
  thinking: 'réfléchit',
  planning: 'rédige un plan',
  waiting: 'attend ta réponse',
  permission: 'attend une permission',
  sleeping: 'en pause',
};

export function activate(context: vscode.ExtensionContext) {
  const hub = new Hub(context);
  context.subscriptions.push(hub);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('realPixelAgent.office', {
      resolveWebviewView(view) {
        hub.attach(view.webview, view);
      },
    }, { webviewOptions: { retainContextWhenHidden: true } }),

    vscode.commands.registerCommand('realPixelAgent.open', () => hub.openPanel()),
    vscode.commands.registerCommand('realPixelAgent.newAgent', () => hub.newAgent()),
    vscode.commands.registerCommand('realPixelAgent.refresh', () => hub.refresh(true)),
    vscode.commands.registerCommand('realPixelAgent.installHooks', () => hub.installHooks()),
    vscode.commands.registerCommand('realPixelAgent.uninstallHooks', () => hub.uninstallHooks()),
    vscode.commands.registerCommand('realPixelAgent.journal', () => hub.showJournal()),
    vscode.commands.registerCommand('realPixelAgent.exportJournal', () => hub.exportJournal()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('realPixelAgent')) { hub.setupWatchers(); hub.refresh(true); }
    }),
  );
  hub.maybeOfferHooks();
}

export function deactivate() {}

interface Override { name?: string; seed?: number }

class Hub implements vscode.Disposable {
  private webviews = new Set<vscode.Webview>();
  private scanner: Scanner;
  private hooks = new HookStore();
  private journal: Journal;
  private timer: NodeJS.Timeout;
  private lastKey = '';
  private agents: AgentInfo[] = [];
  private prevStates = new Map<string, AgentState>();
  private status: vscode.StatusBarItem;
  private panel?: vscode.WebviewPanel;
  private visibleCount = 0;
  private watchers: fs.FSWatcher[] = [];
  private watchingTranscripts = false;
  private watchingEvents = false;
  private lastFull = 0;
  private lastTick = Date.now();
  private debounce?: NodeJS.Timeout;
  private overrides: Record<string, Override>;

  constructor(private ctx: vscode.ExtensionContext) {
    this.scanner = new Scanner(this.options());
    this.scanner.hooks = this.hooks;
    this.journal = new Journal(ctx.globalState);
    this.overrides = ctx.globalState.get<Record<string, Override>>('rpa.overrides', {});
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.status.command = 'realPixelAgent.open';
    this.refreshHookScript();
    this.setupWatchers();
    this.timer = setInterval(() => this.tick(), 1000);
    this.refresh(true);
  }

  private cfg() {
    return vscode.workspace.getConfiguration('realPixelAgent');
  }

  private options(): ScannerOptions {
    const c = this.cfg();
    return {
      projectsDir: c.get<string>('projectsDir') || defaultProjectsDir(),
      workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
      onlyCurrentWorkspace: c.get<boolean>('onlyCurrentWorkspace', true),
      showOtherWorkspaces: c.get<boolean>('showOtherWorkspaces', false),
      activeWindowMs: c.get<number>('activeWindowMinutes', 20) * 60_000,
      permissionDelayMs: c.get<number>('permissionDelaySeconds', 8) * 1000,
    };
  }

  // -------------------------------------------------------------------------
  // Surveillance : événements fichiers (immédiats) + scan de secours périodique
  // -------------------------------------------------------------------------
  setupWatchers() {
    for (const w of this.watchers) { try { w.close(); } catch { /* ignore */ } }
    this.watchers = [];
    this.watchingTranscripts = this.watchingEvents = false;
    const onChange = () => this.schedule();
    const dir = this.options().projectsDir;
    try {
      const w = fs.watch(dir, { recursive: true, persistent: false }, onChange);
      w.on('error', () => { this.watchingTranscripts = false; });
      this.watchers.push(w);
      this.watchingTranscripts = true;
    } catch { /* plateforme sans surveillance récursive ou dossier absent : on passe au scan périodique */ }
    if (this.cfg().get<boolean>('useHooks', true)) {
      try {
        fs.mkdirSync(eventsDir(), { recursive: true });
        const w = fs.watch(eventsDir(), { persistent: false }, onChange);
        w.on('error', () => { this.watchingEvents = false; });
        this.watchers.push(w);
        this.watchingEvents = true;
      } catch { /* ignore */ }
    }
  }

  private schedule() {
    if (this.debounce) return;
    this.debounce = setTimeout(() => { this.debounce = undefined; this.refresh(); }, 80);
  }

  /** Lecture disque puis publication. */
  refresh(force = false) {
    this.scanner.opts = this.options();
    try {
      if (this.cfg().get<boolean>('useHooks', true)) this.hooks.poll();
      this.scanner.hooks = this.cfg().get<boolean>('useHooks', true) ? this.hooks : undefined;
      this.scanner.refresh();
      this.lastFull = Date.now();
    } catch (err) {
      console.error('[real-pixel-agent]', err);
    }
    this.publish(force);
  }

  /** Chaque seconde : réévaluation sans I/O (sauf si la surveillance n'est pas disponible). */
  private tick() {
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    const needIO = !this.watchingTranscripts || (!this.watchingEvents && this.cfg().get<boolean>('useHooks', true)) || now - this.lastFull > 5000;
    if (needIO) this.refresh();
    else this.publish();
    this.journal.record(this.agents, Math.min(dt, 5000), now);
  }

  private publish(force = false) {
    let agents: AgentInfo[];
    try {
      agents = this.scanner.evaluate();
    } catch (err) {
      console.error('[real-pixel-agent]', err);
      return;
    }
    for (const a of agents) {
      const o = this.overrides[a.id];
      if (o?.name) a.title = o.name;
    }
    this.agents = agents;
    const key = JSON.stringify(agents.map((a) => [a.id, a.state, a.tool, a.detail, a.title, a.exact, Math.floor(a.lastActivity / 5000)]));
    if (force || key !== this.lastKey) {
      this.lastKey = key;
      this.broadcast();
      this.updateStatus();
      this.notifyTransitions();
    }
  }

  private hookMode(): 'on' | 'off' | 'installed' {
    if (!this.cfg().get<boolean>('useHooks', true)) return 'off';
    if (this.hooks.working) return 'on';
    try { return hooksStatus(readSettings()) === 'none' ? 'off' : 'installed'; } catch { return 'off'; }
  }

  private payload() {
    const c = this.cfg();
    return {
      type: 'agents',
      agents: this.agents,
      looks: Object.fromEntries(Object.entries(this.overrides).filter(([, o]) => o.seed !== undefined).map(([k, o]) => [k, o.seed])),
      scale: c.get<number>('scale', 3),
      meetingMode: c.get<string>('meetingMode', 'all'),
      sound: c.get<boolean>('sound', true),
      timeOfDay: c.get<string>('timeOfDay', 'auto'),
      renderer: c.get<string>('renderer', 'pixel'),
      hooks: this.hookMode(),
      workspace: vscode.workspace.name || 'Pixel HQ',
      labels: STATE_LABEL,
    };
  }

  private broadcast() {
    const msg = this.payload();
    for (const w of this.webviews) w.postMessage(msg);
  }

  private updateStatus() {
    const main = this.agents.filter((a) => !a.isSub && !a.external);
    if (!main.length) { this.status.hide(); return; }
    const waiting = this.agents.filter((a) => a.state === 'waiting' || (a.state === 'planning' && a.tool === 'ExitPlanMode')).length;
    const perm = this.agents.filter((a) => a.state === 'permission').length;
    let text = `$(hubot) ${main.length}`;
    if (perm) text += ` · $(bell-dot) ${perm}`;
    else if (waiting) text += ` · $(comment) ${waiting}`;
    this.status.text = text;
    const mode = this.hookMode();
    this.status.tooltip = [
      ...this.agents.map((a) => `${a.isSub ? '  ↳ ' : ''}#${a.num} ${a.title} — ${STATE_LABEL[a.state]}${a.detail ? ` (${a.detail})` : ''}`),
      '',
      mode === 'on' ? 'Suivi exact (hooks Claude Code)' : mode === 'installed' ? 'Hooks installés : relance tes sessions Claude Code' : 'Suivi estimé (hooks non installés)',
    ].join('\n');
    this.status.backgroundColor = perm ? new vscode.ThemeColor('statusBarItem.warningBackground') : undefined;
    this.status.show();
  }

  private notifyTransitions() {
    const notify = this.cfg().get<boolean>('notifyOnPermission', true);
    const next = new Map<string, AgentState>();
    for (const a of this.agents) {
      const prev = this.prevStates.get(a.id);
      if (notify && a.state === 'permission' && prev && prev !== 'permission' && this.visibleCount === 0) {
        const what = `${a.tool ?? ''} ${a.detail ?? ''}`.trim();
        vscode.window
          .showInformationMessage(`Agent #${a.num} (${a.project}) ${a.exact ? 'attend' : 'attend probablement'} ta permission${what ? ' : ' + what : ''}`, 'Voir le terminal', 'Voir le campus')
          .then((r) => {
            if (r === 'Voir le terminal') this.focusTerminal(a.id);
            else if (r) this.openPanel();
          });
      }
      next.set(a.id, a.state);
    }
    this.prevStates = next;
  }

  // -------------------------------------------------------------------------
  // Webviews
  // -------------------------------------------------------------------------
  attach(webview: vscode.Webview, host: vscode.WebviewView | vscode.WebviewPanel) {
    const media = vscode.Uri.joinPath(this.ctx.extensionUri, 'media');
    webview.options = { enableScripts: true, localResourceRoots: [media] };
    webview.html = this.html(webview);
    this.webviews.add(webview);

    const visible = () => ('visible' in host ? host.visible : true);
    let wasVisible = visible();
    if (wasVisible) this.visibleCount++;
    const onVis = 'onDidChangeVisibility' in host
      ? host.onDidChangeVisibility(() => {
          const v = visible();
          if (v !== wasVisible) { this.visibleCount += v ? 1 : -1; wasVisible = v; }
        })
      : (host as vscode.WebviewPanel).onDidChangeViewState((e) => {
          const v = e.webviewPanel.visible;
          if (v !== wasVisible) { this.visibleCount += v ? 1 : -1; wasVisible = v; }
        });

    const sub = webview.onDidReceiveMessage((m) => this.onMessage(m, webview));
    host.onDidDispose(() => {
      this.webviews.delete(webview);
      if (wasVisible) this.visibleCount--;
      sub.dispose();
      onVis.dispose();
    });
  }

  private async onMessage(m: any, webview: vscode.Webview) {
    switch (m?.type) {
      case 'ready':
        this.refresh(true);
        break;
      case 'newAgent':
        this.newAgent();
        break;
      case 'openTranscript': {
        const a = this.agents.find((x) => x.id === m.id);
        if (!a) return;
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(a.file));
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Active });
        await vscode.commands.executeCommand('cursorBottom');
        break;
      }
      case 'focusTerminal':
        await this.focusTerminal(m.id);
        break;
      case 'rename': {
        const a = this.agents.find((x) => x.id === m.id);
        if (!a) return;
        const name = await vscode.window.showInputBox({
          title: `Renommer l'agent #${a.num}`, value: this.overrides[a.id]?.name || a.title,
          prompt: 'Laisse vide pour revenir au titre de la session.',
        });
        if (name === undefined) return;
        this.setOverride(a.id, { name: name.trim() || undefined });
        break;
      }
      case 'reroll': {
        const cur = this.overrides[m.id]?.seed ?? 0;
        this.setOverride(m.id, { seed: m.reset ? undefined : cur + 1 });
        break;
      }
      case 'getJournal':
        webview.postMessage({ type: 'journal', days: this.journal.summary(7), labels: STATE_LABEL });
        break;
      case 'exportJournal':
        await this.exportJournal();
        break;
      case 'installHooks':
        await this.installHooks();
        break;
    }
  }

  private setOverride(id: string, patch: Override) {
    const o = { ...(this.overrides[id] || {}), ...patch };
    if (o.name === undefined) delete o.name;
    if (o.seed === undefined) delete o.seed;
    if (Object.keys(o).length) this.overrides[id] = o; else delete this.overrides[id];
    this.ctx.globalState.update('rpa.overrides', this.overrides);
    this.publish(true);
  }

  async focusTerminal(id: string) {
    const a = this.agents.find((x) => x.id === id);
    if (!a) return;
    const pids = a.pids || this.agents.find((x) => x.id === a.parentId)?.pids;
    if (pids?.length) {
      for (const t of vscode.window.terminals) {
        const pid = await t.processId;
        if (pid && pids.includes(pid)) { t.show(); return; }
      }
    }
    const byName = vscode.window.terminals.find((t) => t.name === `Claude #${a.num}`);
    if (byName) { byName.show(); return; }
    const mode = this.hookMode();
    const msg = mode === 'off'
      ? 'Terminal introuvable. Installe les hooks Claude Code pour relier automatiquement chaque agent à son terminal.'
      : "Terminal introuvable : cet agent ne tourne pas dans un terminal de cette fenêtre VS Code.";
    const r = await vscode.window.showInformationMessage(msg, ...(mode === 'off' ? ['Installer les hooks'] : []));
    if (r) await this.installHooks();
  }

  openPanel() {
    if (this.panel) { this.panel.reveal(); return; }
    this.panel = vscode.window.createWebviewPanel('realPixelAgent.panel', 'Real Pixel Agent', vscode.ViewColumn.Beside, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(this.ctx.extensionUri, 'media')],
    });
    this.panel.iconPath = vscode.Uri.joinPath(this.ctx.extensionUri, 'media', 'icon.svg');
    this.attach(this.panel.webview, this.panel);
    this.panel.onDidDispose(() => (this.panel = undefined));
  }

  showJournal() {
    if (!this.webviews.size) this.openPanel();
    setTimeout(() => { for (const w of this.webviews) w.postMessage({ type: 'openJournal' }); }, 400);
  }

  async exportJournal() {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || require('os').homedir(), 'journal-agents.csv')),
      filters: { CSV: ['csv'] },
    });
    if (!uri) return;
    fs.writeFileSync(uri.fsPath, this.journal.csv(STATE_LABEL));
    vscode.window.showInformationMessage(`Journal exporté : ${path.basename(uri.fsPath)}`);
  }

  newAgent() {
    const cmd = this.cfg().get<string>('claudeCommand', 'claude');
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const used = new Set(vscode.window.terminals.map((t) => t.name));
    let n = 1;
    while (used.has(`Claude #${n}`)) n++;
    const term = vscode.window.createTerminal({ name: `Claude #${n}`, cwd, iconPath: new vscode.ThemeIcon('hubot') });
    term.show();
    term.sendText(cmd);
  }

  // -------------------------------------------------------------------------
  // Hooks Claude Code
  // -------------------------------------------------------------------------
  private scriptPath() {
    return path.join(dataDir(), 'real-pixel-agent-hook.js');
  }

  /** Recopie le script de hook (mise à jour de l'extension) s'il est installé. */
  private refreshHookScript() {
    try {
      const target = this.scriptPath();
      if (!fs.existsSync(target)) return;
      const src = this.ctx.asAbsolutePath(path.join('hook', 'real-pixel-agent-hook.js'));
      if (fs.readFileSync(src, 'utf8') !== fs.readFileSync(target, 'utf8')) fs.copyFileSync(src, target);
    } catch { /* ignore */ }
  }

  private findNode(): string | undefined {
    const candidates: string[] = [];
    try {
      const out = cp.execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { encoding: 'utf8', timeout: 3000 });
      candidates.push(...out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
    } catch { /* ignore */ }
    candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node');
    return candidates.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } });
  }

  async maybeOfferHooks() {
    if (!this.cfg().get<boolean>('useHooks', true)) return;
    if (this.ctx.globalState.get<boolean>('rpa.hooksPromptDone')) return;
    let status: string;
    try { status = hooksStatus(readSettings()); } catch { return; }
    if (status === 'full') return;
    const r = await vscode.window.showInformationMessage(
      'Real Pixel Agent peut suivre tes agents avec précision (permissions exactes, mode plan, terminal de chaque agent) en ajoutant des hooks à ~/.claude/settings.json. Les hooks tournent en arrière-plan et ne modifient pas le comportement de Claude.',
      'Installer les hooks', 'Plus tard', 'Ne plus demander',
    );
    if (r === 'Installer les hooks') await this.installHooks();
    if (r === 'Ne plus demander' || r === 'Installer les hooks') this.ctx.globalState.update('rpa.hooksPromptDone', true);
  }

  async installHooks() {
    const file = claudeSettingsPath();
    let settings: Record<string, any>;
    try {
      settings = readSettings(file);
    } catch {
      const r = await vscode.window.showErrorMessage(`${file} n'est pas un JSON valide : je ne le modifie pas.`, 'Ouvrir le fichier');
      if (r) vscode.window.showTextDocument(vscode.Uri.file(file));
      return;
    }
    try {
      fs.mkdirSync(dataDir(), { recursive: true });
      fs.copyFileSync(this.ctx.asAbsolutePath(path.join('hook', 'real-pixel-agent-hook.js')), this.scriptPath());
      const node = this.findNode();
      const cmd = node ? hookCommand(node, this.scriptPath(), false) : hookCommand(process.execPath, this.scriptPath(), true);
      writeSettings(mergeHooks(settings, cmd), file);
      this.ctx.globalState.update('rpa.hooksPromptDone', true);
      this.setupWatchers();
      this.refresh(true);
      vscode.window.showInformationMessage(
        `Hooks installés dans ${file} (sauvegarde : settings.json.real-pixel-agent.bak). Relance les sessions Claude Code déjà ouvertes pour qu'elles les utilisent.`,
      );
    } catch (err: any) {
      vscode.window.showErrorMessage(`Installation des hooks impossible : ${err?.message || err}`);
    }
  }

  async uninstallHooks() {
    const file = claudeSettingsPath();
    try {
      const s = readSettings(file);
      if (hooksStatus(s) === 'none') { vscode.window.showInformationMessage('Aucun hook Real Pixel Agent à retirer.'); return; }
      writeSettings(removeHooks(s), file);
      vscode.window.showInformationMessage('Hooks Real Pixel Agent retirés. Tes autres hooks sont intacts.');
      this.refresh(true);
    } catch (err: any) {
      vscode.window.showErrorMessage(`Désinstallation impossible : ${err?.message || err}`);
    }
  }

  // -------------------------------------------------------------------------
  private html(webview: vscode.Webview): string {
    const media = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(this.ctx.extensionUri, 'media', f));
    const nonce = Array.from({ length: 24 }, () => Math.random().toString(36)[2]).join('');
    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource}; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${media('style.css')}">
<title>Real Pixel Agent</title>
</head>
<body>
${BODY}
${this.cfg().get<string>('renderer', 'pixel') === '3d' ? `  <script nonce="${nonce}" src="${media('scene3d.js')}"></script>\n` : ''}  <script nonce="${nonce}" src="${media('main.js')}"></script>
</body>
</html>`;
  }

  dispose() {
    clearInterval(this.timer);
    for (const w of this.watchers) { try { w.close(); } catch { /* ignore */ } }
    this.journal.flush();
    this.status.dispose();
    this.panel?.dispose();
  }
}
