---
version: 1
slug: "src-ui-styles-css"
primary_target: "src/ui/styles.css"
related_targets: ["src/ui/Hud.ts","src/ui/Screens.ts"]
---

## Scope
Whole game UI overlay (HUD, hotbar, panels, gun bench, build mode, cover, pause, death, Codex, Ledger). Mode: Operate in play, Experience on the cover and death screens.

## Direction contract

THESIS: A Marvel Rivals-style comic UI in hazard colors: flat, slanted, layered slabs of solid color with ink outlines, readable mid-fight. It refuses the incumbent halftone-everywhere panel where dots sit behind text.

OWN-WORLD: Ink black (#0b0b0d) panels, hazard yellow, blood red and toxic green slabs offset behind each other like a second print plate, paper cream for reading surfaces. Barlow Condensed heavy italic for UI labels and numbers, Bangers only for comic sound effects, title and splashes. Halftone survives only as masked edge texture on full screens, never under text.

STORY: The player reads health, ammo and raid timer in one glance, opens a panel and scans it in seconds, and feels each raid alert as a comic page slamming across the screen.

FIRST VIEWPORT: Cover screen: a diagonal ink panel owns the left 45% with a yellow slash edge, giant AFTERMATH in Bangers, red LIVING HELL slab, stacked slanted menu bars with ENTER THE WASTELAND first; the 3D hut shows through on the right with a vertical outlined ISSUE watermark.

FORM: Brief-pinned. The user attached two Marvel Rivals references (battle pass, hero select) and confirmed the hazard palette on 2026-10-25; those references stand in for the seed roll (seed key: none, user-pinned). Code-led.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
