// HUD: health/money/wanted/speed readouts, mission objective tracker,
// dialogue box, live minimap, damage flash, transient hints and the
// start / pause / WASTED / BUSTED menus. All DOM lives in index.html;
// this module wires it up and draws the minimap on a 2D canvas.
import { LANDMARKS, ROAD_LINES } from './config.js';
import { clamp } from './util.js';

const MAP_SIZE = 180;
const WORLD_SPAN = 360; // world x/z -180..180 maps onto the canvas

function worldToMap(x, z) {
  return {
    x: ((x + WORLD_SPAN / 2) / WORLD_SPAN) * MAP_SIZE,
    y: ((z + WORLD_SPAN / 2) / WORLD_SPAN) * MAP_SIZE,
  };
}

export function createHud(G) {
  const $ = (id) => document.getElementById(id);
  const el = {
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    money: $('money'),
    ammo: $('ammo'),
    wanted: $('wanted'),
    speed: $('speed'),
    objective: $('objective'),
    missionTitle: $('mission-title'),
    dialogue: $('dialogue'),
    dialogueText: $('dialogue-text'),
    hint: $('hint'),
    damage: $('damage'),
    minimap: $('minimap'),
    startMenu: $('menu-start'),
    pauseMenu: $('menu-pause'),
    endMenu: $('menu-end'),
    endTitle: $('end-title'),
    endText: $('end-text'),
  };
  const mapCtx = el.minimap.getContext('2d');
  const hud = {
    el, mapCtx,
    hintTimer: 0,
    dialogueQueue: [],
    dialogueTimer: 0,
    damageTimer: 0,
    minimapTimer: 0,
  };

  function starRow(n) {
    let s = '';
    for (let i = 0; i < 5; i += 1) s += i < n ? '★' : '☆';
    return s;
  }

  hud.setObjective = (text) => { el.objective.textContent = text; };
  hud.setMissionTitle = (text) => { el.missionTitle.textContent = text; };
  hud.flashHint = (text) => {
    el.hint.textContent = text;
    el.hint.style.opacity = '1';
    hud.hintTimer = 3;
  };
  hud.flashDamage = () => {
    el.damage.style.opacity = '0.45';
    hud.damageTimer = 0.35;
  };
  hud.showDialogue = (lines) => {
    hud.dialogueQueue = lines.slice();
    hud.dialogueTimer = 0;
    el.dialogue.style.display = 'block';
    advanceDialogue();
  };
  function advanceDialogue() {
    const line = hud.dialogueQueue.shift();
    if (line === undefined) {
      el.dialogue.style.display = 'none';
      return;
    }
    el.dialogueText.textContent = line;
    hud.dialogueTimer = 4;
  }
  el.dialogue.addEventListener('click', () => {
    hud.dialogueTimer = 0;
    advanceDialogue();
  });

  hud.showStart = () => {
    el.startMenu.style.display = 'flex';
    el.pauseMenu.style.display = 'none';
    el.endMenu.style.display = 'none';
  };
  hud.showPause = (show) => {
    el.pauseMenu.style.display = show ? 'flex' : 'none';
  };
  hud.showEnd = (title, text) => {
    el.endTitle.textContent = title;
    el.endText.textContent = text;
    el.endMenu.style.display = 'flex';
  };
  hud.hideMenus = () => {
    el.startMenu.style.display = 'none';
    el.pauseMenu.style.display = 'none';
    el.endMenu.style.display = 'none';
  };

  hud.drawMinimap = () => {
    const c = mapCtx;
    c.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    c.fillStyle = '#0e1a14';
    c.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Sea (west) and sand.
    c.fillStyle = '#2a6fa8';
    c.fillRect(0, 0, 12, MAP_SIZE);
    c.fillStyle = '#e0c98f';
    c.fillRect(12, 0, 8, MAP_SIZE);
    // Roads (from the shared config, so the minimap always matches the
    // streets the cars actually drive on).
    c.strokeStyle = '#3a3a40';
    c.lineWidth = 5;
    for (const line of ROAD_LINES) {
      const p = worldToMap(line, line);
      c.beginPath(); c.moveTo(p.x, 0); c.lineTo(p.x, MAP_SIZE); c.stroke();
      c.beginPath(); c.moveTo(0, p.y); c.lineTo(MAP_SIZE, p.y); c.stroke();
    }
    // Buildings.
    c.fillStyle = '#5a5a62';
    for (const b of G.colliders) {
      const a = worldToMap(b.minX, b.minZ);
      const d = worldToMap(b.maxX, b.maxZ);
      c.fillRect(a.x, a.y, Math.max(1.5, d.x - a.x), Math.max(1.5, d.y - a.y));
    }
    // Landmark labels: hospital + garage as tiny crosses/squares.
    c.fillStyle = '#f0f0ea';
    const hosp = worldToMap(LANDMARKS.hospital.x, LANDMARKS.hospital.z);
    c.fillRect(hosp.x - 2, hosp.y - 2, 4, 4);
    // Coins left.
    c.fillStyle = '#ffd23e';
    for (const coin of G.city.coins) {
      if (coin.taken) continue;
      const p = worldToMap(coin.x, coin.z);
      c.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    // Mission target beacon (pulsing gold).
    const target = G.missions.stepTarget();
    if (target && G.missions.active) {
      const p = worldToMap(target.x, target.z);
      const r = 4 + Math.sin(G.time * 5) * 1.5;
      c.fillStyle = '#ffd23e';
      c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill();
    }
    // Taxi destination.
    const taxi = G.missions.taxiTarget();
    if (taxi) {
      const p = worldToMap(taxi.x, taxi.z);
      c.fillStyle = '#f2c200';
      c.beginPath(); c.arc(p.x, p.y, 3.5, 0, Math.PI * 2); c.fill();
    }
    // Traffic + parked cars (white dots), police (flashing blue/red).
    for (const car of G.cars) {
      const p = worldToMap(car.x, car.z);
      if (car.isPolice) {
        c.fillStyle = Math.floor(G.time * 4) % 2 === 0 ? '#4488ff' : '#ff3333';
        c.beginPath(); c.arc(p.x, p.y, 3, 0, Math.PI * 2); c.fill();
      } else if (car.isPlayer) {
        // Player car drawn as the player arrow below.
      } else {
        c.fillStyle = '#d8d8d8';
        c.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    }
    // Player arrow (rotated to heading).
    const pp = worldToMap(G.player.x, G.player.z);
    const heading = G.player.inCar && G.player.car ? G.player.car.heading : G.player.heading;
    c.save();
    c.translate(pp.x, pp.y);
    c.rotate(-heading);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(6, 0); c.lineTo(-4, -4); c.lineTo(-4, 4); c.closePath();
    c.fill();
    c.restore();
    // North marker.
    c.fillStyle = '#ffffff';
    c.font = 'bold 9px sans-serif';
    c.fillText('N', MAP_SIZE / 2 - 3, 10);
  };

  hud.update = (dt) => {
    const p = G.player;
    el.healthFill.style.width = clamp(p.health, 0, 100) + '%';
    el.healthFill.style.background = p.health > 50 ? '#3aa84f' : p.health > 25 ? '#e8a832' : '#c23b2e';
    el.healthText.textContent = Math.ceil(p.health) + ' HP';
    el.money.textContent = '$' + p.money;
    el.ammo.textContent = p.pistolDrawn ? 'Ammo ' + p.ammo : '';
    el.wanted.textContent = starRow(G.wanted);
    el.wanted.style.color = G.wanted > 0 ? '#ffd23e' : '#888888';
    const speed = p.inCar && p.car ? Math.abs(p.car.speed) * 3.6 : p.speed * 3.6;
    el.speed.textContent = Math.round(speed) + ' km/h';
    if (hud.hintTimer > 0) {
      hud.hintTimer -= dt;
      if (hud.hintTimer <= 0) el.hint.style.opacity = '0';
    }
    if (hud.damageTimer > 0) {
      hud.damageTimer -= dt;
      if (hud.damageTimer <= 0) el.damage.style.opacity = '0';
    }
    if (hud.dialogueTimer > 0) {
      hud.dialogueTimer -= dt;
      if (hud.dialogueTimer <= 0) advanceDialogue();
    }
    hud.minimapTimer -= dt;
    if (hud.minimapTimer <= 0) {
      hud.minimapTimer = 0.12;
      hud.drawMinimap();
    }
  };

  G.hud = hud;
  return hud;
}
