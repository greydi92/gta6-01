// Port Azura — the city itself: ground, roads, buildings, beach, sea,
// boardwalk, harbour and landmarks. Everything is generated from a seeded
// RNG so the same seed always builds the same city. Returns the colliders,
// coin spots, ramps and landmark positions the other systems need.
import * as THREE from '../vendor/three.module.min.js';
import { WORLD, ROAD_LINES, PALETTE, LANDMARKS, RAMPS, COIN_COUNT } from './config.js';
import { mulberry32, randRange, pick } from './util.js';

// One shared window texture per tint: a canvas with a lit-window grid.
function windowTexture(base, lit) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  const rng = mulberry32(base.length * 7919 + lit.length);
  for (let y = 6; y < 122; y += 14) {
    for (let x = 6; x < 58; x += 12) {
      g.fillStyle = rng() < 0.45 ? '#ffe9a8' : '#2c3a4a';
      g.fillRect(x, y, 8, 9);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Asphalt with a dashed centre line, drawn once and reused for every road.
function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2e2e33';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = '#d8d8c8';
  for (let y = 0; y < 256; y += 32) g.fillRect(30, y, 4, 18);
  g.fillStyle = '#e8e8e8';
  g.fillRect(2, 0, 2, 256);
  g.fillRect(60, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const coins = [];
  const animated = { sea: null, coinMeshes: [], beacon: null };
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  const lambert = (color) => new THREE.MeshLambertMaterial({ color });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  // Ground: grass city slab, sand beach, sea.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.half * 2 + 60, WORLD.half * 2 + 60),
    lambert(PALETTE.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(-10, 0, 0);
  group.add(ground);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(44, WORLD.half * 2 + 60),
    lambert(PALETTE.sand));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(WORLD.beachX - 20, 0.02, 0);
  group.add(sand);

  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.seaWidth, WORLD.half * 2 + 120),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea, transparent: true, opacity: 0.92 }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(WORLD.seaX - WORLD.seaWidth / 2 - 2, 0.05, 0);
  group.add(sea);
  animated.sea = sea;

  // Roads: one plane per grid line, both directions, with dashed texture.
  const roadTex = roadTexture();
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
  for (const line of ROAD_LINES) {
    const span = WORLD.half * 2 + 8;
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(span, WORLD.road), roadMat.clone());
    rx.material.map = roadTex.clone();
    rx.material.map.repeat.set(span / 16, 1);
    rx.material.map.needsUpdate = true;
    rx.rotation.x = -Math.PI / 2;
    rx.rotation.z = Math.PI / 2;
    rx.position.set(0, 0.04, line);
    group.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(span, WORLD.road), roadMat.clone());
    rz.material.map = roadTex.clone();
    rz.material.map.repeat.set(span / 16, 1);
    rz.material.map.needsUpdate = true;
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(line, 0.04, 0);
    group.add(rz);
  }

  // Blocks: sidewalk slab + buildings. The plaza block (0,0) stays open.
  // Blocks that host a landmark (garage, bank, casino, hospital, hideout,
  // tower, lookout) get no random buildings — the landmark owns the block.
  const landmarkBlocks = new Set(
    [LANDMARKS.garage, LANDMARKS.hideout, LANDMARKS.casino, LANDMARKS.bank,
     LANDMARKS.hospital, LANDMARKS.tower, LANDMARKS.lookout]
      .map((L) => L.x + ',' + L.z));
  const winTexes = PALETTE.building.map((c) => windowTexture('#' + c.toString(16).padStart(6, '0'), 'lit'));
  let buildingCount = 0;
  for (let bx = 0; bx < WORLD.grid; bx += 1) {
    for (let bz = 0; bz < WORLD.grid; bz += 1) {
      const cx = -104 + bx * WORLD.roadStep;
      const cz = -104 + bz * WORLD.roadStep;
      if (cx === 0 && cz === 0) continue; // plaza
      // Sidewalk slab.
      box(WORLD.block + 4, 0.12, WORLD.block + 4, lambert(PALETTE.sidewalk), cx, 0.06, cz);
      if (landmarkBlocks.has(cx + ',' + cz)) continue; // landmark owns this block
      const n = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i += 1) {
        const w = randRange(rng, 12, 20);
        const d = randRange(rng, 12, 20);
        const h = randRange(rng, 7, 26);
        const ox = randRange(rng, -8, 8);
        const oz = randRange(rng, -8, 8);
        const ci = Math.floor(rng() * PALETTE.building.length);
        const mat = new THREE.MeshLambertMaterial({ map: winTexes[ci] });
        const b = box(w, h, d, mat, cx + ox, h / 2 + 0.1, cz + oz);
        b.userData.isBuilding = true;
        colliders.push({ minX: cx + ox - w / 2, maxX: cx + ox + w / 2, minZ: cz + oz - d / 2, maxZ: cz + oz + d / 2 });
        buildingCount += 1;
        // Flat roof cap.
        box(w + 0.6, 0.4, d + 0.6, lambert(0x3a3a3a), cx + ox, h + 0.3, cz + oz);
      }
    }
  }

  // Downtown tower at (52, 52): the tallest building in Port Azura.
  const towerMat = new THREE.MeshLambertMaterial({ map: winTexes[1] });
  const tower = box(18, 64, 18, towerMat, LANDMARKS.tower.x, 32, LANDMARKS.tower.z);
  tower.userData.isBuilding = true;
  box(20, 1, 20, lambert(0x223344), LANDMARKS.tower.x, 64.5, LANDMARKS.tower.z);
  const towerTip = new THREE.Mesh(new THREE.ConeGeometry(2, 6, 4), lambert(0xffd23e));
  towerTip.position.set(LANDMARKS.tower.x, 68, LANDMARKS.tower.z);
  group.add(towerTip);
  colliders.push({ minX: 43, maxX: 61, minZ: 43, maxZ: 61 });

  // Landmarks.
  const landmarkDefs = [
    { key: 'hospital', w: 22, h: 12, d: 16, color: PALETTE.hospital, cross: true },
    { key: 'bank', w: 20, h: 14, d: 16, color: 0xc8b890, cross: false },
    { key: 'casino', w: 24, h: 10, d: 18, color: 0x8a2a5a, cross: false },
    { key: 'garage', w: 20, h: 6, d: 14, color: 0x5a6a7a, cross: false },
    { key: 'hideout', w: 12, h: 6, d: 10, color: 0x7a5a3a, cross: false },
  ];
  for (const def of landmarkDefs) {
    const L = LANDMARKS[def.key];
    const m = box(def.w, def.h, def.d, lambert(def.color), L.x, def.h / 2 + 0.1, L.z);
    m.userData.isBuilding = true;
    colliders.push({ minX: L.x - def.w / 2, maxX: L.x + def.w / 2, minZ: L.z - def.d / 2, maxZ: L.z + def.d / 2 });
    if (def.cross) {
      box(6, 1.6, 0.6, lambert(0xd02020), L.x, def.h + 0.6, L.z + def.d / 2 + 0.2);
      box(1.6, 6, 0.6, lambert(0xd02020), L.x, def.h + 0.6, L.z + def.d / 2 + 0.2);
    }
    if (def.key === 'casino') {
      const sign = box(10, 2, 0.6, new THREE.MeshLambertMaterial({ color: 0xffd23e, emissive: 0xaa7700 }), L.x, def.h + 1, L.z + def.d / 2 + 0.3);
      sign.userData.isSign = true;
    }
  }

  // Boardwalk along the beach + palm trees.
  const walk = box(6, 0.3, WORLD.half * 2, lambert(0x8a6a3a), WORLD.beachX + 2, 0.15, 0);
  walk.userData.isBoardwalk = true;
  const palmTrunk = lambert(0x7a5a30);
  const palmTop = lambert(0x2a8a3a);
  for (let i = 0; i < 12; i += 1) {
    const z = -120 + i * 22 + randRange(rng, -4, 4);
    const x = WORLD.beachX + randRange(rng, -6, 8);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 7, 6), palmTrunk);
    trunk.position.set(x, 3.5, z);
    group.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 7), palmTop);
    top.position.set(x, 8.2, z);
    group.add(top);
  }

  // Harbour (east edge): pier, containers, boats.
  box(10, 1, 60, lambert(0x6a5a42), 128, 0.5, -52);
  for (let i = 0; i < 6; i += 1) {
    const c = pick(rng, [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa84f]);
    box(5, 2.4, 2.4, lambert(c), 118 + randRange(rng, -2, 2), 1.3, -80 + i * 10);
  }
  for (let i = 0; i < 3; i += 1) {
    const boat = box(8, 1.6, 3, lambert(0xe8e8e8), 138 + i * 6, 0.8, -30 + i * 14);
    boat.userData.isBoat = true;
  }

  // Lookout hill (south-west corner): a grass mound with a flag.
  const hill = new THREE.Mesh(new THREE.ConeGeometry(16, 7, 8), lambert(0x4a7a3a));
  hill.position.set(LANDMARKS.lookout.x, 3.4, LANDMARKS.lookout.z);
  group.add(hill);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), lambert(0xd8d8d8));
  pole.position.set(LANDMARKS.lookout.x, 9.5, LANDMARKS.lookout.z);
  group.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), new THREE.MeshLambertMaterial({ color: 0xffd23e, side: THREE.DoubleSide }));
  flag.position.set(LANDMARKS.lookout.x + 1.6, 11.4, LANDMARKS.lookout.z);
  group.add(flag);

  // Stunt ramps (wedges the car can launch off).
  const rampMeshes = [];
  for (const r of RAMPS) {
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 8), lambert(0xd06a1e));
    ramp.position.set(r.x, 0.9, r.z);
    ramp.rotation.y = r.rotY;
    ramp.rotation.x = -0.42;
    group.add(ramp);
    rampMeshes.push({ mesh: ramp, x: r.x, z: r.z, rotY: r.rotY });
  }

  // Azura coins: 20 gold spinners on sidewalks, plaza and beach.
  const coinGeo = new THREE.CylinderGeometry(0.9, 0.9, 0.18, 12);
  const coinMat = new THREE.MeshLambertMaterial({ color: PALETTE.coin, emissive: 0x8a6a00 });
  const coinSpots = [];
  let guard = 0;
  while (coinSpots.length < COIN_COUNT && guard < 400) {
    guard += 1;
    const x = randRange(rng, -118, 118);
    const z = randRange(rng, -118, 118);
    // Keep coins off roads and out of buildings.
    const onRoad = ROAD_LINES.some((l) => Math.abs(x - l) < 8 || Math.abs(z - l) < 8);
    const inBuilding = colliders.some((b) => x > b.minX - 1 && x < b.maxX + 1 && z > b.minZ - 1 && z < b.maxZ + 1);
    if (onRoad || inBuilding) continue;
    coinSpots.push({ x, z });
  }
  for (const spot of coinSpots) {
    const mesh = new THREE.Mesh(coinGeo, coinMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(spot.x, 1.1, spot.z);
    group.add(mesh);
    animated.coinMeshes.push(mesh);
    coins.push({ mesh, x: spot.x, z: spot.z, taken: false });
  }

  // Mission beacon: a tall glowing pillar marking the current objective.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 60, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: PALETTE.beacon, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
  beacon.position.set(0, 30, 0);
  beacon.visible = false;
  group.add(beacon);
  animated.beacon = beacon;

  // Street props: a few lamp posts along the plaza.
  const lampMat = lambert(0x333338);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 16, z = Math.sin(a) * 16;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), lampMat);
    pole.position.set(x, 2.5, z);
    group.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    bulb.position.set(x, 5.1, z);
    group.add(bulb);
  }

  function update(dt, time) {
    // Gentle sea shimmer and spinning coins.
    if (animated.sea) animated.sea.position.y = 0.05 + Math.sin(time * 0.7) * 0.05;
    for (const m of animated.coinMeshes) {
      if (m.visible) m.rotation.z += dt * 2.4;
    }
  }

  return {
    group, colliders, coins, ramps: rampMeshes, animated,
    buildingCount, update, roadLines: ROAD_LINES,
  };
}
