// Cars: arcade driving physics, traffic AI, police chases and skid marks.
// A car is a THREE group (body, cabin, wheels, lights) plus a small physics
// state. Player driving uses scalar speed + lateral slide so handbrake
// drifts feel right without a full tyre model.
import * as THREE from '../vendor/three.module.min.js';
import { CAR, PALETTE, ROAD_LINES } from './config.js';
import { clamp, angleDiff, dist, resolveCircleBox, mulberry32, randRange, pick } from './util.js';

const SKID_MAX = 140;

export function makeCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x181820 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.85, 2.0), paint);
  body.position.y = 0.75;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 1.75), new THREE.MeshLambertMaterial({ color: 0x2a3542 }));
  cabin.position.set(-0.2, 1.45, 0);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 10);
  const wheels = [];
  for (const [wx, wz] of [[1.5, 0.95], [1.5, -0.95], [-1.5, 0.95], [-1.5, -0.95]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.x = Math.PI / 2;
    w.position.set(wx, 0.42, wz);
    group.add(w);
    wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const wz of [0.6, -0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.4), lightMat);
    h.position.set(2.22, 0.85, wz);
    group.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd02020 });
  for (const wz of [0.6, -0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.4), tailMat);
    t.position.set(-2.22, 0.85, wz);
    group.add(t);
  }
  if (opts.police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(-0.2, 1.9, -0.4);
    group.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(-0.2, 1.9, 0.4);
    group.add(bar2);
    group.userData.lightBars = [bar, bar2];
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe14d }));
    sign.position.set(-0.2, 1.95, 0);
    group.add(sign);
  }
  return { group, wheels };
}

export function createCar(scene, x, z, heading, color, opts = {}) {
  const { group, wheels } = makeCarMesh(color, opts);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  const car = {
    mesh: group, wheels,
    x, z, heading, speed: 0, slide: 0, steer: 0,
    radius: CAR.radius, color,
    isPlayer: !!opts.player, isPolice: !!opts.police,
    isTraffic: !!opts.traffic, isParked: !!opts.parked, isTaxi: !!opts.taxi,
    route: opts.route || null, cruise: opts.cruise || 11,
    airTime: 0, airborne: false, lastCrash: 0,
  };
  return car;
}

// --- player driving -------------------------------------------------------
export function updatePlayerCar(G, dt) {
  const car = G.player.car;
  if (!car) return;
  const input = G.input;
  const fwd = (input.keys.has('KeyW') || input.keys.has('ArrowUp')) ? 1 : 0;
  const rev = (input.keys.has('KeyS') || input.keys.has('ArrowDown')) ? 1 : 0;
  const left = (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) ? 1 : 0;
  const right = (input.keys.has('KeyD') || input.keys.has('ArrowRight')) ? 1 : 0;
  const brake = input.keys.has('Space') ? 1 : 0;

  if (fwd) car.speed += CAR.accel * dt;
  if (rev) car.speed -= (car.speed > 0.5 ? CAR.brake : CAR.reverseAccel) * dt;
  if (!fwd && !rev) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  car.speed -= car.speed * CAR.drag * dt;
  car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);

  const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
  const speedFactor = clamp(Math.abs(car.speed) / 10, 0, 1);
  const dirSign = car.speed >= 0 ? 1 : -1;
  car.heading += steerInput * CAR.steer * speedFactor * dirSign * dt;

  // Lateral slide: steering at speed builds slide; grip bleeds it off.
  // Handbrake cuts the grip, so the car keeps sliding (drift).
  const grip = brake ? CAR.driftGrip : CAR.grip;
  car.slide += steerInput * car.speed * 0.55 * dt * speedFactor;
  car.slide *= Math.exp(-grip * dt);
  car.slide = clamp(car.slide, -9, 9);

  const fx = Math.cos(car.heading), fz = -Math.sin(car.heading);
  const rx = -fz, rz = fx;
  car.x += (fx * car.speed + rx * car.slide) * dt;
  car.z += (fz * car.speed + rz * car.slide) * dt;

  // World bounds: soft wall at the city edge + sea.
  car.x = clamp(car.x, -168, 132);
  car.z = clamp(car.z, -132, 132);

  // Building collisions: push out and scrub speed.
  let hit = false;
  for (const b of G.colliders) {
    if (resolveCircleBox(car, b)) hit = true;
  }
  if (hit) {
    if (Math.abs(car.speed) > 8 && G.time - car.lastCrash > 0.6) {
      car.lastCrash = G.time;
      G.audio.crash();
      G.player.health = Math.max(0, G.player.health - 4);
      G.hud.flashDamage();
    }
    car.speed *= 0.55;
    car.slide *= 0.4;
  }

  // Ramps: launching off a ramp puts the car airborne for a stunt.
  for (const r of G.city.ramps) {
    if (dist(car.x, car.z, r.x, r.z) < 4 && Math.abs(car.speed) > 14) {
      car.airborne = true;
      car.airTime = 0;
    }
  }
  if (car.airborne) {
    car.airTime += dt;
    if (car.airTime > 0.12) {
      // Still "in the air" while the timer runs; landing happens below.
      if (car.airTime > 0.9) {
        car.airborne = false;
        if (car.airTime >= 0.55) G.missions.onStunt(car.airTime);
      }
    }
  }

  // Skid marks while drifting or handbraking at speed.
  const skidding = (brake && Math.abs(car.speed) > 8) || Math.abs(car.slide) > 4.5;
  if (skidding) {
    addSkidMark(G, car.x - fx * 1.5 + rx * 0.95, car.z - fz * 1.5 + rz * 0.95, car.heading);
    addSkidMark(G, car.x - fx * 1.5 - rx * 0.95, car.z - fz * 1.5 - rz * 0.95, car.heading);
    G.audio.setSkid(1);
  } else {
    G.audio.setSkid(0);
  }

  // Sync the mesh: the body points along +x locally, so rotation.y = heading
  // maps local +x onto the physics forward vector (cos h, -sin h).
  car.mesh.position.set(car.x, car.airborne ? Math.sin(Math.min(car.airTime, 0.9) / 0.9 * Math.PI) * 1.6 : 0, car.z);
  car.mesh.rotation.y = car.heading;
  car.mesh.rotation.z = clamp(-car.slide * 0.03, -0.12, 0.12);

  G.audio.setEngine(Math.abs(car.speed) / CAR.maxSpeed, true);
}

// --- traffic AI -----------------------------------------------------------
export function updateTraffic(G, dt) {
  for (const car of G.cars) {
    if (!car.isTraffic) continue;
    // Drive along the current road line; at intersections, sometimes turn.
    const r = car.route;
    const speedTarget = car.cruise;
    // Slow down for a car ahead on the same road.
    let ahead = false;
    for (const other of G.cars) {
      if (other === car) continue;
      const d = dist(car.x, car.z, other.x, other.z);
      if (d < 9) {
        const fx = Math.cos(car.heading), fz = -Math.sin(car.heading);
        const dot = (other.x - car.x) * fx + (other.z - car.z) * fz;
        if (dot > 0 && d < 9) { ahead = true; break; }
      }
    }
    const target = ahead ? 0 : speedTarget;
    car.speed += clamp(target - car.speed, -14 * dt, 8 * dt);
    // Steer toward the road centre line.
    const linePos = r.axis === 'x' ? car.z : car.x;
    const wantHeading = r.axis === 'x'
      ? (r.dir > 0 ? 0 : Math.PI)
      : (r.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    const lineErr = linePos - r.line;
    const headingErr = angleDiff(car.heading, wantHeading) - lineErr * 0.02 * (r.dir > 0 ? 1 : -1);
    car.heading += clamp(headingErr, -1.4 * dt, 1.4 * dt);
    car.x += Math.cos(car.heading) * car.speed * dt;
    car.z += -Math.sin(car.heading) * car.speed * dt;
    // At an intersection, maybe turn onto the crossing road.
    const along = r.axis === 'x' ? car.x : car.z;
    const nearLine = ROAD_LINES.find((l) => Math.abs(along - l) < 1.2);
    if (nearLine !== undefined && Math.random() < 0.006) {
      const cross = pick(G.rng, ROAD_LINES);
      if (cross !== r.line) {
        r.axis = r.axis === 'x' ? 'z' : 'x';
        r.line = cross;
        r.dir = Math.random() < 0.5 ? 1 : -1;
      }
    }
    // Wrap around the city edge instead of driving into the sea.
    if (car.x < -125 || car.x > 128 || car.z < -128 || car.z > 128) {
      r.dir *= -1;
      car.heading += Math.PI;
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
  }
}

// --- police ----------------------------------------------------------------
export function spawnPoliceCar(G) {
  const rng = G.rng;
  const angle = rng() * Math.PI * 2;
  const px = G.player.inCar ? G.player.car.x : G.player.x;
  const pz = G.player.inCar ? G.player.car.z : G.player.z;
  const x = clamp(px + Math.cos(angle) * 45, -120, 125);
  const z = clamp(pz + Math.sin(angle) * 45, -125, 125);
  const car = createCar(G.scene, x, z, 0, PALETTE.police, { police: true, cruise: 16 });
  car.speed = 8;
  G.cars.push(car);
  return car;
}

export function updatePolice(G, dt) {
  const px = G.player.inCar && G.player.car ? G.player.car.x : G.player.x;
  const pz = G.player.inCar && G.player.car ? G.player.car.z : G.player.z;
  const flash = Math.floor(G.time * 4) % 2 === 0;
  for (const car of G.cars) {
    if (!car.isPolice) continue;
    const d = dist(car.x, car.z, px, pz);
    const want = Math.atan2(-(pz - car.z), px - car.x);
    car.heading += clamp(angleDiff(car.heading, want), -2.2 * dt, 2.2 * dt);
    const target = d > 6 ? 30 : 18;
    car.speed += clamp(target - car.speed, -20 * dt, 14 * dt);
    car.x += Math.cos(car.heading) * car.speed * dt;
    car.z += -Math.sin(car.heading) * car.speed * dt;
    let hit = false;
    for (const b of G.colliders) if (resolveCircleBox(car, b)) hit = true;
    if (hit) car.speed *= 0.6;
    // Ram the player's car: shove it and slow it.
    if (d < 4.2) {
      if (G.player.inCar && G.player.car) {
        G.player.car.speed *= 0.985;
        G.player.car.slide += (Math.random() - 0.5) * 2;
        if (G.time - car.lastCrash > 1.2) {
          car.lastCrash = G.time;
          G.audio.crash();
          G.hud.flashDamage();
        }
      } else if (d < 2.2) {
        G.player.health = Math.max(0, G.player.health - 12 * dt);
        G.hud.flashDamage();
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const bars = car.mesh.userData.lightBars;
    if (bars) {
      bars[0].material.color.setHex(flash ? 0x2244ff : 0x881111);
      bars[1].material.color.setHex(flash ? 0x881111 : 0xff2222);
    }
    const spin = car.speed * dt * 2.4;
    for (const w of car.wheels) w.rotation.y += spin;
  }
}

// --- skid marks ---------------------------------------------------------------
// A skid mark is a flat plane; its long axis must lie along the car's
// heading. After rotation.x = -PI/2 lays the plane flat, rotation.z =
// heading - PI/2 turns the long axis onto the forward vector.
export function addSkidMark(G, x, z, heading) {
  if (!G.skids) G.skids = [];
  if (G.skids.length >= SKID_MAX) {
    const old = G.skids.shift();
    G.scene.remove(old.mesh);
    old.mesh.material.dispose();
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 1.4),
    new THREE.MeshBasicMaterial({ color: 0x141416, transparent: true, opacity: 0.55 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = heading - Math.PI / 2;
  mesh.position.set(x, 0.06, z);
  G.scene.add(mesh);
  G.skids.push({ mesh, age: 0 });
}

export function updateSkids(G, dt) {
  if (!G.skids) return;
  for (let i = G.skids.length - 1; i >= 0; i -= 1) {
    const s = G.skids[i];
    s.age += dt;
    if (s.age > 14) {
      s.mesh.material.opacity = Math.max(0, 0.55 - (s.age - 14) * 0.3);
      if (s.age > 16) {
        G.scene.remove(s.mesh);
        s.mesh.material.dispose();
        G.skids.splice(i, 1);
      }
    }
  }
}

// Spawn the ambient traffic + parked cars for a fresh world.
export function populateTraffic(G, count) {
  const rng = G.rng;
  for (let i = 0; i < count; i += 1) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROAD_LINES);
    const along = randRange(rng, -110, 110);
    const x = axis === 'x' ? along : line + (rng() < 0.5 ? 2.4 : -2.4);
    const z = axis === 'x' ? line + (rng() < 0.5 ? 2.4 : -2.4) : along;
    const car = createCar(G.scene, x, z, 0, pick(rng, PALETTE.car), {
      traffic: true,
      route: { axis, line, dir: rng() < 0.5 ? 1 : -1 },
      cruise: randRange(rng, 9, 14),
    });
    car.heading = axis === 'x' ? (car.route.dir > 0 ? 0 : Math.PI) : (car.route.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    car.speed = car.cruise;
    G.cars.push(car);
  }
  // Parked cars along the roads.
  for (let i = 0; i < 16; i += 1) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROAD_LINES);
    const along = randRange(rng, -110, 110);
    const off = rng() < 0.5 ? 5.4 : -5.4;
    const x = axis === 'x' ? along : line + off;
    const z = axis === 'x' ? line + off : along;
    const car = createCar(G.scene, x, z, axis === 'x' ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? -Math.PI / 2 : Math.PI / 2), pick(rng, PALETTE.car), { parked: true });
    G.cars.push(car);
  }
}
