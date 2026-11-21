// Neon Harbor — all drawing: the city, the cars and people, the HUD,
// the minimap and every menu. Canvas 2D only.
import { clamp, dist, formatCash, formatTime } from './util.js';
import {
  WORLD_W, WORLD_H, ROAD_W, ROADS_V, ROADS_H, BUILDINGS, SIGNS, TREES,
  CRATES, LAMPS, CONTAINERS, BOATS, WATER, districtAt,
} from './city.js';
import { missionObjectiveText, currentStage, currentMission, missionStartPoint } from './missions.js';

export function isNight(time) {
  return time < 6 || time >= 19;
}

export function darknessAt(time) {
  // 0 = full day, 1 = deep night.
  if (time >= 7 && time < 17.5) return 0;
  if (time >= 18.5 || time < 5.5) return 0.55;
  if (time >= 17.5) return ((time - 17.5) / 1) * 0.55;
  if (time < 5.5) return 0.55;
  return ((6.5 - time) / 1) * 0.55;
}

function drawCarShape(ctx, car, night) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.len;
  const W = car.wid;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.roundRect(-L / 2 + 3, -W / 2 + 3, L, W, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.roundRect(-L / 2 + 3, -W / 2 + 3, L - 6, 6, 4);
  ctx.fill();
  // Cabin and windshield.
  ctx.fillStyle = '#101623';
  ctx.beginPath();
  ctx.roundRect(-L * 0.18, -W / 2 + 3, L * 0.36, W - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,200,255,0.5)';
  ctx.fillRect(L * 0.2, -W / 2 + 4, 3, W - 8);
  // Headlights at night.
  if (night) {
    ctx.fillStyle = 'rgba(255,244,180,0.9)';
    ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 5);
    ctx.fillRect(L / 2 - 2, W / 2 - 7, 3, 5);
    ctx.fillStyle = 'rgba(255,244,180,0.12)';
    ctx.beginPath();
    ctx.moveTo(L / 2, -W / 2 + 4);
    ctx.lineTo(L / 2 + 70, -W / 2 - 14);
    ctx.lineTo(L / 2 + 70, W / 2 + 14);
    ctx.lineTo(L / 2, W / 2 - 4);
    ctx.closePath();
    ctx.fill();
  }
  // Police livery and light bar.
  if (car.police) {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(-L / 2 + 6, -W / 2 + 2, L - 12, 4);
    ctx.fillRect(-L / 2 + 6, W / 2 - 6, L - 12, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
    const flash = Math.floor(car.lightPhase || 0) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
    ctx.beginPath();
    ctx.arc(-4, -W / 2 + 2, 4, 0, Math.PI * 2);
    ctx.arc(4, -W / 2 + 2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
    ctx.beginPath();
    ctx.arc(-4, W / 2 - 2, 4, 0, Math.PI * 2);
    ctx.arc(4, W / 2 - 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, color, skin, walkPhase, night) {
  ctx.save();
  ctx.translate(x, y);
  const bob = Math.sin(walkPhase) * 1.5;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(1, 2, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle);
  // Body.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-5, -7 + bob * 0.3, 12, 14, 5);
  ctx.fill();
  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(9, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  // Arms swing.
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(-4 + bob, -8);
  ctx.moveTo(0, 5);
  ctx.lineTo(-4 - bob, 8);
  ctx.stroke();
  ctx.restore();
}

function drawWorld(ctx, G, view) {
  const { x0, y0, x1, y1 } = view;
  const night = isNight(G.time);
  const dark = darknessAt(G.time);
  // Ground: district blocks.
  ctx.fillStyle = '#20261f';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const districts = [
    { x: 1000, y: 0, w: 600, h: 820, c: '#23232e' },
    { x: 0, y: 1150, w: 620, h: 650, c: '#26221c' },
    { x: 1750, y: 0, w: 650, h: 620, c: '#1d2a33' },
    { x: 620, y: 820, w: 430, h: 600, c: '#2b2620' },
  ];
  for (const d of districts) {
    ctx.fillStyle = d.c;
    ctx.fillRect(d.x, d.y, d.w, d.h);
  }
  // Water.
  for (const w of WATER) {
    const grad = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
    grad.addColorStop(0, '#0e3a55');
    grad.addColorStop(1, '#0a2a40');
    ctx.fillStyle = grad;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = 'rgba(120,200,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const wy = w.y + 14 + i * 20;
      ctx.beginPath();
      for (let wx = w.x + 6; wx < w.x + w.w - 6; wx += 26) {
        ctx.moveTo(wx, wy + Math.sin(wx * 0.05 + G.animT * 2 + i) * 2);
        ctx.lineTo(wx + 14, wy + Math.sin(wx * 0.05 + G.animT * 2 + i) * 2);
      }
      ctx.stroke();
    }
  }
  // Boats.
  for (const b of BOATS) {
    ctx.save();
    ctx.translate(b.x, b.y + Math.sin(G.animT * 1.5 + b.x) * 2);
    ctx.fillStyle = b.hue;
    ctx.beginPath();
    ctx.roundRect(-b.len / 2, -8, b.len, 16, 7);
    ctx.fill();
    ctx.fillStyle = '#101623';
    ctx.fillRect(-8, -14, 16, 8);
    ctx.restore();
  }
  // Roads.
  ctx.fillStyle = '#17171f';
  for (const rx of ROADS_V) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD_H);
  for (const ry of ROADS_H) ctx.fillRect(0, ry - ROAD_W / 2, WORLD_W, ROAD_W);
  // Sidewalk edges.
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 3;
  for (const rx of ROADS_V) {
    ctx.beginPath(); ctx.moveTo(rx - ROAD_W / 2, 0); ctx.lineTo(rx - ROAD_W / 2, WORLD_H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rx + ROAD_W / 2, 0); ctx.lineTo(rx + ROAD_W / 2, WORLD_H); ctx.stroke();
  }
  for (const ry of ROADS_H) {
    ctx.beginPath(); ctx.moveTo(0, ry - ROAD_W / 2); ctx.lineTo(WORLD_W, ry - ROAD_W / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, ry + ROAD_W / 2); ctx.lineTo(WORLD_W, ry + ROAD_W / 2); ctx.stroke();
  }
  // Lane dashes.
  ctx.strokeStyle = '#c8b45a';
  ctx.lineWidth = 3;
  ctx.setLineDash([22, 26]);
  for (const rx of ROADS_V) {
    ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, WORLD_H); ctx.stroke();
  }
  for (const ry of ROADS_H) {
    ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(WORLD_W, ry); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (const rx of ROADS_V) {
    for (const ry of ROADS_H) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx + i * 12 - 4, ry - ROAD_W / 2 + 4, 7, 12);
        ctx.fillRect(rx + i * 12 - 4, ry + ROAD_W / 2 - 16, 7, 12);
      }
    }
  }
  // Crates and containers at the docks.
  for (const c of CRATES) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.fillStyle = '#6b5636';
    ctx.fillRect(-c.s / 2, -c.s / 2, c.s, c.s);
    ctx.strokeStyle = '#4a3a22';
    ctx.lineWidth = 2;
    ctx.strokeRect(-c.s / 2, -c.s / 2, c.s, c.s);
    ctx.restore();
  }
  for (const c of CONTAINERS) {
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(c.x + (c.w / 5) * i, c.y); ctx.lineTo(c.x + (c.w / 5) * i, c.y + c.h); ctx.stroke();
    }
  }
  // Trees.
  for (const t of TREES) {
    if (t.x < x0 - 30 || t.x > x1 + 30 || t.y < y0 - 30 || t.y > y1 + 30) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(t.x + 3, t.y + 4, t.r, t.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f7a3a';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f9a4a';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
  // Buildings with height shadow and windows.
  for (const b of BUILDINGS) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(b.x + 8, b.y + 10, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(b.x, b.y, b.w, 5);
    // Windows: lit warm at night, dark glass by day.
    const cols = Math.max(2, Math.floor(b.w / 18));
    const rows = Math.max(2, Math.floor(b.h / 18));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = ((b.seed + i * 7 + j * 13) % 10) < (night ? 6 : 2);
        ctx.fillStyle = lit ? '#ffd98a' : 'rgba(10,16,28,0.8)';
        ctx.fillRect(b.x + 6 + i * ((b.w - 12) / cols), b.y + 6 + j * ((b.h - 12) / rows), 8, 9);
      }
    }
    // Rooftop detail on tall downtown towers.
    if (b.hgt > 40) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 8, 16, 16);
    }
  }
  // Neon signs downtown.
  for (const s of SIGNS) {
    if (s.x < x0 - 80 || s.x > x1 + 80 || s.y < y0 - 40 || s.y > y1 + 40) continue;
    const glow = 0.6 + Math.sin(G.animT * 3 + s.x) * 0.25;
    ctx.save();
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = s.color;
    ctx.shadowBlur = 14 * glow;
    ctx.fillStyle = s.color;
    ctx.fillText(s.text, s.x, s.y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = 0.85;
    ctx.fillText(s.text, s.x, s.y);
    ctx.restore();
  }
  // Street lamps glow at night.
  if (night) {
    for (const l of LAMPS) {
      if (l.x < x0 - 40 || l.x > x1 + 40 || l.y < y0 - 40 || l.y > y1 + 40) continue;
      const g = ctx.createRadialGradient(l.x, l.y, 2, l.x, l.y, 46);
      g.addColorStop(0, 'rgba(255,220,140,0.30)');
      g.addColorStop(1, 'rgba(255,220,140,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(l.x, l.y, 46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath(); ctx.arc(l.x, l.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Mission marker and pickups.
  const ms = G.ms;
  if (ms && !ms.active && ms.index < 6) {
    const sp = missionStartPoint(ms);
    drawMarker(ctx, sp.x, sp.y, '#ffe14d', '!', G.animT);
  }
  if (ms && ms.active) {
    const st = currentStage(ms);
    if (st) {
      drawMarker(ctx, st.x, st.y, st.type === 'escape' ? '#7dff6a' : '#ffe14d', '◆', G.animT);
      // Guide line from player to the objective.
      const p = G.player;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,225,77,0.35)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 12]);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(st.x, st.y); ctx.stroke();
      ctx.restore();
    }
  }
  for (const pk of G.pickups) {
    const bob = Math.sin(G.animT * 4 + pk.x) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  }
  // Cars: parked and traffic, then police, then people.
  for (const c of G.cars) drawCarShape(ctx, c, night);
  for (const c of G.police) drawCarShape(ctx, c, night);
  for (const p of G.peds) {
    if (!p.alive) continue;
    drawPerson(ctx, p.x, p.y, p.angle, p.color, p.skin, p.walkPhase, night);
  }
  for (const e of G.enemies) {
    if (e.health <= 0) continue;
    drawPerson(ctx, e.x, e.y, e.angle, '#c0392b', '#e0ac69', e.walkPhase, night);
    // Health bar over enemies.
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - 16, e.y - 22, 32, 5);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(e.x - 16, e.y - 22, 32 * clamp(e.health / 100, 0, 1), 5);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(e.boss ? 'RAT KING' : 'RAT', e.x, e.y - 26);
  }
  // Player: on foot or in a car (car drawn above; draw a marker ring).
  const pl = G.player;
  if (pl.onFoot) {
    drawPerson(ctx, pl.x, pl.y, pl.angle, '#2ec8ff', '#f1c27d', pl.walkPhase, night);
    // Pistol in hand when armed.
    if (pl.armed) {
      ctx.save();
      ctx.translate(pl.x, pl.y);
      ctx.rotate(pl.aimAngle);
      ctx.fillStyle = '#222';
      ctx.fillRect(6, -2, 12, 4);
      ctx.restore();
    }
  } else if (pl.car) {
    ctx.save();
    ctx.strokeStyle = 'rgba(46,200,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(pl.car.x, pl.car.y, pl.car.len * 0.75, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // Bullet tracers.
  for (const t of G.tracers) {
    ctx.strokeStyle = 'rgba(255,240,150,' + clamp(t.life / t.max, 0, 1) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
  }
  // Particles.
  for (const pt of G.particles) {
    ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Night tint.
  if (dark > 0) {
    ctx.fillStyle = 'rgba(10,10,46,' + dark.toFixed(3) + ')';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }
  // World border.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4);
}

function drawMarker(ctx, x, y, color, glyph, t) {
  const bob = Math.sin(t * 3) * 6;
  ctx.save();
  ctx.translate(x, y + bob - 26);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 18);
  ctx.lineTo(-13, -8);
  ctx.lineTo(0, -18);
  ctx.lineTo(13, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(glyph, 0, -2);
  ctx.restore();
  // Ground ring.
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.2;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(x, y, 26 + Math.sin(t * 3) * 4, 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMinimap(ctx, G, W, H) {
  const mw = 200;
  const mh = 150;
  const mx = 14;
  const my = H - mh - 14;
  const sx = mw / WORLD_W;
  const sy = mh / WORLD_H;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,18,0.82)';
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(mx, my, mw, mh, 8);
  ctx.clip();
  // Water and roads.
  ctx.fillStyle = '#0e3a55';
  ctx.fillRect(mx + 2280 * sx, my, 120 * sx, 620 * sy);
  ctx.fillRect(mx + 1400 * sx, my + 1720 * sy, 1000 * sx, 80 * sy);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (const rx of ROADS_V) {
    ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + mh); ctx.stroke();
  }
  for (const ry of ROADS_H) {
    ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke();
  }
  // Mission marker.
  const ms = G.ms;
  if (ms) {
    let mp = null;
    if (ms.active) {
      const st = currentStage(ms);
      if (st) mp = { x: st.x, y: st.y };
    } else if (ms.index < 6) {
      mp = missionStartPoint(ms);
    }
    if (mp) {
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath();
      ctx.arc(mx + mp.x * sx, my + mp.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Cars and police.
  ctx.fillStyle = 'rgba(200,200,220,0.8)';
  for (const c of G.cars) {
    if (c.driver) ctx.fillRect(mx + c.x * sx - 1, my + c.y * sy - 1, 2, 2);
  }
  ctx.fillStyle = '#ff3b30';
  for (const c of G.police) {
    ctx.beginPath(); ctx.arc(mx + c.x * sx, my + c.y * sy, 3, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const pl = G.player;
  ctx.save();
  ctx.translate(mx + pl.x * sx, my + pl.y * sy);
  ctx.rotate(pl.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -4.5);
  ctx.lineTo(-5, 4.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // North label.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('N', mx + 5, my + 12);
  ctx.restore();
}

function drawHUD(ctx, G, W, H) {
  const pl = G.player;
  const d = districtAt(pl.x, pl.y);
  // Top-left: health, cash, ammo.
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,18,0.72)';
  ctx.beginPath(); ctx.roundRect(14, 14, 250, 84, 10); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(formatCash(pl.cash), 28, 42);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath(); ctx.roundRect(28, 52, 180, 12, 6); ctx.fill();
  ctx.fillStyle = pl.health > 30 ? '#2ecc71' : '#ff3b30';
  ctx.beginPath(); ctx.roundRect(28, 52, 180 * clamp(pl.health / 100, 0, 1), 12, 6); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('HP ' + Math.ceil(pl.health), 214, 63);
  ctx.fillStyle = '#ffd98a';
  ctx.font = '13px sans-serif';
  ctx.fillText('Pistol ammo: ' + pl.ammo + '   •   ' + d.name + '   •   ' + formatTime(G.time), 28, 88);
  ctx.restore();
  // Top-right: wanted stars.
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,18,0.72)';
  ctx.beginPath(); ctx.roundRect(W - 190, 14, 176, 52, 10); ctx.fill();
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < G.wanted ? '#ffd700' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', W - 152 + i * 44, 48);
  }
  ctx.fillStyle = G.wanted > 0 ? '#ff6b6b' : 'rgba(255,255,255,0.6)';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(G.wanted > 0 ? 'WANTED — LOSE THE COPS' : 'CLEAN', W - 102, 60);
  ctx.restore();
  // Objective bar, top center.
  const obj = missionObjectiveText(G.ms);
  ctx.save();
  ctx.font = 'bold 14px sans-serif';
  const ow = Math.min(W - 500, ctx.measureText(obj).width + 36);
  ctx.fillStyle = 'rgba(8,10,18,0.72)';
  ctx.beginPath(); ctx.roundRect((W - ow) / 2, 14, ow, 34, 8); ctx.fill();
  ctx.fillStyle = '#ffe14d';
  ctx.textAlign = 'center';
  ctx.fillText('◎  ' + obj, W / 2, 36);
  ctx.restore();
  // Speed when driving.
  if (!pl.onFoot && pl.car) {
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,18,0.72)';
    ctx.beginPath(); ctx.roundRect(W - 190, H - 88, 176, 74, 10); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(Math.round(Math.abs(pl.car.speed) * 0.9)), W - 62, H - 40);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('km/h', W - 28, H - 40);
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#2ec8ff';
    ctx.textAlign = 'center';
    ctx.fillText(pl.car.model, W - 102, H - 22);
    ctx.restore();
  }
  // Context hint.
  if (G.hint) {
    ctx.save();
    ctx.font = 'bold 14px sans-serif';
    const hw = ctx.measureText(G.hint).width + 30;
    ctx.fillStyle = 'rgba(8,10,18,0.72)';
    ctx.beginPath(); ctx.roundRect((W - hw) / 2, H - 52, hw, 30, 8); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(G.hint, W / 2, H - 32);
    ctx.restore();
  }
  // Toast.
  if (G.ms.toastT > 0 && G.ms.toast) {
    ctx.save();
    ctx.globalAlpha = clamp(G.ms.toastT, 0, 1);
    ctx.font = 'bold 18px sans-serif';
    const tw = ctx.measureText(G.ms.toast).width + 36;
    ctx.fillStyle = 'rgba(20,60,20,0.9)';
    ctx.beginPath(); ctx.roundRect((W - tw) / 2, 96, tw, 38, 10); ctx.fill();
    ctx.fillStyle = '#a9f5a9';
    ctx.textAlign = 'center';
    ctx.fillText(G.ms.toast, W / 2, 121);
    ctx.restore();
  }
  drawMinimap(ctx, G, W, H);
  // Crosshair when armed on foot.
  if (pl.onFoot && pl.armed) {
    const ix = G.input.mouseX;
    const iy = G.input.mouseY;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ix, iy, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix - 14, iy); ctx.lineTo(ix - 5, iy);
    ctx.moveTo(ix + 5, iy); ctx.lineTo(ix + 14, iy);
    ctx.moveTo(ix, iy - 14); ctx.lineTo(ix, iy - 5);
    ctx.moveTo(ix, iy + 5); ctx.lineTo(ix, iy + 14);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDialogue(ctx, G, W, H) {
  const m = currentMission(G.ms);
  if (!m) return;
  const line = m.intro[G.ms.introLine];
  ctx.save();
  ctx.fillStyle = 'rgba(5,5,12,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(12,14,26,0.95)';
  const bw = Math.min(760, W - 80);
  const bh = 210;
  ctx.beginPath(); ctx.roundRect((W - bw) / 2, H / 2 - bh / 2, bw, bh, 14); ctx.fill();
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffe14d';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MISSION ' + m.id + ' — ' + m.title.toUpperCase(), W / 2, H / 2 - bh / 2 + 40);
  ctx.fillStyle = '#2ec8ff';
  ctx.font = 'bold 13px sans-serif';
  ctx.fillText(m.giver + '   •   Reward ' + formatCash(m.reward), W / 2, H / 2 - bh / 2 + 64);
  ctx.fillStyle = '#fff';
  ctx.font = '17px sans-serif';
  const words = line.split(' ');
  let row = '';
  let y = H / 2 - 20;
  for (const w of words) {
    if (ctx.measureText(row + ' ' + w).width > bw - 70) {
      ctx.fillText(row, W / 2, y);
      y += 26;
      row = w;
    } else {
      row = row ? row + ' ' + w : w;
    }
  }
  ctx.fillText(row, W / 2, y);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '13px sans-serif';
  ctx.fillText('Press ENTER or click to continue', W / 2, H / 2 + bh / 2 - 22);
  ctx.restore();
}

function drawTitle(ctx, G, W, H) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#12081f');
  grad.addColorStop(0.55, '#1c0f33');
  grad.addColorStop(1, '#08131f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Neon skyline silhouette.
  ctx.save();
  const rngBase = 7;
  for (let x = 0; x < W; x += 46) {
    const h = 90 + ((x * 37 + rngBase) % 170);
    ctx.fillStyle = '#0a0616';
    ctx.fillRect(x, H - h - 180, 40, h + 180);
    if ((x / 46) % 3 === 0) {
      ctx.fillStyle = 'rgba(255,217,138,0.85)';
      for (let wy = H - h - 160; wy < H - 200; wy += 22) {
        if (((x + wy) % 5) < 3) ctx.fillRect(x + 8, wy, 7, 9);
      }
    }
  }
  ctx.restore();
  // Palm-ish neon glow band.
  const glow = ctx.createRadialGradient(W / 2, H * 0.32, 10, W / 2, H * 0.32, 420);
  glow.addColorStop(0, 'rgba(255,46,136,0.28)');
  glow.addColorStop(0.6, 'rgba(46,200,255,0.10)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.shadowColor = '#ff2e88';
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ff2e88';
  ctx.font = 'bold ' + Math.min(96, W * 0.09) + 'px sans-serif';
  ctx.fillText('NEON HARBOR', W / 2, H * 0.32);
  ctx.shadowColor = '#2ec8ff';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#7de3ff';
  ctx.font = 'bold ' + Math.min(30, W * 0.028) + 'px sans-serif';
  ctx.fillText('A N  O P E N - W O R L D  C R I M E  G A M E', W / 2, H * 0.32 + 52);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = '17px sans-serif';
  ctx.fillText('Run with the Harbor Kings. Steal cars, dodge the Harbor PD, take the docks.', W / 2, H * 0.44);
  ctx.fillStyle = '#ffe14d';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(G.saveExists ? 'ENTER — Play      C — Continue saved game' : 'ENTER — Start the story', W / 2, H * 0.56);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = '15px sans-serif';
  const lines = [
    'WASD / Arrows — move & drive      E — steal / enter car      F — punch',
    'Mouse — aim      Click — shoot pistol      Shift — sprint      P — pause      M — mute',
    'Six story missions for the Harbor Kings vs the Dock Rats. Earn cash, lose the cops, own the harbor.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.66 + i * 26));
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '12px sans-serif';
  ctx.fillText('An original game. Neon Harbor, its city, crews and cars are invented — no real-world game content.', W / 2, H - 30);
  ctx.restore();
}

function drawPause(ctx, G, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(5,5,12,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText('PAUSED', W / 2, H / 2 - 40);
  ctx.font = '17px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('P / Esc — resume      S — save game      Q — quit to title', W / 2, H / 2 + 6);
  ctx.fillText('Missions done: ' + G.ms.completed.length + ' / 6      Cash: ' + formatCash(G.player.cash), W / 2, H / 2 + 38);
  ctx.restore();
}

function drawGameOver(ctx, G, W, H) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,0,0,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = G.endKind === 'busted' ? '#2ec8ff' : '#ff3b30';
  ctx.font = 'bold 84px sans-serif';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 30;
  ctx.fillText(G.endKind === 'busted' ? 'BUSTED' : 'WASTED', W / 2, H / 2 - 20);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText(G.endText, W / 2, H / 2 + 30);
  ctx.fillStyle = '#ffe14d';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('Press ENTER to try again', W / 2, H / 2 + 78);
  ctx.restore();
}

export function draw(ctx, G) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  if (G.state === 'title') {
    drawTitle(ctx, G, W, H);
    return;
  }
  const cam = G.cam;
  const view = {
    x0: clamp(cam.x - W / 2, 0, WORLD_W - W > 0 ? Math.min(cam.x - W / 2, WORLD_W) : 0),
    y0: 0, x1: 0, y1: 0,
  };
  const vx = clamp(cam.x - W / 2, -40, WORLD_W - W + 40);
  const vy = clamp(cam.y - H / 2, -40, WORLD_H - H + 40);
  view.x0 = vx;
  view.y0 = vy;
  view.x1 = vx + W;
  view.y1 = vy + H;
  ctx.save();
  ctx.translate(-vx, -vy);
  drawWorld(ctx, G, view);
  ctx.restore();
  if (G.state === 'playing' || G.state === 'paused' || G.state === 'gameover') {
    drawHUD(ctx, G, W, H);
  }
  if (G.ms && G.ms.showingIntro && G.state === 'playing') drawDialogue(ctx, G, W, H);
  if (G.state === 'paused') drawPause(ctx, G, W, H);
  if (G.state === 'gameover') drawGameOver(ctx, G, W, H);
}
