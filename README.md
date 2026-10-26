# Aftermath: Living Hell

Wave-defense survival game in a gas-ravaged wasteland. Built entirely in code with
TypeScript + Three.js + Vite. See `GAME_DESIGN.md` for the full design and build phases.

## Run it

```bash
npm install
npm run dev        # then open http://localhost:5173
```

`npm run build` type-checks and produces a production build in `dist/`.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move (screen-relative) |
| Mouse | Aim |
| Left mouse (hold) | Fire a gun, melee mutants, swing the held tool / fists, or use a consumable |
| Right mouse (hold) | Aim (tighter spread, slower move) |
| R | Reload / clear a jam (or upgrade a piece with the hammer) |
| 1 – 6 | Select hotbar slot |
| I or Tab | Backpack (drag to move, Shift-click to swap rows, right-click to use) |
| Shift | Sprint (uses stamina) |
| Space | Dodge roll (uses stamina) |
| E | Interact / search containers / use the Crafting Table, Oven or Gun Bench / open doors and storage boxes / climb a ladder |
| B | Build mode: Q switches Structure / Traps / Power / Utility, 1–7 pick a piece, left mouse places, R rotates, B or Esc exits |
| E on a turret / generator / trap | Load a crafted gun, ammo, wood or chemicals |
| Hammer equipped | Left mouse repairs the piece under the cursor, R upgrades it, hold X to demolish |
| Mouse wheel | Zoom camera |
| Esc | Pause (volume slider and mute are on the pause screen) |
| M | Full-screen map (drag to pan, wheel to zoom) |
| N | Mute / unmute |
| F1 or ` | Debug panel |
| H | Hide the controls card |

Every run gets a random world. Add `?seed=1234` to the URL to replay a specific one
(the seed is shown on the pause and death screens, and on every row of The Ledger).

Death ends the run. The issue cover shows your score. Open **The Ledger** for high
scores and past issues, and the **Codex** for every mutant, gun part, buildable and
recipe you have ever logged (silhouettes until you find them). Nothing carries over
except what you remember.

## Code layout

- `src/core` — game loop (fixed timestep), input, event bus, math, seeded RNG, noise.
- `src/data` — tunables (`config.ts`), items and tools, gun parts (`guns.ts`: sizes, stats and
  placement rules), resource nodes, containers and loot tables, enemies (`enemies.ts`),
  crafting and oven recipes (`recipes.ts` — add a recipe there and it shows up in the UI).
- `src/render` — renderer, environment (fog, lights, ash, toxic fog shift), camera rig,
  wall/roof fading, a fixed pool of 8 real lights shared by all lamps, hit debris.
  `PostFX.ts` is bloom plus the grade (split tone, vignette, grain, toxic and hurt tints),
  `Weather.ts` the seeded rain/storm cycle with GPU rain and lightning, `GasFx.ts` visible gas
  puffs and ground mist.
- `src/audio` — everything you hear, synthesized with Web Audio. `AudioEngine.ts` is the registry
  (`sfx('gun.shot', { x, z })`), positional panning and distance muffling, reverb, mute and volume.
  `sounds.ts` holds the recipes; swap any id for a sample later without touching gameplay.
  `Soundscape.ts` runs wind, rain, gas hiss, the respirator, footsteps, ambience, the pre-raid
  drone and the raid music, and maps game events to stingers.
- `src/models` — all 3D models, built from code. Everything goes through `ModelRegistry`
  by id, so a model can later be swapped for a `.glb` file without touching gameplay.
  `merge.ts` collapses each placed model into a few draw calls.
- `src/entities` — the player controller and its procedural animation, plus pooled mutants
  (`Enemy.ts`). Mutant stats and specials (spit, scream, cloak, climb, slam, brood) are data in
  `src/data/enemies.ts`; `Horde.ts` runs them and `MutantFx.ts` draws acid globs and shockwaves.
- `src/gameplay` — inventory, gathering (swings, yields, searching, consumables, melee),
  survival (hunger, gas, regen), the crafting queue, the Oven, and base building
  (`Building.ts`: placement rules, support and collapse, tiers, hammer actions;
  `BuildMode.ts`: ghost preview and grid). Defenses live in `Defenses.ts` (traps,
  generator power radius, auto-turrets that fire a mounted gun). Pieces, tiers,
  costs and HP live in `src/data/buildables.ts`. Raids live in `Raid.ts` (timer, Home Zone penalty, Wave Director)
  and `Horde.ts`; pathfinding to the hut is `FlowField.ts`. Guns live in `GunBuild` rules
  inside `data/guns.ts`, the bench UI in `ui/GunBench.ts`, and firing in `Shooting.ts`.
  `Meta.ts` is the localStorage ledger, run history, Codex and score (`data/score.ts`).
- `src/physics` — ground-plane collision on a spatial hash (circles + boxes).
- `src/world` — biomes, a 1 m `heightAt` field (`Height.ts`) with hills, terraces (with ramp gaps),
  cliffs, rivers, lakes, craters, footbridge causeways and a flattened home pad, plus a cached water
  surface per vertex (`waterDepth`, the shared `walk` modifier for slopes, roads and fords). Per-chunk
  ground and water sheets (`Terrain.ts`), traversal links and ladder fitting (`Traversal.ts`),
  deterministic chunk generation and streaming, gas clouds,
  the starter area around the hut, the Home Zone ring, interactables.
- `src/ui` — HUD, hotbar, backpack, minimap, floating comic text, item icons rendered
  from the 3D models, start/pause/death screens, Codex, Ledger, debug panel, and the stylesheet.
- `src/game/Game.ts` — wires everything together.

`archive/earlier-attempt/` holds unused files from an earlier build attempt (raid timer,
survival stats, gas zones). They are not compiled; mine them for later phases or delete.
