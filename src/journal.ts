// Journal de la journée : temps passé par agent et par état, conservé 7 jours.
import type { AgentInfo, AgentState } from './scanner';

interface Memento {
  get<T>(key: string, def: T): T;
  update(key: string, value: unknown): Thenable<void> | Promise<void>;
}
interface AgentDay { title: string; num: number; project: string; sub: boolean; ms: Partial<Record<AgentState, number>> }
type Day = Record<string, AgentDay>;

const KEY = 'rpa.journal';
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export class Journal {
  private days: Record<string, Day>;
  private lastFlush = Date.now();
  private dirty = false;

  constructor(private store: Memento, private keepDays = 7) {
    this.days = store.get<Record<string, Day>>(KEY, {});
  }

  record(agents: AgentInfo[], dtMs: number, now = Date.now()) {
    if (!agents.length || dtMs <= 0) return;
    const day = (this.days[dayKey(now)] ||= {});
    for (const a of agents) {
      const r = (day[a.id] ||= { title: a.title, num: a.num, project: a.project, sub: a.isSub, ms: {} });
      r.title = a.title;
      r.ms[a.state] = (r.ms[a.state] || 0) + dtMs;
    }
    this.dirty = true;
    if (now - this.lastFlush > 30_000) this.flush(now);
  }

  flush(now = Date.now()) {
    const keys = Object.keys(this.days).sort();
    while (keys.length > this.keepDays) delete this.days[keys.shift()!];
    if (this.dirty) this.store.update(KEY, this.days);
    this.dirty = false;
    this.lastFlush = now;
  }

  summary(n = 7) {
    return Object.keys(this.days).sort().reverse().slice(0, n).map((day) => ({
      day,
      agents: Object.entries(this.days[day])
        .map(([id, a]) => ({ id, ...a, total: Object.values(a.ms).reduce((s, v) => s + (v || 0), 0) }))
        .sort((x, y) => y.total - x.total),
    }));
  }

  csv(labels: Record<string, string>): string {
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = ['jour;agent;titre;projet;sous-agent;etat;minutes'];
    for (const { day, agents } of this.summary(this.keepDays)) {
      for (const a of agents) {
        for (const [st, ms] of Object.entries(a.ms)) {
          rows.push([day, a.num, esc(a.title), esc(a.project), a.sub ? 'oui' : 'non', esc(labels[st] || st), ((ms || 0) / 60000).toFixed(1)].join(';'));
        }
      }
    }
    return rows.join('\n') + '\n';
  }
}
