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
| WASD | Move (relative to the screen) |
| Mouse | Aim |
| Left mouse (hold) | Melee mutants, swing the held tool / fists, or use the held consumable |
| 1 – 6 | Select hotbar slot |
| I or Tab | Backpack (drag to move, Shift-click to swap rows, right-click to use) |
| Shift | Sprint (uses stamina) |
| Space | Dodge roll (uses stamina) |
| E | Interact / search containers / use the Crafting Table or Oven / open doors and storage boxes |
| B | Build mode: 1–7 pick a piece, left mouse places, R rotates, B or Esc exits |
| Hammer equipped | Left mouse repairs the piece under the cursor, R upgrades it, hold X to demolish |
| Mouse wheel | Zoom |
| Esc | Pause |
| F1 or ` | Debug panel |
| H | Hide the controls card |

Every run gets a random world. Add `?seed=1234` to the URL to replay a specific one
(the seed is shown on the pause and death screens).

## Code layout

- `src/core` — game loop (fixed timestep), input, event bus, math, seeded RNG, noise.
- `src/data` — tunables (`config.ts`), items and tools, resource nodes, containers and loot
  tables, enemies (`enemies.ts`), crafting and oven recipes (`recipes.ts` — add a recipe there
  and it shows up in the UI).
- `src/render` — renderer, environment (fog, lights, ash, toxic fog shift), camera rig,
  wall/roof fading, a fixed pool of 8 real lights shared by all lamps, hit debris.
- `src/models` — all 3D models, built from code. Everything goes through `ModelRegistry`
  by id, so a model can later be swapped for a `.glb` file without touching gameplay.
  `merge.ts` collapses each placed model into a few draw calls.
- `src/entities` — the player controller and its procedural animation, plus pooled mutants
  (`Enemy.ts`).
- `src/gameplay` — inventory, gathering (swings, yields, searching, consumables, melee),
  survival (hunger, gas, regen), the crafting queue, the Oven, and base building
  (`Building.ts`: placement rules, support and collapse, tiers, hammer actions;
  `BuildMode.ts`: ghost preview and grid). Pieces, tiers, costs and HP live in
  `src/data/buildables.ts`. Raids live in `Raid.ts` (timer, Home Zone penalty, Wave Director)
  and `Horde.ts`; pathfinding to the hut is `FlowField.ts`.
- `src/physics` — ground-plane collision on a spatial hash (circles + boxes).
- `src/world` — biomes, terrain, deterministic chunk generation and streaming, gas clouds,
  the starter area around the hut, the Home Zone ring, interactables.
- `src/ui` — HUD, hotbar, backpack, minimap, floating comic text, item icons rendered
  from the 3D models, start/pause/death screens, debug panel, and the stylesheet.
- `src/game/Game.ts` — wires everything together.

`archive/earlier-attempt/` holds unused files from an earlier build attempt (raid timer,
survival stats, gas zones). They are not compiled; mine them for later phases or delete.
