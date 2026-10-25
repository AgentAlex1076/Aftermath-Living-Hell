---
name: "Aftermath: Living Hell"
description: "A loud, slanted comic-book overlay in hazard inks, printed over a gloomy 3D survival world."
colors:
  ink: "#0b0b0d"
  ink-2: "#141619"
  ink-3: "#1d2024"
  ink-4: "#2b2f35"
  ink-5: "#3b4048"
  well: "#343a42"
  paper: "#f1e7cf"
  paper-dim: "#b8ae98"
  hazard: "#f2b705"
  hazard-hot: "#ffd23a"
  blood: "#e0302a"
  blood-deep: "#8a1410"
  blood-text: "#ff8a7a"
  toxic: "#8cff3a"
  toxic-deep: "#3d6a22"
  ember: "#ff8a3a"
typography:
  display:
    fontFamily: "Bangers, Impact, 'Arial Black', sans-serif"
    fontSize: "clamp(68px, 8.2vw, 148px)"
    fontWeight: 400
    lineHeight: 0.82
    letterSpacing: "3px"
  splash:
    fontFamily: "Bangers, Impact, 'Arial Black', sans-serif"
    fontSize: "clamp(64px, 9vw, 120px)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "3px"
  headline:
    fontFamily: "Bangers, Impact, 'Arial Black', sans-serif"
    fontSize: "32px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "1.5px"
  sfx:
    fontFamily: "Bangers, Impact, 'Arial Black', sans-serif"
    fontSize: "36px"
    fontWeight: 400
    letterSpacing: "1.5px"
  numeral:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontSize: "64px"
    fontWeight: 800
    lineHeight: 0.78
    letterSpacing: "-0.02em"
  button:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontSize: "26px"
    fontWeight: 800
    letterSpacing: "0.04em"
  title:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.02em"
  label:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontSize: "15px"
    fontWeight: 800
    letterSpacing: "0.08em"
  caption:
    fontFamily: "'Barlow Condensed', 'Arial Narrow', sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.1em"
  body:
    fontFamily: "Barlow, system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.55
  body-small:
    fontFamily: "Barlow, system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  none: "0px"
  key: "5px"
  round: "50%"
spacing:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  xxl: "24px"
  edge: "32px"
components:
  button-primary:
    backgroundColor: "{colors.hazard}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "12px 30px 10px 26px"
  button-primary-hover:
    backgroundColor: "{colors.hazard-hot}"
    textColor: "{colors.ink}"
  button-secondary:
    backgroundColor: "{colors.ink-4}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "9px 24px 8px 24px"
  button-secondary-hover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  button-danger-hover:
    backgroundColor: "{colors.blood}"
    textColor: "{colors.paper}"
  button-row:
    backgroundColor: "{colors.hazard}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "5px 12px 4px"
  button-row-ghost:
    backgroundColor: "{colors.ink-4}"
    textColor: "{colors.paper}"
  button-row-disabled:
    backgroundColor: "{colors.ink-3}"
    textColor: "{colors.paper-dim}"
  tab:
    backgroundColor: "{colors.ink-3}"
    textColor: "{colors.paper-dim}"
    typography: "{typography.label}"
    padding: "5px 14px 4px"
  tab-hover:
    backgroundColor: "{colors.ink-4}"
    textColor: "{colors.paper}"
  tab-active:
    backgroundColor: "{colors.hazard}"
    textColor: "{colors.ink}"
  panel:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "18px 22px 22px"
  panel-title:
    backgroundColor: "{colors.hazard}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    padding: "6px 18px 3px 14px"
  panel-title-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  paper-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 16px 14px"
  slot:
    backgroundColor: "{colors.well}"
    size: "64px"
    rounded: "{rounded.none}"
  slot-selected:
    backgroundColor: "{colors.hazard}"
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "1px 7px 1px 2px"
  chip-missing:
    backgroundColor: "{colors.blood}"
    textColor: "{colors.paper}"
  chip-refund:
    backgroundColor: "{colors.toxic}"
    textColor: "{colors.ink}"
  keycap:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.key}"
    height: "32px"
    padding: "0 8px"
  raid-timer:
    backgroundColor: "{colors.hazard}"
    textColor: "{colors.ink}"
    padding: "4px 20px 2px 16px"
  raid-timer-imminent:
    backgroundColor: "{colors.blood}"
    textColor: "{colors.paper}"
  toast:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.paper}"
    padding: "9px 16px 8px"
  toast-danger:
    backgroundColor: "{colors.blood-deep}"
    textColor: "{colors.paper}"
---

# Design System: Aftermath: Living Hell

## Overview

**Creative North Star: "The Second Plate"**

The UI is a comic page printed in hazard inks over a grey, fogged world. Every element is a flat slab of solid color leaning forward at the same angle, and anything that needs weight gets a second slab in a different ink knocked out behind it, like a misregistered print plate. There are no gradients on controls, no glass, and no texture under type; loudness comes from saturated flat color, heavy condensed italics, and the offset plate.

Density follows the moment. The HUD is sparse and anchored to the four screen edges so the world stays visible in the middle; panels (backpack, crafting, gun bench, Codex) are dense, gridded and scannable in seconds; full screens (cover, pause, death) are poster compositions with one giant Bangers word and a short stack of slanted bars. Motion is a slam: things arrive fast from oversize or off-screen and settle without bounce.

The direction explicitly replaced an incumbent halftone-everywhere comic panel where dots sat behind text. Halftone survives in exactly one place: the blood-red slash edge of the cover and pause screens.

**Key Characteristics:**
- Flat solid slabs on ink black, every one skewed -12deg.
- A hard offset plate (no blur) behind any slab that matters: blood under hazard, ink under paper, blood and toxic.
- Two type voices: Bangers shouts, Barlow Condensed 800 italic informs.
- Paper cream is the reading surface; ink-2 is the working surface.
- Red means danger and only danger.
- Square corners everywhere; panels and paper cards get one 16px cut corner pair.

## Colors

Five hot inks (hazard, blood, toxic, ember, paper) on a cool near-black ink ramp; the world provides the grey, the UI provides the color.

### Primary
- **Hazard Yellow** (`hazard`): The house color. Primary buttons, panel title slabs, the raid timer, the selected hotbar slot, active tabs, the 4px top rule on every panel, focus outlines, selection highlight, minimap ring, crosshair. Its hover state is **Hot Hazard** (`hazard-hot`), used only on hover/focus of hazard buttons.

### Secondary
- **Blood Red** (`blood`): Danger, loss and the default offset plate behind hazard. Health fill, low-state alarms, raid imminent, Home Zone outside, missing-ingredient chips, the danger splash band, the cover's slash edge, the LIVING HELL slab. **Deep Blood** (`blood-deep`) is the health bar's plate and the danger toast surface. **Blood Text** (`blood-text`) is the only red allowed for small text on ink, used for blocked-recipe reasons, low-state bar labels and ledger tags.

### Tertiary
- **Toxic Green** (`toxic`): Gas and success. Filter bar fill, gas warning chip, refund chips, the info splash band, toxic toasts, a new-best death score. **Deep Toxic** (`toxic-deep`) is the filter bar plate and the valid-placement cell on the gun bench.
- **Ember Orange** (`ember`): Heat and hunger. Hunger fill, raid timer "soon" state, lit oven status and title.

### Neutral
- **Ink** (`ink`): Outlines, title strokes, offset plates under paper/blood/toxic slabs, the label half of the raid timer, keycap text, all dark text on light slabs.
- **Panel Ink** (`ink-2`): Panel, cover and pause surfaces; toasts.
- **Recess Ink** (`ink-3`): Resting tabs, disabled buttons, locked recipe rows and Codex cards, gun bench cells.
- **Raised Ink** (`ink-4`): Recipe rows, secondary buttons, hotbar key badges, neutral chips.
- **Edge Ink** (`ink-5`): Scrollbar thumbs and ghost-button hover; the lightest ink.
- **Slot Well** (`well`): The face of a filled inventory or hotbar slot and the Codex icon field.
- **Paper Cream** (`paper`): Primary text on ink, and the reading surface for tooltips, Codex cards, ingredient chips, keycaps, the best-gun card, the issue number.
- **Faded Paper** (`paper-dim`): Secondary text on ink: hints, times, stat captions, resting tab text, the cover tagline, the keycap's bottom lip.

### Named Rules
**The Second Plate Rule.** A slab that carries a primary value or action gets a solid offset plate in a contrasting ink, offset right and down 4-10px with zero blur. Hazard sits on blood; paper, blood and toxic sit on ink; in alarm states the plate flips to hazard under blood. Resting secondary controls get no plate; the plate appears on hover.

**The Red Is Danger Rule.** Blood red marks danger, damage, loss and low states. It is never decoration on a calm surface, and small red text on ink always uses Blood Text, never full Blood.

**The Paper Is For Reading Rule.** Paper cream surfaces hold things the player reads closely (tooltip, Codex entry, ingredient count, keycap). Working surfaces are Panel Ink. Don't build a whole panel in paper.

## Typography

**Display Font:** Bangers (with Impact, Arial Black)
**UI Font:** Barlow Condensed 600/700/800 italic (with Arial Narrow)
**Body Font:** Barlow 500/600 (with system-ui)

**Character:** Bangers is the comic letterer's voice: brushy, all-caps, always stroked in ink with a hard offset shadow. Barlow Condensed in heavy italic is the game's instrument voice, narrow enough to fit numbers in a glance and leaning forward like the slabs it sits on. Barlow upright carries the few real sentences.

### Hierarchy
- **Display** (Bangers, clamp(68px, 8.2vw, 148px), 0.82): The AFTERMATH title, rotated -3deg, hazard fill, 4px ink stroke, 7px blood shadow. Sibling full-screen titles (YOU DIED, PAUSED, THE CODEX) use the same treatment at their own clamps (84-170px, 72-120px, 48-84px).
- **Splash** (Bangers, clamp(64px, 9vw, 120px), 0.9): Raid and alert band titles, skewY -3deg.
- **Headline** (Bangers, 32px, 1, 1.5px): Panel title slabs (BACKPACK, CRAFTING, GUN BENCH, BUILD MODE) and, at 30px, the boss name.
- **SFX** (Bangers, 36px scaled per hit, 1.5px): World-space onomatopoeia, 3px ink stroke, 3px ink shadow, tinted per hit.
- **Numeral** (Barlow Condensed 800 italic, 64px, 0.78, -0.02em): The health number. Ammo magazine (56px), raid clock (38px), death score (56-92px) and run stats (34px) are the same voice at their sizes.
- **Button** (Barlow Condensed 800 italic, 26px, 0.04em): Full-screen menu buttons; secondary buttons drop to 20px.
- **Title** (Barlow Condensed 800 italic, 22px, 1): Item names in tooltips and Codex cards, hotbar item name, death cause.
- **Label** (Barlow Condensed 800 italic, 15px, 0.08em): Chips, tabs, row buttons, raid label, zone chip, biome caption, section headers (16-17px).
- **Caption** (Barlow Condensed 700 upright, 13px, 0.1em): Bar labels, hints, stat captions, recipe times and reasons. Upright to separate "what this is" from the leaning value beside it.
- **Body** (Barlow 500, 16px, 1.55, max 40ch): The cover tagline. **Body Small** (13-13.5px, 1.4) carries tooltip and Codex blurbs and the ledger cause of death.

All copy is set in capitals at the source string, not via text-transform; only the tooltip item kind uses `uppercase`. Numerals are tabular everywhere (`font-variant-numeric: tabular-nums` on body).

### Named Rules
**The Two Voices Rule.** Bangers is for the title, full-screen titles, panel title slabs, the boss name, splash bands and sound effects. Every label, number, button and tab is Barlow Condensed. Bangers never sets a number the player has to read mid-fight.

**The Lean Forward Rule.** Values, names and actions are 800 italic; captions that name them are 700 upright. A reader finds the number by its lean.

## Layout

The HUD pins to the screen edges at a 32px side inset (top 18-22px, bottom 26-30px) and leaves the center to the world: vitals bottom-left, hotbar bottom-center, ammo bottom-right, raid timer and Home Zone chip top-center, minimap top-right with toasts stacked beneath it, controls tab top-left. The interact prompt floats above the hotbar at 160px.

Panels center on a dimmed scrim (`rgba(6, 8, 7, 0.62-0.66)`): the backpack is a fixed 6-column grid of 64px slots (gap 10px rows, 12px columns) beside a 430px side panel; the gun bench is one min(1200px, 96vw) panel with tray, 12x6 grid and stat column, collapsing to one column under 980px. When a panel is open, toasts move to bottom-right and shrink to 230px.

Full screens are posters. Cover and pause put a diagonal ink panel on the left (min(800px, 56vw) and min(640px, 50vw)) cut by a 20%-of-width slant, with the world visible on the right. Death centers a min(940px) column under a full-bleed band. The Codex is a min(1120px) frame with an auto-fill grid of 190px-minimum cards; ledger rows stack into a three-area grid under 860px.

Spacing is tight and small-stepped (4, 6, 8, 10, 14, 18, 24px), with 8px and 10px the dominant gaps. Padding is asymmetric on purpose: slanted slabs carry 2-4px more on the left and bottom-padding 1-2px less than top, compensating for skew and italic cap height.

## Elevation & Depth

Depth is printed, not lit. The structural device is the hard offset plate (zero blur); a single soft ambient shadow, `--lift`, sits beneath floating HUD pieces only to separate them from a bright world, and is always secondary to the plate when both are present. Text that floats directly over the world (bar labels, health number, controls tab) gets the `--legible` shadow instead of a backing panel.

### Shadow Vocabulary
- **Small plate** (`box-shadow: 4px 3px 0 var(--blood)`): Row-button hover, small chips; 3px 3px 0 ink under floating gain/warn text.
- **Medium plate** (`box-shadow: 5px 6px 0 var(--blood)` to `7px 6px 0`): Selected slot, raid timer, panel title (6px 5px), primary button at rest (7px 6px), toasts (5px 5px in tone color), ammo chip (7px 6px ink).
- **Large plate** (`box-shadow: 9px 8px 0 var(--ink)` / `10px 7px 0 var(--blood)`): Death score, primary button hover.
- **Lift** (`box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5)`): Ambient separation for HUD slabs over the world.
- **Legible** (`text-shadow: 0 2px 0 var(--ink), 0 0 14px rgba(0, 0, 0, 0.7)`): Paper text directly over the 3D scene.
- **Icon rim** (`filter: drop-shadow(0 0 1.5px rgba(241, 231, 207, 0.6)) drop-shadow(2px 2px 0 rgba(11, 11, 13, 0.75))`): Every rendered 3D item icon, so dark models read on dark wells.
- **Title stroke** (`-webkit-text-stroke: 3-4px var(--ink); paint-order: stroke fill; text-shadow: 6-8px 6-8px 0`): All Bangers titles.

### Named Rules
**The Plate Not Glow Rule.** Weight comes from a solid offset plate, never from a blurred colored glow. The only colored blur in the system is the inset red danger pulse at the screen edge.

**The Halftone Edge Rule.** Halftone dots (`--halftone`, 7px grid, 32% black) appear only on the blood slash edge of the cover and pause screens, visible as the strip between the ink panel and the world. Never under text, never on a panel, never in the HUD.

## Shapes

The form language is the lean and the cut. Every slab, chip, tab, button, slot and bar is sheared `skewX(-12deg)`; content that must stay upright inside it (slot icons, quantities) counter-skews 12deg. Stat bars lean harder at -20deg. Full-width bands (raid splash, death band) tilt `skewY(-3deg)` with 5px ink rules top and bottom and a 10-12px solid plate below; giant titles rotate -2 to -3deg.

Corners are square (0). Panels, Codex cards and the best-gun card clip two opposite corners at 16px (top-right and bottom-left); the tooltip cuts only its bottom-right at 12px. Outlines are ink at 2-3px on slots and bars, offset inward on slots. The only radii are the 5px keycap (and 4px for the small sound keycap) and true circles for the minimap, crosshair and gas icon. Small icons are drawn as CSS polygons (the Home Zone triangle, the button chevron), not glyphs.

## Components

### Buttons
Slammed slabs that jump right when you point at them.
- **Shape:** Square, skewed -12deg, no border.
- **Primary:** Hazard slab, ink Button type, padding 12px 30px 10px 26px, left-aligned text, 7px 6px blood plate. Menu buttons hold a 300px minimum width so stacks read as a column of bars.
- **Hover / Focus:** Fill brightens to Hot Hazard, the slab shifts 8px right, the plate grows to 10px 7px, and a 9x14px ink chevron slides in at the left (180ms, ease-out). Active pushes back 4px right, 2px down with a 3px 2px plate.
- **Secondary:** Raised Ink slab, paper 20px type, 2px inset paper outline at 22% opacity, no plate. Hover turns it paper with ink text and a hazard plate. The danger variant hovers to blood with an ink plate.
- **Row button:** Compact hazard slab at Label size (13px small variant) for craft/add actions; hover adds a 4px 3px blood plate and nudges up-left 1px; the ghost variant is Raised Ink with a hazard plate on hover; disabled is Recess Ink with 35% paper text.
- **Focus ring:** 3px hazard outline, 3px offset, on every button and input.

### Chips
- **Style:** Paper chip with ink Label text and an 18px item icon at the left (ingredient counts); upright, not skewed.
- **State:** Missing ingredients turn blood with paper text; refunds turn toxic. Status chips (station, oven, ammo fire mode, zone) are skewed ink-4 or ink slabs that switch to hazard, ember or blood by state.

### Cards / Containers
- **Panels:** Panel Ink, 4px hazard top rule, 16px cut corners, padding 18px 22px 22px; they rise 18px into place on open (300ms slam). A Bangers title slab (hazard, or paper for side panels, ember when the oven is lit) with a blood plate heads each one.
- **Recipe rows:** Raised Ink rows, 52px icon / name and chips / actions grid, 6px apart; locked rows drop to Recess Ink.
- **Paper tooltip:** Paper, ink text, 6px 6px ink plate, 12px bottom-right cut, max 270px. The name is underlined by a 45%-height highlighter band in the item's tint.
- **Codex card:** Paper, 16px cuts, a 104px Slot Well icon field crossed by a diagonal hazard stripe, then name / meta / blurb at 14px side padding. Locked cards go Recess Ink with a blacked-out silhouette and `???`.

### Inputs / Fields
- **Range slider:** Native range with hazard accent color, 170px.
- **Text field:** The gun bench name field is a flat Recess Ink strip, 16px 700 paper text, hazard caret, a 2px Edge Ink bottom rule that turns hazard on focus, padding 5px 9px 4px; the global 3px hazard ring also applies on keyboard focus.

### Navigation
- **Tabs:** Skewed Recess Ink tabs, Faded Paper Label text, 6px gap. Hover lifts to Raised Ink with paper text; active is hazard with ink text. No underline, no plate. Used for crafting categories, gun bench filters, build categories and Codex sections.

### Slots and Hotbar
- **Slot:** 64px skewed square, Slot Well face, 2px inset ink outline, lift shadow. Empty slots are translucent ink with a faint paper outline. The selected slot turns hazard, rises 6px and takes a 5px 6px blood plate. A hotbar key badge sits top-left (ink-4, ink when selected with hazard text); quantity sits bottom-right in 800 paper with a four-way ink outline.

### Stat Bars
- **Track:** Skewed -20deg, 88% ink, 2px ink outline, colored plate behind per stat (deep blood, hunger brown, deep toxic, stamina ochre). Fill scales on X only. Health is the hero bar: 262x22px, 3px outline, cut into 10 segments by ink ticks, with the 64px Numeral beside it.
- **Low state:** The outline blinks blood in two hard steps (800ms) and the label turns Blood Text; health also throbs its number.

### Raid Timer and Splash
- **Raid timer:** Top-center hazard slab: an ink label cell (NEXT RAID) in hazard Label type, then the 38px clock. It turns ember when soon and blood with a hazard plate when imminent, shaking briefly every cycle.
- **Splash band:** A full-bleed band tilted -3deg with 5px ink rules and a 10px plate below. Tone sets the ink: danger is blood/ink plate with paper title, warn is hazard/blood plate with ink title, info is toxic/ink plate. It wipes in left-to-right, the title slams from 1.6x scale, and it wipes out after 2.4s.

### Toasts
- **Style:** Skewed Panel Ink slab, 18px 700 paper text, max 340px, with a 5px plate in the tone color (paper, hazard, toxic; danger goes blood-deep with a blood plate). They slide in 120px from the right.

### Issue Tag
- **Style:** A skewed two-cell badge: the run number in Bangers on paper (`#1`), joined to an ink cell. It sits top-left of the cover and pinned to the corner of the death band. The cover also carries a vertical outlined ISSUE watermark at 20% paper stroke, transparent fill, at the right edge.

## Do's and Don'ts

### Do:
- **Do** skew every new slab, chip, tab or button by the shared -12deg (`--skew`) and counter-skew icons and quantities inside it.
- **Do** give primary values and actions a zero-blur offset plate in a contrasting ink (hazard on blood; paper, blood, toxic on ink).
- **Do** set every number the player reads in Barlow Condensed 800 italic, and the caption naming it in 700 upright.
- **Do** put close-reading content on Paper Cream and working surfaces on Panel Ink with a 4px hazard top rule and 16px cut corners.
- **Do** use the ease-slam curve (`cubic-bezier(0.16, 1, 0.3, 1)`) for entrances and keep every motion collapsible under `prefers-reduced-motion`.
- **Do** add new colors as `:root` tokens in `src/ui/styles.css`; components reference variables, not hex.

### Don't:
- **Don't** put halftone dots behind text or on any panel or HUD element; they live only on the cover and pause slash edge.
- **Don't** use Bangers for labels, buttons, tabs, body copy or live numbers.
- **Don't** use blood red for anything that isn't danger, damage, loss or a low state.
- **Don't** round slab corners; the only radii are keycaps (5px) and true circles (minimap, crosshair).
- **Don't** use a blurred colored glow as the emphasis device; use the plate.
- **Don't** add small tracked caption lines above titles as kickers; the issue tag carries the run number, not a tagline.
- **Don't** use text glyphs (arrows, stars, check marks) as icons; draw small marks as CSS polygons or render them from the game's 3D models.
