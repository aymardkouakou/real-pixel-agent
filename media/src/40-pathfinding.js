// =====================================================================
// Pathfinding (A* 8 directions + lissage en ligne droite)
// =====================================================================
function findPath(fx, fy, tx, ty) {
  const sx = clampT(Math.floor(fx / T), MAP_W), sy = clampT(Math.floor(fy / T), MAP_H);
  const gx = clampT(Math.floor(tx / T), MAP_W), gy = clampT(Math.floor(ty / T), MAP_H);
  const N = MAP_W * MAP_H;
  const start = sy * MAP_W + sx, goal = gy * MAP_W + gx;
  const gs = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = [];
  const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const hfun = (n) => { const dx = Math.abs((n % MAP_W) - gx), dy = Math.abs(((n / MAP_W) | 0) - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const passable = (n) => n === goal || n === start || !grid[n];
  gs[start] = 0; push(start, hfun(start));
  let found = false;
  while (heap.length) {
    const [, n] = pop();
    if (n === goal) { found = true; break; }
    if (closed[n]) continue;
    closed[n] = 1;
    const cx = n % MAP_W, cy = (n / MAP_W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const m = ny * MAP_W + nx;
      if (!passable(m)) continue;
      if (dx && dy && (!passable(cy * MAP_W + nx) || !passable(ny * MAP_W + cx))) continue;
      const ng = gs[n] + (dx && dy ? 1.414 : 1);
      if (ng < gs[m]) { gs[m] = ng; came[m] = n; push(m, ng + hfun(m)); }
    }
  }
  if (!found) return [{ x: tx, y: ty }];
  const cells = [];
  for (let n = goal; n !== -1; n = came[n]) cells.push(n);
  cells.reverse();
  const pts = cells.map((n) => ({ x: (n % MAP_W) * T + T / 2, y: ((n / MAP_W) | 0) * T + T / 2 }));
  pts[0] = { x: fx, y: fy };
  pts[pts.length - 1] = { x: tx, y: ty };
  // lissage : on saute les points visibles en ligne droite
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineFree(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  out.shift();
  return out;
}
const clampT = (v, max) => Math.max(0, Math.min(max - 1, v));
function lineFree(a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const n = Math.ceil(d / 3);
  const ta = Math.floor(a.x / T) + Math.floor(a.y / T) * MAP_W, tb = Math.floor(b.x / T) + Math.floor(b.y / T) * MAP_W;
  for (let k = 1; k < n; k++) {
    const x = a.x + ((b.x - a.x) * k) / n, y = a.y + ((b.y - a.y) * k) / n;
    for (const [ox, oy] of [[-2, 0], [2, 0], [0, -1]]) {
      const tx = Math.floor((x + ox) / T), ty = Math.floor((y + oy) / T);
      const id = ty * MAP_W + tx;
      if (id !== ta && id !== tb && blocked(tx, ty)) return false;
    }
  }
  return true;
}
