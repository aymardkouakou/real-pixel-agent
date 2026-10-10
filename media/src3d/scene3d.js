// Real Pixel Agent — rendu 3D (prototype). Bundle esbuild -> media/scene3d.js, exposé via window.RPA3D.
// Le monde 2D reste la source de vérité (positions, trajets, états) : cette scène ne fait que le dessiner.
// 1 unité 3D = 1 tuile = 8 px logiques ; x -> X, y -> Z, la hauteur est Y.
import * as THREE from 'three';

const S = 1 / 8;
const STATE_COLOR = {
  typing: '#4fc3f7', reading: '#81c784', running: '#2ecc71', searching: '#64b5f6',
  delegating: '#ce93d8', thinking: '#b0bec5', planning: '#ffb74d', waiting: '#f1c40f',
  permission: '#ff5252', sleeping: '#78909c',
};
const BUBBLE = {
  thinking: '…', waiting: '?', permission: '!', searching: '🔍', delegating: '👥', planning: '📋', sleeping: 'z z',
};
const POSE = { typing: 'type', reading: 'read', thinking: 'think', planning: 'think', permission: 'wave', sleeping: 'sleep' };

const mats = new Map();
const mat = (color, extra = {}) => {
  const { noShadow, ...props } = extra;
  const key = color + JSON.stringify(props);
  let m = mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.0, ...props }); mats.set(key, m); }
  return m;
};
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, color, x, y, z, parent, extra) {
  const m = new THREE.Mesh(boxGeo, extra && extra.material ? extra.material : mat(color, extra));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = !(extra && extra.noShadow);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
// boîte exprimée en pixels logiques : (x, y) coin haut-gauche au sol, hauteur h en unités
function pbox(x, y, w, d, h, color, parent, lift = 0, extra) {
  return box(w * S, h, d * S, color, (x + w / 2) * S, lift + h / 2, (y + d / 2) * S, parent, extra);
}

// ---------------------------------------------------------------------
// Personnage (voxels)
// ---------------------------------------------------------------------
function makeCharacter(look) {
  const root = new THREE.Group();
  const body = new THREE.Group();           // pivot : assis / debout
  root.add(body);
  const skin = look.skin, hair = look.hair;
  const legL = new THREE.Group(), legR = new THREE.Group();
  legL.position.set(-0.28, 0.95, 0); legR.position.set(0.28, 0.95, 0);
  box(0.42, 0.95, 0.46, look.pants, 0, -0.475, 0, legL);
  box(0.42, 0.95, 0.46, look.pants, 0, -0.475, 0, legR);
  box(0.46, 0.2, 0.6, '#141414', 0, -0.9, 0.06, legL);
  box(0.46, 0.2, 0.6, '#141414', 0, -0.9, 0.06, legR);
  body.add(legL, legR);
  const torso = box(1.1, 1.1, 0.62, look.shirt, 0, 1.5, 0, body);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-0.72, 1.95, 0); armR.position.set(0.72, 1.95, 0);
  for (const a of [armL, armR]) {
    box(0.3, 0.85, 0.34, look.shirtDark, 0, -0.42, 0, a);
    box(0.28, 0.24, 0.3, skin, 0, -0.95, 0, a);
    body.add(a);
  }
  const head = new THREE.Group();
  head.position.set(0, 2.05, 0);
  box(0.82, 0.8, 0.78, skin, 0, 0.4, 0, head);
  if (look.style === 2) {
    box(0.9, 0.28, 0.86, look.cap, 0, 0.82, 0, head);
    box(0.9, 0.08, 0.5, look.cap, 0, 0.7, 0.55, head);
  } else {
    box(0.9, 0.3, 0.86, hair, 0, 0.82, -0.02, head);
    box(0.9, look.style === 1 ? 0.9 : 0.5, 0.2, hair, 0, look.style === 1 ? 0.4 : 0.55, -0.34, head);
  }
  box(0.1, 0.12, 0.05, '#1b1b1b', -0.2, 0.42, 0.4, head, { noShadow: true });
  box(0.1, 0.12, 0.05, '#1b1b1b', 0.2, 0.42, 0.4, head, { noShadow: true });
  body.add(head);
  const chair = new THREE.Group();
  box(1.1, 0.16, 1.1, '#2b2f3a', 0, 0.42, 0, chair);
  box(0.16, 0.97, 0.16, '#444b59', 0, -0.07, 0, chair);
  box(1.1, 0.9, 0.12, '#2b2f3a', 0, 0.95, -0.52, chair);
  chair.visible = false;
  root.add(chair);
  root.userData = { body, legL, legR, armL, armR, head, torso, chair };
  return root;
}

function animate(ch, pose, moving, t, seated) {
  const { body, legL, legR, armL, armR, head, chair } = ch.userData;
  chair.visible = seated;
  // remise à zéro
  legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0);
  armL.rotation.set(0, 0, 0); armR.rotation.set(0, 0, 0);
  head.rotation.set(0, 0, 0); head.position.y = 2.05;
  body.position.y = 0; body.rotation.x = 0;
  if (seated) {
    // jambes à l'horizontale devant, assis sur une chaise
    body.position.y = -0.38;
    legL.rotation.x = -Math.PI / 2; legR.rotation.x = -Math.PI / 2;
    legL.position.set(-0.28, 0.95, 0.05); legR.position.set(0.28, 0.95, 0.05);
  } else {
    legL.position.set(-0.28, 0.95, 0); legR.position.set(0.28, 0.95, 0);
  }
  if (moving) {
    const s = Math.sin(t * 9);
    legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7;
    armL.rotation.x = -s * 0.6; armR.rotation.x = s * 0.6;
    body.position.y = Math.abs(Math.cos(t * 9)) * 0.08;
    return;
  }
  switch (pose) {
    case 'type': {
      const f = Math.sin(t * 22), g = Math.sin(t * 22 + 2);
      armL.rotation.x = -1.25 + f * 0.12; armR.rotation.x = -1.25 + g * 0.12;
      head.rotation.x = 0.12;
      break;
    }
    case 'read':
      armL.rotation.x = -1.1; armR.rotation.x = -1.1;
      armL.rotation.z = 0.25; armR.rotation.z = -0.25;
      head.rotation.x = 0.25;
      break;
    case 'think':
      armR.rotation.x = -2.3; armR.rotation.z = -0.35;
      head.rotation.z = Math.sin(t * 1.4) * 0.08;
      break;
    case 'wave':
      armR.rotation.z = -2.6 + Math.sin(t * 8) * 0.35;
      break;
    case 'sleep':
      head.rotation.x = 0.7; head.position.y = 1.95;
      body.rotation.x = 0.12;
      break;
    default:
      body.position.y += Math.sin(t * 1.6) * 0.03;
      armL.rotation.z = 0.06; armR.rotation.z = -0.06;
  }
}

// ---------------------------------------------------------------------
// Sprites (étiquettes et bulles)
// ---------------------------------------------------------------------
const texCache = new Map();
function textSprite(key, draw, w, h, scale) {
  let tex = texCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, tex);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(scale * (w / h), scale, 1);
  sp.renderOrder = 10;
  return sp;
}
function fitText(g, text, max) {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
// Étiquette : nom + ligne d'état optionnelle. Taille écran constante (sizeAttenuation: false).
function labelSprite(text, status, color, lead) {
  const h = status ? 104 : 56;
  const key = `L|${text}|${status}|${color}|${lead}`;
  let tex = texCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = h;
    const g = c.getContext('2d');
    g.font = '600 30px system-ui, sans-serif';
    const name = fitText(g, text, 440);
    const tw = g.measureText(name).width;
    let sw = 0, st = '';
    if (status) { g.font = '400 25px system-ui, sans-serif'; st = fitText(g, '● ' + status, 440); sw = g.measureText(st).width; }
    const bw = Math.max(tw, sw) + 28;
    g.fillStyle = lead ? 'rgba(60,45,0,0.9)' : 'rgba(17,24,39,0.88)';
    g.beginPath(); g.roundRect((512 - bw) / 2, 3, bw, h - 6, 12); g.fill();
    g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.roundRect((512 - bw) / 2, 3, bw, h - 6, 12); g.stroke();
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.font = '600 30px system-ui, sans-serif';
    g.fillStyle = lead ? '#ffd54f' : '#f5f6fa';
    g.fillText(name, 256, status ? 30 : h / 2 + 1);
    if (status) { g.font = '400 25px system-ui, sans-serif'; g.fillStyle = color; g.fillText(st, 256, 77); }
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, tex);
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, sizeAttenuation: false }));
  sp.center.set(0.5, 0);
  sp.renderOrder = 10;
  sp.userData.aspect = 512 / h;
  sp.userData.lines = status ? 2 : 1;
  return sp;
}
function bubbleSprite(sym, border) {
  return textSprite(`B|${sym}|${border}`, (g, w, h) => {
    g.fillStyle = '#fff'; g.strokeStyle = border; g.lineWidth = 6;
    g.beginPath(); g.roundRect(6, 6, w - 12, h - 26, 18); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 10, h - 20); g.lineTo(w / 2, h - 4); g.lineTo(w / 2 + 10, h - 20); g.fill();
    g.fillStyle = '#1b1b1b'; g.font = '700 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sym, w / 2, (h - 20) / 2 + 3);
  }, 96, 96, 1.5);
}

// ---------------------------------------------------------------------
// Écrans animés (texture canvas repeinte par le peintre 2D de main.js), sols texturés
// ---------------------------------------------------------------------
function makeScreen(w, h, pw, ph) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  return { c, ctx: c.getContext('2d'), tex, mesh, w, h, sig: '' };
}
function floorMaterial(kind, w, d) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (kind === 'parquet') {
    g.fillStyle = '#6d5a47'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? '#74604b' : '#665341'; g.fillRect(0, i * 16, 64, 15);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, i * 16 + 15, 64, 1);
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(((i * 23) % 56) + 4, i * 16, 1, 15);
    }
  } else {
    g.fillStyle = '#3a4252'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#434c60'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 64, 1); g.fillRect(0, 0, 1, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  tex.repeat.set(Math.max(1, w * S / 4), Math.max(1, d * S / 4));
  return new THREE.MeshStandardMaterial({ map: tex, roughness: kind === 'parquet' ? 0.55 : 0.8 });
}

// ---------------------------------------------------------------------
// Scène
// ---------------------------------------------------------------------
function create(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1500);
  const raycaster = new THREE.Raycaster();

  const hemi = new THREE.HemisphereLight(0xffffff, 0x556070, 1.0);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  scene.add(hemi, sun, sun.target);

  let world = new THREE.Group();
  scene.add(world);
  const chars = new Map();         // id -> { group, look, label, bubble, state }
  let layoutKey = null;
  let size = { W: 512, H: 320 };
  const lamps = [];
  const roomLamps = [];
  const screens = new Map();       // clé -> écran animé { ctx, tex, mesh, type, ... }
  const sway = [];                 // feuillages qui bougent
  let viewH = 600;
  const ringSel = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.25, 40), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.95, depthWrite: false }));
  const ringHov = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.15, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
  for (const r of [ringSel, ringHov]) { r.rotation.x = -Math.PI / 2; r.visible = false; r.renderOrder = 2; scene.add(r); }

  // caméra orbitale
  const orbit = { az: 0, pol: 0.95, dist: 60, tx: 32, ty: 0, tz: 24 };
  let orbitInit = false;
  function applyCamera() {
    orbit.pol = Math.max(0.15, Math.min(1.4, orbit.pol));
    orbit.dist = Math.max(8, Math.min(600, orbit.dist));
    const sp = Math.sin(orbit.pol), cp = Math.cos(orbit.pol);
    camera.position.set(
      orbit.tx + orbit.dist * sp * Math.sin(orbit.az), orbit.ty + orbit.dist * cp, orbit.tz + orbit.dist * sp * Math.cos(orbit.az),
    );
    camera.lookAt(orbit.tx, orbit.ty, orbit.tz);
  }
  // caméra de suivi : se place derrière l'agent, regarde dans sa direction et tourne avec lui.
  // Modes : 'free' (orbite libre) -> 'chase' (suivi) -> 'return' (retour progressif à l'orbite libre).
  const occluders = [];
  const ray = new THREE.Raycaster();
  const chase = {
    mode: 'free', id: null, lastT: 0,
    tx: 0, ty: 0, tz: 0, az: 0, pol: 1, dist: 20, lx: 0, ly: 0, lz: 0,   // état lissé de la caméra
    offAz: 0, offPol: 0,                                                  // décalage choisi par l'utilisateur (glisser)
  };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const ease = (rate, dt) => 1 - Math.exp(-rate * dt);
  function placeChase() {
    const sp = Math.sin(chase.pol), cp = Math.cos(chase.pol);
    camera.position.set(chase.tx + chase.dist * sp * Math.sin(chase.az), chase.ty + chase.dist * cp, chase.tz + chase.dist * sp * Math.cos(chase.az));
    camera.lookAt(chase.lx, chase.ly, chase.lz);
  }
  function updateChase(f) {
    const dt = Math.min(0.1, Math.max(0.001, (f.t - chase.lastT) / 1000));
    chase.lastT = f.t;
    const ch = f.follow ? chars.get(f.follow) : null;
    if (ch && chase.mode !== 'chase') {
      if (chase.mode === 'free') {          // départ : on part de la vue actuelle, sans saut
        chase.tx = orbit.tx; chase.ty = orbit.ty; chase.tz = orbit.tz; chase.az = orbit.az; chase.pol = orbit.pol; chase.dist = orbit.dist;
        chase.lx = orbit.tx; chase.ly = orbit.ty; chase.lz = orbit.tz;
      }
      if (chase.id !== f.follow) { chase.offAz = 0; chase.offPol = 0; }
      chase.mode = 'chase'; chase.id = f.follow;
    }
    if (chase.mode === 'chase' && !ch) {    // fin du suivi : on rend la main à l'orbite à partir de la vue courante
      orbit.az = chase.az; orbit.pol = chase.pol;
      chase.mode = 'return'; chase.id = null;
    }
    if (chase.mode === 'free') return false;

    if (chase.mode === 'chase') {
      const m = ch.model, yaw = m.rotation.y;
      const px = ch.group.position.x, pz = ch.group.position.z;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const head = ch.group.position.y + 2.0;
      const wantAz = yaw + Math.PI + chase.offAz;
      const wantPol = Math.max(0.35, Math.min(1.4, 1.05 + chase.offPol));
      let wantDist = Math.max(11, Math.min(70, orbit.dist * 0.6));
      // un mur entre l'agent et la caméra : on rapproche la caméra juste avant le mur
      const sp = Math.sin(chase.pol), cp = Math.cos(chase.pol);
      const origin = new THREE.Vector3(chase.tx, chase.ty, chase.tz);
      ray.set(origin, new THREE.Vector3(sp * Math.sin(chase.az), cp, sp * Math.cos(chase.az)).normalize());
      ray.far = wantDist;
      const hit = ray.intersectObjects(occluders, false)[0];
      if (hit) wantDist = Math.max(2.5, hit.distance - 0.6);
      const kp = ease(9, dt), ka = ease(3.2, dt), kd = ease(wantDist < chase.dist ? 14 : 4, dt);
      chase.tx += (px - chase.tx) * kp; chase.ty += (head - 0.6 - chase.ty) * kp; chase.tz += (pz - chase.tz) * kp;
      chase.az += wrap(wantAz - chase.az) * ka;
      chase.pol += (wantPol - chase.pol) * kd; chase.dist += (wantDist - chase.dist) * kd;
      // le regard porte un peu devant l'agent : on voit où il va
      chase.lx += (px + fx * 2.4 - chase.lx) * kp; chase.ly += (head - chase.ly) * kp; chase.lz += (pz + fz * 2.4 - chase.lz) * kp;
      placeChase();
      return true;
    }
    // retour progressif vers l'orbite libre (cible et distance fournies par l'interface)
    const k = ease(7, dt);
    chase.tx += (orbit.tx - chase.tx) * k; chase.ty += (orbit.ty - chase.ty) * k; chase.tz += (orbit.tz - chase.tz) * k;
    chase.az += wrap(orbit.az - chase.az) * k; chase.pol += (orbit.pol - chase.pol) * k; chase.dist += (orbit.dist - chase.dist) * k;
    chase.lx = chase.tx; chase.ly = chase.ty; chase.lz = chase.tz;
    placeChase();
    if (Math.hypot(orbit.tx - chase.tx, orbit.tz - chase.tz) + Math.abs(orbit.dist - chase.dist) < 0.15) { chase.mode = 'free'; applyCamera(); return false; }
    return true;
  }
  let drag = null;
  let onSelect = () => {};
  let onPan = null, onWheel = null, onDouble = null, onHover = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, button: e.button, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) { if (onHover) { const id = pick(e); canvas.style.cursor = id ? 'pointer' : 'grab'; onHover(id); } return; }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.button === 0 && chase.mode === 'chase') { chase.offAz -= dx * 0.006; chase.offPol -= dy * 0.005; chase.offPol = Math.max(-0.7, Math.min(0.3, chase.offPol)); return; }
    if (drag.button === 0) { orbit.az -= dx * 0.006; orbit.pol -= dy * 0.005; }
    else {
      const k = orbit.dist * 0.0016;
      const px = (-dx * Math.cos(orbit.az) + dy * Math.sin(orbit.az)) * k;
      const pz = (dx * Math.sin(orbit.az) + dy * Math.cos(orbit.az)) * k;
      if (onPan) onPan(px / S, pz / S); else { orbit.tx += px; orbit.tz += pz; }
    }
    applyCamera();
  });
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hits = raycaster.intersectObjects([...chars.values()].map((c) => c.group), true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.agentId) o = o.parent; if (o) return o.userData.agentId; }
    return null;
  }
  canvas.addEventListener('pointerup', (e) => {
    const d = drag; drag = null;
    if (!d || d.moved || d.button !== 0) return;
    onSelect(pick(e));
  });
  canvas.addEventListener('pointerleave', () => { if (onHover && !drag) onHover(null); });
  canvas.addEventListener('dblclick', (e) => { if (onDouble) onDouble(pick(e), e); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (onWheel) { onWheel(e); return; }
    orbit.dist *= Math.exp(e.deltaY * 0.0012);
    applyCamera();
  }, { passive: false });

  function addScreen(key, w, h, x, y, z, pw, ph, yaw, parent) {
    const sc = makeScreen(w, h, pw, ph);
    sc.type = key.split(':')[0];
    sc.mesh.position.set(x, y, z);
    sc.mesh.rotation.y = yaw;
    (parent || world).add(sc.mesh);
    screens.set(key, sc);
  }

  function buildWorld(L, c) {
    scene.remove(world);
    world.traverse((o) => { if (o.geometry && o.geometry !== boxGeo) o.geometry.dispose(); });
    world = new THREE.Group();
    scene.add(world);
    lamps.length = 0; roomLamps.length = 0; sway.length = 0;
    for (const sc of screens.values()) sc.tex.dispose();
    screens.clear();
    size = { W: L.W, H: L.H };
    const W = L.W * S, H = L.H * S;

    // sol général
    pbox(0, 0, L.W, L.H, 0.2, '#262b36', world, -0.2, { noShadow: true });
    // bâtiment principal : dalle
    pbox(0, 0, c.MAIN_W, c.ROOM_BOTTOM + 16, 0.2, '#3a4252', world, -0.0, { noShadow: true, material: floorMaterial('tile', c.MAIN_W, c.ROOM_BOTTOM + 16) });
    // mur du fond
    pbox(0, 0, c.MAIN_W, c.ROOM_TOP - 8, 3.4, '#8f98ad', world);
    pbox(0, c.ROOM_TOP - 8, c.MAIN_W, 2, 0.35, '#6b7488', world);
    // open space : parquet
    pbox(8, c.ROOM_BOTTOM + 8, c.OPEN.cols * c.OPEN.w + 24, L.H - c.ROOM_BOTTOM - 16, 0.1, '#6d5a47', world, 0.2, { noShadow: true, material: floorMaterial('parquet', c.OPEN.cols * c.OPEN.w + 24, L.H - c.ROOM_BOTTOM - 16) });
    // salles
    const room = (r, floor, wall) => {
      const rl = new THREE.PointLight(0xffe2b8, 0, 60, 1.2);   // plafonnier : allumé le soir et la nuit
      rl.position.set((r.x + r.w / 2) * S, 4.2, (r.y + r.h / 2) * S);
      world.add(rl); roomLamps.push(rl);
      pbox(r.x, r.y, r.w, r.h, 0.1, floor, world, 0.2, { noShadow: true });
      const t = 3;
      const glass = { transparent: true, opacity: 0.28, roughness: 0.1 };
      pbox(r.x, r.y, r.w, t, 2.6, wall, world, 0.2);                       // fond
      pbox(r.x, r.y, t, r.h, 2.6, wall, world, 0.2);                       // gauche
      pbox(r.x + r.w - t, r.y, t, r.h, 2.6, wall, world, 0.2);             // droite
      // face avant vitrée avec porte au centre
      const doorW = 30, mid = r.x + r.w / 2;
      pbox(r.x, r.y + r.h - t, mid - doorW / 2 - r.x, t, 2.6, '#9fd3e6', world, 0.2, glass);
      pbox(mid + doorW / 2, r.y + r.h - t, r.x + r.w - (mid + doorW / 2), t, 2.6, '#9fd3e6', world, 0.2, glass);
    };
    room(c.LEAD, '#8a6d3b', '#a8845a');
    room(c.WAR, '#2f4872', '#7d8fb3');
    room(c.LOUNGE, '#6b3f5e', '#a7708f');
    if (L.zones.annex) {
      const a = L.zones.annex;
      pbox(a.x, a.y + 16, a.w, a.h - 16, 0.1, '#4f5d4a', world, 0.2, { noShadow: true });
    }

    // bureau du lead
    const lx = c.LEAD.x;
    pbox(44, 64, 72, 14, 1.4, '#7a5a35', world, 0.2);
    pbox(60, 66, 16, 3, 1.1, '#1f232a', world, 1.6);
    pbox(77, 66, 16, 3, 1.1, '#1f232a', world, 1.6);
    addScreen('lead:0', 15, 10, 68 * S, 2.15, 69.2 * S, 1.8, 1.0, 0);
    addScreen('lead:1', 15, 10, 85 * S, 2.15, 69.2 * S, 1.8, 1.0, 0);
    pbox(lx + 6, c.LEAD.y + 6, 24, 8, 3, '#5d4a30', world, 0.2);       // bibliothèque
    // table de réunion
    pbox(186, 56, 124, 28, 1.4, '#a9835a', world, 0.2);
    pbox(c.WAR.x + 12, c.WAR.y + 8, c.WAR.w - 24, 76, 0.05, '#243b61', world, 0.3, { noShadow: true });   // tapis
    pbox(c.WAR.x + c.WAR.w / 2 - 50, c.WAR.y + 1, 100, 2, 1.5, '#1b2330', world, 1.0);                       // cadre du tableau
    addScreen('kanban', 88, 11, (c.WAR.x + c.WAR.w / 2) * S, 1.75, (c.WAR.y + 3) * S + 0.02, 11.4, 1.35, 0);
    // canapés / poufs du lounge
    pbox(c.LOUNGE.x + 8, c.LOUNGE.y + 30, 120, 60, 0.05, '#7a4a69', world, 0.3, { noShadow: true });        // tapis
    pbox(c.LOUNGE.x + 14, c.LOUNGE.y + 54, 50, 16, 1.0, '#c0587e', world, 0.2);
    pbox(c.LOUNGE.x + 14, c.LOUNGE.y + 48, 50, 5, 1.8, '#a24468', world, 0.2);
    pbox(c.LOUNGE.x + 112, c.LOUNGE.y + 6, 40, 12, 3.2, '#2b2f3a', world, 0.2);   // borne d'arcade
    addScreen('arcade', 12, 9, (c.LOUNGE.x + 132) * S, 2.45, (c.LOUNGE.y + 18) * S + 0.02, 3.0, 2.2, 0);
    // bureaux
    const addDesk = (sx, sy, tint, key) => {
      pbox(sx + 4, sy + 16, 40, 15, 1.4, tint, world, 0.2);
      // écran sur le coin droit du bureau, tourné vers l'objectif : l'animation est visible
      const mon = new THREE.Group();
      mon.position.set((sx + 36) * S, 1.6, (sy + 21) * S);
      mon.rotation.y = -0.38;
      box(1.9, 0.12, 0.7, '#20242c', 0, 0.06, 0, mon, { noShadow: true });
      box(0.22, 0.45, 0.16, '#20242c', 0, 0.3, -0.06, mon);
      box(1.95, 1.42, 0.14, '#15171c', 0, 1.1, 0, mon);
      world.add(mon);
      addScreen(key, 11, 8, 0, 1.12, 0.085, 1.72, 1.25, 0, mon);
      pbox(sx + 14, sy + 20, 14, 4, 0.1, '#cfd3da', world, 1.6, { noShadow: true });           // clavier
      const lamp = new THREE.PointLight(0xffd59a, 0, 7, 2);
      lamp.position.set((sx + 24) * S, 3.2, (sy + 22) * S);
      world.add(lamp); lamps.push(lamp);
      pbox(sx + 8, sy + 19, 4, 4, 0.35, '#ffffff', world, 1.6);                    // mug
    };
    const rows = c.OPEN_ROWS;
    for (let i = 0; i < rows * c.OPEN.cols; i++) { const p = c.deskSlot(i); addDesk(p.sx, p.sy, '#9a7b52', 'desk:' + i); }
    const arows = c.ANNEX_ROWS;
    for (let i = 0; i < arows * c.ANNEX.cols; i++) { const p = c.annexSlot(i); addDesk(p.sx, p.sy, '#7d8a6f', 'annex:' + i); }

    // plantes
    for (const [px, py] of [[126, 22], [126, 90], [152, 22], [326, 22], [152, 92], [326, 92]]) {
      pbox(px - 3, py - 2, 6, 6, 0.8, '#6b4a2f', world, 0.2);
      const leaf = box(1.1, 1.6, 1.1, '#3f8f4a', px * S, 1.6, py * S + 0.1, world);
      leaf.geometry = leaf.geometry.clone(); leaf.geometry.translate(0, 0.5, 0); leaf.position.y = 0.8;   // pivot au pied
      sway.push(leaf);
    }

    // murs pleins (hauts, opaques) : la caméra de suivi ne doit pas passer à travers
    occluders.length = 0;
    world.traverse((o) => { if (o.isMesh && o.scale.y >= 2.4 && !o.material.transparent) occluders.push(o); });

    if (!orbitInit) {
      orbit.tx = Math.min(W, c.MAIN_W * S) / 2; orbit.tz = (c.ROOM_BOTTOM - 8) * S; orbit.dist = 52; orbit.az = 0; orbit.pol = 0.9;
      orbitInit = true;
    }
    applyCamera();
    // lumière du soleil couvrant toute la carte
    sun.shadow.camera.left = -W; sun.shadow.camera.right = W; sun.shadow.camera.top = H; sun.shadow.camera.bottom = -H;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 260;
    sun.shadow.camera.updateProjectionMatrix();
    sun.target.position.set(W / 2, 0, H / 2);
  }

  function ambiance(phase) {
    const night = phase === 'night', sunset = phase === 'sunset';
    scene.background = new THREE.Color(night ? '#0b1020' : sunset ? '#3b2a3f' : '#1c1f26');
    hemi.intensity = night ? 0.8 : sunset ? 0.8 : 1.0;
    hemi.color.set(night ? '#7b8ad0' : sunset ? '#ffb27a' : '#ffffff');
    sun.intensity = night ? 0.5 : sunset ? 1.1 : 1.6;
    sun.color.set(night ? '#7f93ff' : sunset ? '#ff9a55' : '#fff4e0');
    sun.position.set(size.W * S * (sunset ? 0.1 : 0.7), sunset ? 18 : 70, size.H * S * (sunset ? 0.9 : 0.1));
    sun.target.position.set(size.W * S / 2, 0, size.H * S / 2);
    for (const l of roomLamps) { l.intensity = night ? 38 : 12; l.visible = night || sunset; }
    for (const l of lamps) { l.intensity = 9; l.visible = night; }   // invisibles le jour : pas de coût de shader
  }

  function placeActor(a, c, t) {
    const cx = a.x * S, cz = a.y * S;
    let x = cx, z = cz, yaw = a.yaw ?? 0, seated = false;
    if (a.seated && !a.leaving) {
      switch (a.kind) {
        case 'desk': case 'annex': case 'lead': z = cz - 0.9; yaw = 0; seated = true; break;
        case 'meet': {
          const s = c.meet[a.i];
          yaw = s.kind === 'north' ? 0 : s.kind === 'south' ? Math.PI : s.side === 'w' ? Math.PI / 2 : -Math.PI / 2;
          seated = true; break;
        }
        case 'lounge': yaw = 0; seated = true; break;
      }
    }
    return { x, z, yaw, seated };
  }

  const dirOf = new Map();
  function sync(f) {
    const L = f.layout, c = f.consts;
    const key = `${L.W}x${L.H}|${c.OPEN_ROWS}|${c.ANNEX_ROWS}`;
    if (key !== layoutKey) { layoutKey = key; buildWorld(L, c); }
    ambiance(f.phase);
    const seen = new Set();
    const t = f.t / 1000;
    ringSel.visible = false; ringHov.visible = false;
    // écrans animés : on repeint chaque écran occupé (les autres une seule fois)
    const occ = new Map();
    for (const a of f.actors) if (a.seated && !a.leaving && (a.kind === 'desk' || a.kind === 'annex')) occ.set(`${a.kind}:${a.i}`, a);
    const lead = f.actors.find((a) => a.seated && !a.leaving && a.kind === 'lead');
    for (const [key, sc] of screens) {
      let o;
      if (sc.type === 'desk' || sc.type === 'annex') { const a = occ.get(key); o = { type: 'screen', state: a && a.state, seed: a ? a.look.seed : 0, t: f.t }; }
      else if (sc.type === 'lead') {
        const st = lead && lead.state, second = key === 'lead:1';
        o = { type: 'screen', state: second && st === 'typing' ? 'reading' : st, seed: second ? 23 : 11, t: f.t + (second ? 777 : 0) };
      } else o = { type: sc.type, t: f.t, gathering: f.gathering };
      const animated = o.type !== 'screen' || o.state !== undefined;
      const sig = animated ? Math.floor(f.t / 60) : 'off';
      if (sig === sc.sig) continue;
      sc.sig = sig;
      o.w = sc.w; o.h = sc.h;
      f.paintScreen(sc.ctx, o);
      sc.tex.needsUpdate = true;
    }
    for (let i = 0; i < sway.length; i++) { sway[i].rotation.z = Math.sin(t * 1.3 + i * 1.7) * 0.07; sway[i].rotation.x = Math.sin(t * 1.1 + i) * 0.05; }
    for (const a of f.actors) {
      seen.add(a.id);
      let ch = chars.get(a.id);
      if (!ch || ch.lookSeed !== a.look.seed) {
        if (ch) world.remove(ch.group);
        const group = new THREE.Group();
        const model = makeCharacter(a.look);
        group.add(model);
        group.userData.agentId = a.id;
        scene.add(group);
        ch = { group, model, lookSeed: a.look.seed, label: null, labelKey: '', bubble: null, bubbleKey: '', px: a.x, pz: a.y, yaw: 0 };
        chars.set(a.id, ch);
      }
      const p = placeActor(a, c, t);
      // cap : direction du déplacement
      if (!p.seated) {
        const dx = a.x - ch.px, dz = a.y - ch.pz;
        if (Math.hypot(dx, dz) > 0.02) ch.yaw = Math.atan2(dx, dz);
        p.yaw = ch.yaw;
      } else ch.yaw = p.yaw;
      ch.px = a.x; ch.pz = a.y;
      ch.group.position.set(p.x, p.seated ? 0.2 + 0.55 : 0.2, p.z);
      // lissage de l'orientation
      let dy = p.yaw - ch.model.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      ch.model.rotation.y += dy * 0.25;
      const pose = POSE[a.state] || 'idle';
      animate(ch.model, a.seated ? pose : 'idle', !a.seated && a.moving, t, p.seated);
      ch.model.scale.setScalar(a.id === f.selected ? 1.12 : 1);

      // étiquette (taille écran constante ; ligne d'état si survol / sélection / zoom suffisant)
      const color = STATE_COLOR[a.state] || '#ccc';
      const hov = a.id === f.hovered, sel = a.id === f.selected;
      const status = hov || sel || f.zoom >= 3 ? (a.stateText || '') : '';
      const lk = `${a.label}|${status}|${color}|${a.isLead}`;
      if (lk !== ch.labelKey) {
        if (ch.label) { ch.group.remove(ch.label); ch.label.material.dispose(); }
        ch.label = labelSprite(a.label, status, color, a.isLead);
        ch.group.add(ch.label); ch.labelKey = lk;
      }
      ch.label.visible = a.isLead || sel || hov || f.showLabels;
      const lh = (ch.label.userData.lines === 2 ? 40 : 21) / viewH / 1.3737;   // hauteur écran en px -> échelle
      ch.label.scale.set(lh * ch.label.userData.aspect, lh, 1);
      // étoile du lead
      if (a.isLead && !ch.star) {
        ch.star = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), new THREE.MeshStandardMaterial({ color: '#ffd54f', emissive: '#ffb300', emissiveIntensity: 0.9, roughness: 0.3, metalness: 0.4 }));
        ch.group.add(ch.star);
      } else if (!a.isLead && ch.star) { ch.group.remove(ch.star); ch.star = null; }
      if (ch.star) { ch.star.position.set(-0.9, 3.5 + Math.sin(t * 2.4) * 0.12, 0); ch.star.rotation.y = t * 2; }
      if (sel) { ringSel.visible = true; ringSel.position.set(p.x, 0.27, p.z); ringSel.scale.setScalar(1 + Math.sin(t * 4) * 0.06); }
      if (hov && !sel) { ringHov.visible = true; ringHov.position.set(p.x, 0.27, p.z); }
      // bulle d'état
      const sym = BUBBLE[a.state];
      const bk = sym ? `${sym}|${a.state === 'permission' ? '#ff5252' : '#1b1b1b'}` : '';
      if (bk !== ch.bubbleKey) {
        if (ch.bubble) { ch.group.remove(ch.bubble); ch.bubble.material.dispose(); }
        ch.bubble = sym ? bubbleSprite(sym, a.state === 'permission' ? '#ff5252' : '#1b1b1b') : null;
        if (ch.bubble) ch.group.add(ch.bubble);
        ch.bubbleKey = bk;
      }
      if (ch.bubble) {
        const pulse = a.state === 'permission' || a.state === 'waiting';
        ch.bubble.position.set(0.9, 3.6 + Math.sin(t * 3) * 0.12 + (a.state === 'sleeping' ? Math.sin(t * 1.3) * 0.2 : 0), 0);
        const k = pulse ? 1 + Math.max(0, Math.sin(t * 6)) * 0.14 : 1;
        // bulle réduite (puis masquée) quand elle est près de la caméra : pas de bulle géante au premier plan
        const dcam = camera.position.distanceTo(ch.group.position);
        const nf = Math.min(1, Math.max(0.3, dcam / 22));
        ch.bubble.visible = dcam > 4;
        ch.bubble.scale.set(1.5 * k * nf, 1.5 * k * nf, 1);
        if (a.state === 'sleeping') ch.bubble.material.opacity = 0.65 + Math.sin(t * 1.3) * 0.3;
      }
      ch.label.position.set(0, 4.1 + (ch.bubble ? 1.5 : 0) + (ch.star ? 0.2 : 0), 0);
    }
    for (const [id, ch] of chars) if (!seen.has(id)) { scene.remove(ch.group); chars.delete(id); }
  }

  return {
    render(f) {
      sync(f);
      updateChase(f);
      renderer.render(scene, camera);
    },
    resize(w, h, dpr) {
      renderer.setPixelRatio(Math.min(dpr || 1, 2));
      renderer.setSize(w, h, false);
      canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
      viewH = h;
      camera.aspect = w / h; camera.updateProjectionMatrix();
    },
    onSelect(fn) { onSelect = fn; },
    onPan(fn) { onPan = fn; },
    onWheel(fn) { onWheel = fn; },
    onDouble(fn) { onDouble = fn; },
    onHover(fn) { onHover = fn; },
    focus(x, z) { orbit.tx = x * S; orbit.tz = z * S; applyCamera(); },
    // zoom partagé avec l'interface (1× = 95 unités de distance)
    setZoom(z) { orbit.dist = 95 / z; applyCamera(); },
    dispose() { renderer.dispose(); },
  };
}

window.RPA3D = { create };
