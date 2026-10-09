// Lecture des transcriptions Claude Code (~/.claude/projects/**/*.jsonl)
// et déduction de l'état de chaque agent. Aucun import vscode ici : testable avec node.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export type AgentState =
  | 'typing'      // Edit / Write
  | 'reading'     // Read / Grep / Glob
  | 'running'     // Bash
  | 'searching'   // WebFetch / WebSearch / outils MCP
  | 'delegating'  // Task / Agent (sous-agent)
  | 'thinking'    // le modèle travaille entre deux outils
  | 'planning'    // mode plan / rédaction d'un plan -> réunion en salle de plan
  | 'waiting'     // tour terminé, attend ta réponse
  | 'permission'  // outil en attente depuis trop longtemps -> probablement une demande de permission
  | 'sleeping';   // inactif depuis plusieurs minutes

export interface AgentInfo {
  id: string;
  num: number;
  file: string;
  project: string;
  title: string;
  state: AgentState;
  tool?: string;
  detail?: string;
  isSub: boolean;
  parentId?: string;
  lastActivity: number;
  /** état issu des hooks Claude Code (exact) plutôt que déduit de la transcription */
  exact?: boolean;
  /** agent d'un autre workspace (bâtiment annexe) */
  external?: boolean;
  /** processus parents de Claude (pour retrouver son terminal) */
  pids?: number[];
}

export interface ScannerOptions {
  projectsDir: string;
  workspaceFolders: string[];
  onlyCurrentWorkspace: boolean;
  activeWindowMs: number;
  permissionDelayMs: number;
  showOtherWorkspaces?: boolean;
}

type Kind = 'tool' | 'toolResult' | 'userPrompt' | 'assistantText' | 'thinking' | 'interrupted' | 'none';

export interface Parsed {
  kind: Kind;
  tool?: string;
  detail?: string;
  subType?: string;
  planMode?: boolean;
}

const HEAD_BYTES = 64 * 1024;

export function defaultProjectsDir(): string {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}

/** Claude Code nomme le dossier d'un projet en remplaçant tout caractère non alphanumérique par '-'. */
export function encodeProjectPath(p: string): string {
  return p.replace(/[^a-zA-Z0-9]/g, '-');
}

function trunc(s: unknown, n = 48): string {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function stateForTool(name: string): AgentState {
  switch (name) {
    case 'Edit': case 'MultiEdit': case 'Write': case 'NotebookEdit':
      return 'typing';
    case 'Read': case 'Grep': case 'Glob': case 'LS': case 'NotebookRead':
      return 'reading';
    case 'Bash': case 'BashOutput': case 'KillShell': case 'KillBash':
      return 'running';
    case 'WebFetch': case 'WebSearch':
      return 'searching';
    case 'Task': case 'Agent':
      return 'delegating';
    case 'AskUserQuestion':
      return 'waiting';
    case 'ExitPlanMode': case 'EnterPlanMode':
      return 'planning';
    case 'TodoWrite':
      return 'thinking';
    default:
      return name.startsWith('mcp__') ? 'searching' : 'running';
  }
}

export function describeTool(name: string, input: any): string {
  const i = input || {};
  const base = (p: unknown) => (p ? path.basename(String(p)) : '');
  switch (name) {
    case 'Read': case 'Write': case 'Edit': case 'MultiEdit':
      return base(i.file_path);
    case 'NotebookEdit': case 'NotebookRead':
      return base(i.notebook_path);
    case 'Bash':
      return trunc(i.description || i.command);
    case 'Grep': case 'Glob':
      return trunc(i.pattern);
    case 'WebFetch':
      try { return new URL(String(i.url)).host; } catch { return trunc(i.url); }
    case 'WebSearch':
      return trunc(i.query);
    case 'Task': case 'Agent':
      return trunc(i.description || i.subagent_type);
    case 'TodoWrite':
      return 'liste de tâches';
    case 'ExitPlanMode':
      return 'plan prêt, à valider';
    case 'EnterPlanMode':
      return 'passe en mode plan';
    default:
      return name.startsWith('mcp__') ? trunc(name.split('__').slice(1).join(' › ')) : '';
  }
}

function textOf(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
  }
  return '';
}

// ---------------------------------------------------------------------------
// Résumé compact d'une ligne de transcription : c'est tout ce qu'on garde en mémoire.
// ---------------------------------------------------------------------------
interface ToolRef { id: string; name: string; detail: string; subType?: string }
export interface Entry {
  type: 'user' | 'assistant';
  meta?: boolean;
  pm?: string;              // permissionMode
  results?: string[];       // tool_use_id résolus
  interrupted?: boolean;
  command?: boolean;
  planOn?: boolean;
  planOff?: boolean;
  tools?: ToolRef[];
  hasText?: boolean;
  hasThinking?: boolean;
}

const PLAN_ON = /Plan mode is active|plan mode is now active|Entered plan mode/i;
const PLAN_OFF = /approved your plan|exited plan mode/i;

export function summarize(e: any): Entry | null {
  if (!e || (e.type !== 'user' && e.type !== 'assistant')) return null;
  const c = e.message?.content;
  if (e.type === 'user') {
    const out: Entry = { type: 'user' };
    if (e.isMeta) out.meta = true;
    if (typeof e.permissionMode === 'string') out.pm = e.permissionMode;
    let t = textOf(c);
    if (Array.isArray(c)) {
      const res = c.filter((b: any) => b?.type === 'tool_result');
      if (res.length) {
        out.results = res.map((b: any) => String(b.tool_use_id || ''));
        t += '\n' + res.map((b: any) => textOf(b.content)).join('\n').slice(0, 4000);
      }
    }
    if (t.includes('[Request interrupted')) out.interrupted = true;
    if (/^\s*<(command-name|local-command|command-message)/.test(textOf(c))) out.command = true;
    if (PLAN_OFF.test(t)) out.planOff = true;
    else if (PLAN_ON.test(t)) out.planOn = true;
    return out;
  }
  const out: Entry = { type: 'assistant' };
  if (Array.isArray(c)) {
    const tools = c.filter((b: any) => b?.type === 'tool_use');
    if (tools.length) {
      out.tools = tools.map((b: any) => {
        const r: ToolRef = { id: String(b.id || ''), name: String(b.name || ''), detail: describeTool(String(b.name || ''), b.input) };
        if (b.input?.subagent_type) r.subType = String(b.input.subagent_type);
        return r;
      });
    }
    if (c.some((b: any) => b?.type === 'text' && String(b.text || '').trim())) out.hasText = true;
    if (c.some((b: any) => b?.type === 'thinking' || b?.type === 'redacted_thinking')) out.hasThinking = true;
  } else if (typeof c === 'string' && c.trim()) out.hasText = true;
  return out;
}

function summarizeLines(text: string): Entry[] {
  const out: Entry[] = [];
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l || (!l.includes('"user"') && !l.includes('"assistant"'))) continue;
    let e: any;
    try { e = JSON.parse(l); } catch { continue; }
    const s = summarize(e);
    if (s) out.push(s);
  }
  return out;
}

/** Ce que fait l'agent, d'après la fin de la liste d'entrées. */
export function decide(entries: Entry[]): Parsed {
  const p = decideKind(entries);
  p.planMode = decidePlan(entries);
  return p;
}

function decideKind(entries: Entry[]): Parsed {
  const resolved = new Set<string>();
  let sawToolResult = false;
  let seen = 0;
  for (let i = entries.length - 1; i >= 0 && seen < 400; i--) {
    const e = entries[i];
    if (e.meta) continue;
    seen++;
    if (e.type === 'user') {
      if (e.results) { for (const id of e.results) resolved.add(id); sawToolResult = true; continue; }
      if (sawToolResult) return { kind: 'toolResult' };
      if (e.interrupted || e.command) return { kind: 'interrupted' };
      return { kind: 'userPrompt' };
    }
    if (e.tools) {
      for (let k = e.tools.length - 1; k >= 0; k--) {
        const t = e.tools[k];
        if (!resolved.has(t.id)) {
          const p: Parsed = { kind: 'tool', tool: t.name, detail: t.detail };
          if (t.subType) p.subType = t.subType;
          return p;
        }
      }
    }
    if (sawToolResult) return { kind: 'toolResult' };
    if (e.hasText) return { kind: 'assistantText' };
    if (e.hasThinking) return { kind: 'thinking' };
  }
  return { kind: sawToolResult ? 'toolResult' : 'none' };
}

/**
 * Mode plan actif ? On remonte jusqu'au premier indice décisif : champ permissionMode
 * des messages utilisateur, ou rappels système d'entrée/sortie du mode plan.
 */
function decidePlan(entries: Entry[]): boolean {
  let seen = 0;
  for (let i = entries.length - 1; i >= 0 && seen < 300; i--) {
    const e = entries[i];
    if (e.type !== 'user') continue;
    seen++;
    if (e.pm !== undefined) return e.pm === 'plan';
    if (e.planOff) return false;
    if (e.planOn) return true;
  }
  return false;
}

/** Analyse la fin d'une transcription (texte brut JSONL). */
export function parseTail(text: string): Parsed {
  return decide(summarizeLines(text));
}

/** Titre de la session : résumé si présent, sinon premier message de l'utilisateur. Renvoie aussi le cwd. */
export function parseHead(text: string): { title?: string; cwd?: string } {
  let title: string | undefined;
  let summary: string | undefined;
  let cwd: string | undefined;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let e: any;
    try { e = JSON.parse(line); } catch { continue; }
    if (!cwd && typeof e.cwd === 'string') cwd = e.cwd;
    if (e.type === 'summary' && e.summary && !summary) summary = String(e.summary);
    if (!title && e.type === 'user' && !e.isMeta) {
      const t = textOf(e.message?.content).trim();
      if (t && !t.startsWith('<') && !t.startsWith('[Request interrupted') && !t.startsWith('Caveat:')) {
        title = trunc(t.split('\n')[0], 60);
      }
    }
    if ((title || summary) && cwd) break;
  }
  return { title: summary ? trunc(summary, 60) : title, cwd };
}

function readSlice(file: string, start: number, len: number): Buffer {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(len);
    const n = fs.readSync(fd, buf, 0, len, start);
    return buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}

interface DirEntry { mtime: number; files: string[]; dirs: string[]; }

/** Parcours des dossiers avec cache : un dossier n'est relu que si sa date de modification change. */
function listJsonl(dir: string, depth: number, out: string[], cache: Map<string, DirEntry>, seen: Set<string>): void {
  let st: fs.Stats;
  try { st = fs.statSync(dir); } catch { return; }
  seen.add(dir);
  let c = cache.get(dir);
  if (!c || c.mtime !== st.mtimeMs) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    c = { mtime: st.mtimeMs, files: [], dirs: [] };
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) c.dirs.push(p);
      else if (e.isFile() && e.name.endsWith('.jsonl')) c.files.push(p);
    }
    cache.set(dir, c);
  }
  out.push(...c.files);
  if (depth < 3) for (const d of c.dirs) listJsonl(d, depth + 1, out, cache, seen);
}

// ---------------------------------------------------------------------------
// Hooks : source optionnelle d'états exacts (voir hooks.ts)
// ---------------------------------------------------------------------------
export interface HookView {
  t: number; last: string; tool?: string; detail?: string; subType?: string; pm?: string;
  perm: boolean; idle: boolean; stopped: boolean; ended: boolean; pids?: number[];
}
export interface HookSource {
  get(sid: string, sub?: string): HookView | undefined;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------
const MAX_ENTRIES = 400;
const INITIAL_TAIL = 256 * 1024;
const MAX_INCREMENT = 2 * 1024 * 1024;

interface FileState {
  file: string;
  mtime: number;
  size: number;
  offset: number;          // octets consommés (jusqu'au dernier saut de ligne)
  entries: Entry[];        // dernières entrées résumées
  parsed: Parsed;
  title?: string;
  cwd?: string;
  external: boolean;
}

export class Scanner {
  private files = new Map<string, FileState>();
  private dirCache = new Map<string, DirEntry>();
  private nums = new Map<string, number>();
  private nextNum = 1;
  /** nombre d'octets lus depuis le démarrage (mesure / tests) */
  bytesRead = 0;
  hooks?: HookSource;

  constructor(public opts: ScannerOptions) {}

  private projectDirs(): { dir: string; external: boolean }[] {
    const root = this.opts.projectsDir;
    let dirs: string[];
    try {
      dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      return [];
    }
    const enc = this.opts.workspaceFolders.map((f) => encodeProjectPath(f).toLowerCase());
    const filter = this.opts.onlyCurrentWorkspace && enc.length > 0;
    const out: { dir: string; external: boolean }[] = [];
    for (const d of dirs) {
      const n = d.toLowerCase();
      const mine = !filter || enc.some((e) => n === e || n.startsWith(e + '-'));
      if (mine) out.push({ dir: path.join(root, d), external: false });
      else if (this.opts.showOtherWorkspaces) out.push({ dir: path.join(root, d), external: true });
    }
    return out;
  }

  /** Lecture disque : nouveaux fichiers, octets ajoutés. Retourne true si quelque chose a changé. */
  refresh(now = Date.now()): boolean {
    const seenDirs = new Set<string>();
    const live = new Set<string>();
    let changed = false;
    for (const { dir, external } of this.projectDirs()) {
      const list: string[] = [];
      listJsonl(dir, 0, list, this.dirCache, seenDirs);
      for (const file of list) {
        let st: fs.Stats;
        try { st = fs.statSync(file); } catch { continue; }
        if (now - st.mtimeMs > this.opts.activeWindowMs || st.size === 0) continue;
        live.add(file);
        let fsx = this.files.get(file);
        if (fsx && fsx.mtime === st.mtimeMs && fsx.size === st.size) continue;
        changed = true;
        if (!fsx || st.size < fsx.offset || st.size - fsx.offset > MAX_INCREMENT) {
          // première lecture (ou fichier réécrit / énorme saut) : on lit la fin seulement
          const start = Math.max(0, st.size - INITIAL_TAIL);
          const buf = readSlice(file, start, st.size - start);
          this.bytesRead += buf.length;
          let text = buf.toString('utf8');
          if (start > 0) { const nl = text.indexOf('\n'); text = nl >= 0 ? text.slice(nl + 1) : ''; }
          const end = text.lastIndexOf('\n');
          const consumed = end >= 0 ? text.slice(0, end + 1) : '';
          const prev = fsx;
          fsx = {
            file, mtime: st.mtimeMs, size: st.size, external,
            offset: st.size - Buffer.byteLength(text) + Buffer.byteLength(consumed),
            entries: summarizeLines(consumed).slice(-MAX_ENTRIES),
            parsed: { kind: 'none' },
            title: prev?.title, cwd: prev?.cwd,
          };
          if (!prev) {
            const head = readSlice(file, 0, Math.min(st.size, HEAD_BYTES));
            this.bytesRead += head.length;
            Object.assign(fsx, parseHead(head.toString('utf8')));
          }
        } else {
          // lecture incrémentale : uniquement les octets ajoutés depuis la dernière fois
          const buf = readSlice(file, fsx.offset, st.size - fsx.offset);
          this.bytesRead += buf.length;
          const nl = buf.lastIndexOf(10);
          if (nl >= 0) {
            const added = summarizeLines(buf.subarray(0, nl + 1).toString('utf8'));
            fsx.entries.push(...added);
            if (fsx.entries.length > MAX_ENTRIES) fsx.entries.splice(0, fsx.entries.length - MAX_ENTRIES);
            fsx.offset += nl + 1;
          }
          fsx.mtime = st.mtimeMs;
          fsx.size = st.size;
        }
        fsx.parsed = decide(fsx.entries);
        this.files.set(file, fsx);
      }
    }
    for (const k of this.files.keys()) if (!live.has(k)) { this.files.delete(k); changed = true; }
    for (const k of this.dirCache.keys()) if (!seenDirs.has(k)) this.dirCache.delete(k);
    return changed;
  }

  /** Calcule l'état de chaque agent à partir du cache (aucune I/O). */
  evaluate(now = Date.now()): AgentInfo[] {
    const out: AgentInfo[] = [];
    const root = this.opts.projectsDir;
    for (const fsx of this.files.values()) {
      const { file, mtime } = fsx;
      const age = now - mtime;
      if (age > this.opts.activeWindowMs) continue;

      const rel = path.relative(root, file).split(path.sep);
      const projDir = rel[0];
      const inner = rel.slice(1);
      const isSub = inner.length > 1 && inner.includes('subagents');
      const id = (projDir + '/' + inner.join('/')).replace(/\.jsonl$/, '');
      const parentId = isSub ? projDir + '/' + inner[0] : undefined;
      const sid = inner[0].replace(/\.jsonl$/, '');
      const subName = isSub ? path.basename(file, '.jsonl') : undefined;
      const hs = this.hooks?.get(sid, subName);
      const p = fsx.parsed;

      // Un sous-agent qui a rendu sa réponse a terminé : on le fait sortir.
      if (isSub) {
        if (hs?.stopped && hs.t >= mtime - 1000) continue;
        if (age > 120_000 || ((p.kind === 'assistantText' || p.kind === 'none') && age > 5_000)) continue;
      }
      // Session fermée (hook SessionEnd)
      if (hs?.ended && hs.t >= mtime - 1000) continue;

      let state: AgentState;
      let tool: string | undefined;
      let detail: string | undefined;
      switch (p.kind) {
        case 'tool': {
          tool = p.tool;
          detail = p.detail;
          state = stateForTool(p.tool || '');
          // Sans hooks : un outil sans résultat depuis trop longtemps = probablement une permission.
          if (!hs && state !== 'delegating' && state !== 'waiting' && state !== 'planning') {
            const factor = state === 'running' ? 4 : state === 'searching' ? 2 : 1;
            if (age > this.opts.permissionDelayMs * factor) state = 'permission';
          }
          break;
        }
        case 'toolResult': case 'userPrompt': case 'thinking':
          state = age > 3 * 60_000 ? 'sleeping' : 'thinking';
          break;
        case 'assistantText': case 'interrupted': case 'none':
        default:
          state = age > 5 * 60_000 ? 'sleeping' : 'waiting';
      }

      // Hooks : information exacte, prioritaire quand elle est au moins aussi récente que la transcription.
      let planMode = !!p.planMode;
      if (hs) {
        const fresh = hs.t >= mtime - 1500;
        if (hs.pm) planMode = hs.pm === 'plan';
        if (hs.perm) {
          state = 'permission';
          if (hs.tool) { tool = hs.tool; detail = hs.detail; }
        } else if (fresh) {
          if (hs.idle || hs.stopped) state = now - hs.t > 5 * 60_000 ? 'sleeping' : 'waiting';
          else if (hs.last === 'PreToolUse' && hs.tool) { tool = hs.tool; detail = hs.detail; state = stateForTool(hs.tool); }
          else if (hs.last === 'UserPromptSubmit' || hs.last === 'PostToolUse' || hs.last === 'PostToolUseFailure') state = 'thinking';
        }
      }

      // Rédaction d'un plan : mode plan actif, plan présenté (ExitPlanMode) ou sous-agent « Plan » lancé.
      const planTool = (tool === 'ExitPlanMode' || tool === 'EnterPlanMode' || p.subType === 'Plan' || hs?.subType === 'Plan') && state !== 'waiting';
      if (state !== 'sleeping' && state !== 'permission' && (planTool || planMode)) {
        if (!planTool && !detail) detail = state === 'waiting' ? 'plan en discussion' : 'rédige le plan';
        state = 'planning';
      }

      let num = this.nums.get(id);
      if (num === undefined) { num = this.nextNum++; this.nums.set(id, num); }

      const project = fsx.cwd ? path.basename(fsx.cwd) : projDir.split('-').filter(Boolean).pop() || projDir;
      const info: AgentInfo = {
        id, num, file, project,
        title: fsx.title || (isSub ? 'sous-agent' : 'session ' + sid.slice(0, 8)),
        state, tool, detail, isSub, parentId,
        lastActivity: Math.max(mtime, hs?.t || 0),
        exact: !!hs,
      };
      if (fsx.external) info.external = true;
      const pids = hs?.pids || (isSub ? this.hooks?.get(sid)?.pids : undefined);
      if (pids) info.pids = pids;
      out.push(info);
    }
    out.sort((a, b) => a.num - b.num);
    return out;
  }

  /** refresh + evaluate */
  scan(now = Date.now()): AgentInfo[] {
    this.refresh(now);
    return this.evaluate(now);
  }
}
