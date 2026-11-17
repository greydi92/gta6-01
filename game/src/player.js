// Mara Voss on foot: WASD movement relative to the camera, running, punching,
// pistol combat with mouse aim, and entering / exiting cars. The player is a
// simple low-poly figure; the camera and HUD live in main.js / hud.js.
import * as THREE from '../vendor/three.module.min.js';
import { PLAYER } from './config.js';
import { clamp, dist, resolveCircleBox } from './util.js';

export function makePlayerMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x8a2a2a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a070 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x22222c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.9, 0.4), jacket);
  body.position.y = 1.08;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.78;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
  hair.position.y = 1.84;
  group.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.66, 0.26), pants);
  legL.position.set(0, 0.33, 0.15);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.66, 0.26), pants);
  legR.position.set(0, 0.33, -0.15);
  group.add(legR);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), jacket);
  armR.position.set(0.44, 1.15, 0);
  group.add(armR);
  group.userData.legL = legL;
  group.userData.legR = legR;
  group.userData.armR = armR;
  return group;
}

export function createPlayer(G) {
  const mesh = makePlayerMesh();
  mesh.position.set(-52, 0, 46);
  G.scene.add(mesh);
  const player = {
    mesh, x: -52, z: 46, heading: 0, radius: PLAYER.radius,
    health: PLAYER.health, money: PLAYER.startMoney, ammo: PLAYER.startAmmo,
    inCar: false, car: null, speed: 0,
    pistolDrawn: false, punchCd: 0, shootCd: 0, firedRecently: 0,
    walkPhase: 0, camYaw: Math.PI * 0.75, camPitch: 0.32, camDist: 9,
  };
  G.player = player;
  return player;
}

// Find the nearest stealable car (not police, not the player's own).
export function nearestCar(G, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of G.cars) {
    if (car.isPolice) continue;
    const d = dist(G.player.x, G.player.z, car.x, car.z);
    if (d < bestD) { best = car; bestD = d; }
  }
  return best;
}

export function enterCar(G, car) {
  const p = G.player;
  p.inCar = true;
  p.car = car;
  car.isPlayer = true;
  p.mesh.visible = false;
  p.x = car.x; p.z = car.z;
  if (!car.wasStolen) {
    car.wasStolen = true;
    G.addWanted(1, 'car stolen');
  }
  G.audio.setEngine(0, true);
  G.hud.setObjective('Drive — WASD to drive, Space to drift, E to get out');
}

export function exitCar(G) {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  car.isPlayer = false;
  p.inCar = false;
  p.car = null;
  // Step out to the side of the car (perpendicular to its heading).
  p.x = car.x + Math.sin(car.heading) * 2.4;
  p.z = car.z + Math.cos(car.heading) * 2.4;
  p.heading = car.heading;
  p.mesh.visible = true;
  p.mesh.position.set(p.x, 0, p.z);
  G.audio.setEngine(0, false);
}

export function updatePlayerOnFoot(G, dt) {
  const p = G.player;
  if (p.inCar || G.gameOver) return;
  const input = G.input;
  const run = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
  const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  // Movement is camera-relative: W moves away from the camera.
  let mx = 0, mz = 0;
  if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) { mx += -Math.sin(p.camYaw); mz += -Math.cos(p.camYaw); }
  if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) { mx += Math.sin(p.camYaw); mz += Math.cos(p.camYaw); }
  if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) { mx += -Math.cos(p.camYaw); mz += Math.sin(p.camYaw); }
  if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) { mx += Math.cos(p.camYaw); mz += -Math.sin(p.camYaw); }
  const len = Math.hypot(mx, mz);
  if (len > 0) {
    mx /= len; mz /= len;
    p.x += mx * speed * dt;
    p.z += mz * speed * dt;
    p.heading = Math.atan2(-mz, mx);
    p.speed = speed;
    p.walkPhase += dt * speed * 1.4;
  } else {
    p.speed = 0;
  }
  p.x = clamp(p.x, -168, 130);
  p.z = clamp(p.z, -130, 130);
  for (const b of G.colliders) resolveCircleBox(p, b);
  // Bumping into a parked/traffic car pushes the player around it.
  for (const car of G.cars) {
    const d = dist(p.x, p.z, car.x, car.z);
    if (d < car.radius + p.radius && d > 0.01) {
      const push = (car.radius + p.radius - d) / d;
      p.x += (p.x - car.x) * push;
      p.z += (p.z - car.z) * push;
    }
  }
  // Walk cycle.
  const swing = Math.sin(p.walkPhase) * 0.5 * (p.speed > 0 ? 1 : 0);
  p.mesh.userData.legL.rotation.x = swing;
  p.mesh.userData.legR.rotation.x = -swing;
  p.mesh.userData.armR.rotation.x = p.pistolDrawn ? -1.2 : -swing * 0.6;
  p.mesh.position.set(p.x, 0, p.z);
  p.mesh.rotation.y = p.heading;

  // Punch: nearest ped or cop in range takes damage; hitting a ped is a crime.
  p.punchCd -= dt;
  p.shootCd -= dt;
  p.firedRecently = Math.max(0, p.firedRecently - dt);
  if (input.pressed('KeyF') && p.punchCd <= 0) {
    p.punchCd = 0.45;
    G.audio.punch();
    let hitAny = false;
    for (const ped of G.peds) {
      if (dist(p.x, p.z, ped.x, ped.z) < PLAYER.punchRange) {
        hitAny = true;
        if (ped.missionTarget) G.missions.onPunchTarget(ped);
        // Knock the ped back and away.
        const a = Math.atan2(-(ped.z - p.z), ped.x - p.x);
        ped.x += Math.cos(a) * 2.2;
        ped.z += -Math.sin(a) * 2.2;
        ped.fleeing = true;
        if (!ped.isCop) G.addWanted(1, 'pedestrian hit');
        break;
      }
    }
    if (!hitAny) G.hud.flashHint('Nothing in reach');
  }

  // Pistol: G draws, click shoots toward the mouse ground point.
  if (input.pressed('KeyG')) {
    p.pistolDrawn = !p.pistolDrawn;
    G.hud.setObjective(p.pistolDrawn ? 'Pistol out — click to shoot' : 'Pistol holstered');
  }
  if (p.pistolDrawn && input.clicked && p.shootCd <= 0) {
    if (p.ammo <= 0) {
      G.hud.flashHint('Out of ammo');
    } else {
      p.shootCd = 0.28;
      p.ammo -= 1;
      p.firedRecently = 4;
      G.audio.gunshot();
      G.addWanted(1, 'shot fired');
      shootAt(G, input.clicked.x, input.clicked.y);
    }
    input.clicked = null;
  }
}

// Raycast from the camera through the click point onto the ground plane,
// then damage the first ped / car near that point.
function shootAt(G, clientX, clientY) {
  const p = G.player;
  const rect = G.renderer.domElement.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera({ x: nx, y: ny }, G.camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, hit)) return;
  // Muzzle flash line (brief).
  G.effects.shootLine(p.x, 1.5, p.z, hit.x, 1.2, hit.z);
  let best = null;
  let bestD = 3.2;
  for (const ped of G.peds) {
    const d = dist(hit.x, hit.z, ped.x, ped.z);
    if (d < bestD) { best = ped; bestD = d; }
  }
  if (best) {
    if (best.missionTarget) G.missions.onPunchTarget(best);
    const a = Math.atan2(-(best.z - p.z), best.x - p.x);
    best.x += Math.cos(a) * 3;
    best.z += -Math.sin(a) * 3;
    best.fleeing = true;
    if (!best.isCop) G.addWanted(1, 'pedestrian shot');
    G.hud.flashHint('Hit!');
    return;
  }
  for (const car of G.cars) {
    if (dist(hit.x, hit.z, car.x, car.z) < car.radius + 0.6) {
      car.speed *= 0.7;
      G.hud.flashHint('Hit the car');
      return;
    }
  }
}
