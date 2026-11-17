// Story missions, taxi fares, stunt jumps and coin collection.
// The mission engine walks a mission's steps in order; each step type has
// one completion check. Dialogue shows in the HUD dialogue box.
import { MISSIONS, LANDMARKS, TAXI_DESTINATIONS, COIN_REWARD, STUNT_REWARD } from './config.js';
import { dist, clamp } from './util.js';
import { spawnPed } from './peds.js';

export function createMissions(G) {
  const M = {
    index: 0,            // current mission (0-based); 5 = all done
    step: 0,             // current step inside the mission
    stepTime: 0,         // seconds spent in the current step
    waitProgress: 0,
    active: false,       // a mission is currently being played
    done: false,         // all missions complete
    taxi: null,          // { dest, fare, ped } while a fare is running
    taxiCooldown: 0,
    stuntCooldown: 0,
    coinsGot: 0,
    rico: null,          // the debt-collection target ped
  };
  G.missions = M;
  return M;
}

function landmarkPos(name) {
  const L = LANDMARKS[name];
  return L ? { x: L.x, z: L.z, label: L.label } : { x: 0, z: 0, label: name };
}

function currentMission(G) {
  return MISSIONS[G.missions.index] || null;
}

function currentStep(G) {
  const m = currentMission(G);
  return m ? m.steps[G.missions.step] : null;
}

// Where the current step wants the player to go (for the beacon + minimap).
export function stepTarget(G) {
  const step = currentStep(G);
  if (!step) return null;
  if (step.target) return landmarkPos(step.target);
  return null;
}

export function startMission(G) {
  const M = G.missions;
  const m = currentMission(G);
  if (!m || M.active || M.done) return false;
  M.active = true;
  M.step = 0;
  M.stepTime = 0;
  M.waitProgress = 0;
  G.hud.showDialogue(m.briefing);
  G.hud.setMissionTitle('Mission ' + m.id + ' — ' + m.title);
  // Mission 3 needs Rico the debtor standing at the bank plaza.
  if (m.id === 3) {
    const rico = spawnPed(G, LANDMARKS.bank.x + 4, LANDMARKS.bank.z + 4, false);
    rico.missionTarget = true;
    M.rico = rico;
  }
  // Missions that start hot set the wanted level up front.
  const step = currentStep(G);
  if (step && step.wanted) G.setWanted(step.wanted, 'mission heat');
  updateBeacon(G);
  return true;
}

export function updateBeacon(G) {
  const t = stepTarget(G);
  const beacon = G.city.animated.beacon;
  if (!beacon) return;
  if (G.missions.active && t) {
    beacon.visible = true;
    beacon.position.set(t.x, 30, t.z);
  } else {
    beacon.visible = false;
  }
}

function completeStep(G) {
  const M = G.missions;
  const m = currentMission(G);
  M.step += 1;
  M.stepTime = 0;
  M.waitProgress = 0;
  G.audio.pickup();
  if (M.step >= m.steps.length) completeMission(G);
  else {
    const step = currentStep(G);
    if (step && step.wanted) G.setWanted(step.wanted, 'mission heat');
    updateBeacon(G);
  }
}

function completeMission(G) {
  const M = G.missions;
  const m = currentMission(G);
  G.player.money += m.reward;
  G.audio.missionDone();
  G.hud.showDialogue(['MISSION COMPLETE — ' + m.title, 'Reward: $' + m.reward + '. Mara pockets the cash.']);
  G.hud.setMissionTitle('All clear — press M for the next job');
  M.active = false;
  M.index += 1;
  if (M.index >= MISSIONS.length) {
    M.done = true;
    G.hud.setMissionTitle('All missions complete — Port Azura is yours');
    G.hud.showDialogue(['MARA: That was the last job. Port Azura is mine now.']);
  }
  if (M.rico) {
    const i = G.peds.indexOf(M.rico);
    if (i >= 0) { G.scene.remove(M.rico.mesh); G.peds.splice(i, 1); }
    M.rico = null;
  }
  updateBeacon(G);
  G.saveGame();
}

// Called by player.js when a mission-target ped is punched or shot.
export function onPunchTarget(G, ped) {
  const M = G.missions;
  if (!M.active) return;
  const step = currentStep(G);
  if (step && step.type === 'punch' && ped.missionTarget) {
    completeStep(G);
  }
}

// Called by vehicles.js when the player lands a long jump.
export function onStunt(G, airTime) {
  const M = G.missions;
  if (M.stuntCooldown > 0 || !G.player.inCar) return;
  M.stuntCooldown = 4;
  G.player.money += STUNT_REWARD;
  G.hud.flashHint('STUNT! +$' + STUNT_REWARD + ' (' + airTime.toFixed(1) + 's air)');
  G.audio.coin();
}

export function updateMissions(G, dt) {
  const M = G.missions;
  M.taxiCooldown = Math.max(0, M.taxiCooldown - dt);
  M.stuntCooldown = Math.max(0, M.stuntCooldown - dt);
  const p = G.player;
  const px = p.inCar && p.car ? p.car.x : p.x;
  const pz = p.inCar && p.car ? p.car.z : p.z;

  // Coins: collect on touch (on foot or in car).
  for (const coin of G.city.coins) {
    if (coin.taken) continue;
    if (dist(px, pz, coin.x, coin.z) < 2.4) {
      coin.taken = true;
      coin.mesh.visible = false;
      M.coinsGot += 1;
      p.money += COIN_REWARD;
      G.audio.coin();
      G.hud.flashHint('Azura coin +$' + COIN_REWARD + ' (' + M.coinsGot + '/20)');
    }
  }

  // Taxi fares: start at the plaza stand (E), drive the passenger over.
  if (!M.taxi && M.taxiCooldown <= 0 && !p.inCar) {
    if (dist(p.x, p.z, LANDMARKS.plaza.x, LANDMARKS.plaza.z) < 5 && G.input.pressed('KeyT')) {
      const dest = TAXI_DESTINATIONS[Math.floor(G.rng() * TAXI_DESTINATIONS.length)];
      M.taxi = { dest: dest.target, fare: dest.fare };
      G.hud.flashHint('Taxi fare: take the passenger to the ' + LANDMARKS[dest.target].label + ' ($' + dest.fare + ')');
    }
  }
  if (M.taxi) {
    const d = landmarkPos(M.taxi.dest);
    // Landmarks sit at block centres, 26 m from the nearest road, so the
    // fare completes when the cab reaches the road beside the destination.
    if (p.inCar && dist(px, pz, d.x, d.z) < 28) {
      p.money += M.taxi.fare;
      G.audio.missionDone();
      G.hud.flashHint('Fare complete +$' + M.taxi.fare);
      M.taxi = null;
      M.taxiCooldown = 8;
    } else if (!p.inCar) {
      M.taxi = null;
      M.taxiCooldown = 5;
      G.hud.flashHint('Passenger left — fare cancelled');
    }
  }

  if (!M.active || M.done) return;
  const step = currentStep(G);
  if (!step) return;
  M.stepTime += dt;
  const target = step.target ? landmarkPos(step.target) : null;
  const d = target ? dist(px, pz, target.x, target.z) : 999;

  switch (step.type) {
    case 'goto':
    case 'driveTo':
      if (d < (step.radius || 6)) completeStep(G);
      break;
    case 'enterCar':
      if (p.inCar) completeStep(G);
      break;
    case 'wait':
      if (d < (step.radius || 5)) {
        M.waitProgress += dt;
        if (M.waitProgress >= (step.time || 2)) completeStep(G);
      } else {
        M.waitProgress = 0;
      }
      break;
    case 'punch':
      // Completed by onPunchTarget; nothing to do per-frame.
      break;
    case 'survive':
      if (M.stepTime >= (step.time || 30)) completeStep(G);
      break;
    default:
      break;
  }
  // Keep the HUD objective line in sync with the current step.
  const m = currentMission(G);
  if (m && step) {
    const extra = step.type === 'wait' && M.waitProgress > 0
      ? ' (' + Math.ceil((step.time || 2) - M.waitProgress) + 's)'
      : step.type === 'survive'
        ? ' (' + Math.ceil((step.time || 30) - M.stepTime) + 's left)'
        : '';
    G.hud.setObjective(step.text + extra);
  }
}

// Taxi marker position for the minimap (null when no fare).
export function taxiTarget(G) {
  if (!G.missions.taxi) return null;
  return landmarkPos(G.missions.taxi.dest);
}

// Attach the mission helpers to G so other modules can call them.
export function bindMissions(G) {
  G.missions.onPunchTarget = (ped) => onPunchTarget(G, ped);
  G.missions.onStunt = (air) => onStunt(G, air);
  G.missions.start = () => startMission(G);
  G.missions.update = (dt) => updateMissions(G, dt);
  G.missions.stepTarget = () => stepTarget(G);
  G.missions.taxiTarget = () => taxiTarget(G);
  G.missions.current = () => currentMission(G);
  G.missions.currentStep = () => currentStep(G);
}
