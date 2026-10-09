// Real Pixel Agent — campus en pixel art (webview)
// Monde en pixels logiques (tuiles de 8 px) rendu sur un canvas hors écran,
// puis affiché via une caméra (pan / zoom continu) sur le canvas visible.
// Modules : 00 noyau · 10 carte · 20 écrans · 30 personnages · 40 chemins
//           50 acteurs · 60 rendu · 70 caméra · 80 interface · 90 extras

const vscode = acquireVsCodeApi();
const saved = vscode.getState() || {};
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const canvas = $('screen');
const ctx = canvas.getContext('2d');
const elCount = $('count');
const elEmpty = $('empty');
const elInfo = $('info');
const elZoom = $('zlvl');
const elZRange = $('zrange');
const elVisit = $('visit');
const elHint = $('hint');
const elHooks = $('hooksBadge');
const elJournal = $('journalPanel');

// =====================================================================
// Constantes de la carte
// =====================================================================
const T = 8;
let MAP_W = 64;                   // tuiles (64 + annexe éventuelle)
const MAIN_W = 512;               // largeur du bâtiment principal (px)
const ANNEX = { x0: 528, y0: 144, cols: 4, w: 56, h: 48, tiles: 31 };
let ANNEX_ROWS = 0;
let MAP_H = 40;                   // tuiles (grandit avec l'open space)
const ROOM_TOP = 16;              // y intérieur sous le mur du fond
const ROOM_BOTTOM = 112;          // ligne des parois vitrées
const OPEN = { x0: 24, y0: 144, cols: 6, w: 56, h: 48 };
const LEAD = { x: 8, y: 16, w: 136, h: 96 };
const WAR = { x: 147, y: 16, w: 189, h: 96 };
const LOUNGE = { x: 339, y: 16, w: 165, h: 96 };
let OPEN_ROWS = 3;
const SPEED = 46;                 // px logiques / s

const world = document.createElement('canvas');
const wg = world.getContext('2d');
const stat = document.createElement('canvas');
const sg = stat.getContext('2d');
let g = wg;
let grid = new Uint8Array(0);
let LAYOUT = null;
let staticHour = -1;

// =====================================================================
// État
// =====================================================================
let wsName = 'PIXEL HQ';
let labels = {};
let meetingMode = 'all';
const actors = new Map();
const deskOf = new Map();
const annexDeskOf = new Map();
let looks = {};                  // id -> graine d'apparence choisie par l'utilisateur
let timeOfDay = 'auto';
let soundOn = true;
let hookMode = 'off';
let selected = null;
let hovered = null;
let followId = null;
let leadOverride = saved.lead || null;
let leadId = null;
let gathering = false;
let firstUpdate = true;
let zoom = saved.zoom || 0;
const cam = { x: saved.camX ?? 0, y: saved.camY ?? 0 };
let camInit = saved.camX !== undefined;
let visitMode = false;
const visitor = { x: 448, y: 300, look: null, moving: false, back: false };
const keys = new Set();
let cssW = 300, cssH = 200;

const STATE_COLOR = {
  typing: '#4fc3f7', reading: '#81c784', running: '#2ecc71', searching: '#64b5f6',
  delegating: '#ce93d8', thinking: '#b0bec5', planning: '#ffb74d', waiting: '#f1c40f',
  permission: '#ff5252', sleeping: '#90a4ae',
};

// =====================================================================
// Outils de dessin
// =====================================================================
function rect(x, y, w, h, c) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }
function glyph(rows, x, y, c) {
  for (let r = 0; r < rows.length; r++)
    for (let k = 0; k < rows[r].length; k++) if (rows[r][k] === '#') rect(x + k, y + r, 1, 1, c);
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1, 7), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + f))));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('');
}

// Police 3×5 pour les enseignes (5 lignes de 3 pixels)
const FONT3 = {
  A: '.#.#.#####.##.#',
  B: '##.#.###.#.###.',
  C: '.###..#..#...##',
  D: '##.#.##.##.###.',
  E: '####..##.#..###',
  F: '####..##.#..#..',
  G: '.###..#.##.#.##',
  H: '#.##.#####.##.#',
  I: '###.#..#..#.###',
  J: '..#..#..##.#.#.',
  K: '#.##.###.#.##.#',
  L: '#..#..#..#..###',
  M: '#.########.##.#',
  N: '##.#.##.##.##.#',
  O: '.#.#.##.##.#.#.',
  P: '##.#.###.#..#..',
  Q: '.#.#.##.###..##',
  R: '##.#.###.#.##.#',
  S: '.###...#...###.',
  T: '###.#..#..#..#.',
  U: '#.##.##.##.####',
  V: '#.##.##.##.#.#.',
  W: '#.##.########.#',
  X: '#.##.#.#.#.##.#',
  Y: '#.##.#.#..#..#.',
  Z: '###..#.#.#..###',
  '0': '####.##.##.####',
  '1': '.#.##..#..#.###',
  '2': '##...#.#.#..###',
  '3': '##...#.#...###.',
  '4': '#.##.####..#..#',
  '5': '####..##...###.',
  '6': '.###..####.####',
  '7': '###..#.#..#..#.',
  '8': '####.#####.####',
  '9': '####.####..###.',
  '-': '......###......',
  '.': '.............#.',
  '_': '............###',
  ' ': '...............',
  '★': '.#.###.#.#.#...',
  '>': '#...#...#.#.#..',
};
function norm(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}
function text3(s, x, y, c) {
  const str = norm(s);
  for (let i = 0; i < str.length; i++) {
    const gl = FONT3[str[i]] || FONT3[' '];
    for (let p = 0; p < 15; p++) if (gl[p] === '#') rect(x + i * 4 + (p % 3), y + ((p / 3) | 0), 1, 1, c);
  }
}
const text3w = (s) => norm(s).length * 4 - 1;

const G = {
  q: ['.###.', '#...#', '..##.', '.....', '..#..'],
  bang: ['..#..', '..#..', '..#..', '.....', '..#..'],
  mag: ['.##..', '#..#.', '#..#.', '.##..', '....#'],
  person: ['..#..', '.###.', '..#..', '.#.#.', '.#.#.'],
  plan: ['####.', '#..#.', '####.', '#..#.', '####.'],
  z: ['###', '..#', '.#.', '#..', '###'],
  star: ['..#..', '.###.', '#####', '.###.', '.#.#.'],
};

// =====================================================================
// Apparence des personnages
// =====================================================================
const SKIN = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
const HAIR = ['#2b1b0e', '#1a1a1a', '#6b3e1f', '#b5651d', '#e6c35c', '#7d3c98', '#c0392b', '#dfe6e9'];
const SHIRT = ['#e74c3c', '#3498db', '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#d35400', '#2c3e50', '#e84393'];
const PANTS = ['#2c3e50', '#34495e', '#3d3d3d', '#5d4037', '#1e3a5f'];
function lookFor(id, teamShirt) {
  const h = hash(id);
  const shirt = teamShirt || SHIRT[(h >>> 6) % SHIRT.length];
  return {
    skin: SKIN[h % SKIN.length], hair: HAIR[(h >>> 3) % HAIR.length],
    shirt, shirtDark: shade(shirt, -0.3), pants: PANTS[(h >>> 11) % PANTS.length],
    cap: SHIRT[(h >>> 12) % SHIRT.length], style: (h >>> 9) % 3, mug: (h >>> 14) % 2 === 0, seed: h,
  };
}
