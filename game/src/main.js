// Neon Harbor — an original open-world crime game. Top-down 2D, Canvas 2D,
// vanilla JavaScript, no libraries, no network requests, no external assets.
// You are a new runner for the Harbor Kings crew. Explore the city on foot
// and by car, steal cars, outrun the Harbor PD, and finish six story missions
// to take the docks from the rival Dock Rats.
import { clamp, dist, angleTo, angleDiff, mulberry32, pick, formatCash } from './util.js';
import { WORLD_W, WORLD_H, collideWorld, pointInBuilding, nearestRoadPoint, randomRoadPoint } from './city.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { spawnTraffic, spawnPeds, spawnParkedCars, updateTraffic, updatePeds, makePoliceCar, updatePolice as updatePoliceCars } from './entities.js';
import {
  MISSIONS, createMissionState, currentMission, currentStage, missionStartPoint,
  startMission, advanceStage, checkReachStage,
} from './missions.js';
import { draw, isNight } from './render.js';
import { applyShotStaging } from './shots.js';

const SAVE_KEY = 'neon-harbor-save-v1';
const SPAWN = { x: 1250, y: 560 };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = new Input(canvas);
const sound = new SoundEngine();

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

function makePlayer() {
  return {
    x: SPAWN.x, y: SPAWN.y, angle: 0, aimAngle: 0, speed: 0,
    onFoot: true, car: null, health: 100, cash: 120, ammo: 24,
    armed: true, punchT: 0, shootT: 0, walkPhase: 0, invulnT: 0,
  };
}

function createGame() {
  const rng = mulberry32(987654321);
  const G = {
    state: 'title',
    time: 20.2,
    animT: 0,
    rng,
    input,
    sound,
    player: makePlayer(),
    cars: [],
    police: [],
    peds: [],
    enemies: [],
    pickups: [],
    particles: [],
    tracers: [],
    ms: createMissionState(),
    wanted: 0,
    heat: 0,
    lastCrimeT: -99,
    arrestT: 0,
    cam: { x: SPAWN.x, y: SPAWN.y },
    hint: '',
    endKind: '',
    endText: '',
    saveExists: false,
    stats: { kills: 0, stolen: 0, shots: 0 },
    playT: 0,
    skidT: 0,
    missionCar: null,
  };
  G.cars = spawnParkedCars(rng).concat(spawnTraffic(rng, 14));
  // The Comet GT the second mission asks you to steal.
  G.missionCar = G.cars[0];
  G.peds = spawnPeds(rng, 24);
  // Scattered cash and ammo to find while exploring.
  const lootSpots = [
    { x: 760, y: 300, kind: 'cash', amount: 80 },
    { x: 1760, y: 900, kind: 'cash', amount: 120 },
    { x: 300, y: 1100, kind: 'ammo', amount: 18 },
    { x: 1300, y: 1300, kind: 'cash', amount: 150 },
    { x: 2160, y: 1100, kind: 'ammo', amount: 18 },
    { x: 800, y: 1700, kind: 'cash', amount: 100 },
  ];
  for (const s of lootSpots) G.pickups.push({ x: s.x, y: s.y, kind: s.kind, amount: s.amount });
  try {
    G.saveExists = !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    G.saveExists = false;
  }
  return G;
}

const G = createGame();
// Debug handle for play-testing (read-only state inspection from the console).
window.__NH = G;

function saveGame() {
  try {
    const data = {
      cash: G.player.cash, health: G.player.health, ammo: G.player.ammo,
      x: G.player.x, y: G.player.y,
      missionIndex: G.ms.index, completed: G.ms.completed,
      time: G.time,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    G.saveExists = true;
    G.ms.toast = 'Game saved';
    G.ms.toastT = 2;
  } catch (e) {
    G.ms.toast = 'Save failed (storage unavailable)';
    G.ms.toastT = 2;
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    G.player.cash = d.cash || 0;
    G.player.health = d.health || 100;
    G.player.ammo = d.ammo || 24;
    G.player.x = d.x || SPAWN.x;
    G.player.y = d.y || SPAWN.y;
    G.ms.index = d.missionIndex || 0;
    G.ms.completed = d.completed || [];
    G.time = d.time || 20.2;
    G.player.onFoot = true;
    G.player.car = null;
    G.wanted = 0;
    G.heat = 0;
    return true;
  } catch (e) {
    return false;
  }
}

function addParticles(x, y, color, n, speed, size) {
  for (let i = 0; i < n; i++) {
    const a = G.rng() * Math.PI * 2;
    const s = speed * (0.4 + G.rng() * 0.8);
    G.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.5 + G.rng() * 0.5, max: 1, color, size: size * (0.6 + G.rng() * 0.8),
    });
  }
}

function explosion(x, y, big) {
  addParticles(x, y, '#ff7a2e', big ? 42 : 22, big ? 260 : 170, 5);
  addParticles(x, y, '#ffd23e', big ? 26 : 14, big ? 200 : 130, 4);
  addParticles(x, y, '#555', big ? 20 : 10, 80, 7);
  sound.explosion();
}

function addHeat(amount) {
  G.heat = clamp(G.heat + amount, 0, 100);
  G.lastCrimeT = G.playT;
  updateWantedStars();
}

function updateWantedStars() {
  const w = G.heat > 85 ? 3 : G.heat > 55 ? 2 : G.heat > 25 ? 1 : 0;
  if (w > G.wanted && G.wanted > 0) sound.sirenBlip();
  G.wanted = w;
}

function spawnEnemies(stage) {
  G.enemies = [];
  const n = stage.count || 3;
  for (let i = 0; i < n; i++) {
    const boss = G.ms.index === 5 && i === 0;
    G.enemies.push({
      x: stage.x + (G.rng() - 0.5) * 160,
      y: stage.y + (G.rng() - 0.5) * 160,
      angle: 0, speed: 55 + G.rng() * 20,
      health: boss ? 240 : 100, boss,
      walkPhase: G.rng() * 6, shootT: 1 + G.rng() * 1.5,
    });
  }
}

function spawnBags(stage) {
  for (let i = 0; i < (stage.count || 3); i++) {
    G.pickups.push({
      x: stage.x + (i - 1) * 46 + (G.rng() - 0.5) * 20,
      y: stage.y + (G.rng() - 0.5) * 60,
      kind: 'bag', amount: 400,
    });
  }
}

function beginStageEffects() {
  const st = currentStage(G.ms);
  if (!st) return;
  if (st.type === 'kill') spawnEnemies(st);
  if (st.type === 'collect') spawnBags(st);
  if (st.type === 'escape') {
    addHeat(45);
    G.ms.toast = 'The cops are onto you — lose them!';
    G.ms.toastT = 3;
  }
}

function completeStage() {
  const done = advanceStage(G.ms);
  sound.pickup();
  if (done) {
    const m = MISSIONS[G.ms.index - 1];
    if (m) {
      G.player.cash += m.reward;
      G.player.ammo += 12;
      G.ms.toast = 'Mission complete: ' + m.title + '  +' + formatCash(m.reward);
      G.ms.toastT = 4;
      sound.missionDone();
      sound.cash();
      saveGame();
    }
  } else {
    G.ms.toast = 'Objective updated';
    G.ms.toastT = 2;
    beginStageEffects();
  }
}

function nearestCar(maxD) {
  let best = null;
  let bestD = maxD;
  for (const c of G.cars) {
    const d = dist(G.player.x, G.player.y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function enterCar(car) {
  const wasDriven = car.driver;
  G.player.car = car;
  G.player.onFoot = false;
  car.driver = 'player';
  if (wasDriven) {
    addHeat(30);
    G.stats.stolen++;
    G.ms.toast = 'You stole the ' + car.model + '! The cops noticed.';
    G.ms.toastT = 2.5;
    for (const p of G.peds) {
      if (dist(p.x, p.y, car.x, car.y) < 200) p.scared = 2;
    }
  }
  const st = currentStage(G.ms);
  if (G.ms.active && st && st.type === 'steal' && car === G.missionCar) {
    completeStage();
  }
}

function exitCar() {
  const car = G.player.car;
  if (!car) return;
  car.speed = 0;
  car.driver = false;
  G.player.x = car.x - Math.cos(car.angle) * 0 - 26;
  G.player.y = car.y - 26;
  G.player.onFoot = true;
  G.player.car = null;
  collideWorld(G.player, 12);
}

function damagePlayer(amount, cause) {
  if (G.player.invulnT > 0) return;
  G.player.health -= amount;
  G.player.invulnT = 0.25;
  addParticles(G.player.x, G.player.y, '#ff3b30', 8, 120, 3);
  if (G.player.health <= 0) {
    G.player.health = 0;
    endGame('wasted', cause || 'The harbor got the better of you.');
  }
}

function endGame(kind, text) {
  G.state = 'gameover';
  G.endKind = kind;
  G.endText = text;
  sound.setEngine(0, false);
  sound.setSiren(false, 0);
  if (kind === 'busted') sound.busted();
  else sound.explosion();
}

function respawn() {
  const lost = Math.floor(G.player.cash * 0.1);
  G.player.cash -= lost;
  G.player.health = 100;
  G.player.x = SPAWN.x;
  G.player.y = SPAWN.y;
  G.player.onFoot = true;
  G.player.car = null;
  G.wanted = 0;
  G.heat = 0;
  G.police = [];
  G.enemies = [];
  G.arrestT = 0;
  G.cam.x = SPAWN.x;
  G.cam.y = SPAWN.y;
  G.state = 'playing';
}

// ---- combat ----
function aimWorld() {
  const vx = clamp(G.cam.x - canvas.width / 2, -40, WORLD_W - canvas.width + 40);
  const vy = clamp(G.cam.y - canvas.height / 2, -40, WORLD_H - canvas.height + 40);
  return { x: input.mouseX + vx, y: input.mouseY + vy };
}

function shoot() {
  const pl = G.player;
  if (pl.ammo <= 0 || pl.shootT > 0) return;
  pl.ammo--;
  pl.shootT = 0.28;
  G.stats.shots++;
  sound.shot();
  const aim = aimWorld();
  const a = angleTo(pl.x, pl.y, aim.x, aim.y);
  pl.aimAngle = a;
  const range = 430;
  const tx = pl.x + Math.cos(a) * range;
  const ty = pl.y + Math.sin(a) * range;
  let bestD = range;
  let hit = null;
  let hitKind = '';
  const consider = (x, y, r, obj, kind) => {
    const dx = x - pl.x;
    const dy = y - pl.y;
    const along = dx * Math.cos(a) + dy * Math.sin(a);
    if (along < 0 || along > bestD) return;
    const perp = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a));
    if (perp < r + 6) { bestD = along; hit = obj; hitKind = kind; }
  };
  for (const e of G.enemies) {
    if (e.health > 0) consider(e.x, e.y, 14, e, 'enemy');
  }
  for (const p of G.peds) {
    if (p.alive) consider(p.x, p.y, 12, p, 'ped');
  }
  for (const c of G.police) consider(c.x, c.y, 22, c, 'police');
  for (const c of G.cars) {
    if (c !== pl.car) consider(c.x, c.y, 20, c, 'car');
  }
  const ex = pl.x + Math.cos(a) * bestD;
  const ey = pl.y + Math.sin(a) * bestD;
  G.tracers.push({ x1: pl.x, y1: pl.y, x2: ex, y2: ey, life: 0.09, max: 0.09 });
  addParticles(ex, ey, '#ffd23e', 4, 90, 2);
  if (hitKind === 'enemy') {
    hit.health -= 34;
    addParticles(hit.x, hit.y, '#ff3b30', 10, 130, 3);
    if (hit.health <= 0) {
      G.stats.kills++;
      addParticles(hit.x, hit.y, '#ff3b30', 22, 180, 4);
      const st = currentStage(G.ms);
      if (G.ms.active && st && st.type === 'kill') {
        G.ms.progress++;
        if (G.ms.progress >= st.count) completeStage();
      }
    }
  } else if (hitKind === 'ped') {
    hit.alive = false;
    addHeat(25);
    addParticles(hit.x, hit.y, '#ff3b30', 16, 150, 3);
    for (const p of G.peds) {
      if (dist(p.x, p.y, hit.x, hit.y) < 260) p.scared = 3;
    }
  } else if (hitKind === 'police') {
    hit.health -= 22;
    addHeat(30);
    addParticles(hit.x, hit.y, '#ffb02e', 10, 140, 3);
    if (hit.health <= 0) {
      explosion(hit.x, hit.y, true);
      G.police = G.police.filter((c) => c !== hit);
      addHeat(15);
    }
  } else if (hitKind === 'car') {
    hit.health -= 20;
    if (hit.health <= 0) {
      explosion(hit.x, hit.y, true);
      G.cars = G.cars.filter((c) => c !== hit);
    }
  }
}

function punch() {
  const pl = G.player;
  if (pl.punchT > 0) return;
  pl.punchT = 0.4;
  sound.punch();
  const reach = 58;
  const arc = 1.1;
  let hitSomething = false;
  const tryHit = (x, y, r) => {
    if (dist(pl.x, pl.y, x, y) > reach + r) return null;
    const a = angleTo(pl.x, pl.y, x, y);
    return Math.abs(angleDiff(pl.aimAngle, a)) < arc ? { x, y } : null;
  };
  for (const e of G.enemies) {
    if (e.health > 0 && tryHit(e.x, e.y, 14)) {
      e.health -= 25;
      hitSomething = true;
      addParticles(e.x, e.y, '#ff3b30', 8, 120, 3);
      if (e.health <= 0) {
        G.stats.kills++;
        const st = currentStage(G.ms);
        if (G.ms.active && st && st.type === 'kill') {
          G.ms.progress++;
          if (G.ms.progress >= st.count) completeStage();
        }
      }
      break;
    }
  }
  if (!hitSomething) {
    for (const p of G.peds) {
      if (p.alive && tryHit(p.x, p.y, 12)) {
        p.alive = false;
        hitSomething = true;
        addHeat(15);
        addParticles(p.x, p.y, '#ff3b30', 10, 120, 3);
        for (const q of G.peds) {
          if (dist(q.x, q.y, p.x, p.y) < 260) q.scared = 3;
        }
        break;
      }
    }
  }
  if (hitSomething) {
    const hx = pl.x + Math.cos(pl.aimAngle) * 40;
    const hy = pl.y + Math.sin(pl.aimAngle) * 40;
    addParticles(hx, hy, '#ffffff', 6, 100, 2);
  }
}

// ---- per-frame updates ----
function updatePlayerOnFoot(dt) {
  const pl = G.player;
  const ix = (input.down('d', 'arrowright') ? 1 : 0) - (input.down('a', 'arrowleft') ? 1 : 0);
  const iy = (input.down('s', 'arrowdown') ? 1 : 0) - (input.down('w', 'arrowup') ? 1 : 0);
  const sprint = input.down('shift') ? 1.55 : 1;
  const speed = 165 * sprint;
  if (ix !== 0 || iy !== 0) {
    const len = Math.hypot(ix, iy);
    pl.x += (ix / len) * speed * dt;
    pl.y += (iy / len) * speed * dt;
    pl.walkPhase += dt * 10 * sprint;
    pl.angle = Math.atan2(iy, ix);
  }
  collideWorld(pl, 12);
  const aim = aimWorld();
  pl.aimAngle = angleTo(pl.x, pl.y, aim.x, aim.y);
  if (input.mouseDown || input.wasPressed(' ')) shoot();
  if (input.wasPressed('f')) punch();
  pl.punchT = Math.max(0, pl.punchT - dt);
  pl.shootT = Math.max(0, pl.shootT - dt);
  pl.invulnT = Math.max(0, pl.invulnT - dt);
  const car = nearestCar(64);
  if (car) {
    G.hint = 'E — Get in the ' + car.model + (car.driver ? ' (steal it!)' : '');
    if (input.wasPressed('e')) enterCar(car);
  } else if (!G.ms.active && G.ms.index < MISSIONS.length) {
    const sp = missionStartPoint(G.ms);
    if (dist(pl.x, pl.y, sp.x, sp.y) < 70) {
      G.hint = 'E — Start mission: ' + MISSIONS[G.ms.index].title;
      if (input.wasPressed('e')) startMission(G.ms);
    }
  }
}

function updateDriving(dt) {
  const pl = G.player;
  const car = pl.car;
  if (!car) return;
  const fwd = (input.down('w', 'arrowup') ? 1 : 0) - (input.down('s', 'arrowdown') ? 1 : 0);
  const steer = (input.down('a', 'arrowleft') ? 1 : 0) - (input.down('d', 'arrowright') ? 1 : 0);
  const handbrake = input.down(' ');
  if (fwd > 0) car.speed += car.accel * dt;
  else if (fwd < 0) car.speed -= (car.speed > 0 ? 420 : 200) * dt;
  else car.speed -= car.speed * 0.7 * dt;
  if (handbrake) car.speed -= car.speed * 2.2 * dt;
  car.speed = clamp(car.speed, -140, car.topSpeed);
  const turnRate = 2.1 * clamp(Math.abs(car.speed) / 120, 0, 1) * (car.speed < 0 ? -1 : 1);
  car.angle += steer * turnRate * dt;
  pl.angle = car.angle;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  pl.x = car.x;
  pl.y = car.y;
  const crashed = collideWorld(car, car.wid / 2);
  if (crashed && Math.abs(car.speed) > 120) {
    sound.crash();
    addParticles(car.x, car.y, '#ffb02e', 10, 140, 3);
    car.health -= 12;
    car.speed *= -0.25;
  } else if (crashed) {
    car.speed *= 0.5;
  }
  // Bump traffic cars: shove them aside, scrub some speed (frame-rate safe).
  for (const o of G.cars) {
    if (o === car || !o.driver) continue;
    if (dist(car.x, car.y, o.x, o.y) < 46) {
      o.x += (o.x - car.x) * 0.1;
      o.y += (o.y - car.y) * 0.1;
      o.speed = Math.min(o.targetSpeed + 40, (o.speed || 0) + 120 * dt);
      car.speed *= Math.max(0, 1 - 1.5 * dt);
      if (Math.abs(car.speed) > 150 && G.rng() < dt * 3) {
        sound.crash();
        addParticles(car.x, car.y, '#ffb02e', 8, 120, 3);
      }
    }
  }
  // Skid particles and sound on hard turns at speed.
  if (Math.abs(steer) > 0 && Math.abs(car.speed) > 200) {
    G.skidT -= dt;
    addParticles(
      car.x - Math.cos(car.angle) * car.len / 2,
      car.y - Math.sin(car.angle) * car.len / 2,
      '#aaaaaa', 1, 20, 3,
    );
    if (G.skidT <= 0) {
      sound.noise(0.18, 0.12, 900);
      G.skidT = 0.3;
    }
  }
  // Running over pedestrians is a crime.
  for (const p of G.peds) {
    if (p.alive && dist(car.x, car.y, p.x, p.y) < 26 && Math.abs(car.speed) > 40) {
      p.alive = false;
      addHeat(25);
      addParticles(p.x, p.y, '#ff3b30', 14, 150, 3);
      car.speed *= 0.9;
    }
  }
  sound.setEngine(Math.abs(car.speed) / car.topSpeed, true);
  if (input.wasPressed('e')) exitCar();
  if (car.health <= 0) {
    explosion(car.x, car.y, true);
    G.cars = G.cars.filter((c) => c !== car);
    G.player.car = null;
    G.player.onFoot = true;
    G.player.x = car.x + 30;
    G.player.y = car.y;
    damagePlayer(20, 'Your car went up in flames.');
  }
}

function updatePolice(dt) {
  // Wanted heat cools off when the player lies low.
  if (G.playT - G.lastCrimeT > 5) {
    const nearCop = G.police.some((c) => dist(c.x, c.y, G.player.x, G.player.y) < 320);
    const rate = G.ms.active && currentStage(G.ms) && currentStage(G.ms).type === 'escape' && !nearCop ? 5 : 2;
    G.heat = Math.max(0, G.heat - rate * dt);
    updateWantedStars();
  }
  const wantCount = G.wanted * 2;
  while (G.police.length < wantCount) {
    const p = randomRoadPoint(G.rng);
    let tries = 0;
    while (dist(p.x, p.y, G.player.x, G.player.y) < 420 && tries < 8) {
      const q = randomRoadPoint(G.rng);
      p.x = q.x;
      p.y = q.y;
      tries++;
    }
    G.police.push(makePoliceCar(p.x, p.y));
  }
  while (G.police.length > wantCount) G.police.pop();
  updatePoliceCars(G.police, dt, G.player, G.rng);
  // Ramming and arrest.
  const pl = G.player;
  let touchingCop = false;
  for (const c of G.police) {
    const d = dist(c.x, c.y, pl.x, pl.y);
    if (pl.onFoot) {
      if (d < 34 && Math.abs(c.speed) > 60) {
        damagePlayer(22, 'The Harbor PD ran you down.');
        c.speed *= 0.3;
      }
      if (d < 52 && Math.abs(c.speed) < 70) touchingCop = true;
    } else if (pl.car && d < 50) {
      pl.car.speed *= Math.max(0, 1 - 0.9 * dt);
      pl.car.health -= 14 * dt;
      c.speed *= Math.max(0, 1 - 0.9 * dt);
      if (G.rng() < dt * 2) {
        sound.crash();
        addParticles(c.x, c.y, '#ffb02e', 6, 100, 3);
      }
    }
  }
  if (touchingCop && pl.onFoot) {
    G.arrestT += dt;
    G.hint = 'The cops are grabbing you — RUN! (' + Math.ceil(1.2 - G.arrestT) + ')';
    if (G.arrestT > 1.2) endGame('busted', 'The Harbor PD took you in. The Kings will post bail... eventually.');
  } else {
    G.arrestT = Math.max(0, G.arrestT - dt * 2);
  }
  sound.setSiren(G.wanted > 0, dt);
}

function updateEnemies(dt) {
  const pl = G.player;
  for (const e of G.enemies) {
    if (e.health <= 0) continue;
    e.walkPhase += dt * 6;
    const d = dist(e.x, e.y, pl.x, pl.y);
    e.angle = angleTo(e.x, e.y, pl.x, pl.y);
    if (d > 130) {
      e.x += Math.cos(e.angle) * e.speed * dt;
      e.y += Math.sin(e.angle) * e.speed * dt;
    } else {
      // Strafe at close range.
      e.x += Math.cos(e.angle + Math.PI / 2) * Math.sin(G.animT + e.walkPhase) * 30 * dt;
      e.y += Math.sin(e.angle + Math.PI / 2) * Math.sin(G.animT + e.walkPhase) * 30 * dt;
    }
    collideWorld(e, 12);
    e.shootT -= dt;
    if (e.shootT <= 0 && d < 420) {
      e.shootT = 1.5 + G.rng() * 0.8;
      sound.shot();
      G.tracers.push({ x1: e.x, y1: e.y, x2: pl.x, y2: pl.y, life: 0.09, max: 0.09 });
      if (G.rng() < 0.45) damagePlayer(e.boss ? 12 : 7, 'A Dock Rat gunned you down.');
    }
  }
  G.enemies = G.enemies.filter((e) => e.health > 0 || G.rng() < 0.5);
}

function updateMissions(dt) {
  const ms = G.ms;
  if (ms.toastT > 0) ms.toastT -= dt;
  if (!ms.active || ms.showingIntro) return;
  const st = currentStage(ms);
  if (!st) return;
  const pl = G.player;
  if (st.type === 'goto' || st.type === 'deliverCar' || st.type === 'escape') {
    const res = checkReachStage(ms, pl.x, pl.y, !pl.onFoot, G.wanted);
    if (res === 'done') completeStage();
  }
  // Pickup collection (cash, ammo, mission money bags).
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    if (dist(pl.x, pl.y, pk.x, pk.y) < 34) {
      if (pk.kind === 'cash') {
        pl.cash += pk.amount;
        sound.cash();
        G.ms.toast = '+' + formatCash(pk.amount) + ' found';
        G.ms.toastT = 1.5;
      } else if (pk.kind === 'ammo') {
        pl.ammo += pk.amount;
        sound.pickup();
        G.ms.toast = '+' + pk.amount + ' pistol ammo';
        G.ms.toastT = 1.5;
      } else if (pk.kind === 'bag') {
        ms.progress++;
        sound.cash();
        if (ms.progress >= (st.count || 3)) completeStage();
        else {
          G.ms.toast = 'Money bag ' + ms.progress + '/' + st.count;
          G.ms.toastT = 1.5;
        }
      }
      addParticles(pk.x, pk.y, '#2ecc71', 10, 100, 3);
      G.pickups.splice(i, 1);
    }
  }
}

function updatePlaying(dt) {
  G.playT += dt;
  G.animT += dt;
  G.time = (G.time + dt * 0.02) % 24;
  const ms = G.ms;
  if (ms.showingIntro) {
    if (input.wasPressed('enter') || input.mouseClicked) {
      ms.introLine++;
      sound.pickup();
      const m = currentMission(ms);
      if (ms.introLine >= m.intro.length) {
        ms.showingIntro = false;
        beginStageEffects();
      }
    }
    return;
  }
  G.hint = '';
  if (G.player.onFoot) updatePlayerOnFoot(dt);
  else updateDriving(dt);
  updateTraffic(G.cars, dt, G.rng, G.player.car);
  updatePeds(G.peds, dt, G.rng, G.player);
  updatePolice(dt);
  updateEnemies(dt);
  updateMissions(dt);
  // Particles and tracers.
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    if (p.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.tracers.length - 1; i >= 0; i--) {
    G.tracers[i].life -= dt;
    if (G.tracers[i].life <= 0) G.tracers.splice(i, 1);
  }
  // Camera follows the player.
  const target = G.player;
  G.cam.x += (target.x - G.cam.x) * Math.min(1, dt * 5);
  G.cam.y += (target.y - G.cam.y) * Math.min(1, dt * 5);
  if (G.player.onFoot) sound.setEngine(0, false);
  // Pause / save keys.
  if (input.wasPressed('p', 'escape')) G.state = 'paused';
  if (input.wasPressed('m')) sound.setMuted(!sound.muted);
}

function updateTitle(dt) {
  G.animT += dt;
  if (input.wasPressed('enter')) {
    sound.ensure();
    G.state = 'playing';
  }
  if (input.wasPressed('c') && G.saveExists) {
    sound.ensure();
    if (loadGame()) G.state = 'playing';
  }
}

function updatePaused(dt) {
  if (input.wasPressed('p', 'escape')) G.state = 'playing';
  if (input.wasPressed('s')) saveGame();
  if (input.wasPressed('q')) G.state = 'title';
}

function updateGameOver(dt) {
  if (input.wasPressed('enter')) respawn();
}

let lastT = performance.now();
function loop(now) {
  const dt = clamp((now - lastT) / 1000, 0, 0.05);
  lastT = now;
  if (G.state === 'title') updateTitle(dt);
  else if (G.state === 'playing') updatePlaying(dt);
  else if (G.state === 'paused') updatePaused(dt);
  else if (G.state === 'gameover') updateGameOver(dt);
  draw(ctx, G);
  input.endFrame();
  requestAnimationFrame(loop);
}

// Boot: stage any screenshot scene from the URL hash, then start the loop.
applyShotStaging(G);
requestAnimationFrame(loop);
