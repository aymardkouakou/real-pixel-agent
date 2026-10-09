// =====================================================================
// Caméra et entrées
// ---------------------------------------------------------------------
// Zoom continu (0,35× à 10×), ancré sous le curseur, animé en espace log.
// Glisser (bouton gauche, milieu ou droit) avec inertie, pincement tactile
// et trackpad, double-clic pour zoomer, Maj + molette pour défiler.
// =====================================================================
const ZMAX = 10;
const zMin = () => (LAYOUT ? Math.max(0.35, Math.min(cssW / LAYOUT.W, cssH / LAYOUT.H) * 0.85) : 0.5);
let zoomGoal = null;           // { z, px, py } : cible animée, point écran fixe
const vel = { x: 0, y: 0 };    // inertie (px monde / s)

function clampCam() {
  if (!LAYOUT) return;
  const vw = cssW / zoom, vh = cssH / zoom;
  const m = 24 / zoom;         // petite marge pour ne pas « buter » contre les bords
  cam.x = vw + 2 * m >= LAYOUT.W ? (LAYOUT.W - vw) / 2 : Math.max(-m, Math.min(LAYOUT.W - vw + m, cam.x));
  cam.y = vh + 2 * m >= LAYOUT.H ? (LAYOUT.H - vh) / 2 : Math.max(-m, Math.min(LAYOUT.H - vh + m, cam.y));
}
function centerOn(x, y, instant) {
  const tx = x - cssW / zoom / 2, ty = y - cssH / zoom / 2;
  if (instant) { cam.x = tx; cam.y = ty; camGoal = null; } else { camGoal = { x: tx, y: ty, wx: x, wy: y }; }
  clampCam();
}
let camGoal = null;

function applyZoom(z, px, py) {
  z = Math.max(zMin(), Math.min(ZMAX, z));
  const wx = cam.x + px / zoom, wy = cam.y + py / zoom;
  zoom = z;
  cam.x = wx - px / zoom; cam.y = wy - py / zoom;
  if (camGoal) { camGoal.x = camGoal.wx - cssW / zoom / 2; camGoal.y = camGoal.wy - cssH / zoom / 2; }
  clampCam();
  showZoom();
}
// animate=false : immédiat (trackpad, pincement) ; sinon transition douce
function setZoom(z, px, py, animate = true) {
  z = Math.max(zMin(), Math.min(ZMAX, z));
  if (!animate) { zoomGoal = null; applyZoom(z, px, py); return; }
  zoomGoal = { z, px, py };
}
const zoomTarget = () => (zoomGoal ? zoomGoal.z : zoom);
function showZoom() {
  elZoom.textContent = (zoom < 10 ? zoom.toFixed(zoom < 2 ? 2 : 1) : Math.round(zoom)) + '×';
  if (elZRange && document.activeElement !== elZRange) elZRange.value = String(zToRange(zoom));
}
const zToRange = (z) => Math.round((100 * Math.log(z / zMin())) / Math.log(ZMAX / zMin()));
const rangeToZ = (v) => zMin() * Math.pow(ZMAX / zMin(), v / 100);

function updateCamera(dt) {
  if (zoomGoal) {
    const k = 1 - Math.pow(0.0005, dt);
    const lz = Math.log(zoom) + (Math.log(zoomGoal.z) - Math.log(zoom)) * k;
    if (Math.abs(Math.log(zoomGoal.z) - lz) < 0.003) { applyZoom(zoomGoal.z, zoomGoal.px, zoomGoal.py); zoomGoal = null; }
    else applyZoom(Math.exp(lz), zoomGoal.px, zoomGoal.py);
  }
  let goal = camGoal;
  const f = visitMode ? visitor : followId && actors.get(followId);
  if (f) goal = { x: f.x - cssW / zoom / 2, y: f.y - 12 - cssH / zoom / 2 };
  if (goal) {
    const k = 1 - Math.pow(0.001, dt);
    cam.x += (goal.x - cam.x) * k; cam.y += (goal.y - cam.y) * k;
    if (camGoal && Math.hypot(goal.x - cam.x, goal.y - cam.y) < 0.3) camGoal = null;
    clampCam();
  } else if (!drag && (vel.x || vel.y)) {
    cam.x += vel.x * dt; cam.y += vel.y * dt;
    const d = Math.pow(0.005, dt);
    vel.x *= d; vel.y *= d;
    if (Math.hypot(vel.x, vel.y) * zoom < 8) vel.x = vel.y = 0;
    const bx = cam.x, by = cam.y;
    clampCam();
    if (cam.x !== bx) vel.x = 0;
    if (cam.y !== by) vel.y = 0;
  }
}
function cameraBusy() {
  return !!(drag || zoomGoal || camGoal || vel.x || vel.y || followId || visitMode || keys.size || pinch);
}

function jumpTo(zone, instant) {
  if (!LAYOUT) return;
  followId = null; vel.x = vel.y = 0;
  if (zone === 'all') {
    const z = Math.min(cssW / LAYOUT.W, cssH / LAYOUT.H) * 0.96;
    zoomGoal = null; applyZoom(z, cssW / 2, cssH / 2);
    centerOn(LAYOUT.W / 2, LAYOUT.H / 2, true);
    return;
  }
  const r = LAYOUT.zones[zone];
  // on ajuste le zoom pour que la zone remplisse la vue (sans trop zoomer)
  const zFit = Math.min(cssW / (r.w + 24), cssH / (r.h + 24), 5);
  if (zoom < zFit * 0.7 || zoom > zFit * 1.6) { zoomGoal = null; applyZoom(zFit, cssW / 2, cssH / 2); }
  if (zone === 'lead' && leadId && actors.get(leadId)) { const a = actors.get(leadId); centerOn(a.x, a.y - 10, instant); return; }
  centerOn(r.x + r.w / 2, r.y + r.h / 2, instant);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  cssW = Math.max(100, stage.clientWidth);
  cssH = Math.max(80, stage.clientHeight);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  if (r3) r3.resize(cssW, cssH, dpr);
  if (zoom < zMin()) zoom = zMin();
  clampCam();
  showZoom();
  dirty = true;
}

function screenPt(e) {
  const r = canvas.getBoundingClientRect();
  return { px: e.clientX - r.left, py: e.clientY - r.top };
}
function worldAt(e) {
  const { px, py } = screenPt(e);
  return { px, py, x: cam.x + px / zoom, y: cam.y + py / zoom };
}
function actorAt(x, y) {
  let best = null;
  for (const a of actors.values()) {
    if (a.leaving || !a.hit) continue;
    const h = a.hit;
    if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) best = a.id;
  }
  return best;
}
function inMinimap(px, py) { return mm && px >= mm.x && px <= mm.x + mm.w && py >= mm.y && py <= mm.y + mm.h; }

let drag = null;
let pinch = null;
const pointers = new Map();

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.focus();
  canvas.setPointerCapture(e.pointerId);
  const p = worldAt(e);
  pointers.set(e.pointerId, { px: p.px, py: p.py });
  vel.x = vel.y = 0;
  if (pointers.size === 2) {
    // deuxième doigt : pincement
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.px - b.px, a.py - b.py), z: zoom, mx: (a.px + b.px) / 2, my: (a.py + b.py) / 2 };
    drag = null;
    return;
  }
  if (inMinimap(p.px, p.py) && e.button === 0) {
    drag = { mini: true };
    followId = null; centerOn((p.px - mm.x) / mm.s, (p.py - mm.y) / mm.s, true);
    return;
  }
  drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: e.button !== 0, button: e.button, samples: [] };
  if (e.button !== 0) canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (e) => {
  const p = worldAt(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { px: p.px, py: p.py });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.px - b.px, a.py - b.py);
    const mx = (a.px + b.px) / 2, my = (a.py + b.py) / 2;
    cam.x -= (mx - pinch.mx) / zoom; cam.y -= (my - pinch.my) / zoom;
    pinch.mx = mx; pinch.my = my;
    setZoom(pinch.z * (d / pinch.d), mx, my, false);
    followId = null;
    return;
  }
  if (drag && drag.mini) { centerOn((p.px - mm.x) / mm.s, (p.py - mm.y) / mm.s, true); return; }
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved && !visitMode) {
      followId = null; camGoal = null;
      cam.x = drag.cx - dx / zoom; cam.y = drag.cy - dy / zoom; clampCam();
      canvas.style.cursor = 'grabbing';
      const now = performance.now();
      drag.samples.push({ t: now, x: cam.x, y: cam.y });
      while (drag.samples.length > 2 && now - drag.samples[0].t > 90) drag.samples.shift();
    }
    return;
  }
  if (inMinimap(p.px, p.py)) { hovered = null; canvas.style.cursor = 'crosshair'; return; }
  const h = actorAt(p.x, p.y);
  if (h !== hovered) { hovered = h; dirty = true; }
  canvas.style.cursor = hovered ? 'pointer' : 'grab';
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; drag = null; return; }
  const d = drag;
  drag = null;
  canvas.style.cursor = 'grab';
  if (!d || d.mini) return;
  if (d.moved) {
    // inertie : vitesse moyenne des ~90 dernières ms
    const s = d.samples;
    if (s.length >= 2 && performance.now() - s[s.length - 1].t < 60) {
      const a = s[0], b = s[s.length - 1], dt = (b.t - a.t) / 1000;
      if (dt > 0) { vel.x = (b.x - a.x) / dt; vel.y = (b.y - a.y) / dt; }
    }
    return;
  }
  if (e.type !== 'pointerup' || d.button !== 0) return;
  const p = worldAt(e);
  const id = actorAt(p.x, p.y);
  selectedByProximity = false;
  selectActor(id === selected ? null : id);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('dblclick', (e) => {
  const p = worldAt(e);
  const id = actorAt(p.x, p.y);
  if (id) { followId = id; selectActor(id); return; }
  // double-clic dans le vide : zoom ×2 centré sur ce point (Maj : dézoom)
  setZoom(zoomTarget() * (e.shiftKey ? 0.5 : 2), p.px, p.py);
});
function onWheel(e) {
  e.preventDefault();
  const { px, py } = use3d ? { px: cssW / 2, py: cssH / 2 } : screenPt(e);
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cssH : 1;
  const dx = e.deltaX * unit, dy = e.deltaY * unit;
  if (e.shiftKey && !e.ctrlKey) {
    // Maj + molette : défilement
    followId = null; camGoal = null;
    cam.x += (dx || dy) / zoom; if (dx) cam.y += dy / zoom;
    clampCam();
    return;
  }
  vel.x = vel.y = 0;
  if (e.ctrlKey) {
    // pincement trackpad : continu et immédiat
    setZoom(zoom * Math.exp(-dy * 0.012), px, py, false);
  } else if (Math.abs(dy) < 40 && e.deltaMode === 0 && !Number.isInteger(dy)) {
    // défilement fin (trackpad / souris haute précision) : immédiat
    setZoom(zoom * Math.exp(-dy * 0.004), px, py, false);
  } else {
    // molette crantée : pas de ~15 %, animé, cumulable
    setZoom(zoomTarget() * Math.pow(1.18, -Math.sign(dy) * Math.min(3, Math.max(1, Math.abs(dy) / 100))), px, py);
  }
}
canvas.addEventListener('wheel', onWheel, { passive: false });
canvas.addEventListener('mouseleave', () => { if (hovered) { hovered = null; dirty = true; } });

const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ']);
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (MOVE_KEYS.has(e.code)) { keys.add(e.code); e.preventDefault(); return; }
  if (e.key === '+' || e.key === '=') setZoom(zoomTarget() * 1.25, cssW / 2, cssH / 2);
  else if (e.key === '-' || e.key === '_') setZoom(zoomTarget() / 1.25, cssW / 2, cssH / 2);
  else if (e.key === '0') setZoom(3, cssW / 2, cssH / 2);
  else if (e.code === 'KeyF') jumpTo('all');
  else if (e.code === 'KeyV') toggleVisit();
  else if (e.key === 'Escape') { followId = null; selectActor(null); }
  else if (e.code === 'KeyL') jumpTo('lead');
  else if (e.code === 'KeyP') jumpTo('war');
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function toggleVisit() {
  visitMode = !visitMode;
  elVisit.classList.toggle('on', visitMode);
  elVisit.setAttribute('aria-pressed', String(visitMode));
  if (visitMode) {
    followId = null;
    // on apparaît près de ce qu'on regarde
    const cx = cam.x + cssW / zoom / 2, cy = cam.y + cssH / zoom / 2;
    const spots = [[cx, cy], [448, LAYOUT.H - 24], [200, 128]];
    for (const [x, y] of spots) if (!footBlocked(x, y)) { visitor.x = x; visitor.y = y; break; }
    canvas.focus();
  } else if (selectedByProximity) selectActor(null);
}
