// Port Azura — shared configuration: world layout, colours, missions, dialogue.
// All numbers are in world units (1 unit = 1 metre). The city is a 5x5 block
// grid; roads run between the blocks, on the grid midpoints, so no building
// ever stands on a road. West (negative x) is the beach and the sea; east is
// the harbour.
export const WORLD = {
  block: 40,          // block size (building plots sit inside each block)
  road: 12,           // road width
  grid: 5,            // blocks per side
  roadStep: 52,       // distance between road centre lines (block + road)
  half: 130,          // half-extent of the drivable city
  beachX: -130,       // sand starts here
  seaX: -170,         // water starts here
  seaWidth: 90,
  groundY: 0,
};

// Road centre lines (both axes). Blocks are centred at -104,-52,0,52,104, so
// the roads run in the gaps between them, at -78,-26,26,78 — a clear 12-wide
// strip with no building on it, on either axis.
export const ROAD_LINES = [-78, -26, 26, 78];

export const PALETTE = {
  sky: 0x8ec9e8,
  fog: 0xa8c8dc,
  ground: 0x3d7a4a,
  sidewalk: 0x9a9a92,
  road: 0x2e2e33,
  roadLine: 0xd8d8c8,
  sand: 0xe0c98f,
  sea: 0x2a6fa8,
  building: [0xb08a5a, 0x8a9ab0, 0xa88a90, 0x7a8a6a, 0xc0a060, 0x9090a8, 0xa06048],
  glass: 0x6fb0d8,
  car: [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa84f, 0xe8e8e8, 0x222226, 0x7a4fc2, 0xd06a1e],
  police: 0x1e2a3a,
  taxi: 0xf2c200,
  ped: [0xd06a8a, 0x4f8a6a, 0x8a6ad0, 0xd0a04f, 0x5a7ad0, 0xc25a3a],
  coin: 0xffd23e,
  beacon: 0xffd23e,
  hospital: 0xf0f0ea,
};

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.6,
  health: 100,
  punchDamage: 25,
  punchRange: 2.2,
  pistolDamage: 34,
  pistolRange: 60,
  startMoney: 120,
  startAmmo: 48,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 42,        // ~150 km/h
  maxReverse: 12,
  steer: 1.9,          // rad/s at full lock, scaled by speed
  grip: 8.0,           // lateral grip; lower = more slide
  driftGrip: 2.2,      // grip while handbraking
  drag: 0.35,
  radius: 1.9,
};

// Named landmarks (x, z). city.js builds meshes at these spots and exports
// the same positions for missions, taxi and the minimap.
export const LANDMARKS = {
  garage: { x: -52, z: 52, label: 'Garage' },
  hideout: { x: 104, z: -104, label: 'Hideout' },
  harbour: { x: 118, z: -52, label: 'Harbour' },
  casino: { x: 52, z: -52, label: 'Casino' },
  bank: { x: 0, z: -52, label: 'Bank' },
  hospital: { x: -104, z: -52, label: 'Hospital' },
  plaza: { x: 0, z: 0, label: 'Plaza' },
  lookout: { x: -104, z: 104, label: 'Lookout' },
  boardwalk: { x: -138, z: 0, label: 'Boardwalk' },
  tower: { x: 52, z: 52, label: 'Azura Tower' },
};

// Stunt ramps: a ramp is a wedge the car can launch off. Each sits on a road
// (its x or z is a road line) and launches along that road.
export const RAMPS = [
  { x: 26, z: -78, rotY: Math.PI / 2 },
  { x: -26, z: 78, rotY: -Math.PI / 2 },
  { x: 78, z: 26, rotY: 0 },
];

// Story missions. Steps: goto (reach marker on foot or in car), enterCar,
// driveTo, wait (stand in marker N seconds), punch (punch the marked ped),
// survive (stay alive N seconds while wanted), collect (stand in marker).
// Landmarks sit at block centres, 26 m from the nearest road, so driveTo
// steps use radius 28: they complete when the player reaches the road
// beside the landmark's block. goto/wait steps are on foot, radius stays 5-6.
export const MISSIONS = [
  {
    id: 1, title: 'The Last Getaway', reward: 300,
    briefing: [
      'MARA: One last job. That is what I keep telling myself.',
      'DEX (garage): Car is ready, Mara. Take her to the hideout and lay low.',
    ],
    steps: [
      { type: 'goto', target: 'garage', text: 'Go to the garage', radius: 5 },
      { type: 'enterCar', text: 'Get in the car (E)', radius: 6 },
      { type: 'driveTo', target: 'hideout', text: 'Drive to the hideout', radius: 28 },
    ],
  },
  {
    id: 2, title: 'Harbor Pickup', reward: 450,
    briefing: [
      'DEX: A package is waiting at the harbour. No questions, no peeking.',
      'MARA: And if the harbour master asks?',
      'DEX: He will not. He owes me.',
    ],
    steps: [
      { type: 'driveTo', target: 'harbour', text: 'Drive to the harbour', radius: 28 },
      { type: 'wait', target: 'harbour', text: 'Pick up the package', radius: 5, time: 3 },
      { type: 'driveTo', target: 'casino', text: 'Deliver to the casino', radius: 28 },
    ],
  },
  {
    id: 3, title: 'Debt Collection', reward: 500,
    briefing: [
      'MARA: Rico has owed me since the dock job. Time to collect.',
      'DEX: He hangs around the bank plaza. Remind him — firmly.',
    ],
    steps: [
      { type: 'goto', target: 'bank', text: 'Find Rico at the bank plaza', radius: 6 },
      { type: 'punch', text: 'Teach Rico a lesson (F)', radius: 8 },
      { type: 'wait', target: 'bank', text: 'Collect the cash', radius: 5, time: 2 },
    ],
  },
  {
    id: 4, title: 'Hot Pursuit', reward: 700,
    briefing: [
      'MARA: The whole PD is on me. I need to lose them.',
      'DEX: Get to the lookout and stay out of sight. Do not stop.',
    ],
    steps: [
      { type: 'survive', text: 'Lose the police — stay alive', time: 45, wanted: 3 },
      { type: 'driveTo', target: 'lookout', text: 'Reach the lookout', radius: 28 },
    ],
  },
  {
    id: 5, title: 'The Final Job', reward: 1500,
    briefing: [
      'MARA: The bank vault. One clean run and I am done for good.',
      'DEX: Grab the cash, get to the hideout, and do not look back.',
    ],
    steps: [
      { type: 'driveTo', target: 'bank', text: 'Get to the bank', radius: 28 },
      { type: 'wait', target: 'bank', text: 'Grab the cash', radius: 5, time: 4 },
      { type: 'driveTo', target: 'hideout', text: 'Escape to the hideout', radius: 28, wanted: 4 },
    ],
  },
];

export const TAXI_DESTINATIONS = [
  { target: 'casino', fare: 120 },
  { target: 'harbour', fare: 140 },
  { target: 'hospital', fare: 90 },
  { target: 'lookout', fare: 110 },
  { target: 'boardwalk', fare: 100 },
  { target: 'tower', fare: 80 },
];

export const COIN_COUNT = 20;
export const COIN_REWARD = 50;
export const STUNT_REWARD = 150;
export const STUNT_AIR_MIN = 0.55; // seconds airborne to count as a stunt

export const WANTED = {
  max: 5,
  decaySeconds: 12,     // one star decays after this long without a crime
  policePerStar: 1,      // police cars per wanted star (capped)
  footCopsPerStar: 1,    // foot cops per wanted star from level 2
  bustSeconds: 1.5,      // cop contact time to get busted
};
