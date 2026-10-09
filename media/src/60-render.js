// =====================================================================
// Rendu
// =====================================================================
// Cadence adaptative : 60 i/s quand la caméra ou des agents bougent,
// ~20 i/s au repos (les écrans et bulles s'animent lentement), rien si l'onglet est caché.
let last = performance.now();
let lastRender = 0;
let dirty = true;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (LAYOUT) {
    step(dt);
    updateCamera(dt);
    const busy = dirty || cameraBusy() || anyWalking();
    if (busy || now - lastRender > 50) { render(now); lastRender = now; dirty = false; }
  }
  requestAnimationFrame(frame);
}
function anyWalking() {
  for (const a of actors.values()) if (!a.seated) return true;
  return false;
}

// Zone visible (en pixels monde) avec une marge : on ne redessine que ce qui peut s'afficher.
const VIEW = { x0: 0, y0: 0, x1: 0, y1: 0 };
const inView = (x, y, w, h) => x + w > VIEW.x0 && x < VIEW.x1 && y + h > VIEW.y0 && y < VIEW.y1;

function render(t) {
  if (timeOfDay === 'auto' && new Date().getHours() !== staticHour) { g = sg; drawStatic(); g = wg; staticHour = new Date().getHours(); }
  g = wg;
  const M = 24;
  VIEW.x0 = Math.max(0, Math.floor(cam.x) - M); VIEW.y0 = Math.max(0, Math.floor(cam.y) - M);
  VIEW.x1 = Math.min(LAYOUT.W, Math.ceil(cam.x + cssW / zoom) + M); VIEW.y1 = Math.min(LAYOUT.H, Math.ceil(cam.y + cssH / zoom) + M);
  const vw = VIEW.x1 - VIEW.x0, vh = VIEW.y1 - VIEW.y0;
  if (vw > 0 && vh > 0) wg.drawImage(stat, VIEW.x0, VIEW.y0, vw, vh, VIEW.x0, VIEW.y0, vw, vh);
  drawDynamicDecor(t);
  // ambiance : coucher de soleil / nuit (les écrans et les personnages restent éclairés)
  const ph = phase();
  if (ph !== 'day' && vw > 0 && vh > 0) {
    wg.fillStyle = ph === 'night' ? 'rgba(14,20,52,0.42)' : 'rgba(255,128,64,0.10)';
    wg.fillRect(VIEW.x0, ROOM_TOP, vw, Math.max(0, VIEW.y1 - ROOM_TOP));
  }

  const seated = [], walkers = [];
  for (const a of actors.values()) (a.seated && !a.leaving ? seated : walkers).push(a);
  const bubbles = [];

  // halo du lead
  const lead = leadId && actors.get(leadId);
  if (lead && lead.seated && lead.target.kind === 'lead') {
    const pulse = 0.18 + 0.08 * Math.sin(t / 600);
    const grd = wg.createRadialGradient(80, 58, 4, 80, 58, 46);
    grd.addColorStop(0, `rgba(255,213,79,${pulse})`); grd.addColorStop(1, 'rgba(255,213,79,0)');
    wg.fillStyle = grd; wg.fillRect(30, 12, 100, 90);
  }

  // bureaux occupés
  for (const a of seated) {
    const k = a.target.kind, st = a.agent.state, pose = poseFor(st);
    if (k === 'desk' || k === 'annex') {
      const { sx, sy } = k === 'desk' ? deskSlot(a.target.i) : annexSlot(a.target.i);
      a.hit = { x: sx + 4, y: sy - 10, w: 44, h: 42 };
      a.labelAt = { x: sx + 24, y: sy + 31 };
      if (!inView(sx, sy - 12, 48, 46)) continue;
      if (ph === 'night') { const lg = wg.createRadialGradient(sx + 24, sy + 14, 2, sx + 24, sy + 14, 26); lg.addColorStop(0, 'rgba(255,214,140,0.30)'); lg.addColorStop(1, 'rgba(255,214,140,0)'); wg.fillStyle = lg; wg.fillRect(sx - 4, sy - 12, 56, 52); }
      rect(sx + 12, sy + 8, 12, 9, '#1f232a'); rect(sx + 13, sy + 9, 10, 6, '#2d333d');
      drawSeated(sx + 13, sy + 3, a.look, pose, t, 'back');
      drawOpenDesk(sx, sy, a, t, false);
      drawSeated(sx + 13, sy + 3, a.look, pose, t, 'front', sy + 16);
      bubbles.push([a, sx + 13, sy + 3]);
    } else if (k === 'lead') {
      drawSeated(75, 51, a.look, pose, t, 'back');
      drawLeadDesk(a, t);
      drawSeated(75, 51, a.look, pose, t, 'front', 64);
      bubbles.push([a, 75, 51]);
      a.hit = { x: 44, y: 36, w: 72, h: 46 };
      a.labelAt = { x: 80, y: 82 };
    }
  }
  // salle de plan : nord -> table -> sud
  const meetSeated = seated.filter((a) => a.target.kind === 'meet');
  for (const a of meetSeated) {
    const s = LAYOUT.meet[a.target.i];
    if (s.kind === 'north') { drawSeated(s.x - 5, 39, a.look, poseFor(a.agent.state), t, 'back'); bubbles.push([a, s.x - 5, 39]); a.hit = { x: s.x - 7, y: 28, w: 14, h: 26 }; a.labelAt = null; }
  }
  if (meetSeated.length) drawTable();
  for (const a of meetSeated) {
    const s = LAYOUT.meet[a.target.i];
    if (s.kind === 'south') {
      drawSeatedBack(s.x - 5, 74, a.look);
      rect(s.x - 6, 86, 12, 9, '#1f232a'); rect(s.x - 5, 87, 10, 5, '#2d333d');
      bubbles.push([a, s.x - 5, 74]); a.hit = { x: s.x - 7, y: 64, w: 14, h: 32 }; a.labelAt = null;
    } else if (s.kind === 'end') {
      drawSitting(s.x, s.y, a.look, poseFor(a.agent.state), t);
      bubbles.push([a, s.x - 5, s.y - 17]); a.hit = { x: s.x - 7, y: s.y - 28, w: 14, h: 30 }; a.labelAt = null;
    }
  }
  // lounge
  for (const a of seated) {
    if (a.target.kind !== 'lounge') continue;
    drawSitting(a.x, a.y, a.look, poseFor(a.agent.state), t);
    bubbles.push([a, a.x - 5, a.y - 17]);
    a.hit = { x: a.x - 7, y: a.y - 28, w: 14, h: 30 }; a.labelAt = null;
  }
  // marcheurs + visiteur, triés par profondeur
  const moving = walkers.slice();
  if (visitMode) moving.push(visitor);
  moving.sort((p, q) => p.y - q.y);
  for (const a of moving) {
    if (a !== visitor) { a.hit = { x: a.x - 7, y: a.y - 22, w: 14, h: 24 }; a.labelAt = null; }
    if (!inView(a.x - 8, a.y - 30, 16, 32)) continue;
    drawWalker(a.x, a.y, a.look, t, a === visitor ? visitor.moving : a.path.length > 0 && !(a.delay > 0), a.back);
  }
  // bulles et badges par-dessus
  for (const [a, hx, hy] of bubbles) {
    if (!inView(hx - 10, hy - 16, 30, 20)) continue;
    drawBubble(hx, hy, a.agent.state, t, a.agent.tool);
    if (a.id === leadId) {
      const hasBubble = !['typing', 'reading', 'running', 'idle'].includes(a.agent.state);
      glyph(G.star, hasBubble ? hx - 7 : hx + 2, hy - 8 - (((t / 500) | 0) % 2), '#ffd54f');
    }
  }
  for (const a of walkers) if (a.id === leadId) glyph(G.star, a.x - 2, a.y - 26, '#ffd54f');

  // ---- affichage écran ----
  blitWorld();
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawLabels(cam.x, cam.y);
  drawMinimap();
}

// Affiche la portion visible du monde. Zoom entier (en pixels écran) : copie directe
// au plus proche voisin. Zoom fractionnaire : on agrandit d'abord d'un facteur entier
// (pixels nets), puis on réduit en lissé jusqu'à l'échelle exacte — pas de pixels
// de tailles inégales, pas de flou, et un déplacement au sous-pixel près.
const up = document.createElement('canvas');
const ug = up.getContext('2d');
function blitWorld() {
  const dpr = window.devicePixelRatio || 1;
  const s = zoom * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1c1f26';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const x0 = Math.max(0, Math.floor(cam.x)), y0 = Math.max(0, Math.floor(cam.y));
  const x1 = Math.min(LAYOUT.W, Math.ceil(cam.x + cssW / zoom) + 1), y1 = Math.min(LAYOUT.H, Math.ceil(cam.y + cssH / zoom) + 1);
  const sw = x1 - x0, sh = y1 - y0;
  if (sw <= 0 || sh <= 0) return;
  const dx = (x0 - cam.x) * s, dy = (y0 - cam.y) * s;
  const k = Math.round(s);
  if (Math.abs(s - k) < 0.02 && k >= 1) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(world, x0, y0, sw, sh, Math.round(dx), Math.round(dy), sw * k, sh * k);
    return;
  }
  const kk = Math.max(1, Math.ceil(s));
  if (up.width < sw * kk || up.height < sh * kk) { up.width = Math.max(up.width, sw * kk); up.height = Math.max(up.height, sh * kk); }
  ug.imageSmoothingEnabled = false;
  ug.clearRect(0, 0, sw * kk, sh * kk);
  ug.drawImage(world, x0, y0, sw, sh, 0, 0, sw * kk, sh * kk);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(up, 0, 0, sw * kk, sh * kk, dx, dy, sw * s, sh * s);
}

function drawDynamicDecor(t) {
  // borne d'arcade
  const k = ((t / 200) | 0);
  rect(484, 20, 12, 9, '#0d0221');
  rect(485 + (k % 10), 22 + ((k >> 1) % 5), 2, 2, ['#ff1744', '#00e676', '#ffea00'][k % 3]);
  // néon qui scintille de temps en temps
  if (k % 47 === 0) { const name = norm(wsName).slice(0, 14); text3(name, 470 - Math.floor(text3w(name) / 2), 5, '#7a2a6a'); }
  // écran de la salle de plan : kanban animé en réunion
  if (gathering) {
    rect(196, 2, 88, 11, '#fdfdfd');
    const cycle = (t / 700) % 18;
    const colsC = ['#ffb74d', '#4fc3f7', '#81c784'];
    for (let c = 0; c < 3; c++) {
      rect(198 + c * 29, 3, 26, 1, colsC[c]);
      for (let r = 0; r < 3; r++) for (let n = 0; n < 4; n++) {
        if (c * 12 + r * 4 + n < cycle * 2) rect(198 + c * 29 + n * 6, 5 + r * 3, 5, 2, shade(colsC[c], 0.15 * ((n + r) % 2)));
      }
    }
    if (((t / 400) | 0) % 2) rect(198 + Math.floor(cycle * 4.6) % 84, 11, 2, 1, '#e53935');
  }
}

const FONT = (getComputedStyle(document.body).getPropertyValue('--vscode-font-family') || 'sans-serif').trim();
function drawLabels(cx, cy) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const a of actors.values()) {
    if (a.leaving) continue;
    const ag = a.agent;
    const isLead = a.id === leadId;
    const show = isLead || a.id === selected || a.id === hovered || (zoom >= 2.5 && a.labelAt);
    if (a.hit && (a.id === selected || a.id === hovered)) {
      ctx.strokeStyle = a.id === selected ? '#ffd166' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.setLineDash(a.id === selected ? [6, 4] : []);
      ctx.strokeRect((a.hit.x - cx) * zoom, (a.hit.y - cy) * zoom, a.hit.w * zoom, a.hit.h * zoom);
      ctx.setLineDash([]);
    }
    if (!show) continue;
    const pos = a.labelAt || (a.hit ? { x: a.hit.x + a.hit.w / 2, y: a.hit.y + a.hit.h + 1 } : { x: a.x, y: a.y + 2 });
    const X = (pos.x - cx) * zoom, Y = (pos.y - cy) * zoom;
    if (X < -100 || Y < -40 || X > cssW + 100 || Y > cssH + 40) continue;
    const max = Math.max(90, Math.min(260, 50 * zoom));
    const size = Math.round(isLead ? Math.min(16, Math.max(11, zoom * 3.8)) : Math.min(14, Math.max(10, zoom * 3.3)));
    ctx.font = `600 ${size}px ${FONT}`;
    const name = `${isLead ? '★ ' : ag.isSub ? '↳ ' : ''}${ag.external ? '[' + ag.project + '] ' : ''}#${ag.num} ${ag.title}`;
    const txt = fit(name, max);
    const w = ctx.measureText(txt).width;
    ctx.fillStyle = isLead ? 'rgba(60,45,0,0.82)' : 'rgba(17,24,39,0.78)';
    roundRect(X - w / 2 - 5, Y - 1, w + 10, size + 4, 4);
    ctx.fillStyle = isLead ? '#ffd54f' : '#f5f6fa';
    ctx.fillText(txt, X, Y + 1);
    if (a.labelAt || a.id === selected || a.id === hovered) {
      const ssz = Math.round(Math.min(12, Math.max(9, zoom * 2.9)));
      ctx.font = `${ssz}px ${FONT}`;
      const st = (labels[ag.state] || ag.state) + (ag.detail ? ' · ' + ag.detail : '');
      const stTxt = fit('● ' + st, max);
      const sw2 = ctx.measureText(stTxt).width;
      ctx.fillStyle = 'rgba(17,24,39,0.72)';
      roundRect(X - sw2 / 2 - 4, Y + size + 4, sw2 + 8, ssz + 4, 3);
      ctx.fillStyle = STATE_COLOR[ag.state] || '#ccc';
      ctx.fillText(stTxt, X, Y + size + 6);
    }
  }
  if (visitMode) {
    const X = (visitor.x - cx) * zoom, Y = (visitor.y - cy) * zoom;
    ctx.font = `600 ${Math.round(Math.min(13, Math.max(10, zoom * 3.2)))}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(X - 14, Y + 4, 28, 14, 4);
    ctx.fillStyle = '#111827';
    ctx.fillText('Toi', X, Y + 5);
  }
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  ctx.fill();
}
function fit(text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(text.slice(0, mid) + '…').width <= max) lo = mid; else hi = mid - 1; }
  return text.slice(0, lo) + '…';
}

// ---- minimap ----
let mm = null;
function drawMinimap() {
  if (cssW < 280 || (cssW / zoom >= LAYOUT.W && cssH / zoom >= LAYOUT.H)) { mm = null; return; }
  const w = Math.min(150, Math.round(cssW * 0.24));
  const h = Math.round((w * LAYOUT.H) / LAYOUT.W);
  const x = cssW - w - 10, y = cssH - h - 10;
  mm = { x, y, w, h, s: w / LAYOUT.W };
  ctx.fillStyle = 'rgba(17,24,39,0.85)';
  ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.9;
  ctx.drawImage(stat, 0, 0, LAYOUT.W, LAYOUT.H, x, y, w, h);
  ctx.globalAlpha = 1;
  for (const a of actors.values()) {
    if (a.leaving) continue;
    ctx.fillStyle = a.id === leadId ? '#ffd54f' : STATE_COLOR[a.agent.state] || '#fff';
    const r = a.id === leadId ? 3 : 2;
    ctx.fillRect(x + a.x * mm.s - r, y + (a.y - 8) * mm.s - r, r * 2, r * 2);
  }
  if (visitMode) { ctx.fillStyle = '#fff'; ctx.fillRect(x + visitor.x * mm.s - 2, y + (visitor.y - 8) * mm.s - 2, 4, 4); }
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + cam.x * mm.s + 0.5, y + cam.y * mm.s + 0.5, (cssW / zoom) * mm.s, (cssH / zoom) * mm.s);
}
