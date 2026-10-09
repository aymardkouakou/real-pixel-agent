#!/usr/bin/env node
// Real Pixel Agent — hook Claude Code.
// Reçoit l'événement JSON sur stdin et l'ajoute, sous forme compacte, à
// ~/.real-pixel-agent/events/<session_id>.jsonl. N'écrit jamais sur stdout et
// sort toujours avec le code 0 : il n'a aucun effet sur le comportement de Claude.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const DIR = process.env.REAL_PIXEL_AGENT_DIR || path.join(os.homedir(), '.real-pixel-agent');
const MAX_FILE = 256 * 1024;

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { if (buf.length < 4e6) buf += d; });
process.stdin.on('end', () => {
  try { handle(JSON.parse(buf)); } catch { /* jamais d'erreur visible */ }
  process.exit(0);
});
setTimeout(() => process.exit(0), 4000).unref();

function trunc(s, n) {
  const t = String(s == null ? '' : s);
  return t.length > n ? t.slice(0, n) : t;
}

function pick(ti) {
  const o = {};
  for (const k of ['file_path', 'notebook_path', 'description', 'pattern', 'url', 'query', 'subagent_type']) {
    if (ti[k] != null) o[k] = trunc(ti[k], 160);
  }
  if (ti.command != null) o.command = trunc(ti.command, 160);
  return o;
}

// Chaîne des processus parents : permet de retrouver le terminal VS Code de l'agent.
function ancestors() {
  const out = [];
  try {
    let pid = process.ppid;
    if (process.platform === 'linux') {
      for (let i = 0; i < 10 && pid > 1; i++) {
        out.push(pid);
        const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
        pid = parseInt(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1], 10);
      }
    } else if (process.platform === 'darwin') {
      const map = new Map();
      for (const line of cp.execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8', timeout: 1500 }).split('\n')) {
        const [a, b] = line.trim().split(/\s+/).map(Number);
        if (a) map.set(a, b);
      }
      for (let i = 0; i < 10 && pid > 1; i++) { out.push(pid); pid = map.get(pid) || 0; }
    } else {
      out.push(pid);
    }
  } catch { /* ignore */ }
  return out;
}

function handle(h) {
  const sid = String(h.session_id || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sid)) return;
  const ev = {
    e: h.hook_event_name,
    t: Date.now(),
    sid,
    aid: h.agent_id,
    atype: h.agent_type,
    pm: h.permission_mode,
    tool: h.tool_name,
    tuid: h.tool_use_id,
    input: h.tool_input && typeof h.tool_input === 'object' ? pick(h.tool_input) : undefined,
    nt: h.notification_type || h.type,
    msg: h.message ? trunc(h.message, 200) : undefined,
    reason: h.reason,
    src: h.source,
    tp: h.transcript_path,
    cwd: h.cwd,
  };
  if (ev.e === 'SessionStart' || ev.e === 'UserPromptSubmit') ev.pids = ancestors();
  for (const k of Object.keys(ev)) if (ev[k] === undefined || ev[k] === null) delete ev[k];

  const dir = path.join(DIR, 'events');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, sid + '.jsonl');
  try {
    if (fs.statSync(f).size > MAX_FILE) {
      const keep = fs.readFileSync(f, 'utf8').trim().split('\n').slice(-100);
      fs.writeFileSync(f, keep.join('\n') + '\n');
    }
  } catch { /* fichier absent */ }
  fs.appendFileSync(f, JSON.stringify(ev) + '\n');
}
