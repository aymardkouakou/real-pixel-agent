// =====================================================================
// Construction de la carte (couche statique + grille de collisions)
// =====================================================================
function block(x, y, w, h) {
  const x0 = Math.max(0, Math.floor(x / T)), x1 = Math.min(MAP_W - 1, Math.floor((x + w - 1) / T));
  const y0 = Math.max(0, Math.floor(y / T)), y1 = Math.min(MAP_H - 1, Math.floor((y + h - 1) / T));
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) grid[ty * MAP_W + tx] = 1;
}
const blocked = (tx, ty) => tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H || grid[ty * MAP_W + tx] === 1;

function deskSlot(i) {
  return { sx: OPEN.x0 + (i % OPEN.cols) * OPEN.w, sy: OPEN.y0 + Math.floor(i / OPEN.cols) * OPEN.h };
}
function annexSlot(i) {
  return { sx: ANNEX.x0 + (i % ANNEX.cols) * ANNEX.w, sy: ANNEX.y0 + Math.floor(i / ANNEX.cols) * ANNEX.h };
}

function buildMap(rows, annexRows = ANNEX_ROWS) {
  OPEN_ROWS = rows;
  ANNEX_ROWS = annexRows;
  MAP_W = annexRows ? 64 + ANNEX.tiles : 64;
  MAP_H = Math.max(40, Math.ceil((OPEN.y0 + Math.max(rows, annexRows) * OPEN.h + 32) / T));
  const W = MAP_W * T, H = MAP_H * T;
  world.width = stat.width = W;
  world.height = stat.height = H;
  grid = new Uint8Array(MAP_W * MAP_H);

  const meet = [];
  meet.push({ x: 172, y: 70, kind: 'end', side: 'w' });                 // bout de table : place du lead
  for (const cx of [200, 222, 244, 266, 288]) meet.push({ x: cx, y: 46, kind: 'north' });
  for (const cx of [200, 222, 244, 266, 288]) meet.push({ x: cx, y: 92, kind: 'south' });
  meet.push({ x: 308, y: 70, kind: 'end', side: 'e' });

  LAYOUT = {
    W, H,
    leadSeat: { x: 80, y: 62 },
    meet,
    lounge: [
      { x: 358, y: 62 }, { x: 370, y: 62 }, { x: 382, y: 62 },
      { x: 357, y: 101 }, { x: 385, y: 101 },
    ],
    entrance: { x: 448, y: H - 12 },
    zones: {
      lead: LEAD, war: WAR, lounge: LOUNGE,
      open: { x: 8, y: 120, w: 368, h: H - 128 },
      annex: annexRows ? { x: MAIN_W, y: 112, w: W - MAIN_W, h: H - 112 } : null,
      all: { x: 0, y: 0, w: W, h: H },
    },
  };
  const ab = document.querySelector('[data-zone="annex"]');
  if (ab) ab.hidden = !annexRows;
  staticHour = new Date().getHours();
  g = sg;
  drawStatic();
  g = wg;
  if (!visitor.look) visitor.look = lookFor('visiteur', '#111827');
  if (visitor.y > H - 12) { visitor.x = 448; visitor.y = H - 20; }
}

// ---------------------------------------------------------------------
function drawStatic() {
  const { W, H } = LAYOUT;
  sg.clearRect(0, 0, W, H);

  // --- sols ---
  // parquet chêne clair (général)
  rect(0, 0, W, H, '#dcc7a6');
  for (let y = ROOM_TOP, row = 0; y < H; y += 8, row++) {
    rect(0, y, W, 1, '#cfb893');
    for (let x = (row % 2) * 16; x < W; x += 32) rect(x, y + 1, 1, 7, '#d3bd99');
  }
  // bureau du lead : noyer
  rect(LEAD.x, LEAD.y, LEAD.w, LEAD.h, '#8b6b4f');
  for (let y = LEAD.y; y < LEAD.y + LEAD.h; y += 6) rect(LEAD.x, y, LEAD.w, 1, '#7d5f45');
  // tapis doré
  rect(30, 34, 100, 58, '#a8841c');
  rect(32, 36, 96, 54, '#c9a227');
  rect(36, 40, 88, 46, '#d4b03c');
  for (let x = 40; x < 122; x += 8) { rect(x, 38, 2, 1, '#a8841c'); rect(x, 87, 2, 1, '#a8841c'); }
  // salle de plan : moquette marine
  rect(WAR.x, WAR.y, WAR.w, WAR.h, '#2d3a5a');
  for (let y = WAR.y + 2; y < WAR.y + WAR.h; y += 4)
    for (let x = WAR.x + ((y >> 2) % 2) * 2; x < WAR.x + WAR.w; x += 4) rect(x, y, 1, 1, '#33426a');
  // lounge : carrelage cuisine + tapis
  for (let y = 16; y < 40; y += 4)
    for (let x = LOUNGE.x; x < LOUNGE.x + LOUNGE.w; x += 4)
      rect(x, y, 4, 4, ((x + y) >> 2) % 2 ? '#eceff1' : '#dfe3e6');
  rect(342, 44, 60, 66, '#1f8a8a');
  rect(344, 46, 56, 62, '#26a3a3');
  for (let x = 346; x < 398; x += 6) rect(x, 106, 3, 2, '#e9f7f7');
  // réception : béton ciré
  rect(384, 120, 120, H - 128, '#c6c9ce');
  for (let i = 0; i < 160; i++) {
    const h = hash('c' + i);
    rect(384 + (h % 120), 120 + ((h >>> 8) % (H - 128)), 1, 1, (h >>> 20) % 2 ? '#bcc0c5' : '#d0d3d7');
  }

  // --- murs ---
  drawBackWall(MAIN_W);
  rect(0, 0, 8, H, '#4b5263'); rect(6, ROOM_TOP, 2, H - ROOM_TOP, '#6b7385');
  rect(W - 8, 0, 8, H, '#4b5263'); rect(W - 8, ROOM_TOP, 2, H - ROOM_TOP, '#6b7385');
  if (ANNEX_ROWS) drawAnnex(W, H);
  rect(0, H - 8, W, 8, '#4b5263'); rect(8, H - 8, W - 16, 2, '#6b7385');
  block(0, 0, W, ROOM_TOP); block(0, 0, 8, H); block(W - 8, 0, 8, H); block(0, H - 8, 432, 8); block(464, H - 8, W - 464, 8);
  // porte d'entrée vitrée
  rect(432, H - 8, 32, 8, '#9fd8ef'); rect(447, H - 8, 2, 8, '#5f6b7a');
  rect(434, H - 18, 28, 8, '#8d6e63'); rect(436, H - 16, 24, 4, '#a1887f');
  text3('HELLO', 438, H - 16, '#efebe9');

  // parois vitrées verticales
  glassV(143, ROOM_TOP, ROOM_BOTTOM - ROOM_TOP); block(144, ROOM_TOP, 8, ROOM_BOTTOM - ROOM_TOP);
  glassV(335, ROOM_TOP, ROOM_BOTTOM - ROOM_TOP); block(336, ROOM_TOP, 8, ROOM_BOTTOM - ROOM_TOP);

  // --- bureau du lead ---
  // bibliothèque
  rect(10, 18, 10, 60, '#5d4037'); block(8, 16, 16, 64);
  const books = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#ecf0f1'];
  for (let s = 0; s < 5; s++) {
    rect(10, 20 + s * 12, 10, 1, '#3e2723');
    for (let b = 0; b < 4; b++) rect(11 + b * 2, 22 + s * 12, 2, 8, books[(s + b) % books.length]);
  }
  rect(12, 18, 6, 2, '#ffd54f'); // trophée
  // canapé + table basse
  rect(14, 92, 36, 12, '#37474f'); rect(14, 92, 36, 4, '#455a64'); rect(14, 96, 3, 8, '#263238'); rect(47, 96, 3, 8, '#263238');
  block(14, 92, 36, 12);
  plant(126, 22); plant(126, 90);
  // fauteuil de direction (derrière le lead)
  rect(72, 44, 16, 18, '#1f1f1f'); rect(74, 46, 12, 14, '#2d2d2d'); rect(75, 46, 10, 2, '#3a3a3a');
  drawLeadDesk(null, 0);
  block(46, 64, 68, 16);
  // enseigne
  text3('★ LEAD', 104, 20, '#ffd54f');

  // --- salle de plan ---
  rect(194, 1, 92, 14, '#111318');
  rect(196, 2, 88, 11, '#1b2030');
  text3('PLAN ROOM', 222, 6, '#6c7a9c');
  // chaises
  for (const s of LAYOUT.meet) chairAt(s);
  drawTable();
  block(184, 52, 112, 28);
  plant(152, 22); plant(326, 22); plant(152, 92); plant(326, 92);

  // parois vitrées horizontales (face visible, vue 3/4) avec portes
  glassH(8, 136, 64, 88);        // bureau lead, porte 64..88
  glassH(147, 336, 224, 256);    // salle de plan, porte 224..256
  block(8, 104, 56, 8); block(88, 104, 56, 8);
  block(144, 104, 80, 8); block(256, 104, 88, 8);

  // --- lounge ---
  rect(344, 18, 64, 12, '#eceff1'); rect(344, 18, 64, 3, '#b0bec5'); rect(344, 28, 64, 2, '#90a4ae');
  block(344, 16, 64, 16);
  rect(350, 12, 9, 11, '#263238'); rect(351, 14, 7, 4, '#c62828'); rect(353, 19, 3, 2, '#795548'); // machine à café
  rect(372, 20, 12, 5, '#90a4ae'); rect(374, 21, 8, 3, '#cfd8dc'); // évier
  rect(392, 15, 3, 6, '#2e7d32'); rect(396, 14, 3, 7, '#c62828'); rect(400, 16, 3, 5, '#f9a825'); // bocaux
  rect(412, 12, 14, 24, '#cfd8dc'); rect(412, 22, 14, 1, '#90a4ae'); rect(423, 15, 1, 5, '#78909c'); rect(423, 25, 1, 6, '#78909c');
  block(412, 16, 16, 24);
  // canapé corail
  rect(346, 46, 46, 16, '#c0392b');
  rect(348, 46, 42, 6, '#ff7a59'); rect(348, 52, 42, 8, '#ff9478');
  rect(346, 48, 3, 14, '#e05a3a'); rect(389, 48, 3, 14, '#e05a3a');
  block(346, 48, 46, 8);
  // table basse
  rect(352, 72, 36, 10, '#f5f5f5'); rect(352, 80, 36, 2, '#bdbdbd'); rect(358, 74, 6, 3, '#6d4c41'); rect(372, 73, 8, 5, '#4fc3f7');
  block(352, 72, 36, 10);
  // poufs
  bean(350, 92, '#00897b'); bean(378, 92, '#fbc02d');
  // ping-pong
  rect(424, 56, 44, 26, '#1b5e20'); rect(425, 57, 42, 22, '#2e7d32');
  rect(425, 67, 42, 1, '#ffffff'); rect(445, 56, 2, 26, '#eeeeee'); rect(425, 79, 42, 3, '#145a19');
  block(424, 56, 44, 26);
  rect(434, 62, 3, 3, '#e53935'); rect(456, 70, 3, 3, '#1e88e5');
  // borne d'arcade
  rect(482, 18, 16, 22, '#311b92'); rect(484, 20, 12, 9, '#111'); rect(484, 31, 12, 3, '#4527a0');
  rect(486, 32, 2, 1, '#ff1744'); rect(491, 32, 2, 1, '#00e676'); block(480, 16, 20, 24);
  plant(490, 92); plant(462, 22);
  // jardinières (limite basse du lounge)
  planter(344, 104, 56); planter(440, 104, 64);
  block(344, 104, 56, 8); block(440, 104, 64, 8);

  // --- open space ---
  const nDesks = OPEN_ROWS * OPEN.cols;
  for (let i = 0; i < nDesks; i++) {
    const { sx, sy } = deskSlot(i);
    drawOpenDesk(sx, sy, null, 0, true);
    block(sx + 6, sy + 16, 36, 14);
  }
  for (let r = 0; r < OPEN_ROWS; r++) plant(358 + 4, OPEN.y0 + r * OPEN.h + 10);
  // fontaine à eau
  rect(12, 122, 8, 12, '#cfd8dc'); rect(13, 118, 6, 6, '#81d4fa'); block(8, 120, 16, 16);
  // séparation open space / réception
  for (let y = 148; y < H - 16; y += 24) { planter(376, y, 8, true); block(376, y, 8, 18); }
  text3('OPEN SPACE', 28, 126, '#b39b74');

  // --- réception ---
  rect(398, 146, 76, 14, '#fafafa'); rect(398, 146, 76, 3, '#a1887f');
  rect(398, 154, 76, 6, '#e0e0e0'); rect(398, 156, 76, 1, '#26a69a');
  rect(430, 142, 12, 6, '#263238'); rect(431, 143, 10, 4, '#4fc3f7');
  block(398, 146, 76, 14);
  // tapis logo
  const initials = norm(wsName).split(/[^A-Z0-9]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3) || 'HQ';
  rect(406, 176, 60, 34, '#263238'); rect(408, 178, 56, 30, '#37474f');
  rect(428 - 2, 184, 20, 14, '#26a69a');
  text3(initials, 436 - Math.floor(text3w(initials) / 2), 189, '#ffffff');
  text3('WELCOME', 422, 200, '#80cbc4');
  // sièges d'attente
  for (let k = 0; k < 3; k++) { rect(392, 226 + k * 12, 10, 8, '#455a64'); rect(392, 226 + k * 12, 10, 3, '#607d8b'); block(392, 226 + k * 12, 10, 8); }
  plant(492, 128); plant(492, H - 28); plant(388, H - 28);
}

// Bâtiment annexe (agents des autres workspaces), relié par une porte sur le couloir
function drawAnnex(W, H) {
  const x = MAIN_W;
  // pelouse et arbres au-dessus de l'annexe
  rect(x, 0, W - x, 112, '#7cb342');
  for (let i = 0; i < 40; i++) { const h = hash('g' + i); rect(x + (h % (W - x)), (h >>> 8) % 108, 2, 1, '#689f38'); }
  for (const tx of [x + 30, x + 110, x + 190]) {
    rect(tx - 1, 70, 3, 14, '#6d4c41');
    rect(tx - 9, 52, 18, 16, '#2e7d32'); rect(tx - 6, 46, 12, 8, '#388e3c'); rect(tx - 4, 54, 6, 4, '#43a047');
  }
  rect(x + 60, 90, 120, 4, '#d7ccc8');
  block(x, 0, W - x, 120);
  // sol ardoise
  rect(x, 120, W - x - 8, H - 128, '#5c6672');
  for (let y = 120; y < H - 8; y += 8) rect(x, y, W - x - 8, 1, '#56606b');
  // murs : façade haute, mur mitoyen avec porte sur le couloir
  rect(x, 112, W - x, 8, '#4b5263'); rect(x, 118, W - x, 2, '#6b7385');
  rect(MAIN_W - 8, 0, 8, H, '#4b5263');
  rect(MAIN_W - 8, 120, 8, 16, '#8d6e63'); rect(MAIN_W - 6, 120, 4, 16, '#a1887f');
  block(MAIN_W - 8, 0, 8, 120); block(MAIN_W - 8, 136, 8, H - 136);
  text3('ANNEXE', x + 8, 124, '#cfd8dc');
  for (let i = 0; i < ANNEX_ROWS * ANNEX.cols; i++) {
    const { sx, sy } = annexSlot(i);
    drawOpenDesk(sx, sy, null, 0, true);
    block(sx + 6, sy + 16, 36, 14);
  }
}

function drawBackWall(W) {
  const sky = skyColors();
  rect(0, 0, W, ROOM_TOP, '#ebe6dd');
  rect(0, 0, W, 2, '#d7d0c4');
  rect(0, ROOM_TOP - 2, W, 2, '#b8b1a5');
  // fenêtres panoramiques (avec palmiers et collines)
  const wins = [[24, 40], [70, 40], [150, 40], [290, 40], [344, 40]];
  for (const [x, w] of wins) {
    rect(x - 1, 2, w + 2, 12, '#5f6b7a');
    for (let yy = 0; yy < 10; yy++) rect(x, 3 + yy, w, 1, yy < 5 ? sky.top : sky.bottom);
    rect(x, 10, w, 3, sky.hill);
    rect(x + 4, 9, 10, 1, sky.hill);
    const px = x + (hash('p' + x) % (w - 8)) + 3;
    rect(px, 6, 1, 6, sky.palm); rect(px - 2, 5, 5, 1, sky.palm); rect(px - 3, 6, 2, 1, sky.palm); rect(px + 2, 6, 2, 1, sky.palm);
    if (sky.stars) { rect(x + 6, 4, 1, 1, '#fff'); rect(x + w - 7, 5, 1, 1, '#fff'); }
    for (let k = x + 13; k < x + w; k += 13) rect(k, 3, 1, 10, '#5f6b7a');
  }
  // enseigne néon du workspace (lounge)
  const name = norm(wsName).slice(0, 14);
  const nx = 470 - Math.floor(text3w(name) / 2);
  rect(nx - 4, 2, text3w(name) + 8, 11, '#1a1426');
  text3(name, nx + 1, 6, '#7a2a6a');
  text3(name, nx, 5, '#ff6bd6');
}

// Moment de la journée : réglage « timeOfDay » ou heure réelle
function phase() {
  if (timeOfDay !== 'auto') return timeOfDay;
  const h = new Date().getHours();
  if (h >= 7 && h < 17) return 'day';
  if ((h >= 17 && h < 19) || h === 6) return 'sunset';
  return 'night';
}
function skyColors() {
  const ph = phase();
  if (ph === 'day') return { top: '#7cc6f2', bottom: '#a9dcf7', hill: '#7fb069', palm: '#2f5d3a', stars: false };
  if (ph === 'sunset') return { top: '#f4845f', bottom: '#f7b267', hill: '#6d597a', palm: '#3a2e39', stars: false };
  return { top: '#0b1d3a', bottom: '#1d2b53', hill: '#14213d', palm: '#0a0f1e', stars: true };
}
function skyColorsByHour() {
  const h = new Date().getHours();
  if (h >= 7 && h < 17) return { top: '#7cc6f2', bottom: '#a9dcf7', hill: '#7fb069', palm: '#2f5d3a', stars: false };
  if ((h >= 17 && h < 19) || h === 6) return { top: '#f4845f', bottom: '#f7b267', hill: '#6d597a', palm: '#3a2e39', stars: false };
  return { top: '#0b1d3a', bottom: '#1d2b53', hill: '#14213d', palm: '#0a0f1e', stars: true };
}

function glassV(x, y, h) {
  g.fillStyle = 'rgba(160,220,245,0.55)'; g.fillRect(x, y, 3, h);
  rect(x + 1, y, 1, h, 'rgba(255,255,255,0.7)');
}
function glassH(x0, x1, d0, d1) {
  const seg = (a, b) => {
    g.fillStyle = 'rgba(170,225,250,0.38)'; g.fillRect(a, 101, b - a, 11);
    rect(a, 100, b - a, 1, '#7d8a99'); rect(a, 111, b - a, 1, '#7d8a99');
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = a + 6; x < b - 4; x += 22) { g.fillRect(x, 103, 1, 6); g.fillRect(x + 2, 102, 1, 4); }
    for (let x = a + 20; x < b; x += 24) rect(x, 101, 1, 10, 'rgba(125,138,153,0.6)');
  };
  seg(x0, d0); seg(d1, x1);
  rect(d0 - 1, 98, 2, 14, '#5f6b7a'); rect(d1 - 1, 98, 2, 14, '#5f6b7a');
}
function plant(x, y) {
  rect(x - 4, y + 4, 8, 7, '#eceff1'); rect(x - 4, y + 4, 8, 2, '#cfd8dc');
  rect(x - 1, y - 3, 2, 7, '#2e7d32');
  rect(x - 5, y - 2, 4, 3, '#43a047'); rect(x + 1, y - 5, 4, 3, '#66bb6a');
  rect(x - 4, y - 7, 4, 3, '#66bb6a'); rect(x + 2, y, 4, 3, '#388e3c'); rect(x - 2, y - 9, 3, 3, '#81c784');
  block(x - 4, y + 2, 8, 8);
}
function planter(x, y, w, vertical) {
  if (vertical) {
    rect(x, y, 8, 18, '#6d4c41'); rect(x + 1, y + 1, 6, 16, '#3e2723');
    for (let k = 0; k < 4; k++) rect(x + 1 + (k % 2) * 3, y - 2 + k * 4, 4, 4, k % 2 ? '#43a047' : '#66bb6a');
    return;
  }
  rect(x, y, w, 8, '#6d4c41'); rect(x + 1, y + 1, w - 2, 3, '#3e2723');
  for (let k = x + 2; k < x + w - 3; k += 5) rect(k, y - 3 + ((k >> 2) % 2), 4, 5, (k >> 2) % 2 ? '#43a047' : '#66bb6a');
}
function bean(x, y, c) {
  rect(x, y + 2, 14, 8, shade(c, -0.25)); rect(x + 1, y, 12, 8, c); rect(x + 3, y + 1, 5, 2, shade(c, 0.25));
}
function chairAt(s) {
  if (s.kind === 'north') { rect(s.x - 6, 38, 12, 12, '#1f232a'); rect(s.x - 5, 39, 10, 8, '#2d333d'); }
  else if (s.kind === 'south') { rect(s.x - 6, 86, 12, 9, '#1f232a'); rect(s.x - 5, 87, 10, 5, '#2d333d'); }
  else { rect(s.x - 6, s.y - 14, 12, 16, '#1f232a'); rect(s.x - 5, s.y - 13, 10, 12, '#2d333d'); }
}
function drawTable() {
  rect(186, 52, 108, 28, '#c9b896');
  rect(184, 54, 112, 24, '#c9b896');
  rect(188, 52, 104, 24, '#efe6d8');
  rect(186, 54, 108, 20, '#efe6d8');
  rect(190, 53, 100, 1, '#fbf6ee');
  // ordinateurs portables et documents
  for (const cx of [200, 222, 244, 266, 288]) { rect(cx - 3, 54, 6, 3, '#90a4ae'); rect(cx - 2, 55, 4, 1, '#cfd8dc'); }
  for (const cx of [211, 255, 277]) rect(cx, 64, 5, 6, '#ffffff');
  rect(236, 62, 8, 8, '#66bb6a'); rect(238, 60, 4, 3, '#43a047');
}

// Bureau de l'open space : moderne, plateau blanc, écran fin
function drawOpenDesk(sx, sy, actor, t, empty) {
  const deskTop = sy + 16;
  if (empty) {
    rect(sx + 12, sy + 8, 12, 9, '#1f232a');
    rect(sx + 13, sy + 9, 10, 6, '#2d333d');
  }
  rect(sx + 6, deskTop, 36, 4, '#f4f4f2');
  rect(sx + 6, deskTop, 36, 1, '#ffffff');
  rect(sx + 6, deskTop + 4, 36, 3, '#d8dadf');
  rect(sx + 7, deskTop + 7, 1, 7, '#8a8f98'); rect(sx + 40, deskTop + 7, 1, 7, '#8a8f98');
  rect(sx + 7, deskTop + 13, 34, 1, '#8a8f98');
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(sx + 6, deskTop + 14, 36, 1);
  rect(sx + 13, deskTop + 1, 10, 1, '#c5c9d0');
  // écran fin sur bras
  rect(sx + 28, sy + 5, 13, 10, '#15171c');
  drawScreen(sx + 29, sy + 6, actor ? actor.agent.state : undefined, t, actor ? actor.look.seed : 0);
  rect(sx + 34, sy + 15, 1, 2, '#15171c');
  rect(sx + 32, deskTop + 1, 5, 1, '#5b6170');
  if (actor && actor.look.mug) { rect(sx + 8, deskTop - 2, 3, 3, '#ffffff'); rect(sx + 11, deskTop - 1, 1, 1, '#ffffff'); }
  else if (actor) { rect(sx + 8, deskTop - 3, 3, 3, '#66bb6a'); rect(sx + 8, deskTop, 3, 1, '#8d6e63'); }
}

// Grand bureau du lead : noyer, double écran, plaque dorée
function drawLeadDesk(actor, t) {
  const st = actor ? actor.agent.state : undefined;
  rect(46, 64, 68, 5, '#6d4c41');
  rect(46, 64, 68, 1, '#8d6e63');
  rect(46, 69, 68, 9, '#4e342e');
  rect(46, 77, 68, 2, '#3e2723');
  rect(72, 71, 16, 5, '#c9a227'); rect(73, 72, 14, 3, '#ffd54f');
  rect(75, 73, 10, 1, '#c9a227');
  // écrans
  rect(52, 47, 17, 13, '#15171c'); drawScreen(53, 48, st, t, 11, 15, 10);
  rect(60, 60, 1, 4, '#15171c'); rect(57, 63, 7, 1, '#15171c');
  rect(91, 47, 17, 13, '#15171c'); drawScreen(92, 48, st === undefined ? undefined : (st === 'typing' ? 'reading' : st), t + 777, 23, 15, 10);
  rect(99, 60, 1, 4, '#15171c'); rect(96, 63, 7, 1, '#15171c');
  rect(74, 64, 12, 1, '#cfd8dc');
  rect(108, 60, 4, 4, '#ffffff'); // tasse
  rect(48, 59, 4, 5, '#66bb6a'); rect(48, 63, 4, 1, '#8d6e63');
}
