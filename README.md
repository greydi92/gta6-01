[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/greydi92/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/greydi92/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

# Port Azura — One Last Job

An original open-world crime game built for the [gta6-01 "Make GTA 6" bounty](https://make.fun/bounty/gta6-01) on make.fun. Mara Voss, ex-getaway driver, is drawn back for one last job in the fictional coastal city of Port Azura. Everything is original: the city, characters, vehicles, story, art, sounds and music — nothing from Rockstar's Grand Theft Auto or any other commercial game.

## What you can do

- **Explore Port Azura** on foot and by car — a 5×5 block city with a beach, boardwalk, harbour, lookout and a downtown tower. The streets run between the blocks, so every road is clear to drive.
- **Steal and drive cars** — park up, press E, and go. Handbrake drifts, skid marks, stunt ramps, engine and skid sounds.
- **Traffic and pedestrians** — cars cruise the road network, peds wander the sidewalks and beach, and they flee from gunfire.
- **Wanted level** — steal a car, hit a pedestrian or fire a shot and the Azura PD responds. Police cars chase and ram; cops on foot chase and punch. Lose the heat or get busted.
- **Five story missions** — The Last Getaway, Harbor Pickup, Debt Collection, Hot Pursuit, and The Final Job, with dialogue, objectives, markers and cash rewards.
- **Side activities** — taxi fares from the plaza stand (T), stunt jumps off the ramps, and 20 Azura coins hidden around the city.
- **Combat** — punch (F) and a pistol (G to draw, click to shoot) with mouse aim.
- **HUD** — live minimap, health, money, wanted stars, speedometer and a mission objective tracker.
- **Menus and saving** — start screen, pause menu, save/load via localStorage, WASTED / BUSTED endings with hospital respawn.
- **Sound** — all synthesized live with the Web Audio API: engine hum, tyre skid, gunshots, and an original music loop. No audio files.

## How to run

No build step, no network requests at runtime. Serve the `game/` folder with any static server and open it in a desktop browser:

```sh
node serve.ts
# open http://localhost:8080
```

Or with Python:

```sh
python3 -m http.server 8080 --directory game
```

Controls: **WASD** move / drive · **mouse drag** camera · **E** enter / exit car · **F** punch · **G** pistol, click to shoot · **Space** handbrake / drift · **Shift** run · **M** start mission · **T** taxi fare at the plaza · **Q** horn · **N** mute / unmute · **P / Esc** pause.

## How it is built

- Plain static files under `game/` — `index.html` plus ES modules in `game/src/`.
- Three.js 0.160.0 vendored as a single module build under `game/vendor/` (no runtime network).
- `main.ts` (Node 22, stdlib only) copies `game/` + `screenshots/` to `/output` and writes `/output/dossier.json`.
- Deterministic screenshot states: `?shot=start`, `?shot=drive`, `?shot=chase`, `?shot=mission` (with `&seed=1`).

## Screenshots

The cover and gameplay shots in `screenshots/` are real renders of this game, taken from the `?shot=` states above.

---

Built with [make.fun](https://make.fun) — build AI agents and programs, enter competitions, and get ranked in the open. Referral code: **qgn48q27**.
