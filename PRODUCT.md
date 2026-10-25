# Product

<!-- impeccable:product-schema 1 -->

Inferred from `GAME_DESIGN.md` and `README.md`; the user confirmed the UI scope and palette on 2026-10-25.

## Platform

web

## Users
A single player on a desktop PC with mouse and keyboard, mid-run in a permadeath wave-defense survival game. Most UI is read in glances while moving, aiming and fighting; menus are read between raids or after death.

## Product Purpose
Aftermath: Living Hell is a 3D wave-defense survival game seen from an angled 3/4 top-down camera. A survivor in a hazmat suit scavenges a gas-ravaged world, builds and fortifies a hut, assembles guns on a grid bench, and survives escalating raids until death. Success is a higher score than last run.

## Positioning
Every gun is assembled part by part on a grid, and where a part sits changes how it fires. The raid timer and Home Zone rule (caught outside at zero means losing everything) make every trip a risk calculation.

## Operating Context
- HTML/CSS overlay above a Three.js canvas; no UI framework.
- The world is gloomy (desaturated greys, browns, sickly greens, fog, rain). The UI intentionally contrasts with it.
- Surfaces: in-game HUD, hotbar, backpack, crafting, oven, storage, gun bench, build mode, hammer piece card, start cover, pause, death issue cover, Codex, Ledger, debug panel.

## Capabilities and Constraints
- Runs at 60fps with hordes on screen; UI updates every frame must stay cheap (transforms, no layout thrash).
- Fonts are bundled locally through `@fontsource`.
- Out of scope for v1: controller support, multiplayer, online leaderboards.

## Brand Commitments
- Dynamic comic-book UI inspired by Marvel Rivals: loud and colorful against the gloomy world.
- Palette stays hazard yellow, blood red and toxic green on ink black, with paper cream (user confirmed).
- Bangers remains the comic voice (title, onomatopoeia hit text, splash alerts).
- Comic onomatopoeia ("BLAM!", "KRAK!", "SPLAT!") floats in world space on hits.
- Death screen is an "issue cover"; runs are "issues".

## Evidence on Hand
Item, part, mutant and buildable icons are rendered from the game's own 3D models at runtime (`src/ui/IconRenderer.ts`). No external art assets exist.

## Product Principles
- Readable at a glance in the middle of a fight beats decoration.
- The UI is the loud part; the world is the gloomy part.
- Nothing carries over between runs except knowledge, so the Codex and Ledger are the long-term reward.
