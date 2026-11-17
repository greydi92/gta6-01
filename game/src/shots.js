// Deterministic screenshot states (?shot=start|drive|chase|mission&seed=1).
// Each shot resets the world from the seed, places Mara and the cars, then
// steps the real simulation forward a fixed number of fixed-dt steps with
// scripted inputs — so the frame is what the game really looks like, and
// the same seed always gives the same frame. Sets window.__shotReady when
// the frame is ready to capture.
import { LANDMARKS } from './config.js';
import { mulberry32 } from './util.js';
import { spawnPoliceCar } from './vehicles.js';
import { enterCar, nearestCar } from './player.js';

const STEP = 1 / 60;

function stepN(G, seconds, keys) {
  const n = Math.round(seconds / STEP);
  for (const k of keys || []) G.input.keys.add(k);
  for (let i = 0; i < n; i += 1) G.step(STEP);
  for (const k of keys || []) G.input.keys.delete(k);
}

// Temporarily seed Math.random so the staged sequence is reproducible.
function withSeededRandom(seed, fn) {
  const real = Math.random;
  Math.random = mulberry32(seed);
  try { fn(); } finally { Math.random = real; }
}

export function stageShot(G, name) {
  const seed = G.seed;
  // Pick a car parked on an east-west road with the longest clear stretch
  // ahead of it (smallest x), so a 3.5 s drive east stays inside the city
  // instead of running off the eastern edge.
  const ewParkedCar = () => {
    const cands = G.cars.filter((c) => c.isParked
      && (Math.abs(c.heading) < 0.01 || Math.abs(Math.abs(c.heading) - Math.PI) < 0.01));
    if (!cands.length) return null;
    return cands.reduce((a, b) => (b.x < a.x ? b : a));
  };
  G.shotMode = true;
  withSeededRandom(seed, () => {
    G.resetWorld(seed);
    if (name === 'drive') {
      // Mara steals a car parked on an east-west road and drives east, so
      // the car stays on the road for the whole shot.
      const car = ewParkedCar() || nearestCar(G, 200) || G.cars[0];
      G.player.x = car.x - 3; G.player.z = car.z;
      G.player.mesh.position.set(G.player.x, 0, G.player.z);
      enterCar(G, car);
      G.player.car.heading = 0;
      stepN(G, 3.5, ['KeyW']);
      // Chase camera behind the car, high enough to see the road ahead and
      // the city around it instead of a wall of sky.
      const c = G.player.car;
      const fx = Math.cos(c.heading), fz = -Math.sin(c.heading);
      G.shotCamera = { pos: [c.x - fx * 18, 10, c.z - fz * 18], look: [c.x + fx * 10, 1, c.z + fz * 10] };
    } else if (name === 'chase') {
      // Wanted level 3: three police cars hunting Mara's car.
      const car = ewParkedCar(G) || nearestCar(G, 200) || G.cars[0];
      G.player.x = car.x - 3; G.player.z = car.z;
      G.player.mesh.position.set(G.player.x, 0, G.player.z);
      enterCar(G, car);
      G.player.car.heading = 0;
      G.setWanted(3, 'shot');
      spawnPoliceCar(G); spawnPoliceCar(G); spawnPoliceCar(G);
      stepN(G, 3.0, ['KeyW']);
      G.shotCamera = { pos: [G.player.car.x - 22, 14, G.player.car.z + 20], look: [G.player.car.x, 2, G.player.car.z] };
      // setWanted does not flash a hint, so refresh the top hint to match
      // the 3-star heat (the steal's 1-star hint has already faded by now).
      G.hud.flashHint('WANTED (3★) — lose the cops!');
    } else if (name === 'mission') {
      // Mission 1 active: Mara on foot at the garage, the beacon lit over
      // the first objective, briefing dialogue on screen. The HUD objective
      // is left to the live step text ("Go to the garage").
      G.player.x = LANDMARKS.garage.x;
      G.player.z = LANDMARKS.garage.z + 8;
      G.player.heading = Math.PI;
      G.player.mesh.position.set(G.player.x, 0, G.player.z);
      G.player.mesh.rotation.y = G.player.heading;
      G.missions.start();
      stepN(G, 0.8, []);
      G.shotCamera = { pos: [LANDMARKS.garage.x - 16, 11, LANDMARKS.garage.z + 24], look: [LANDMARKS.garage.x, 5, LANDMARKS.garage.z] };
    } else {
      // start: title screen over the city, Mara on foot at the plaza.
      G.player.x = LANDMARKS.plaza.x + 6;
      G.player.z = LANDMARKS.plaza.z + 4;
      G.player.mesh.position.set(G.player.x, 0, G.player.z);
      G.player.heading = Math.PI * 0.25;
      stepN(G, 1.2, []);
      G.shotCamera = { pos: [-30, 24, 58], look: [LANDMARKS.tower.x, 12, LANDMARKS.tower.z] };
      G.hud.showStart();
    }
  });
  // Let one frame render, then signal readiness to the screenshot harness.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
      window.__shotName = name;
    });
  });
  return name;
}
