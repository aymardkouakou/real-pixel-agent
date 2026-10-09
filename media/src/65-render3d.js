// =====================================================================
// Rendu 3D (optionnel) : réglage « renderer: 3d ». La scène vient de media/scene3d.js (Three.js),
// chargé seulement dans ce mode. La simulation 2D (positions, trajets, états) reste la source de vérité.
// =====================================================================
const canvas3d = $('screen3d');
let r3 = null;
let use3d = false;

function setRenderer(mode) {
  const want = mode === '3d' && !!window.RPA3D;
  if (want === use3d) return;
  use3d = want;
  canvas.hidden = use3d;
  canvas3d.hidden = !use3d;
  if (use3d && !r3) {
    r3 = window.RPA3D.create(canvas3d);
    r3.onSelect((id) => { selectedByProximity = false; selectActor(id === selected ? null : id); dirty = true; });
  }
  resize();
  dirty = true;
}

function render3d(t) {
  const list = [];
  for (const a of actors.values()) {
    const ag = a.agent;
    list.push({
      id: a.id, x: a.x, y: a.y, seated: a.seated, leaving: a.leaving, kind: a.target && a.target.kind, i: a.target && a.target.i,
      state: ag.state, moving: !!a.moving || (a.path.length > 0 && !(a.delay > 0)), look: a.look,
      label: `${ag.isSub ? '↳ ' : ''}#${ag.num} ${ag.title}`, isLead: a.id === leadId,
    });
  }
  r3.render({
    t, actors: list, layout: LAYOUT, phase: phase(), selected, showLabels: true,
    consts: { MAIN_W, ROOM_TOP, ROOM_BOTTOM, OPEN, ANNEX, LEAD, WAR, LOUNGE, OPEN_ROWS, ANNEX_ROWS, deskSlot, annexSlot, meet: LAYOUT.meet },
  });
}
