// Neon Harbor — small math and random helpers shared by every module.
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

// Push a circle out of a rectangle; returns true when a push happened.
export function pushOutOfRect(obj, r, rx, ry, rw, rh) {
  if (!circleHitsRect(obj.x, obj.y, r, rx, ry, rw, rh)) return false;
  const left = obj.x - rx;
  const right = rx + rw - obj.x;
  const top = obj.y - ry;
  const bottom = ry + rh - obj.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) obj.x = rx - r;
  else if (m === right) obj.x = rx + rw + r;
  else if (m === top) obj.y = ry - r;
  else obj.y = ry + rh + r;
  return true;
}

export function formatCash(n) {
  return '$' + Math.floor(n).toLocaleString('en-US');
}

export function formatTime(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + ':' + String(m).padStart(2, '0') + ' ' + ap;
}
