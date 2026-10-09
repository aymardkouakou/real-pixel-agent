// =====================================================================
// Extras : son de permission, journal de la journée, badge des hooks
// =====================================================================

// --- son : deux notes courtes, générées (aucun fichier audio) ---
let audioCtx = null;
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime;
    [[880, 0], [1320, 0.13]].forEach(([f, d]) => {
      const o = audioCtx.createOscillator();
      const gn = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      gn.gain.setValueAtTime(0.0001, t0 + d);
      gn.gain.exponentialRampToValueAtTime(0.05, t0 + d + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.11);
      o.connect(gn).connect(audioCtx.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.12);
    });
  } catch { /* audio indisponible */ }
}
// les navigateurs exigent une interaction avant de jouer un son
window.addEventListener('pointerdown', () => {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch { /* ignore */ }
}, { once: true });

// --- journal ---
let journalDays = [];
let journalTimer = null;
const elJBody = $('journalBody');
const elJDay = $('journalDay');

function openJournal() {
  elJournal.hidden = false;
  vscode.postMessage({ type: 'getJournal' });
  clearInterval(journalTimer);
  journalTimer = setInterval(() => vscode.postMessage({ type: 'getJournal' }), 5000);
}
function closeJournal() {
  elJournal.hidden = true;
  clearInterval(journalTimer);
}
function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return '< 1 min';
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
const STATE_ORDER = ['typing', 'reading', 'running', 'searching', 'delegating', 'thinking', 'planning', 'waiting', 'permission', 'sleeping'];

function renderJournal(jLabels) {
  const cur = elJDay.value;
  elJDay.replaceChildren(...journalDays.map((d, i) => {
    const o = document.createElement('option');
    o.value = d.day;
    o.textContent = i === 0 ? `Aujourd'hui (${d.day})` : d.day;
    return o;
  }));
  if (cur && journalDays.some((d) => d.day === cur)) elJDay.value = cur;
  const day = journalDays.find((d) => d.day === elJDay.value) || journalDays[0];
  elJBody.replaceChildren();
  if (!day || !day.agents.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Rien d\'enregistré pour l\'instant : le journal se remplit pendant que les agents travaillent.';
    elJBody.append(p);
    return;
  }
  // totaux par état sur la journée
  const totals = {};
  for (const a of day.agents) for (const [k, v] of Object.entries(a.ms)) totals[k] = (totals[k] || 0) + v;
  const sum = Object.values(totals).reduce((s, v) => s + v, 0);
  const active = sum - (totals.waiting || 0) - (totals.sleeping || 0) - (totals.permission || 0);
  const kpi = document.createElement('div');
  kpi.className = 'j-kpis';
  for (const [label, val] of [['Temps agents', fmtDur(sum)], ['Travail effectif', fmtDur(active)], ['À t\'attendre', fmtDur((totals.waiting || 0) + (totals.permission || 0))], ['Agents', String(day.agents.filter((a) => !a.sub).length)]]) {
    const d = document.createElement('div');
    const b = document.createElement('b'); b.textContent = val;
    const s = document.createElement('span'); s.textContent = label;
    d.append(b, s);
    kpi.append(d);
  }
  elJBody.append(kpi);
  const max = Math.max(...day.agents.map((a) => a.total), 1);
  for (const a of day.agents) {
    const row = document.createElement('div');
    row.className = 'j-row' + (a.sub ? ' sub' : '');
    const name = document.createElement('div');
    name.className = 'j-name';
    name.textContent = `${a.sub ? '↳ ' : ''}#${a.num} ${a.title}`;
    name.title = `${a.title} — ${a.project}`;
    const bar = document.createElement('div');
    bar.className = 'j-bar';
    bar.style.width = Math.max(2, (a.total / max) * 100) + '%';
    for (const k of STATE_ORDER) {
      const v = a.ms[k];
      if (!v) continue;
      const seg = document.createElement('span');
      seg.style.background = STATE_COLOR[k];
      seg.style.flexGrow = String(v);
      seg.title = `${(jLabels || labels)[k] || k} : ${fmtDur(v)}`;
      bar.append(seg);
    }
    const tot = document.createElement('div');
    tot.className = 'j-tot';
    tot.textContent = fmtDur(a.total);
    const track = document.createElement('div');
    track.className = 'j-track';
    track.append(bar);
    row.append(name, track, tot);
    elJBody.append(row);
  }
  const legend = document.createElement('div');
  legend.className = 'j-legend';
  for (const k of STATE_ORDER) {
    if (!totals[k]) continue;
    const it = document.createElement('span');
    const sw = document.createElement('i');
    sw.style.background = STATE_COLOR[k];
    it.append(sw, document.createTextNode(`${(jLabels || labels)[k] || k} ${Math.round((totals[k] / sum) * 100)} %`));
    legend.append(it);
  }
  elJBody.append(legend);
}

window.addEventListener('message', (e) => {
  const m = e.data;
  if (!m) return;
  if (m.type === 'journal') { journalDays = m.days || []; if (!elJournal.hidden) renderJournal(m.labels); }
  if (m.type === 'openJournal') openJournal();
});
$('journal').onclick = () => (elJournal.hidden ? openJournal() : closeJournal());
$('journalClose').onclick = closeJournal;
$('journalCsv').onclick = () => vscode.postMessage({ type: 'exportJournal' });
elJDay.onchange = () => renderJournal();
elHooks.onclick = () => { if (hookMode !== 'on') vscode.postMessage({ type: 'installHooks' }); };
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (e.code === 'KeyJ') (elJournal.hidden ? openJournal() : closeJournal());
  if (e.key === 'Escape' && !elJournal.hidden) closeJournal();
});
