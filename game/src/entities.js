// Neon Harbor — traffic cars, pedestrians, parked cars and police.
// Every vehicle is an original Harbor design; names are our own.
import { clamp, dist, angleDiff, mulberry32, pick } from './util.js';
import { WORLD_W, WORLD_H, ROADS_V, ROADS_H, ROAD_W, collideWorld, isOnRoad, pointInBuilding, randomRoadPoint } from './city.js';

export const CAR_MODELS = [
  { name: 'Comet GT', color: '#ff2e5e', len: 46, wid: 22, top: 300, accel: 340 },
  { name: 'Harbor Taxi', color: '#ffc93c', len: 44, wid: 22, top: 240, accel: 260 },
  { name: 'Dock Hauler', color: '#7a5a34', len: 58, wid: 26, top: 190, accel: 200 },
  { name: 'Pier Cruiser', color: '#2ec8ff', len: 50, wid: 24, top: 230, accel: 240 },
  { name: 'Sunset Coupe', color: '#ff7a2e', len: 44, wid: 22, top: 270, accel: 290 },
  { name: 'Bay Van', color: '#e8e8f0', len: 52, wid: 26, top: 200, accel: 210 },
  { name: 'Neon Sedan', color: '#c86bff', len: 46, wid: 22, top: 250, accel: 250 },
  { name: 'Rust Bucket', color: '#8a8f96', len: 42, wid: 22, top: 210, accel: 220 },
];

export const PED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8'];
export const PED_SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export function makeCar(x, y, angle, modelIdx, opts) {
  const m = CAR_MODELS[modelIdx % CAR_MODELS.length];
  return Object.assign({
    x, y, angle, speed: 0,
    model: m.name, color: m.color, len: m.len, wid: m.wid,
    topSpeed: m.top, accel: m.accel,
    health: 100, driver: true, police: false,
    dir: 'E', road: null, targetSpeed: 0, id: Math.random(),
  }, opts || {});
}

export function spawnParkedCars(rng) {
  const spots = [
    { x: 1250, y: 700, a: 0, m: 0 }, { x: 760, y: 180, a: Math.PI / 2, m: 4 },
    { x: 1750, y: 1100, a: 0, m: 6 }, { x: 260, y: 1500, a: Math.PI / 2, m: 1 },
    { x: 2150, y: 700, a: 0, m: 3 }, { x: 1250, y: 1500, a: Math.PI / 2, m: 5 },
    { x: 760, y: 1100, a: 0, m: 7 }, { x: 1750, y: 300, a: Math.PI / 2, m: 2 },
    { x: 260, y: 700, a: 0, m: 6 }, { x: 2150, y: 1500, a: Math.PI / 2, m: 4 },
  ];
  const cars = [];
  for (const s of spots) {
    const c = makeCar(s.x, s.y, s.a, s.m, { driver: false, targetSpeed: 0 });
    cars.push(c);
  }
  return cars;
}

export function spawnTraffic(rng, count) {
  const cars = [];
  for (let i = 0; i < count; i++) {
    const p = randomRoadPoint(rng);
    const vertical = rng() < 0.5;
    let dir, road;
    if (vertical) {
      road = ROADS_V.reduce((a, b) => Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a);
      dir = rng() < 0.5 ? 'S' : 'N';
    } else {
      road = ROADS_H.reduce((a, b) => Math.abs(b - p.y) < Math.abs(a - p.y) ? b : a);
      dir = rng() < 0.5 ? 'E' : 'W';
    }
    const modelIdx = Math.floor(rng() * CAR_MODELS.length);
    const c = makeCar(p.x, p.y, 0, modelIdx, {
      dir, road, targetSpeed: 90 + rng() * 70, driver: true,
    });
    placeOnLane(c);
    cars.push(c);
  }
  return cars;
}

function placeOnLane(c) {
  const off = 22;
  if (c.dir === 'E') { c.y = c.road + off; c.angle = 0; }
  if (c.dir === 'W') { c.y = c.road - off; c.angle = Math.PI; }
  if (c.dir === 'S') { c.x = c.road + off; c.angle = Math.PI / 2; }
  if (c.dir === 'N') { c.x = c.road - off; c.angle = -Math.PI / 2; }
}

function atIntersection(c) {
  if (c.dir === 'E' || c.dir === 'W') {
    for (const rx of ROADS_V) {
      if (Math.abs(c.x - rx) < 14) return { x: rx, y: c.road };
    }
  } else {
    for (const ry of ROADS_H) {
      if (Math.abs(c.y - ry) < 14) return { x: c.road, y: ry };
    }
  }
  return null;
}

export function updateTraffic(cars, dt, rng, playerCar) {
  for (const c of cars) {
    if (!c.driver || c.driver === 'player') continue;
    // Slow down for the car ahead on the same lane.
    let slow = false;
    for (const o of cars) {
      if (o === c || !o.driver) continue;
      if (o.dir !== c.dir || o.road !== c.road) continue;
      const ahead = (c.dir === 'E' && o.x > c.x && o.x - c.x < 90) ||
        (c.dir === 'W' && o.x < c.x && c.x - o.x < 90) ||
        (c.dir === 'S' && o.y > c.y && o.y - c.y < 90) ||
        (c.dir === 'N' && o.y < c.y && c.y - o.y < 90);
      if (ahead) { slow = true; break; }
    }
    if (playerCar && playerCar !== c) {
      const d = dist(c.x, c.y, playerCar.x, playerCar.y);
      if (d < 80) slow = true;
    }
    const want = slow ? 0 : c.targetSpeed;
    c.speed += clamp(want - c.speed, -260 * dt, 150 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    // Turn at intersections sometimes; U-turn at the map edge.
    const inter = atIntersection(c);
    if (inter && rng() < dt * 0.55) {
      if (c.dir === 'E' || c.dir === 'W') {
        c.dir = rng() < 0.5 ? 'S' : 'N';
        c.road = inter.y;
      } else {
        c.dir = rng() < 0.5 ? 'E' : 'W';
        c.road = inter.x;
      }
      placeOnLane(c);
    }
    if (c.x < 60 || c.x > WORLD_W - 60 || c.y < 60 || c.y > WORLD_H - 60) {
      if (c.dir === 'E') c.dir = 'W';
      else if (c.dir === 'W') c.dir = 'E';
      else if (c.dir === 'S') c.dir = 'N';
      else c.dir = 'S';
      placeOnLane(c);
    }
  }
}

export function spawnPeds(rng, count) {
  const peds = [];
  for (let i = 0; i < count; i++) {
    const p = randomRoadPoint(rng);
    const vertical = rng() < 0.5;
    peds.push({
      x: p.x + (rng() - 0.5) * 60, y: p.y + (rng() - 0.5) * 60,
      angle: rng() * Math.PI * 2,
      speed: 26 + rng() * 22,
      color: pick(rng, PED_COLORS), skin: pick(rng, PED_SKINS),
      dir: vertical ? (rng() < 0.5 ? 'S' : 'N') : (rng() < 0.5 ? 'E' : 'W'),
      road: vertical ? p.x : p.y, vertical,
      pause: 0, scared: 0, health: 30, alive: true,
      walkPhase: rng() * 6,
    });
  }
  return peds;
}

export function updatePeds(peds, dt, rng, danger) {
  for (const p of peds) {
    if (!p.alive) continue;
    p.walkPhase += dt * 6;
    if (p.scared > 0) {
      p.scared -= dt;
      // Run away from the danger point.
      const a = Math.atan2(p.y - danger.y, p.x - danger.x);
      p.x += Math.cos(a) * 110 * dt;
      p.y += Math.sin(a) * 110 * dt;
      p.angle = a;
      if (!isOnRoad(p.x, p.y) && pointInBuilding(p.x, p.y)) {
        p.x -= Math.cos(a) * 110 * dt;
        p.y -= Math.sin(a) * 110 * dt;
      }
      continue;
    }
    if (p.pause > 0) {
      p.pause -= dt;
      continue;
    }
    const step = p.speed * dt;
    if (p.dir === 'E') p.x += step;
    if (p.dir === 'W') p.x -= step;
    if (p.dir === 'S') p.y += step;
    if (p.dir === 'N') p.y -= step;
    p.angle = p.dir === 'E' ? 0 : p.dir === 'W' ? Math.PI : p.dir === 'S' ? Math.PI / 2 : -Math.PI / 2;
    // Wander: at intersections sometimes turn, at edges turn back.
    const onV = ROADS_V.some((rx) => Math.abs(p.x - rx) < 10);
    const onH = ROADS_H.some((ry) => Math.abs(p.y - ry) < 10);
    if ((onV || onH) && rng() < dt * 0.25) {
      const dirs = ['E', 'W', 'S', 'N'];
      p.dir = pick(rng, dirs);
    }
    if (p.x < 70) p.dir = 'E';
    if (p.x > WORLD_W - 70) p.dir = 'W';
    if (p.y < 70) p.dir = 'S';
    if (p.y > WORLD_H - 70) p.dir = 'N';
    if (rng() < dt * 0.02) p.pause = 1 + rng() * 3;
    // Keep pedestrians out of buildings.
    if (pointInBuilding(p.x, p.y)) {
      if (p.dir === 'E') p.x -= step;
      if (p.dir === 'W') p.x += step;
      if (p.dir === 'S') p.y -= step;
      if (p.dir === 'N') p.y += step;
      p.dir = pick(rng, ['E', 'W', 'S', 'N']);
    }
  }
}

export function makePoliceCar(x, y) {
  const c = makeCar(x, y, 0, 0, {
    police: true, driver: true, color: '#1a1a22', model: 'Harbor PD Interceptor',
    len: 48, wid: 24, topSpeed: 330, accel: 320, health: 120,
  });
  c.lightPhase = Math.random() * 6;
  return c;
}

// Police chase: steer toward the target, ram on contact.
export function updatePolice(police, dt, target, rng) {
  for (const c of police) {
    c.lightPhase += dt * 6;
    const wantAngle = Math.atan2(target.y - c.y, target.x - c.x);
    const diff = angleDiff(c.angle, wantAngle);
    c.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
    const d = dist(c.x, c.y, target.x, target.y);
    const want = d > 60 ? c.topSpeed : 120;
    c.speed += clamp(want - c.speed, -400 * dt, 320 * dt);
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
    const blocked = collideWorld(c, c.wid / 2);
    if (blocked && c.speed > 60) {
      c.speed *= 0.4;
    }
    // Slight wobble so the chase does not look robotic.
    c.angle += Math.sin(c.lightPhase * 0.7) * 0.06 * dt;
  }
}
