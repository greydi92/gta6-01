// Small math + determinism helpers. The city and all scripted content are
// built from a seeded RNG so ?shot=&seed=1 always renders the same frame.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
export function dist(ax, az, bx, bz) { return Math.sqrt(dist2(ax, az, bx, bz)); }
// Shortest angular difference (radians), wrapped to [-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function randRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Axis-aligned box collider in the XZ plane. resolveCircle pushes a circle
// (entity with x/z/radius) out of the box and returns true when it hit.
export function resolveCircleBox(e, box) {
  const cx = clamp(e.x, box.minX, box.maxX);
  const cz = clamp(e.z, box.minZ, box.maxZ);
  const dx = e.x - cx, dz = e.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= e.radius * e.radius) return false;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    const push = (e.radius - d) / d;
    e.x += dx * push; e.z += dz * push;
  } else {
    // Centre inside the box: push out along the smallest penetration axis.
    const pl = e.x - box.minX, pr = box.maxX - e.x;
    const pt = e.z - box.minZ, pb = box.maxZ - e.z;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) e.x = box.minX - e.radius;
    else if (m === pr) e.x = box.maxX + e.radius;
    else if (m === pt) e.z = box.minZ - e.radius;
    else e.z = box.maxZ + e.radius;
  }
  return true;
}
