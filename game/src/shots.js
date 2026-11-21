// Neon Harbor — screenshot staging. A URL hash like #shot=drive starts the
// game straight into a staged scene so screenshots are real renders of the
// game's own code. Normal players never see this: no hash, no staging.
import { makePoliceCar } from './entities.js';
import { MISSIONS } from './missions.js';

export function shotName() {
  const fromHash = (location.hash || '').match(/shot=([a-z]+)/);
  if (fromHash) return fromHash[1];
  const q = new URLSearchParams(location.search).get('shot');
  return q || '';
}

export function applyShotStaging(G) {
  const shot = shotName();
  if (!shot || shot === 'start') return;
  const pl = G.player;
  G.sound.ensure();
  G.state = 'playing';
  if (shot === 'drive') {
    // Night cruise west along the long 1020 road in the Comet GT, Downtown ahead.
    G.time = 20.4;
    const car = G.missionCar;
    car.x = 2000;
    car.y = 1020;
    car.angle = Math.PI;
    car.speed = 200;
    car.driver = 'player';
    pl.car = car;
    pl.onFoot = false;
    pl.x = car.x;
    pl.y = car.y;
    pl.angle = Math.PI;
    G.cam.x = car.x;
    G.cam.y = car.y;
    // Clear the lane ahead so the cruise is not stuck behind traffic.
    G.cars = G.cars.filter((c) => c === car || Math.abs(c.y - 1020) > 60 || c.x < 900 || c.x > 2100);
    window.setInterval(() => {
      if (G.state === 'playing' && G.player.car && G.player.car.health > 40) {
        G.player.car.speed = 200;
      }
    }, 120);
  } else if (shot === 'chase') {
    // Two-star chase: Harbor PD interceptors closing in at night, heading west.
    G.time = 21.5;
    const car = G.missionCar;
    car.x = 1900;
    car.y = 1020;
    car.angle = Math.PI;
    car.speed = 220;
    car.driver = 'player';
    pl.car = car;
    pl.onFoot = false;
    pl.x = car.x;
    pl.y = car.y;
    G.cam.x = car.x;
    G.cam.y = car.y;
    G.heat = 70;
    G.wanted = 2;
    G.lastCrimeT = 9999;
    const spots = [
      { x: 2080, y: 1020 }, { x: 2050, y: 980 }, { x: 1900, y: 1250 },
    ];
    for (const s of spots) G.police.push(makePoliceCar(s.x, s.y));
    G.cars = G.cars.filter((c) => c === car || Math.abs(c.y - 1020) > 60 || c.x < 900 || c.x > 2100);
    window.setInterval(() => {
      if (G.state === 'playing' && G.player.car && G.player.car.health > 40) {
        G.player.car.speed = 220;
      }
    }, 120);
  } else if (shot === 'mission') {
    // Turf War at the Docks in daylight: Dock Rats closing in, objective live.
    G.time = 15.0;
    G.ms.index = 3;
    G.ms.active = true;
    G.ms.stage = 0;
    G.ms.progress = 0;
    G.ms.showingIntro = false;
    pl.x = 470;
    pl.y = 1380;
    pl.onFoot = true;
    pl.car = null;
    pl.ammo = 48;
    pl.aimAngle = Math.PI;
    G.cam.x = pl.x;
    G.cam.y = pl.y;
    const stage = MISSIONS[3].stages[0];
    for (let i = 0; i < 3; i++) {
      G.enemies.push({
        x: stage.x + (i - 1) * 70,
        y: stage.y - 40 + i * 30,
        angle: 0, speed: 55,
        health: 100, boss: false,
        walkPhase: i * 2, shootT: 1 + i * 0.7,
      });
    }
  }
}
