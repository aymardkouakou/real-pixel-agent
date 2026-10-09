// =====================================================================
// Rendu 3D (optionnel) : réglage « renderer: 3d ». La scène vient de media/scene3d.js (Three.js),
// chargé seulement dans ce mode. La simulation 2D (positions, trajets, états) reste la source de vérité.
// =====================================================================
const canvas3d = $('screen3d');
let r3 = null;
let use3d = false;
const VISITOR_ID = '__visitor';

function setRenderer(mode) {
  const want = mode === '3d' && !!window.RPA3D;
  if (want === use3d) return;
  use3d = want;
  canvas.hidden = use3d;
  canvas3d.hidden = !use3d;
  if (use3d && !r3) {
    r3 = window.RPA3D.create(canvas3d);
    r3.onSelect((id) => { if (id === VISITOR_ID) return; selectedByProximity = false; selectActor(id === selected ? null : id); dirty = true; });
    // la caméra 2D (cam, zoom) reste la source de vérité : son centre est la cible de la caméra 3D
    r3.onPan((dx, dz) => { followId = null; camGoal = null; vel.x = vel.y = 0; cam.x += dx; cam.y += dz; clampCam(); });
    r3.onWheel(onWheel);
    r3.onHover((id) => { const h = id && id !== VISITOR_ID ? id : null; if (h !== hovered) { hovered = h; dirty = true; } });
    r3.onDouble((id, e) => {
      if (id && id !== VISITOR_ID) { followId = id; selectActor(id); return; }
      setZoom(zoomTarget() * (e.shiftKey ? 0.5 : 2), cssW / 2, cssH / 2);
    });
  }
  resize();
  dirty = true;
}

// Réutilise les peintres 2D (drawScreen, borne d'arcade, kanban) sur une petite texture
function paintScreen3d(c2d, o) {
  const prev = g;
  g = c2d;
  try {
    if (o.type === 'screen') drawScreen(0, 0, o.state, o.t, o.seed, o.w, o.h);
    else if (o.type === 'arcade') { c2d.save(); c2d.translate(-484, -20); drawArcade(o.t); c2d.restore(); }
    else if (o.type === 'kanban') {
      c2d.save(); c2d.translate(-196, -2);
      if (o.gathering) drawKanban(o.t); else { rect(196, 2, 88, 11, '#10151d'); rect(198, 6, 84, 1, '#1f2a3a'); rect(198, 9, 60, 1, '#1f2a3a'); }
      c2d.restore();
    }
  } finally { g = prev; }
}

function render3d(t) {
  const list = [];
  for (const a of actors.values()) {
    const ag = a.agent;
    list.push({
      id: a.id, x: a.x, y: a.y, seated: a.seated, leaving: a.leaving, kind: a.target && a.target.kind, i: a.target && a.target.i,
      state: ag.state, moving: !!a.moving || (a.path.length > 0 && !(a.delay > 0)), look: a.look,
      label: `${ag.isSub ? '↳ ' : ''}${ag.external ? '[' + ag.project + '] ' : ''}#${ag.num} ${ag.title}`, isLead: a.id === leadId,
      stateText: (labels[ag.state] || ag.state) + (ag.detail ? ' · ' + ag.detail : ''),
    });
  }
  if (visitMode) {
    list.push({ id: VISITOR_ID, x: visitor.x, y: visitor.y, seated: false, state: 'idle', moving: visitor.moving, look: visitor.look, label: 'Toi', isLead: false });
  }
  r3.setZoom(zoom);
  r3.focus(cam.x + cssW / zoom / 2, cam.y + cssH / zoom / 2);
  r3.render({
    t, actors: list, layout: LAYOUT, phase: phase(), selected, hovered, zoom, gathering, showLabels: true, paintScreen: paintScreen3d,
    consts: { MAIN_W, ROOM_TOP, ROOM_BOTTOM, OPEN, ANNEX, LEAD, WAR, LOUNGE, OPEN_ROWS, ANNEX_ROWS, deskSlot, annexSlot, meet: LAYOUT.meet },
  });
}
