// Pedestrians and foot police. Peds wander the sidewalks and the beach and
// flee from gunfire; foot cops spawn when the wanted level rises, chase Mara
// on foot and punch her — hold contact long enough and she gets BUSTED.
import * as THREE from '../vendor/three.module.min.js';
import { PALETTE, WANTED, ROAD_LINES } from './config.js';
import { clamp, dist, resolveCircleBox, randRange, pick } from './util.js';

export function makePedMesh(color, isCop) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: isCop ? 0x1e2a3a : color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a070 });
  const pants = new THREE.MeshLambertMaterial({ color: isCop ? 0x14181f : 0x2a2a33 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.85, 0.36), shirt);
  body.position.y = 1.05;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.72;
  group.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), pants);
  legL.position.set(0, 0.31, 0.14);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.62, 0.24), pants);
  legR.position.set(0, 0.31, -0.14);
  group.add(legR);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x0e141c }));
    cap.position.y = 1.95;
    group.add(cap);
  }
  group.userData.legL = legL;
  group.userData.legR = legR;
  return group;
}

export function spawnPed(G, x, z, isCop) {
  const mesh = makePedMesh(pick(G.rng, PALETTE.ped), isCop);
  mesh.position.set(x, 0, z);
  G.scene.add(mesh);
  const ped = {
    mesh, x, z, heading: G.rng() * Math.PI * 2,
    speed: 0, radius: 0.55, isCop: !!isCop,
    targetX: x, targetZ: z, wait: 0, fleeing: false,
    punchCd: 0, bustHold: 0, walkPhase: G.rng() * 6,
  };
  G.peds.push(ped);
  return ped;
}

export function populatePeds(G, count) {
  const rng = G.rng;
  for (let i = 0; i < count; i += 1) {
    // Sidewalk spots: just off a road line, or on the beach.
    let x; let z;
    if (rng() < 0.2) {
      x = randRange(rng, -160, -132);
      z = randRange(rng, -120, 120);
    } else {
      const line = pick(rng, ROAD_LINES);
      if (rng() < 0.5) { x = randRange(rng, -118, 118); z = line + (rng() < 0.5 ? 8.5 : -8.5); }
      else { x = line + (rng() < 0.5 ? 8.5 : -8.5); z = randRange(rng, -118, 118); }
    }
    spawnPed(G, x, z, false);
  }
}

function pickWanderTarget(G, ped) {
  const rng = G.rng;
  if (rng() < 0.25) {
    ped.targetX = randRange(rng, -160, -132);
    ped.targetZ = randRange(rng, -120, 120);
  } else {
    const line = pick(rng, ROAD_LINES);
    if (rng() < 0.5) { ped.targetX = randRange(rng, -118, 118); ped.targetZ = line + (rng() < 0.5 ? 8.5 : -8.5); }
    else { ped.targetX = line + (rng() < 0.5 ? 8.5 : -8.5); ped.targetZ = randRange(rng, -118, 118); }
  }
}

export function updatePeds(G, dt) {
  const px = G.player.inCar && G.player.car ? G.player.car.x : G.player.x;
  const pz = G.player.inCar && G.player.car ? G.player.car.z : G.player.z;
  for (const ped of G.peds) {
    if (ped.isCop) continue;
    // Flee when the player fires nearby or drives at them fast.
    const dPlayer = dist(ped.x, ped.z, px, pz);
    const scared = (G.player.firedRecently > 0 && dPlayer < 26) || (G.player.inCar && G.player.car && G.player.car.speed > 12 && dPlayer < 10);
    if (scared) ped.fleeing = true;
    if (ped.fleeing) {
      const away = Math.atan2(-(ped.z - pz), ped.x - px);
      ped.heading = away;
      ped.speed = 5.2;
      ped.x += Math.cos(ped.heading) * ped.speed * dt;
      ped.z += -Math.sin(ped.heading) * ped.speed * dt;
      if (dPlayer > 34) ped.fleeing = false;
    } else {
      if (ped.wait > 0) {
        ped.wait -= dt;
        ped.speed = 0;
      } else {
        const d = dist(ped.x, ped.z, ped.targetX, ped.targetZ);
        if (d < 1.5) {
          ped.wait = randRange(G.rng, 1, 4);
          pickWanderTarget(G, ped);
          ped.speed = 0;
        } else {
          const want = Math.atan2(-(ped.targetZ - ped.z), ped.targetX - ped.x);
          ped.heading = want;
          ped.speed = 1.6;
          ped.x += Math.cos(ped.heading) * ped.speed * dt;
          ped.z += -Math.sin(ped.heading) * ped.speed * dt;
        }
      }
    }
    ped.x = clamp(ped.x, -166, 130);
    ped.z = clamp(ped.z, -130, 130);
    for (const b of G.colliders) resolveCircleBox(ped, b);
    // Walk-cycle leg swing.
    ped.walkPhase += dt * (ped.speed > 0 ? 9 : 0);
    const swing = Math.sin(ped.walkPhase) * 0.45 * (ped.speed > 0 ? 1 : 0);
    ped.mesh.userData.legL.rotation.x = swing;
    ped.mesh.userData.legR.rotation.x = -swing;
    ped.mesh.position.set(ped.x, 0, ped.z);
    ped.mesh.rotation.y = ped.heading;
  }
}

export function spawnFootCop(G) {
  const rng = G.rng;
  const angle = rng() * Math.PI * 2;
  const x = clamp(G.player.x + Math.cos(angle) * 22, -120, 125);
  const z = clamp(G.player.z + Math.sin(angle) * 22, -125, 125);
  return spawnPed(G, x, z, true);
}

export function updateFootCops(G, dt) {
  const px = G.player.x, pz = G.player.z;
  for (const cop of G.peds) {
    if (!cop.isCop) continue;
    // Cops only chase the player on foot; if she is in a car they run
    // after it but cannot catch it.
    const d = dist(cop.x, cop.z, px, pz);
    const want = Math.atan2(-(pz - cop.z), px - cop.x);
    cop.heading = want;
    cop.speed = G.player.inCar ? 5.5 : 6.4;
    cop.x += Math.cos(cop.heading) * cop.speed * dt;
    cop.z += -Math.sin(cop.heading) * cop.speed * dt;
    for (const b of G.colliders) resolveCircleBox(cop, b);
    cop.walkPhase += dt * 10;
    const swing = Math.sin(cop.walkPhase) * 0.5;
    cop.mesh.userData.legL.rotation.x = swing;
    cop.mesh.userData.legR.rotation.x = -swing;
    cop.mesh.position.set(cop.x, 0, cop.z);
    cop.mesh.rotation.y = cop.heading;
    // Punch when close; sustained contact busts the player.
    if (d < 1.6 && !G.player.inCar && !G.gameOver) {
      cop.punchCd -= dt;
      cop.bustHold += dt;
      if (cop.punchCd <= 0) {
        cop.punchCd = 0.8;
        G.player.health = Math.max(0, G.player.health - 8);
        G.audio.punch();
        G.hud.flashDamage();
      }
      if (cop.bustHold >= WANTED.bustSeconds) {
        G.onBusted();
        return;
      }
    } else {
      cop.bustHold = 0;
    }
  }
}

// Remove foot cops beyond the wanted level (called when heat falls).
export function trimFootCops(G, keep) {
  const cops = G.peds.filter((p) => p.isCop);
  for (let i = cops.length - 1; i >= keep; i -= 1) {
    const cop = cops[i];
    G.scene.remove(cop.mesh);
    G.peds.splice(G.peds.indexOf(cop), 1);
  }
}
