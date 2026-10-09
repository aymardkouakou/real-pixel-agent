// =====================================================================
// Écrans animés
// =====================================================================
function drawScreen(x, y, state, t, seed, w = 11, h = 8) {
  const tick = (ms) => (t / ms) | 0;
  switch (state) {
    case undefined:
      rect(x, y, w, h, '#0b0c10'); rect(x + 1, y + 1, 2, 1, '#1c1f26'); return;
    case 'typing': {
      rect(x, y, w, h, '#1e1f29');
      const cols = ['#ff79c6', '#8be9fd', '#50fa7b', '#f1fa8c'];
      const k = tick(350);
      for (let i = 0; i < (h >> 1); i++) {
        const len = 2 + (((seed >>> i) + (i === (h >> 1) - 1 ? k : 0)) % (w - 4));
        rect(x + 1 + (i % 2) * 2, y + 1 + i * 2, Math.min(len, w - 3), 1, cols[(i + seed) % 4]);
      }
      if (tick(400) % 2) rect(x + w - 2, y + h - 1, 1, 1, '#fff');
      return;
    }
    case 'reading': {
      rect(x, y, w, h, '#f5f6fa');
      for (let i = 0; i < (h >> 1); i++) rect(x + 1, y + 1 + i * 2, 3 + ((seed >>> (i + tick(500))) % (w - 4)), 1, '#95a5a6');
      return;
    }
    case 'running': {
      rect(x, y, w, h, '#0b0c10');
      const k = tick(140);
      for (let i = 0; i < (h >> 1); i++) rect(x + 1, y + 1 + i * 2, 1 + (hash(String(i + k + seed)) % (w - 2)), 1, i === (h >> 1) - 1 ? '#a3f7bf' : '#2ecc71');
      return;
    }
    case 'searching': {
      rect(x, y, w, h, '#0f2a44');
      const cx = x + (w >> 1), cy = y + (h >> 1);
      rect(cx - 2, cy - 3, 5, 6, '#2e86de'); rect(cx - 3, cy - 2, 7, 4, '#2e86de');
      const k = tick(300) % 5;
      rect(cx - 3 + k, cy - 1, 2, 2, '#26de81');
      return;
    }
    case 'delegating': {
      rect(x, y, w, h, '#2d1b4e');
      const cx = x + (w >> 1);
      rect(cx - 1, y + 1, 3, 2, '#ce93d8'); rect(x + 1, y + h - 3, 3, 2, '#ce93d8'); rect(x + w - 4, y + h - 3, 3, 2, '#ce93d8');
      rect(x + 2, y + h - 4, w - 4, 1, '#9b59b6'); rect(cx, y + 3, 1, h - 7, '#9b59b6');
      if (tick(300) % 2) rect(cx, y + h - 4, 1, 1, '#fff');
      return;
    }
    case 'planning': {
      rect(x, y, w, h, '#fff8e1');
      const k = tick(600);
      for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++)
        if ((c * 3 + r + k) % 5 !== 0) rect(x + 1 + c * Math.floor((w - 1) / 3), y + 1 + r * 2, 2, 1, ['#ffb74d', '#4fc3f7', '#81c784'][c]);
      return;
    }
    case 'thinking': {
      rect(x, y, w, h, '#1e1f29');
      const k = tick(250) % 3;
      for (let i = 0; i < 3; i++) rect(x + (w >> 1) - 2 + i * 2, y + (h >> 1), 1, 1, i === k ? '#ffffff' : '#555a6e');
      return;
    }
    case 'waiting': {
      rect(x, y, w, h, '#1e1f29');
      const cy = y + (h >> 1);
      rect(x + 1, cy - 1, 1, 1, '#f1c40f'); rect(x + 2, cy, 1, 1, '#f1c40f'); rect(x + 1, cy + 1, 1, 1, '#f1c40f');
      if (tick(500) % 2) rect(x + 4, cy, 2, 1, '#f1c40f');
      return;
    }
    case 'permission': {
      rect(x, y, w, h, tick(450) % 2 ? '#c0392b' : '#3b1214');
      rect(x + (w >> 1), y + 1, 1, h - 4, '#fff'); rect(x + (w >> 1), y + h - 2, 1, 1, '#fff');
      return;
    }
    case 'sleeping': {
      rect(x, y, w, h, '#050608');
      const k = tick(220);
      rect(x + 1 + Math.abs((k % (2 * (w - 3))) - (w - 3)), y + 1 + Math.abs((k % (2 * (h - 3))) - (h - 3)), 1, 1, '#6c5ce7');
      return;
    }
  }
}
