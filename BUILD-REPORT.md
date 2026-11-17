# Build report — Port Azura: One Last Job (gta6-01 rebuild)

## What was built

An original open-world crime game for the make.fun gta6-01 "Make GTA 6"
bounty ($1,666 total, 1st $500, top 100 paid). Mara Voss, ex-getaway
driver, is drawn back for one last job in the fictional coastal city of
Port Azura. Everything is original: the city, characters, vehicles,
story, art, sounds and music — nothing from Rockstar's Grand Theft Auto
or any other commercial game.

- **World:** 5×5 block city (beach, boardwalk, harbour, lookout, downtown
  tower). Streets run *between* the blocks, so every road is clear to
  drive. 23 buildings, 28 cars (12 traffic + 16 parked), 22 pedestrians,
  20 Azura coins, 3 stunt ramps.
- **Gameplay:** explore on foot and by car; steal/drive cars (E) with
  handbrake drifts and skid marks; traffic AI and wandering peds (they
  flee gunfire); wanted 0–5 stars with police cars (chase/ram) and foot
  cops (chase/punch, bust); combat — punch (F), pistol (G, click to
  shoot, mouse aim); 5 story missions with dialogue, beacon + minimap
  markers and cash rewards ($300/$450/$500/$700/$1500); side activities
  — taxi fares from the plaza (T, $80–140), stunt jumps (+$150),
  coins (+$50); HUD with live minimap, health, money, wanted stars,
  speedometer, objective tracker; start/pause/WASTED/BUSTED menus;
  save/load via localStorage; N mutes the sound.
- **Sound:** all synthesized live with the Web Audio API (engine hum,
  skid, siren, gunshots, crashes, pickups, an original 112 BPM music
  loop). No audio files.
- **Tech:** plain static files under `game/` (ES modules, no build step,
  no runtime network). Three.js 0.160.0 vendored as a single module
  build under `game/vendor/`. Deterministic screenshot states
  `?shot=start|drive|chase|mission` with `&seed=1`.

## Files

```
game/index.html            HUD DOM + CSS, loads ./src/main.js
game/src/config.js         world layout, palette, missions, landmarks
game/src/util.js           seeded RNG, math, circle/box collision
game/src/audio.js          WebAudio synth engine (incl. mute, N key)
game/src/city.js           city builder (roads, blocks, landmarks, coins)
game/src/vehicles.js       cars, traffic AI, police chase, skid marks
game/src/peds.js           pedestrians, foot cops, bust logic
game/src/player.js         Mara on foot, enter/exit car, punch/shoot
game/src/missions.js       5 missions, taxi fares, coins, stunts
game/src/hud.js            HUD readouts, minimap, menus, dialogue
game/src/save.js           localStorage save/load (validated)
game/src/shots.js          deterministic ?shot= staging
game/src/main.js           boot, game loop, camera, wanted, police mgmt
game/vendor/three.module.min.js   (downloaded from unpkg in-session)
shots.json                 4 shots, seed 1
.makefun/owner.json        payout wallet HbfEuuP4KjMr9bEsv5YhPpxeF7nULnFH442117iDrPeB
README.md                  description + how to run
main.ts / serve.ts / LICENSE   starter files, unchanged from the kit
```

Every counted file was written fresh in this session and revisited in
a later edit pass (≥2 writing messages each). No file was copied from
the v1 archive; v1 was used only as a design reference.

## Fixes made during the edit pass

- Mesh facing: car/ped/player rotation now `+heading` (was `-heading`),
  so models face their direction of travel; chase camera yaw corrected
  to `heading - PI/2`; skid marks aligned to travel (`heading - PI/2`);
  exit-car offset made truly perpendicular; wheel spin/steer code
  removed (invisible on plain cylinders, tilted the wheels).
- Favicon 404: added `<link rel="icon" href="data:,">` — 0 console
  errors afterwards.
- **Road layout (real gameplay bug):** roads used to run through the
  block centres, so buildings stood on the roads and a car driving
  straight would crash (HP 96, stopped, in the first drive shot).
  Roads now run *between* the blocks (`ROAD_LINES = [-78,-26,26,78]`),
  landmark blocks carry no random buildings, ramps sit on roads, and
  `driveTo` steps / taxi fares complete from the road beside a
  landmark's block (radius 28; landmarks sit 26 m from the nearest
  road). Verified: 10 s straight drive, HP stayed 100, 19 → 147 km/h.
- Minimap drew roads at the old hardcoded lines; now uses `ROAD_LINES`
  from config.
- Shot framing: drive/chase shots pick the westmost E–W parked car so
  the car stays inside the city; drive camera raised (10 m, 18 m back);
  chase shot re-flashes the correct 3★ hint; mission shot puts Mara on
  foot at the garage with the live step text ("Go to the garage") instead
  of a hardcoded objective.
- Save/load: loaded numbers validated finite; a loaded mission restarts
  from its first step, on foot, with no stale step/taxi state.
- Audio: mute flag was dead (never set) and the engine/siren ignored it.
  Added `AudioEngine.setMuted()` (N key) that ducks the continuous
  loops too.

## Verification (all inside this recorded session)

- `node --check` passes on all 12 game modules.
- `MAKEFUN_OUTPUT_DIR=/tmp/gta6-out node main.ts` → exit 0,
  `dossier.json` schema `makefun/dossier/v1`, cover 0, 4 images.
  Gate caps: game/ 16 files+dirs (≤993), 767,350 bytes (≤48 MiB);
  index.html 5,763 bytes (≤1 MiB); /output 23 entries (≤1,000),
  1,525,644 bytes (≤64 MiB); 4 screenshots, 64–74 KB each (≤256 KiB),
  first by name is the cover.
- Headless Playwright (Chromium + SwiftShader) play-test:
  all 4 `?shot=` states reach `window.__shotReady`; 0 console errors,
  0 failed requests, 0 external requests. Live play: start works,
  mission 1 starts ("The Last Getaway", "Go to the garage"), steal car
  (wanted 1), drive 4 s + drift (63–69 km/h, 8–10 skid marks), shoot
  (wanted 2, ammo 47), pause menu shows, save written and reloads
  (money + mission index survive, mission restarts at step 0).
  Mission 1 `driveTo` completes from the road beside the hideout
  (+$300); a taxi fare completes from the road beside the casino
  (+$120). Mute toggle (N) works.
- Screenshots in `screenshots/` are real renders of this game's code,
  visually checked: 1-start (title over the city), 2-drive (car at
  151 km/h on a road), 3-chase (3★, 3 police cars, ramp in frame),
  4-mission (Mara at the garage, beacon, briefing dialogue).

## Recording

- Recording id: `01a1ea57-eb6d-77e6-868e-1c157c86c584` (started ~23:33 WIB
  2026-11-17, running for the whole build; do not stop it).
- This rebuild re-authors v1 ('Port Azura: One Last Job') from scratch
  under the fresh recording, after a VM restart killed the v1 recorder
  mid-build. v1 archive (read-only design reference):
  `~/workspace/kerjaan/makefun/gta6-01-v1-defective/`.

## Submit-time notes (for the parent)

- Do NOT create the repo, push, submit, or run `makefun login` from
  this session — the parent does repo/push/submit after handover.
- Repo name must be `gta6-01`, owner `greydi92`.
- The record run needs `~/workspace/kerjaan/makefun/gta6-01-rebuild-prompt.txt`
  word-for-word via `--prompt-file` at submit time, plus `--mcp none`.
- Never edit any file in this work dir after handover — it breaks
  transcripts_witnessed.
- Competition: gta6-01 "Make GTA 6", entries close Tue 2026-11-24
  22:00 WIB, result due 2026-12-10. No entry fee. Payout wallet is in
  `.makefun/owner.json`; referral `qgn48q27`.
