// =====================================================================
// Logique des acteurs
// =====================================================================
function targetPoint(key) {
  const [kind, idxS] = key.split(':');
  const i = +idxS;
  switch (kind) {
    case 'lead': return { ...LAYOUT.leadSeat, kind };
    case 'desk': { const { sx, sy } = deskSlot(i); return { x: sx + 18, y: sy + 15, kind, i }; }
    case 'annex': { const { sx, sy } = annexSlot(i); return { x: sx + 18, y: sy + 15, kind, i }; }
    case 'meet': return { x: LAYOUT.meet[i].x, y: LAYOUT.meet[i].y, kind, i };
    case 'lounge': return { ...LAYOUT.lounge[i], kind, i };
    default: return { ...LAYOUT.entrance, kind: 'exit' };
  }
}

// Départs étalés : quand plusieurs agents bougent en même temps (réunion, fin de
// réunion), chacun attend son tour pour éviter la cohue dans les portes.
let departures = 0;
function setTarget(a, key) {
  if (a.targetKey === key) return;
  a.targetKey = key;
  a.target = targetPoint(key);
  if (firstUpdate) { a.x = a.target.x; a.y = a.target.y; a.path = []; a.seated = true; return; }
  a.seated = false;
  a.wait = 0;
  a.delay = Math.min(2.5, departures++ * 0.3);
  a.path = findPath(a.x, a.y, a.target.x, a.target.y);
}

function stableSlots(map, ids, nearOf) {
  for (const id of [...map.keys()]) if (!ids.has(id)) map.delete(id);
  const used = new Set(map.values());
  for (const id of ids) {
    if (map.has(id)) continue;
    let i = 0;
    const pd = nearOf(id);
    if (pd !== undefined) { for (let d = 1; d < 400; d++) if (!used.has(pd + d)) { i = pd + d; break; } }
    else while (used.has(i)) i++;
    map.set(id, i); used.add(i);
  }
  return Math.max(-1, ...map.values());
}

let prevStates = new Map();
function update(msg) {
  labels = msg.labels || labels;
  meetingMode = msg.meetingMode || meetingMode;
  soundOn = msg.sound !== false;
  hookMode = msg.hooks || hookMode;
  let rebuild = false;
  if (msg.workspace && msg.workspace !== wsName) { wsName = msg.workspace; rebuild = true; }
  if (msg.timeOfDay && msg.timeOfDay !== timeOfDay) { timeOfDay = msg.timeOfDay; rebuild = true; }
  if (!zoom && msg.scale) zoom = Math.max(0.5, Math.min(10, +msg.scale));
  const newLooks = msg.looks || {};

  const list = msg.agents || [];
  const byId = new Map(list.map((a) => [a.id, a]));
  const internal = list.filter((a) => !a.external);
  const mains = internal.filter((a) => !a.isSub);
  const ov = leadOverride && byId.get(leadOverride);
  leadId = ov && !ov.isSub && !ov.external ? leadOverride : mains.length ? mains[0].id : null;

  // son : nouvelle demande de permission
  let ding = false;
  for (const a of list) if (a.state === 'permission' && prevStates.get(a.id) && prevStates.get(a.id) !== 'permission') ding = true;
  prevStates = new Map(list.map((a) => [a.id, a.state]));
  if (ding && soundOn && !firstUpdate) beep();

  // qui va en salle de plan ? (les agents des autres workspaces restent dans l'annexe)
  const planners = internal.filter((a) => a.state === 'planning');
  gathering = planners.length > 0;
  const gather = new Set();
  if (gathering) {
    if (meetingMode === 'team') {
      for (const p of planners) {
        const root = p.isSub ? p.parentId : p.id;
        for (const a of internal) if (a.id === root || a.parentId === root) gather.add(a.id);
      }
    } else internal.forEach((a) => { if (a.state !== 'sleeping') gather.add(a.id); });
  }

  // places stables : open space / annexe
  const maxDesk = stableSlots(deskOf, new Set(internal.filter((a) => a.id !== leadId).map((a) => a.id)), (id) => {
    const p = byId.get(id)?.parentId; return p ? deskOf.get(p) : undefined;
  });
  const maxAnnex = stableSlots(annexDeskOf, new Set(list.filter((a) => a.external).map((a) => a.id)), (id) => {
    const p = byId.get(id)?.parentId; return p ? annexDeskOf.get(p) : undefined;
  });
  const rows = Math.max(3, Math.ceil((maxDesk + 1) / OPEN.cols));
  const aRows = maxAnnex < 0 ? 0 : Math.max(2, Math.ceil((maxAnnex + 1) / ANNEX.cols));
  if (rows !== OPEN_ROWS || aRows !== ANNEX_ROWS || rebuild || !LAYOUT) {
    buildMap(rows, aRows);
    for (const a of actors.values()) if (!a.seated && a.target) a.path = findPath(a.x, a.y, a.target.x, a.target.y);
    clampCam();
  }

  // acteurs
  for (const ag of list) {
    let a = actors.get(ag.id);
    const seed = newLooks[ag.id];
    if (!a || a.leaving) {
      a = {
        id: ag.id, agent: ag, look: null, lookSeed: undefined,
        x: LAYOUT.entrance.x, y: LAYOUT.entrance.y, path: [], seated: false, targetKey: null, leaving: false, back: false, wait: 0, delay: 0,
      };
      actors.set(ag.id, a);
    }
    if (!a.look || a.lookSeed !== seed) {
      const parent = ag.parentId && actors.get(ag.parentId);
      a.look = lookFor(seed ? `${ag.id}#${seed}` : ag.id, parent && parent.look ? parent.look.shirt : null);
      a.lookSeed = seed;
    }
    a.agent = ag;
  }
  looks = newLooks;
  departures = 0;
  for (const a of actors.values()) {
    if (!byId.has(a.id) && !a.leaving) { a.leaving = true; setTarget(a, 'exit'); }
  }

  // places : salle de plan / lounge / bureau / annexe
  const present = list.map((ag) => actors.get(ag.id));
  const gatherList = present.filter((a) => gather.has(a.id))
    .sort((p, q) => (p.id === leadId ? -1 : q.id === leadId ? 1 : p.agent.num - q.agent.num));
  const meetIdx = new Map();
  gatherList.slice(0, LAYOUT.meet.length).forEach((a, i) => meetIdx.set(a.id, i));
  let lounge = 0;
  for (const a of present) {
    let key;
    if (a.agent.external) key = 'annex:' + annexDeskOf.get(a.id);
    else if (meetIdx.has(a.id)) key = 'meet:' + meetIdx.get(a.id);
    else if (a.agent.state === 'sleeping' && lounge < LAYOUT.lounge.length) key = 'lounge:' + lounge++;
    else if (a.id === leadId) key = 'lead';
    else key = 'desk:' + deskOf.get(a.id);
    setTarget(a, key);
  }
  firstUpdate = false;
  dirty = true;
  if (!camInit) { camInit = true; jumpTo('lead', true); }
  refreshChrome();
}

// Évitement local : un marcheur cède le passage à celui qui a la priorité
// (numéro plus petit) s'il est juste devant lui ; au-delà de 0,8 s il passe quand même.
function blockedAhead(a, dx, dy, d) {
  for (const o of actors.values()) {
    if (o === a || o.seated || o.delay > 0) continue;
    const ox = o.x - a.x, oy = o.y - a.y;
    const dist = Math.hypot(ox, oy);
    if (dist > 9 || dist < 0.01) continue;
    if ((ox * dx + oy * dy) / (dist * d) < 0.45) continue;
    if ((o.agent?.num ?? 0) < (a.agent?.num ?? 0) || o.leaving) return true;
  }
  return false;
}

function step(dt) {
  for (const [id, a] of actors) {
    if (a.seated) continue;
    if (a.delay > 0) { a.delay -= dt; a.moving = false; continue; }
    let budget = SPEED * dt;
    if (a.path.length) {
      const p = a.path[0];
      const dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0.5 && a.wait < 0.8 && blockedAhead(a, dx, dy, d)) { a.wait += dt; a.moving = false; continue; }
      a.wait = Math.max(0, a.wait - dt);
    }
    while (budget > 0 && a.path.length) {
      const p = a.path[0];
      const dx = p.x - a.x, dy = p.y - a.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dy) > Math.abs(dx) * 1.2) a.back = dy < 0; else if (d > 0.5) a.back = false;
      if (d <= budget) { a.x = p.x; a.y = p.y; a.path.shift(); budget -= d; }
      else { a.x += (dx / d) * budget; a.y += (dy / d) * budget; budget = 0; }
    }
    a.moving = a.path.length > 0;
    if (!a.path.length) {
      if (a.leaving) { actors.delete(id); if (selected === id) selectActor(null); if (followId === id) followId = null; }
      else a.seated = true;
    }
  }
  // visiteur
  if (visitMode) {
    let vx = 0, vy = 0;
    if (keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('KeyQ')) vx -= 1;
    if (keys.has('ArrowRight') || keys.has('KeyD')) vx += 1;
    if (keys.has('ArrowUp') || keys.has('KeyW') || keys.has('KeyZ')) vy -= 1;
    if (keys.has('ArrowDown') || keys.has('KeyS')) vy += 1;
    visitor.moving = !!(vx || vy);
    if (visitor.moving) {
      const n = Math.hypot(vx, vy), s = 70 * dt;
      const nx = visitor.x + (vx / n) * s, ny = visitor.y + (vy / n) * s;
      if (!footBlocked(nx, visitor.y)) visitor.x = nx;
      if (!footBlocked(visitor.x, ny)) visitor.y = ny;
      if (vy) visitor.back = vy < 0; else visitor.back = false;
    }
    // proximité : on affiche la fiche de l'agent le plus proche
    let best = null, bd = 26;
    for (const a of actors.values()) {
      if (a.leaving) continue;
      const d = Math.hypot(a.x - visitor.x, a.y - visitor.y);
      if (d < bd) { bd = d; best = a.id; }
    }
    if (best !== selected && (best || selectedByProximity)) { selectedByProximity = !!best; selectActor(best, true); }
  } else if (keys.size) {
    // caméra libre au clavier
    const s = (220 / zoom) * dt;
    if (keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('KeyQ')) cam.x -= s;
    if (keys.has('ArrowRight') || keys.has('KeyD')) cam.x += s;
    if (keys.has('ArrowUp') || keys.has('KeyW') || keys.has('KeyZ')) cam.y -= s;
    if (keys.has('ArrowDown') || keys.has('KeyS')) cam.y += s;
    if (keys.size) { followId = null; clampCam(); }
  }
}
let selectedByProximity = false;
function footBlocked(x, y) {
  for (const [ox, oy] of [[-3, -1], [3, -1], [-3, 1], [3, 1]]) if (blocked(Math.floor((x + ox) / T), Math.floor((y + oy) / T))) return true;
  return false;
}
