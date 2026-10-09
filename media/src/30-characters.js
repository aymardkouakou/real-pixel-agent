// =====================================================================
// Personnages
// =====================================================================
function poseFor(state) {
  switch (state) {
    case 'typing': return 'type';
    case 'reading': return 'read';
    case 'thinking': case 'planning': return 'think';
    case 'permission': return 'wave';
    case 'sleeping': return 'sleep';
    default: return 'idle';
  }
}
function drawHead(x, y, L, closed) {
  if (L.style === 2) {
    rect(x + 2, y, 6, 1, L.cap); rect(x + 1, y + 1, 8, 2, L.cap); rect(x + 2, y + 3, 8, 1, shade(L.cap, -0.3));
  } else { rect(x + 2, y, 6, 1, L.hair); rect(x + 1, y + 1, 8, 2, L.hair); }
  rect(x + 2, y + 3, 6, 5, L.skin);
  if (L.style !== 2) {
    rect(x + 1, y + 3, 1, L.style === 1 ? 6 : 2, L.hair); rect(x + 8, y + 3, 1, L.style === 1 ? 6 : 2, L.hair);
    rect(x + 2, y + 3, 6, 1, L.hair);
  } else rect(x + 1, y + 3, 1, 2, L.hair);
  if (closed) { rect(x + 3, y + 5, 2, 1, shade(L.skin, -0.35)); rect(x + 6, y + 5, 2, 1, shade(L.skin, -0.35)); }
  else { rect(x + 3, y + 5, 1, 1, '#1b1b1b'); rect(x + 6, y + 5, 1, 1, '#1b1b1b'); }
  rect(x + 4, y + 7, 2, 1, shade(L.skin, -0.2));
}
function drawHeadBack(x, y, L) {
  const c = L.style === 2 ? L.cap : L.hair;
  rect(x + 2, y, 6, 1, c); rect(x + 1, y + 1, 8, 6, c); rect(x + 2, y + 7, 6, 1, L.style === 1 ? L.hair : L.skin);
  if (L.style === 2) rect(x + 1, y + 4, 8, 3, L.hair);
}
function drawTorso(x, y, L) {
  rect(x + 4, y + 8, 2, 1, L.skin);
  rect(x + 1, y + 9, 8, 6, L.shirt);
  rect(x + 4, y + 9, 2, 1, L.shirtDark);
}
// Assis derrière un bureau, vu de face. pass 'back' avant le meuble, 'front' après.
function drawSeated(x, y, L, pose, t, pass, deskTop) {
  const f = ((t / 130) | 0) % 2;
  if (pass === 'back') {
    const bob = pose === 'idle' && ((t / 1400) | 0) % 2 ? 1 : 0;
    drawTorso(x, y, L);
    drawHead(x, y + (pose === 'sleep' ? 2 : 0) + bob, L, pose === 'sleep');
    if (pose === 'idle' || pose === 'type') { rect(x, y + 10, 1, 4, L.shirtDark); rect(x + 9, y + 10, 1, 4, L.shirtDark); }
    if (pose === 'think') { rect(x, y + 10, 1, 4, L.shirtDark); rect(x + 7, y + 10, 1, 3, L.shirtDark); rect(x + 6, y + 8, 2, 2, L.skin); rect(x + 9, y + 10, 1, 4, L.shirtDark); }
    if (pose === 'read') {
      rect(x + 1, y + 9, 8, 6, '#f5f6fa');
      rect(x + 2, y + 10, 5, 1, '#b2bec3'); rect(x + 2, y + 12, 4, 1, '#b2bec3'); rect(x + 2, y + 14, 5, 1, '#b2bec3');
      rect(x, y + 12, 1, 2, L.skin); rect(x + 9, y + 12, 1, 2, L.skin);
    }
    if (pose === 'wave') {
      rect(x, y + 10, 1, 4, L.shirtDark);
      rect(x + 9 + f, y + 4, 1, 6, L.shirtDark); rect(x + 9 + f, y + 2, 1, 2, L.skin);
    }
  } else if (deskTop !== undefined) {
    if (pose === 'type') { rect(x + 1, deskTop - 1 + f, 2, 1, L.skin); rect(x + 7, deskTop - f, 2, 1, L.skin); }
    if (pose === 'sleep') { rect(x, deskTop - 1, 10, 2, L.shirtDark); rect(x + 3, deskTop - 1, 4, 1, L.skin); }
  }
}
// Assis vu de dos (côté sud de la table)
function drawSeatedBack(x, y, L) {
  rect(x + 1, y + 9, 8, 6, L.shirt); rect(x + 1, y + 9, 8, 1, L.shirtDark);
  rect(x, y + 10, 1, 3, L.shirtDark); rect(x + 9, y + 10, 1, 3, L.shirtDark);
  drawHeadBack(x, y, L);
}
// Assis jambes visibles (canapé, poufs, bout de table)
function drawSitting(fx, fy, L, pose, t) {
  const x = fx - 5, y = fy - 17;
  drawTorso(x, y, L);
  drawHead(x, y + (pose === 'sleep' ? 1 : 0), L, pose === 'sleep');
  rect(x, y + 10, 1, 4, L.shirtDark); rect(x + 9, y + 10, 1, 4, L.shirtDark);
  rect(x + 1, y + 14, 8, 2, L.pants); rect(x + 2, y + 16, 2, 1, L.pants); rect(x + 6, y + 16, 2, 1, L.pants);
  rect(x + 2, y + 17, 2, 1, '#141414'); rect(x + 6, y + 17, 2, 1, '#141414');
  if (pose === 'think') rect(x + 6, y + 8, 2, 2, L.skin);
  if (pose === 'wave') { const f = ((t / 250) | 0) % 2; rect(x + 9 + f, y + 4, 1, 6, L.shirtDark); rect(x + 9 + f, y + 2, 1, 2, L.skin); }
}
function drawWalker(fx, fy, L, t, moving, back) {
  const x = Math.round(fx - 5), y = Math.round(fy - 18);
  const f = moving ? ((t / 140) | 0) % 2 : 0;
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 1, y + 18, 8, 1);
  if (back) { rect(x + 1, y + 9, 8, 6, L.shirt); drawHeadBack(x, y - (f ? 1 : 0), L); }
  else { drawTorso(x, y, L); drawHead(x, y - (f ? 1 : 0), L, false); }
  rect(x, y + 10 + f, 1, 4, L.shirtDark); rect(x + 9, y + 11 - f, 1, 4, L.shirtDark);
  rect(x + 2, y + 15, 2, f ? 3 : 2, L.pants); rect(x + 6, y + 15, 2, f ? 2 : 3, L.pants);
  rect(x + 2, y + (f ? 18 : 17), 2, 1, '#141414'); rect(x + 6, y + (f ? 17 : 18), 2, 1, '#141414');
}
function drawBubble(hx, hy, state, t, tool) {
  if (state === 'sleeping') {
    const k = ((t / 700) | 0) % 3;
    for (let i = 0; i <= k; i++) glyph(G.z, hx + 9 + i * 3, hy - 4 - i * 4, i === k ? '#ffffff' : '#b0bec5');
    return;
  }
  const content = { thinking: 'dots', waiting: 'q', permission: 'bang', searching: 'mag', delegating: 'person', planning: tool === 'ExitPlanMode' ? 'q' : 'plan' }[state];
  if (!content) return;
  const by = hy - 11 - (((t / 600) | 0) % 2);
  const bx = hx - 1;
  const border = state === 'permission' && ((t / 300) | 0) % 2 ? '#ff5252' : '#1b1b1b';
  rect(bx, by, 12, 9, border); rect(bx + 1, by + 1, 10, 7, '#ffffff');
  rect(bx + 3, by + 9, 3, 1, border); rect(bx + 4, by + 8, 1, 1, '#ffffff'); rect(bx + 4, by + 10, 1, 1, border);
  const ix = bx + 3, iy = by + 2;
  switch (content) {
    case 'dots': { const k = ((t / 300) | 0) % 4; for (let i = 0; i < 3; i++) rect(bx + 3 + i * 2, by + 4, 1, 1, i < k ? '#2d3436' : '#b2bec3'); break; }
    case 'q': glyph(G.q, ix, iy, '#d4a017'); break;
    case 'bang': glyph(G.bang, ix, iy, '#e74c3c'); break;
    case 'mag': glyph(G.mag, ix, iy, '#2e86de'); break;
    case 'person': glyph(G.person, ix, iy, '#8e44ad'); break;
    case 'plan': glyph(G.plan, ix + 1, iy, '#ef8c00'); break;
  }
}
