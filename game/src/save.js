// Save / load via localStorage. One slot, keyed to the game. Saves money,
// health, ammo, mission progress, coins collected, player position and the
// wanted level. Loading restores the player state and re-opens the world.
const KEY = 'port-azura-save-v1';

export function saveGame(G) {
  try {
    const p = G.player;
    const data = {
      money: p.money,
      health: p.health,
      ammo: p.ammo,
      missionIndex: G.missions.index,
      coinsGot: G.missions.coinsGot,
      coinsTaken: G.city.coins.map((c) => (c.taken ? 1 : 0)),
      x: p.x,
      z: p.z,
      wanted: G.wanted,
      savedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame(G) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    // Guard against a corrupt save: only finite numbers are restored.
    const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
    const p = G.player;
    p.money = num(data.money, 120);
    p.health = num(data.health, 100);
    p.ammo = num(data.ammo, 48);
    p.x = num(data.x, -52);
    p.z = num(data.z, 46);
    p.mesh.position.set(p.x, 0, p.z);
    G.missions.index = num(data.missionIndex, 0);
    G.missions.coinsGot = num(data.coinsGot, 0);
    // A loaded mission restarts from its first step, on foot, with no
    // half-finished step state carried over.
    G.missions.active = false;
    G.missions.step = 0;
    G.missions.stepTime = 0;
    G.missions.waitProgress = 0;
    G.missions.taxi = null;
    if (p.inCar) p.inCar = false;
    if (p.car) p.car = null;
    if (Array.isArray(data.coinsTaken)) {
      G.city.coins.forEach((coin, i) => {
        if (data.coinsTaken[i]) {
          coin.taken = true;
          coin.mesh.visible = false;
        }
      });
    }
    if (typeof data.wanted === 'number') G.setWanted(num(data.wanted, 0), 'loaded save');
    return true;
  } catch (e) {
    return false;
  }
}

export function hasSave() {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch (e) {
    return false;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
}
