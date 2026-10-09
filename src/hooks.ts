// Intégration des hooks Claude Code : installation dans settings.json et lecture des événements.
// Aucun import vscode : testable avec node.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { describeTool, HookSource, HookView } from './scanner';

export const HOOK_MARKER = 'real-pixel-agent-hook';
export const HOOK_EVENTS = [
  'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
  'PermissionRequest', 'PermissionDenied', 'Notification', 'Stop', 'SubagentStart', 'SubagentStop', 'SessionEnd',
];

export function dataDir(): string {
  return process.env.REAL_PIXEL_AGENT_DIR || path.join(os.homedir(), '.real-pixel-agent');
}
export function eventsDir(): string {
  return path.join(dataDir(), 'events');
}
export function claudeSettingsPath(): string {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'settings.json');
}

const q = (s: string) => `"${s.replace(/(["\\$`])/g, '\\$1')}"`;

/** Commande enregistrée dans settings.json. viaElectron : utilise le runtime de VS Code si node est absent. */
export function hookCommand(runtime: string, scriptPath: string, viaElectron: boolean): string {
  return `${viaElectron ? 'ELECTRON_RUN_AS_NODE=1 ' : ''}${q(runtime)} ${q(scriptPath)}`;
}

type Settings = Record<string, any>;
const isOurs = (h: any) => typeof h?.command === 'string' && h.command.includes(HOOK_MARKER);

function stripOurs(groups: any[]): any[] {
  return groups
    .map((g) => (g && Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h: any) => !isOurs(h)) } : g))
    .filter((g) => !g || !Array.isArray(g.hooks) || g.hooks.length > 0);
}

/** Ajoute (ou remplace) nos hooks sans toucher aux autres. */
export function mergeHooks(settings: Settings, command: string): Settings {
  const s: Settings = { ...settings };
  const hooks: Record<string, any[]> = { ...(s.hooks || {}) };
  for (const ev of HOOK_EVENTS) {
    const groups = stripOurs(Array.isArray(hooks[ev]) ? hooks[ev] : []);
    groups.push({ hooks: [{ type: 'command', command, async: true, timeout: 10 }] });
    hooks[ev] = groups;
  }
  s.hooks = hooks;
  return s;
}

/** Retire uniquement nos hooks. */
export function removeHooks(settings: Settings): Settings {
  const s: Settings = { ...settings };
  if (!s.hooks || typeof s.hooks !== 'object') return s;
  const hooks: Record<string, any[]> = { ...s.hooks };
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue;
    const g = stripOurs(hooks[ev]);
    if (g.length) hooks[ev] = g; else delete hooks[ev];
  }
  if (Object.keys(hooks).length) s.hooks = hooks; else delete s.hooks;
  return s;
}

export function hooksStatus(settings: Settings): 'none' | 'partial' | 'full' {
  const has = (ev: string) => Array.isArray(settings?.hooks?.[ev]) && settings.hooks[ev].some((g: any) => Array.isArray(g?.hooks) && g.hooks.some(isOurs));
  const n = HOOK_EVENTS.filter(has).length;
  return n === 0 ? 'none' : n === HOOK_EVENTS.length ? 'full' : 'partial';
}

export function readSettings(file = claudeSettingsPath()): Settings {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw); // lève une erreur si le fichier est invalide : on ne l'écrase jamais dans ce cas
}

export function writeSettings(settings: Settings, file = claudeSettingsPath()): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const backup = file + '.real-pixel-agent.bak';
  if (fs.existsSync(file) && !fs.existsSync(backup)) fs.copyFileSync(file, backup);
  const tmp = file + '.tmp-rpa';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// Lecture des événements
// ---------------------------------------------------------------------------

export interface HookEvent {
  e: string; t: number; sid: string; aid?: string; atype?: string; pm?: string;
  tool?: string; input?: Record<string, string>; nt?: string; msg?: string; pids?: number[]; cwd?: string;
}

export interface HookState extends HookView {
  t: number;
  last: string;
  tool?: string;
  detail?: string;
  subType?: string;
  pm?: string;
  perm: boolean;
  idle: boolean;
  stopped: boolean;
  ended: boolean;
  pids?: number[];
}

const isPermNotif = (ev: HookEvent) => ev.nt === 'permission_prompt' || /permission/i.test(ev.msg || '');
const isIdleNotif = (ev: HookEvent) => ev.nt === 'idle_prompt' || /waiting for your input/i.test(ev.msg || '');

export function reduceHook(prev: HookState | undefined, ev: HookEvent): HookState {
  const s: HookState = prev ? { ...prev } : { t: 0, last: '', perm: false, idle: false, stopped: false, ended: false };
  s.t = Math.max(s.t, ev.t || 0);
  s.last = ev.e;
  if (ev.pm) s.pm = ev.pm;
  if (ev.pids && ev.pids.length) s.pids = ev.pids;
  switch (ev.e) {
    case 'SessionStart':
      Object.assign(s, { ended: false, stopped: true, perm: false, idle: false, tool: undefined, detail: undefined });
      break;
    case 'UserPromptSubmit':
    case 'SubagentStart':
      Object.assign(s, { ended: false, stopped: false, perm: false, idle: false, tool: undefined, detail: undefined });
      break;
    case 'PreToolUse':
      Object.assign(s, { tool: ev.tool, detail: describeTool(ev.tool || '', ev.input), subType: ev.input?.subagent_type, perm: false, stopped: false, idle: false });
      break;
    case 'PermissionRequest':
      s.perm = true;
      if (ev.tool) { s.tool = ev.tool; s.detail = describeTool(ev.tool, ev.input); }
      break;
    case 'Notification':
      if (isPermNotif(ev)) s.perm = true;
      else if (isIdleNotif(ev)) { s.idle = true; s.perm = false; }
      break;
    case 'PostToolUse': case 'PostToolUseFailure': case 'PermissionDenied':
      Object.assign(s, { perm: false, tool: undefined, detail: undefined, subType: undefined });
      break;
    case 'Stop': case 'SubagentStop':
      Object.assign(s, { stopped: true, perm: false, tool: undefined, detail: undefined });
      break;
    case 'SessionEnd':
      s.ended = true;
      break;
  }
  return s;
}

/** Clé d'état : la session, ou session/agent-<id> pour un sous-agent. */
export const hookKey = (sid: string, aid?: string) => (aid ? `${sid}/agent-${aid}` : sid);

/** Lit les fichiers d'événements de façon incrémentale (seuls les octets ajoutés). */
export class HookStore implements HookSource {
  private states = new Map<string, HookState>();
  private offsets = new Map<string, number>();
  private lastEventAt = 0;

  constructor(public dir = eventsDir(), private recentMs = 24 * 3600_000) {}

  /** Retourne true si un nouvel événement a été lu. */
  poll(now = Date.now()): boolean {
    let names: string[];
    try { names = fs.readdirSync(this.dir).filter((n) => n.endsWith('.jsonl')); } catch { return false; }
    let changed = false;
    for (const n of names) {
      const f = path.join(this.dir, n);
      let st: fs.Stats;
      try { st = fs.statSync(f); } catch { continue; }
      let off = this.offsets.get(f);
      if (off === undefined) {
        if (now - st.mtimeMs > this.recentMs) {
          this.offsets.set(f, st.size);
          if (now - st.mtimeMs > 3 * 24 * 3600_000) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
          continue;
        }
        off = 0;
      }
      if (st.size < off) { off = 0; this.dropSession(n.replace(/\.jsonl$/, '')); }
      if (st.size === off) continue;
      const fd = fs.openSync(f, 'r');
      let text = '';
      try {
        const b = Buffer.alloc(st.size - off);
        fs.readSync(fd, b, 0, b.length, off);
        text = b.toString('utf8');
      } finally { fs.closeSync(fd); }
      const end = text.lastIndexOf('\n');
      if (end < 0) continue;
      this.offsets.set(f, off + Buffer.byteLength(text.slice(0, end + 1)));
      for (const line of text.slice(0, end).split('\n')) {
        if (!line.trim()) continue;
        let ev: HookEvent;
        try { ev = JSON.parse(line); } catch { continue; }
        if (!ev.sid || !ev.e) continue;
        const k = hookKey(ev.sid, ev.aid);
        this.states.set(k, reduceHook(this.states.get(k), ev));
        // un sous-agent lancé ou terminé est aussi un signal pour la session parente
        if (ev.aid && (ev.e === 'SubagentStart' || ev.e === 'SubagentStop')) {
          const p = this.states.get(ev.sid);
          if (p) this.states.set(ev.sid, { ...p, t: Math.max(p.t, ev.t) });
        }
        this.lastEventAt = Math.max(this.lastEventAt, ev.t || 0);
        changed = true;
      }
    }
    return changed;
  }

  private dropSession(sid: string) {
    for (const k of [...this.states.keys()]) if (k === sid || k.startsWith(sid + '/')) this.states.delete(k);
  }

  get(sid: string, sub?: string): HookState | undefined {
    return this.states.get(sub ? `${sid}/${sub}` : sid);
  }

  /** Vrai si des hooks ont produit des événements récemment (installation fonctionnelle). */
  get working(): boolean {
    return Date.now() - this.lastEventAt < this.recentMs;
  }
}
