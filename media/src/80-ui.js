// =====================================================================
// Interface HTML
// =====================================================================
function refreshChrome() {
  const all = [...actors.values()].filter((a) => !a.leaving);
  const present = all.filter((a) => !a.agent.external);
  const ext = all.length - present.length;
  const main = present.filter((a) => !a.agent.isSub).length;
  const subs = present.length - main;
  const wait = present.filter((a) => a.agent.state === 'waiting' || (a.agent.state === 'planning' && a.agent.tool === 'ExitPlanMode')).length;
  const perm = present.filter((a) => a.agent.state === 'permission').length;
  let txt = main ? `${main} agent${main > 1 ? 's' : ''}` : 'Aucun agent';
  if (subs) txt += ` + ${subs} sous-agent${subs > 1 ? 's' : ''}`;
  if (gathering) txt += ' · 📋 réunion plan';
  if (perm) txt += ` · ⚠ ${perm}`;
  if (wait) txt += ` · ${wait} t'attend${wait > 1 ? 'ent' : ''}`;
  if (ext) txt += ` · ${ext} à l'annexe`;
  elCount.textContent = txt;
  elEmpty.hidden = all.length > 0;
  // badge de précision du suivi
  elHooks.hidden = hookMode === 'on';
  elHooks.textContent = hookMode === 'installed' ? '⟳ relancer Claude' : '≈ estimé';
  elHooks.title = hookMode === 'installed'
    ? 'Hooks installés : relance tes sessions Claude Code pour un suivi exact'
    : 'Suivi estimé à partir des transcriptions. Cliquer pour installer les hooks Claude Code (suivi exact).';
  renderInfo();
}
function ago(ms) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `il y a ${s} s` : `il y a ${Math.round(s / 60)} min`;
}
function selectActor(id, byProximity) {
  selected = id;
  if (!byProximity) selectedByProximity = false;
  renderInfo();
}
function btn(label, cls, onClick, title) {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  if (title) b.title = title;
  b.onclick = onClick;
  return b;
}
function renderInfo() {
  const a = selected && actors.get(selected);
  if (!a) { elInfo.hidden = true; return; }
  const ag = a.agent;
  elInfo.hidden = false;
  elInfo.replaceChildren();
  const head = document.createElement('div');
  head.className = 'info-head';
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.style.background = STATE_COLOR[ag.state];
  const title = document.createElement('strong');
  title.textContent = `${a.id === leadId ? '★ ' : ''}#${ag.num} ${ag.title}`;
  head.append(dot, title);
  const meta = document.createElement('div');
  meta.className = 'muted';
  const where = { lead: 'bureau du lead', desk: 'open space', annex: 'annexe', meet: 'salle de plan', lounge: 'lounge', exit: 'sort' }[a.target?.kind] || '';
  meta.textContent = `${labels[ag.state] || ag.state}${ag.tool ? ` — ${ag.tool}` : ''}${ag.detail ? ` : ${ag.detail}` : ''} · ${ag.project} · ${where} · ${ago(ag.lastActivity)} · ${ag.exact ? '✓ suivi exact' : '≈ estimé'}`;
  const btns = document.createElement('div');
  btns.className = 'info-btns';
  btns.append(
    btn(followId === a.id ? 'Ne plus suivre' : 'Suivre', 'secondary', () => { followId = followId === a.id ? null : a.id; renderInfo(); }),
  );
  btns.append(
    btn('Renommer', 'secondary', () => vscode.postMessage({ type: 'rename', id: ag.id }), 'Donner un nom à cet agent'),
    btn('🎲', 'secondary', (e) => vscode.postMessage({ type: 'reroll', id: ag.id, reset: e.shiftKey }), 'Changer d\'apparence (Maj+clic : apparence d\'origine)'),
  );
  if (!ag.isSub && !ag.external && a.id !== leadId) {
    btns.append(btn('★ Lead', 'secondary', () => {
      leadOverride = a.id; persist();
      vscode.postMessage({ type: 'ready' });
    }, 'Installer cet agent dans le bureau du lead'));
  }
  btns.append(
    btn('Transcription', '', () => vscode.postMessage({ type: 'openTranscript', id: ag.id })),
    btn('Terminal', 'secondary', () => vscode.postMessage({ type: 'focusTerminal', id: ag.id })),
    btn('✕', 'secondary', () => selectActor(null), 'Fermer'),
  );
  elInfo.append(head, meta, btns);
}

function persist() {
  vscode.setState({ zoom: Math.round(zoom * 100) / 100, camX: Math.round(cam.x), camY: Math.round(cam.y), lead: leadOverride });
}
setInterval(persist, 3000);
setInterval(renderInfo, 5000);

for (const b of document.querySelectorAll('[data-zone]')) b.addEventListener('click', () => jumpTo(b.dataset.zone));
$('zin').onclick = () => setZoom(zoomTarget() * 1.25, cssW / 2, cssH / 2);
$('zout').onclick = () => setZoom(zoomTarget() / 1.25, cssW / 2, cssH / 2);
elZoom.onclick = () => setZoom(3, cssW / 2, cssH / 2);
if (elZRange) elZRange.addEventListener('input', () => setZoom(rangeToZ(+elZRange.value), cssW / 2, cssH / 2, false));
elVisit.onclick = toggleVisit;
$('add').onclick = () => vscode.postMessage({ type: 'newAgent' });
$('add2').onclick = () => vscode.postMessage({ type: 'newAgent' });
setTimeout(() => elHint.classList.add('fade'), 6000);

window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'agents') update(e.data);
});
new ResizeObserver(() => resize()).observe(stage);

if (!zoom) zoom = 3;
resize();
buildMap(3);
if (!camInit) jumpTo('lead', true);
requestAnimationFrame(frame);
vscode.postMessage({ type: 'ready' });
