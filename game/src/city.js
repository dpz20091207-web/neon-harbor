// Neon Harbor — the city: roads, districts, buildings, props and collision.
// The map is 2400 x 1800, built from a fixed seed so every run looks the same.
import { mulberry32, pick, circleHitsRect, pushOutOfRect, clamp } from './util.js';

export const WORLD_W = 2400;
export const WORLD_H = 1800;
export const ROAD_W = 92;

export const ROADS_V = [250, 750, 1250, 1750, 2150];
export const ROADS_H = [220, 620, 1020, 1420, 1620];

export const DISTRICTS = [
  { name: 'Downtown', x: 1000, y: 0, w: 600, h: 820, ground: '#23232e', roof: '#2e2e42', accent: '#ff2e88' },
  { name: 'Docks', x: 0, y: 1150, w: 620, h: 650, ground: '#26221c', roof: '#3a332a', accent: '#ffb02e' },
  { name: 'Marina', x: 1750, y: 0, w: 650, h: 620, ground: '#1d2a33', roof: '#2c3e4a', accent: '#2ec8ff' },
  { name: 'Old Town', x: 620, y: 820, w: 430, h: 600, ground: '#2b2620', roof: '#40342a', accent: '#ff7a2e' },
  { name: 'Suburbs', x: 0, y: 0, w: 2400, h: 1800, ground: '#20261f', roof: '#33392f', accent: '#7dff6a' },
];

export function districtAt(x, y) {
  for (let i = 0; i < DISTRICTS.length - 1; i++) {
    const d = DISTRICTS[i];
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d;
  }
  return DISTRICTS[DISTRICTS.length - 1];
}

export function isOnRoad(x, y) {
  for (const rx of ROADS_V) {
    if (Math.abs(x - rx) < ROAD_W / 2) return true;
  }
  for (const ry of ROADS_H) {
    if (Math.abs(y - ry) < ROAD_W / 2) return true;
  }
  return false;
}

export const WATER = [
  { x: 2280, y: 0, w: 120, h: 620 },
  { x: 1400, y: 1720, w: 1000, h: 80 },
];

export function inWater(x, y) {
  for (const w of WATER) {
    if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return true;
  }
  return false;
}

const NEON_WORDS = [
  ['NEON', '#ff2e88'], ['HARBOUR', '#2ec8ff'], ['24H TACOS', '#ffb02e'],
  ['HOTEL LUMEN', '#c86bff'], ['ARCADE', '#7dff6a'], ['KINGS CLUB', '#ff2e88'],
  ['PIER 9', '#2ec8ff'], ['RAMEN', '#ffb02e'], ['CASINO', '#ffe14d'],
  ['NOODLE BAR', '#ff7a2e'], ['DISCO', '#c86bff'], ['GYM', '#7dff6a'],
];

const PALETTES = {
  Downtown: ['#3a3a55', '#463a5e', '#2e4055', '#553a4a', '#3f4a3a'],
  Docks: ['#4a4034', '#3d3630', '#54452e', '#453a2c'],
  Marina: ['#2c3e4a', '#33505e', '#2a4448', '#3a4a55'],
  'Old Town': ['#4a3a2c', '#54402e', '#46382a', '#5a4632'],
  Suburbs: ['#39412f', '#333a2e', '#3f4636', '#2f3a33'],
};

function buildCity() {
  const rng = mulberry32(20261121);
  const buildings = [];
  const signs = [];
  const trees = [];
  const crates = [];
  const lamps = [];
  const containers = [];
  const boats = [];
  const xs = [0].concat(ROADS_V).concat([WORLD_W]);
  const ys = [0].concat(ROADS_H).concat([WORLD_H]);
  for (let bi = 0; bi < xs.length - 1; bi++) {
    for (let bj = 0; bj < ys.length - 1; bj++) {
      const x0 = xs[bi] + (bi === 0 ? 12 : ROAD_W / 2 + 14);
      const x1 = xs[bi + 1] - (bi === xs.length - 2 ? 12 : ROAD_W / 2 + 14);
      const y0 = ys[bj] + (bj === 0 ? 12 : ROAD_W / 2 + 14);
      const y1 = ys[bj + 1] - (bj === ys.length - 2 ? 12 : ROAD_W / 2 + 14);
      const bw = x1 - x0;
      const bh = y1 - y0;
      if (bw < 70 || bh < 70) continue;
      // Water blocks get no buildings.
      if (x0 > 2260 && y0 < 620) continue;
      if (y0 > 1700 && x0 > 1380) continue;
      const d = districtAt(x0 + bw / 2, y0 + bh / 2);
      const cols = Math.max(1, Math.floor(bw / 150));
      const rows = Math.max(1, Math.floor(bh / 140));
      const palette = PALETTES[d.name] || PALETTES.Suburbs;
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if (rng() < 0.22) {
            // Empty lot: a few trees or a parking patch.
            if (rng() < 0.6) {
              trees.push({ x: x0 + (cx + 0.5) * (bw / cols), y: y0 + (cy + 0.5) * (bh / rows), r: 10 + rng() * 8 });
            }
            continue;
          }
          const cw = bw / cols;
          const ch = bh / rows;
          const w = cw * (0.55 + rng() * 0.3);
          const h = ch * (0.55 + rng() * 0.3);
          const bx = x0 + cx * cw + (cw - w) / 2;
          const by = y0 + cy * ch + (ch - h) / 2;
          const tall = d.name === 'Downtown' ? 26 + rng() * 60 : 12 + rng() * 22;
          const b = {
            x: bx, y: by, w, h, hgt: tall,
            color: pick(rng, palette),
            district: d.name,
            seed: Math.floor(rng() * 100000),
          };
          buildings.push(b);
          if (d.name === 'Downtown' && rng() < 0.55) {
            const word = pick(rng, NEON_WORDS);
            signs.push({ x: bx + w / 2, y: by + h + 4, text: word[0], color: word[1], vertical: rng() < 0.5 });
          }
          if ((d.name === 'Suburbs' || d.name === 'Old Town') && rng() < 0.7) {
            trees.push({ x: bx - 14, y: by - 10, r: 9 + rng() * 7 });
          }
        }
      }
    }
  }
  // Docks clutter: crates and shipping containers.
  for (let i = 0; i < 26; i++) {
    crates.push({ x: 60 + rng() * 480, y: 1220 + rng() * 480, s: 16 + rng() * 14, rot: rng() * 0.6 - 0.3 });
  }
  const contColors = ['#c8542e', '#2e7fc8', '#c8a52e', '#3fae5a', '#8a4ac8'];
  for (let i = 0; i < 14; i++) {
    containers.push({
      x: 40 + rng() * 500, y: 1180 + rng() * 560,
      w: 70 + rng() * 30, h: 26, color: pick(rng, contColors),
    });
  }
  // Marina boats bobbing in the water.
  for (let i = 0; i < 6; i++) {
    boats.push({ x: 2300 + rng() * 70, y: 60 + i * 90 + rng() * 30, len: 46 + rng() * 20, hue: pick(rng, ['#e8e8f0', '#ffb02e', '#2ec8ff']) });
  }
  for (let i = 0; i < 5; i++) {
    boats.push({ x: 1500 + i * 170 + rng() * 40, y: 1745 + rng() * 20, len: 50 + rng() * 24, hue: pick(rng, ['#e8e8f0', '#ff7a2e', '#7dff6a']) });
  }
  // Street lamps along every road.
  for (const rx of ROADS_V) {
    for (let y = 120; y < WORLD_H; y += 260) {
      lamps.push({ x: rx + ROAD_W / 2 + 6, y });
      lamps.push({ x: rx - ROAD_W / 2 - 6, y: y + 130 });
    }
  }
  for (const ry of ROADS_H) {
    for (let x = 120; x < WORLD_W; x += 260) {
      lamps.push({ x, y: ry + ROAD_W / 2 + 6 });
    }
  }
  return { buildings, signs, trees, crates, lamps, containers, boats };
}

const CITY = buildCity();
export const BUILDINGS = CITY.buildings;
export const SIGNS = CITY.signs;
export const TREES = CITY.trees;
export const CRATES = CITY.crates;
export const LAMPS = CITY.lamps;
export const CONTAINERS = CITY.containers;
export const BOATS = CITY.boats;

export function pointInBuilding(x, y) {
  for (const b of BUILDINGS) {
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return b;
  }
  return null;
}

// Resolve a circle against buildings, containers, crates and the world edge.
// Returns true when anything blocked the circle.
export function collideWorld(obj, r) {
  let hit = false;
  for (const b of BUILDINGS) {
    if (circleHitsRect(obj.x, obj.y, r, b.x, b.y, b.w, b.h)) {
      if (pushOutOfRect(obj, r, b.x, b.y, b.w, b.h)) hit = true;
    }
  }
  for (const c of CONTAINERS) {
    if (circleHitsRect(obj.x, obj.y, r, c.x, c.y, c.w, c.h)) {
      if (pushOutOfRect(obj, r, c.x, c.y, c.w, c.h)) hit = true;
    }
  }
  if (obj.x < r) { obj.x = r; hit = true; }
  if (obj.y < r) { obj.y = r; hit = true; }
  if (obj.x > WORLD_W - r) { obj.x = WORLD_W - r; hit = true; }
  if (obj.y > WORLD_H - r) { obj.y = WORLD_H - r; hit = true; }
  return hit;
}

export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    const rx = pick(rng, ROADS_V);
    return { x: rx, y: 80 + rng() * (WORLD_H - 160) };
  }
  const ry = pick(rng, ROADS_H);
  return { x: 80 + rng() * (WORLD_W - 160), y: ry };
}

export function nearestRoadPoint(x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS_V) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 60, WORLD_H - 60) }; }
  }
  for (const ry of ROADS_H) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 60, WORLD_W - 60), y: ry }; }
  }
  return best;
}
