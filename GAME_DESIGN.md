# AFTERMATH: LIVING HELL — Game Design Document

## Elevator pitch
A single-player, PC, 3D wave-defense survival game seen from an angled 3/4 top-down camera.
You are a lone survivor in a hazmat suit and gas mask after a catastrophic chemical lab
malfunction released a gas that mutated humanity into a wide range of horrifying creatures.
Scavenge the poisoned world, build and fortify a base, craft deeply customizable guns, and
survive escalating raids for as long as possible. Permadeath — every run is a new
procedurally generated world, and your goal is a higher score than last time.

## Tech (everything is code — built, run and tested entirely by Cursor)
- Stack: TypeScript + Three.js + Vite. Runs in the desktop browser with `npm run dev`.
  Later packaged as a desktop app with Tauri or Electron.
- Platform: PC, mouse + keyboard.
- No external editors or engines. Every model, level, effect, UI and sound is created in code.
- Models: mid-poly meshes generated procedurally in code from primitives and custom
  geometry (flat/smooth shading, vertex colors). All models go through a central
  ModelRegistry so any model can later be swapped for a .glb file (Blender/CC0 packs like
  Kenney, Quaternius, Poly Pizza) without changing gameplay code.
- Physics/collision: lightweight custom collision (circles/AABBs on the ground plane) or
  Rapier (@dimforge/rapier3d-compat) if needed.
- Pathfinding: grid-based flow field toward the hut (scales to hordes), with structures
  as weighted/breakable obstacles.
- UI: HTML/CSS overlay on top of the Three.js canvas (no UI framework, or lightweight
  Preact if helpful).
- Audio: Web Audio API. Placeholder SFX generated procedurally in code (sfxr-style);
  real sound files can replace them later via an AudioRegistry.
- Saving: localStorage/IndexedDB for high scores, run history and codex.
- Data-driven content: gun parts, enemies, recipes, buildables, loot tables defined in
  typed TypeScript data files so content can be added without touching systems.
- Architecture: fixed-timestep game loop, entity + systems structure, small focused
  modules, event bus over hard references. Object pooling and InstancedMesh for enemies,
  projectiles and resources so hordes stay at 60fps.
- Debug: in-game debug panel (toggle with F1) to skip raid timer, spawn enemies,
  give items, show pathfinding grid, show FPS.
- Cursor should run the game in the browser and verify each feature works before
  calling it done.

## Camera & controls
- Angled 3/4 top-down (Diablo/Hades style), fixed angle, smooth follow, scroll-wheel zoom
  within limits.
- WASD move, mouse aim (character faces cursor), LMB fire/use, RMB aim/alt,
  R reload, E interact, I/Tab inventory, B build mode, 1–6 hotbar (wheel stays zoom), Shift sprint,
  Space dodge-roll, Esc pause.
- Walls/roofs between camera and player fade out (occlusion transparency).

## Core loop
1. Start of run: spawn in a small abandoned hut containing a Crafting Table and an Oven.
2. Explore outward to gather resources with crafted tools.
3. Return, craft, build and fortify.
4. Survive the raid when the timer hits zero.
5. Repeat — raids escalate until you die. Death ends the run.

## Raid timer & home zone (critical rule)
- After each raid ends, the next raid timer is set to a RANDOM duration between 1:30 and 5:00.
  The timer is always visible on the HUD.
- The hut defines a circular HOME ZONE (default radius 30m, shown as a faint hazard ring on
  the ground and on the minimap).
- When the timer hits zero:
  - If the player is inside the Home Zone → raid starts normally.
  - If the player is outside → they LOSE EVERYTHING IN THEIR INVENTORY (equipped gear
    included, except the hazmat suit) and are teleported to the hut. The raid then starts.
- Leaving the Home Zone during a raid triggers the same penalty and teleport.
- A raid ends when all enemies in the wave are dead. Then the timer restarts.
- Warnings: comic-style alert at 60s, 30s and 10s remaining, plus a siren sound and
  a screen-edge pulse when the player is outside the zone.

## Survival stats
- Health, Hunger (restored by cooking food in the Oven), Stamina (sprint/dodge),
  Filter (gas mask filter — drains in toxic gas zones out in the world; craft new filters).
- Starving or running out of filter drains health.

## World
- Procedurally generated per run (seeded, seed shown on death screen).
  A ruined industrial/suburban city-edge: roads, collapsed houses, labs, factories,
  forests of dead trees, toxic gas pockets, chemical spill zones.
- World is chunked; only nearby chunks are active for performance.
- Higher-value resources are found deeper in more toxic areas (risk vs. reward vs. the
  raid timer).
- Resource nodes: scrap metal, wood, stone, chemicals, cloth, electronics, gunpowder
  components, food (canned goods, mutated animals).
- Gun parts are found as loot (containers, enemy drops, lab ruins), with rarity tiers:
  Rusted, Standard, Military, Prototype, Lab-Grade.

## Tools
- Craftable tools with tiers: Hatchet, Pickaxe, Crowbar (opens containers), Hammer
  (building/repair/upgrade), Gas Detector, Flashlight.

## Base building (Rust-like, free placement)
- Build mode (B): ghost preview, green/red validity, snapping grid for structural pieces,
  free placement for deployables, R to rotate.
- Build anywhere, but raids always target the Home Zone around the hut.
- Structural: foundations, walls, doorways, doors, windows, half-walls, stairs, ramps,
  floors/ceilings, roofs, wall frames, gates.
- Material tiers per piece: Wood → Scrap Metal → Armored. Upgrade with the Hammer.
- Every piece has HP; enemies damage it; repair with the Hammer + resources.
- Structural support: unsupported pieces collapse.
- Defenses: spike strips, barbed wire, landmines, tripwire explosives, sticky gas traps,
  flamethrower vents, auto-turrets (use crafted guns!), shotgun traps, floodlights,
  alarm bells, sandbags.
- Utility: storage crates, workbench tiers (unlock better recipes), oven, water purifier,
  generator + wiring for powered defenses, research table.

## GUN CRAFTING (signature system)
Guns are assembled on a grid at the Gun Bench.
- The gun is built on a 2D side-view grid (e.g. 12 x 6 cells) starting from a RECEIVER
  (the core). Every part must connect to the receiver through other parts.
- Part categories: Receiver, Barrel, Grip, Handle, Stock, Trigger, Magazine, Sight/Scope,
  Muzzle, Underbarrel, Ammo Converter (each with multiple types and rarities).
- Max 5 of each part category per gun.
- WHERE a part is placed changes the stats and behavior. Examples of placement rules:
  - Barrels chained end-to-end → more range, accuracy and velocity, slower handling.
  - Barrels stacked in parallel → multiple projectiles per shot (shotgun-like), more spread.
  - Grips near the front reduce recoil; grips at the rear improve handling/swap speed.
  - Triggers: 1 = semi-auto, 2 = burst, 3+ = full-auto (more triggers = faster fire rate).
  - Magazines: more = bigger capacity, slower reload; placement affects weight balance.
  - Stocks reduce recoil and sway; too many make the gun heavy (slows the player).
  - Sights placed on top of the receiver work; elsewhere they do nothing (feedback shown).
  - Center of mass: parts far from the grip increase sway and recoil.
- Stats: Damage, Fire Rate, Fire Mode, Projectiles, Spread, Recoil, Range, Velocity,
  Mag Size, Reload Time, Weight (affects move speed), Handling, Heat/Jam Chance.
- Drag-and-drop bench UI shows live stat bars with green/red deltas while dragging, and
  lists active synergies and warnings ("Sight not mounted: no effect").
- A live 3D preview of the gun rotates next to the grid. The in-game gun model is
  assembled from the actual part meshes in their grid positions, so every gun looks like
  how it was built.
- Save/name gun blueprints. Guns can be mounted in auto-turrets.
- All stat rules data-driven so new parts/rules can be added easily.

## Enemies (mutated humans)
Each has a distinct silhouette, sound and behavior. They follow the flow field toward the
hut, attack structures in the way and switch to the player when close.
- Shambler: slow basic melee, comes in crowds.
- Crawler: fast, low, slips through gaps.
- Bloater: explodes into a toxic gas cloud on death.
- Spitter: ranged acid that damages structures.
- Brute: huge, tanky, smashes walls.
- Screamer: buffs nearby enemies, calls more.
- Stalker: nearly invisible inside gas clouds.
- Climber: scales walls.
- Boss every 5th raid (e.g. "The Chemist", "Patient Zero"), each with unique mechanics.
- Wave Director scales count, mix, elite modifiers (armored, toxic, fast) and spawn
  directions with raid number.
- Enemies also roam the world at lower density outside raids.
- Procedural animation in code (bobbing, limb swing, lurching, hit flinch, death ragdoll-
  style collapse) since there are no animation files.

## Permadeath, score & meta progression
- Death ends the run immediately. No respawn.
- End-of-run comic "issue cover" screen: raids survived, kills by enemy type, structures
  built, guns crafted, best gun build, time survived, seed, final score.
- Score = raids survived (heavily weighted) + kills + boss kills + bonus multipliers.
- Persistent (saved between runs):
  - Local high score leaderboard and full run history.
  - Codex/Collection: every gun part, enemy, buildable and recipe the player has ever
    discovered across all runs (undiscovered = silhouette).
  - Lifetime stats.
- No power carries over between runs. The meta is knowledge and bragging rights.

## Art direction
- Smooth mid-poly 3D: clean faceted forms with smooth shading, flat colors and gradients,
  no realistic textures.
- Gloomy dystopia: desaturated grays, browns and sickly greens. Exponential fog, drifting
  toxic gas (particle sprites/shaders), overcast lighting, flickering lights, rain.
- Post-processing (Three.js EffectComposer): subtle bloom on toxic glows, vignette,
  color grading, film grain.
- Accent colors: toxic green glow, hazard yellow, warning red.
- Player: chunky yellow/orange hazmat suit with a gas mask, readable from the top-down
  camera.

## UI (dynamic comic style, inspired by Marvel Rivals)
- The loud, colorful comic UI intentionally contrasts with the gloomy world.
- Bold black ink outlines, halftone dot shading (CSS radial-gradient patterns),
  slanted/angled panels (CSS clip-path/skew), a punchy comic display font plus a clean
  readable body font (Bangers + Inter, bundled locally).
- Punchy motion: panels slam in at angles, scale-bounce, screen-shake on big moments.
- Onomatopoeia hit text ("BLAM!", "KRAK!", "SPLAT!") floating in world space on hits and
  kills, sized by damage.
- Raid alerts as comic splash panels ("RAID INCOMING!").
- HUD: health/hunger/stamina/filter as angled comic bars, ammo counter, raid timer in a
  jagged burst shape, Home Zone indicator, minimap.
- Menus: main menu as a comic cover, inventory/crafting as comic panels, death screen
  as an "issue cover".
- All styles come from one shared set of CSS variables/design tokens.

## Audio
- Ambient wind, distant screams, dripping, gas hiss; heavy industrial raid music.
- Placeholder SFX generated in code early; real CC0 sounds later via AudioRegistry.

## Out of scope for v1
Multiplayer, controller support, story campaign, mod support, online leaderboards.

## Build phases
1. Foundation: project, loop, input, camera, hazmat player (move/aim/sprint/dodge), starter hut, debug panel.
2. World + gathering: seeded chunked world, resource nodes, gas zones, inventory, hotbar, tools. **(done — build 0.2)**
3. Survival + crafting: health/hunger/stamina/filter, Oven, Crafting Table, data-driven recipes. **(done — build 0.3)**
4. Base building: build mode, snapping, material tiers, HP, repair/upgrade, structural support. **(done — build 0.4)**
   Shipped single-story on a 3 m grid (the hut is 6 × 6 m so it lines up): foundations, walls, doorways,
   window walls, half walls, doors and storage boxes. Stairs, ramps, floors/ceilings, roofs and gates are
   deferred; a fixed top-down camera hides anything above the player, so they need a design pass first.
5. Raids: raid timer, Home Zone rule + penalty, Wave Director, flow-field pathfinding, first enemies. **(done — build 0.5)**
   Timer rolls 1:30–5:00. Away at raid start (or leaving during a raid) wipes carried gear and
   teleports you to the hut; the wave still comes. Shamblers, crawlers, bloaters and brutes mix
   in; The Chemist shows up every 5th raid. Roamers wander outside the Home Zone between waves.
   Melee only until Phase 6. Stairs, roofs and gates stay deferred from Phase 4.
6. Gun crafting: grid Gun Bench, placement rules, live stats, 3D preview, assembled gun. **(done — build 0.6)**
   12×6 side-view bench in the hut. Parts must touch a receiver. Placement changes fire mode,
   projectiles, recoil and whether a sight works. Take the assembled gun, shoot, reload, jam.
   Rusted parts and scrap cartridges are craftable; better parts sit in lockers and on The Chemist.
7. Defenses: turrets, traps, power. **(done — build 0.7)**
   Build mode has Structure / Traps / Power tabs (Q). Sandbags, spikes, barbed wire,
   mines, tripwire, gas traps and shotgun traps; a wood-burning generator with a
   power radius; auto-turrets that mount a crafted gun; floodlights and flame vents.
   Alarm bells, workbench tiers, water purifiers and the research table stay deferred.
8. Permadeath + meta: death screen, score, saves, run history, Codex. **(done — build 0.8)**
   Death is an issue cover: score (raids weighted, kills, bosses, a streak multiplier
   at 5/10/15), kills by type, best gun, seed. localStorage keeps the high-score ledger,
   the last 40 runs and a Codex of every mutant, gun part, buildable and recipe ever
   seen. Nothing powerful carries over. Replay any run's seed from the ledger.
9. Comic UI pass. **(done — build 0.9)**
10. Polish: post-processing, gas/fog effects, rain, audio, remaining enemies and bosses. **(done — build 1.0)**
   Bloom, a sickly split-tone grade, vignette, grain, a toxic tint in gas and red edges when hurt.
   Seeded weather: clear spells, drizzle and storms with lightning and thunder; the ground darkens
   and gets a sheen when wet. Gas puffs (bloaters, traps, drums, the Chemist) are now visible, plus
   low ground mist. All audio is synthesized in `src/audio`: guns, hits, mutant voices, building,
   UI, raid sirens and horn, wind, rain, the respirator, and an industrial track during raids.
   M mutes; volume is on the pause screen. New mutants: Spitter (lobs acid, eats walls), Screamer
   (frenzies the horde, calls more), Stalker (fades out in gas and breathes its own; powered
   floodlights reveal it) and Climber (goes over walls). Boss raids alternate The Chemist and
   Patient Zero (ground slam, splits into crawlers, enrages low), and each boss comes back with
   +50% HP after both have appeared. Boss raids show a boss health bar.
   Fixed along the way: upright mutants' legs were below the ground, gas clouds never rendered,
   and enemy attacks landed on every tick of their swing instead of once.
   Elite modifiers (armored, toxic, fast) are still unscheduled.

## Post-v1 ideas
Not scheduled. Build the v1 phases so they don't block these.

### Endless runs (guiding goal)
A run should be playable forever in theory; only the escalating raids should end it. No story
campaign, because the game should not have an ending.
- Resources must come back. Today harvested nodes, looted containers and carcasses stay gone for
  the whole run, so a long run strips the map and starvation ends it, not the raids. Options:
  - Regrowth: nodes and carcasses respawn slowly, getting slower or farther from the hut as raids go up.
  - Restocks: supply drops, wandering scavenger caches, lab ruins that open up after a raid.
  - Spreading gas pushes the best loot deeper into dangerous ground over time.
  - Renewable sources: a buildable farm plot or mutant-meat trap.
- Uncapped difficulty: the Wave Director keeps scaling count, HP and elite modifiers with no ceiling.
  Bosses rotate and return stronger each cycle. Player gear plateaus at Lab-Grade while enemies
  keep growing, which is what eventually ends a run.
- Variety in long runs: new enemy combinations in later raids, and raid events such as gas storms,
  blood moons, night raids and attacks from every side at once.
- Save and quit mid-run: one save slot per run, deleted on death (still permadeath).
- Performance for big bases: batch building pieces once bases reach hundreds of pieces; keep
  large hordes on InstancedMesh.
- Milestones: raid milestones on the HUD, personal best shown during a run, Codex unlocks for long runs.

### Endless world
- Remove the world edge so chunks stream forever. Things tied to the fixed 384 m map today:
  the chunk bounds and edge gas in `World.ts`, the single ground mesh in `Terrain.ts`, the
  full-map minimap, and the threat value in `Biomes.ts`, which should keep rising with distance.
- More biomes as content updates, each with its own ground, props, resources, loot tables,
  enemies and possibly hazards (radiation, cold). Biomes get rarer and harder with distance,
  for example Deadwood near home, Toxic Marsh further out, a Crater Zone 1 km away.
- Far from the origin, shift the world back toward zero to avoid floating-point jitter, and save
  far-away chunk changes per chunk so saves stay small.

### Reaching far biomes (raid timer workarounds)
The timer caps trips at about 900 m out and back, which makes far biomes unreachable. Options:
- Outposts: build a second base far out; claiming it moves your Home Zone there.
- Base relocation: pack up the hut and move it (a big, risky decision).
- Vehicles: craft a bike or truck to travel faster.
- Expedition mode: choose to skip a raid in exchange for a penalty or a harder next raid.

### Other possible additions
- Online leaderboards (easiest): a hosted database or Steam leaderboards, basic sanity checks
  against fake scores, and a daily-seed challenge where everyone plays the same world.
- Controller support: gameplay maps onto the existing `Input` actions; menus (backpack drag-and-drop,
  Gun Bench grid, build placement) need a D-pad focus mode. Cheaper if planned before Phases 6 and 9.
- Mod support: load extra data packs (parts, recipes, buildables, loot) on top of the typed data files.
- Co-op multiplayer (hardest): 2–4 players with one host in charge of the world. Decide yes or no
  before Phase 5, since retrofitting raids and enemies later is expensive.
