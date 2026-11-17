// Port Azura — boot, game loop, camera, wanted system and game-over flow.
// The shared game object G is built here and handed to every system.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, PALETTE, PLAYER, WANTED, LANDMARKS } from './config.js';
import { mulberry32, clamp } from './util.js';
import { buildCity } from './city.js';
import { createCar, updatePlayerCar, updateTraffic, updatePolice, spawnPoliceCar, populateTraffic, updateSkids } from './vehicles.js';
import { populatePeds, updatePeds, spawnFootCop, updateFootCops, trimFootCops } from './peds.js';
import { createPlayer, updatePlayerOnFoot, enterCar, exitCar, nearestCar } from './player.js';
import { createMissions, bindMissions } from './missions.js';
import { createHud } from './hud.js';
import { AudioEngine } from './audio.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') || '1') || 1;
const SHOT = params.get('shot');

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 200, 460);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 700);

scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x3a5a3a, 0.95));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.15);
sun.position.set(90, 140, 50);
scene.add(sun);

const G = {
  scene, camera, renderer,
  seed: SEED, rng: mulberry32(SEED),
  time: 0, dt: 0,
  cars: [], peds: [], skids: [],
  colliders: [],
  wanted: 0, heatTimer: 0, policeSpawnCd: 0,
  started: false, paused: false, gameOver: false,
  shotMode: !!SHOT, shotCamera: null,
  audio: new AudioEngine(),
  input: null,
  effects: null,
  city: null, missions: null, hud: null, player: null,
};
window.__game = G;

// --- input ------------------------------------------------------------------
const keys = new Set();
const pressedKeys = new Set();
let clicked = null;
let dragStart = null;
let dragging = false;
const input = {
  keys,
  clicked: null,
  pressed: (code) => pressedKeys.has(code),
};
G.input = input;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  pressedKeys.add(e.code);
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('mousedown', (e) => {
  dragStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  dragging = true;
  G.audio.ensure();
});
window.addEventListener('mousemove', (e) => {
  if (!dragging || !dragStart) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  dragStart.x = e.clientX;
  dragStart.y = e.clientY;
  const p = G.player;
  if (p) {
    p.camYaw -= dx * 0.005;
    p.camPitch = clamp(p.camPitch + dy * 0.004, -0.1, 1.1);
  }
});
window.addEventListener('mouseup', (e) => {
  if (dragging && dragStart) {
    const moved = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
    const dtMs = performance.now() - dragStart.t;
    if (moved < 6 && dtMs < 350) input.clicked = { x: e.clientX, y: e.clientY };
  }
  dragging = false;
  dragStart = null;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- effects (muzzle flash lines) --------------------------------------------
const effectGroup = new THREE.Group();
scene.add(effectGroup);
G.effects = {
  lines: [],
  shootLine(x1, y1, z1, x2, y2, z2) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2),
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe14d }));
    effectGroup.add(line);
    this.lines.push({ line, age: 0 });
  },
  update(dt) {
    for (let i = this.lines.length - 1; i >= 0; i -= 1) {
      const l = this.lines[i];
      l.age += dt;
      if (l.age > 0.09) {
        effectGroup.remove(l.line);
        l.line.geometry.dispose();
        l.line.material.dispose();
        this.lines.splice(i, 1);
      }
    }
  },
};

// --- wanted -------------------------------------------------------------------
G.addWanted = (n, reason) => {
  if (G.gameOver) return;
  const before = G.wanted;
  G.wanted = clamp(G.wanted + n, 0, WANTED.max);
  G.heatTimer = 0;
  if (G.wanted > before) G.hud.flashHint('WANTED — ' + reason + ' (' + G.wanted + '★)');
};
G.setWanted = (n, reason) => {
  G.wanted = clamp(n, 0, WANTED.max);
  G.heatTimer = 0;
};

function managePolice(dt) {
  // Spawn / trim police cars and foot cops to match the wanted level.
  const wantCars = Math.min(G.wanted * WANTED.policePerStar, 4);
  const haveCars = G.cars.filter((c) => c.isPolice).length;
  G.policeSpawnCd -= dt;
  if (haveCars < wantCars && G.policeSpawnCd <= 0 && G.wanted > 0) {
    spawnPoliceCar(G);
    G.policeSpawnCd = 2.5;
  }
  if (haveCars > wantCars) {
    const cops = G.cars.filter((c) => c.isPolice);
    const extra = cops[cops.length - 1];
    G.scene.remove(extra.mesh);
    G.cars.splice(G.cars.indexOf(extra), 1);
  }
  const wantFoot = G.wanted >= 2 ? Math.min((G.wanted - 1) * WANTED.footCopsPerStar, 3) : 0;
  const haveFoot = G.peds.filter((p) => p.isCop).length;
  if (haveFoot < wantFoot && G.policeSpawnCd <= 0) {
    spawnFootCop(G);
    G.policeSpawnCd = 2.5;
  }
  if (haveFoot > wantFoot) trimFootCops(G, wantFoot);
  G.audio.setSiren(G.wanted > 0);
  // Heat decays after a quiet stretch.
  if (G.wanted > 0) {
    G.heatTimer += dt;
    if (G.heatTimer >= WANTED.decaySeconds) {
      G.heatTimer = 0;
      G.wanted -= 1;
      if (G.wanted === 0) G.hud.flashHint('You lost the heat');
    }
  }
}

// --- game over ------------------------------------------------------------------
function endGame(kind) {
  if (G.gameOver) return;
  G.gameOver = true;
  G.audio.setSiren(false);
  G.audio.setEngine(0, false);
  if (kind === 'WASTED') {
    G.hud.showEnd('WASTED', 'Mara is down. The Azura PD scrapes her off the street and the hospital patches her up — minus $200.');
  } else {
    G.hud.showEnd('BUSTED', 'The Azura PD caught Mara. A night in the cells, a $200 fine, and she is back on the street.');
  }
}
G.onBusted = () => endGame('BUSTED');
G.onWasted = () => endGame('WASTED');

function respawn() {
  const p = G.player;
  p.health = PLAYER.health;
  p.money = Math.max(0, p.money - 200);
  p.ammo = PLAYER.startAmmo;
  if (p.inCar) exitCar(G);
  p.x = LANDMARKS.hospital.x;
  p.z = LANDMARKS.hospital.z + 8;
  p.mesh.position.set(p.x, 0, p.z);
  G.setWanted(0, 'respawn');
  // Clear police.
  for (let i = G.cars.length - 1; i >= 0; i -= 1) {
    if (G.cars[i].isPolice) { G.scene.remove(G.cars[i].mesh); G.cars.splice(i, 1); }
  }
  trimFootCops(G, 0);
  G.gameOver = false;
  G.hud.hideMenus();
  G.hud.flashHint('Back on the street — $200 lighter');
}

// --- world build / reset ---------------------------------------------------------
function buildWorld(seed) {
  G.city = buildCity(scene, seed);
  G.colliders = G.city.colliders;
  populateTraffic(G, 12);
  populatePeds(G, 22);
}

G.resetWorld = (seed) => {
  // Remove dynamic entities and rebuild from the seed.
  for (const car of G.cars) G.scene.remove(car.mesh);
  for (const ped of G.peds) G.scene.remove(ped.mesh);
  for (const s of G.skids) G.scene.remove(s.mesh);
  G.cars = [];
  G.peds = [];
  G.skids = [];
  G.rng = mulberry32(seed);
  G.wanted = 0;
  G.heatTimer = 0;
  G.time = 0;
  for (const coin of G.city.coins) {
    coin.taken = false;
    coin.mesh.visible = true;
  }
  const p = G.player;
  if (p.inCar) { p.inCar = false; p.car = null; }
  p.mesh.visible = true;
  p.health = PLAYER.health;
  p.money = PLAYER.startMoney;
  p.ammo = PLAYER.startAmmo;
  p.x = -52; p.z = 46;
  p.heading = 0;
  p.mesh.position.set(p.x, 0, p.z);
  G.missions.index = 0;
  G.missions.step = 0;
  G.missions.active = false;
  G.missions.done = false;
  G.missions.taxi = null;
  G.missions.coinsGot = 0;
  G.gameOver = false;
  populateTraffic(G, 12);
  populatePeds(G, 22);
};

G.saveGame = () => saveGame(G);

// --- one fixed simulation step ---------------------------------------------------
G.step = (dt) => {
  G.time += dt;
  const p = G.player;
  if (p.inCar) updatePlayerCar(G, dt);
  else updatePlayerOnFoot(G, dt);
  updateTraffic(G, dt);
  updatePolice(G, dt);
  updatePeds(G, dt);
  updateFootCops(G, dt);
  G.missions.update(dt);
  G.city.update(dt, G.time);
  updateSkids(G, dt);
  G.effects.update(dt);
  managePolice(dt);
  if (p.health <= 0 && !G.gameOver) G.onWasted();
};

// --- camera -----------------------------------------------------------------------
function updateCamera(dt) {
  const p = G.player;
  if (G.shotMode && G.shotCamera) {
    camera.position.set(G.shotCamera.pos[0], G.shotCamera.pos[1], G.shotCamera.pos[2]);
    camera.lookAt(G.shotCamera.look[0], G.shotCamera.look[1], G.shotCamera.look[2]);
    return;
  }
  const target = p.inCar && p.car
    ? { x: p.car.x, z: p.car.z, h: p.car.heading }
    : { x: p.x, z: p.z, h: p.heading };
  // Chase camera: behind the heading, smoothed. The camera offset is
  // (sin yaw, cos yaw); for it to sit behind the forward vector
  // (cos h, -sin h) the yaw must be h - PI/2. On foot the yaw is the
  // mouse-orbit yaw, which already satisfies the same relation.
  const desiredYaw = p.inCar && p.car ? target.h - Math.PI / 2 : p.camYaw;
  const yaw = desiredYaw;
  const pitch = p.camPitch;
  const distCam = p.inCar ? 13 : 9;
  const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * distCam;
  const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * distCam;
  const cy = 2 + Math.sin(pitch) * distCam + (p.inCar ? 2 : 0);
  camera.position.lerp(new THREE.Vector3(cx, cy, cz), 1 - Math.exp(-8 * dt));
  camera.lookAt(target.x, 1.6, target.z);
}

// --- menus --------------------------------------------------------------------------
const hud = createHud(G);
createMissions(G);
bindMissions(G);
createPlayer(G);
buildWorld(SEED);

document.getElementById('btn-start').addEventListener('click', () => {
  G.audio.ensure();
  G.started = true;
  hud.hideMenus();
  hud.setObjective('Press M to start the first mission — or explore Port Azura');
});
document.getElementById('btn-start-load').addEventListener('click', () => {
  G.audio.ensure();
  G.started = true;
  hud.hideMenus();
  if (loadGame(G)) hud.flashHint('Save loaded');
  hud.setObjective('Press M to continue the story');
});
document.getElementById('btn-resume').addEventListener('click', () => {
  G.paused = false;
  hud.showPause(false);
});
document.getElementById('btn-save').addEventListener('click', () => {
  if (saveGame(G)) hud.flashHint('Game saved');
});
document.getElementById('btn-load').addEventListener('click', () => {
  if (loadGame(G)) hud.flashHint('Save loaded');
  G.paused = false;
  hud.showPause(false);
});
document.getElementById('btn-restart').addEventListener('click', () => {
  G.resetWorld(SEED);
  G.paused = false;
  hud.showPause(false);
  hud.setObjective('Press M to start the first mission');
});
document.getElementById('btn-respawn').addEventListener('click', respawn);
if (hasSave()) document.getElementById('btn-start-load').style.display = 'inline-block';

// --- main loop ---------------------------------------------------------------------------
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  // Edge-triggered keys (E, M, N, P, Q, T handled here; F/G in player.js).
  if (G.started && !G.paused && !G.gameOver && !G.shotMode) {
    if (pressedKeys.has('KeyE')) {
      if (G.player.inCar) exitCar(G);
      else {
        const car = nearestCar(G, 4.5);
        if (car) enterCar(G, car);
      }
    }
    if (pressedKeys.has('KeyM')) G.missions.start();
    if (pressedKeys.has('KeyQ') && G.player.inCar) G.audio.horn();
    if (pressedKeys.has('KeyN')) {
      G.audio.setMuted(!G.audio.muted);
      G.hud.flashHint(G.audio.muted ? 'Sound off — press N to turn it back on' : 'Sound on');
    }
  }
  if (pressedKeys.has('KeyP') || pressedKeys.has('Escape')) {
    if (G.started && !G.gameOver && !G.shotMode) {
      G.paused = !G.paused;
      hud.showPause(G.paused);
    }
  }
  if (G.started && !G.paused && !G.gameOver && !G.shotMode) {
    G.step(dt);
  } else if (G.shotMode) {
    G.time += dt;
    G.city.update(dt, G.time);
    G.effects.update(dt);
  }
  updateCamera(dt);
  hud.update(dt);
  renderer.render(scene, camera);
  pressedKeys.clear();
  input.clicked = null;
}

if (SHOT) {
  G.started = true;
  hud.hideMenus();
  stageShot(G, SHOT);
} else {
  hud.showStart();
  hud.setObjective('Port Azura awaits — press Start');
}
frame();
