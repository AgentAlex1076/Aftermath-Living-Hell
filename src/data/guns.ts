/** Side-view bench grid. Column 0 is the stock / rear; higher X is toward the muzzle. */
export const GUN_GRID = { cols: 12, rows: 6 } as const;
export const MAX_PER_CATEGORY = 5;

export type PartCategory =
  | 'receiver'
  | 'barrel'
  | 'grip'
  | 'handle'
  | 'stock'
  | 'trigger'
  | 'magazine'
  | 'sight'
  | 'muzzle'
  | 'underbarrel'
  | 'converter';

export type Rarity = 'rusted' | 'standard' | 'military' | 'prototype' | 'lab';

export type FireMode = 'semi' | 'burst' | 'auto';

export const CATEGORY_LABEL: Record<PartCategory, string> = {
  receiver: 'RECEIVER',
  barrel: 'BARREL',
  grip: 'GRIP',
  handle: 'HANDLE',
  stock: 'STOCK',
  trigger: 'TRIGGER',
  magazine: 'MAGAZINE',
  sight: 'SIGHT',
  muzzle: 'MUZZLE',
  underbarrel: 'UNDERBARREL',
  converter: 'AMMO CONVERTER',
};

export const RARITY_LABEL: Record<Rarity, string> = {
  rusted: 'RUSTED',
  standard: 'STANDARD',
  military: 'MILITARY',
  prototype: 'PROTOTYPE',
  lab: 'LAB-GRADE',
};

export const RARITY_COLOR: Record<Rarity, string> = {
  rusted: '#c47a3a',
  standard: '#c4c1b8',
  military: '#6fd3ff',
  prototype: '#d4a0ff',
  lab: '#8cff3a',
};

/** Combat numbers for a finished (or in-progress) build. */
export interface GunStats {
  damage: number;
  fireRate: number;
  fireMode: FireMode;
  burstCount: number;
  projectiles: number;
  spread: number;
  recoil: number;
  range: number;
  velocity: number;
  magSize: number;
  reloadTime: number;
  weight: number;
  handling: number;
  heat: number;
  sway: number;
  /** Extra ammo pulled from the pack per shot (slug converters). */
  ammoPerShot: number;
}

export interface PartStats {
  damage: number;
  fireRate: number;
  projectiles: number;
  spread: number;
  recoil: number;
  range: number;
  velocity: number;
  magSize: number;
  reloadTime: number;
  weight: number;
  handling: number;
  heat: number;
  sway: number;
}

export interface GunPartDef {
  id: string;
  name: string;
  category: PartCategory;
  rarity: Rarity;
  w: number;
  h: number;
  model: string;
  color: string;
  description: string;
  stats: PartStats;
}

export interface PlacedPart {
  uid: number;
  part: string;
  x: number;
  y: number;
}

export interface GunInstance {
  id: number;
  name: string;
  parts: PlacedPart[];
  /** Rounds currently in the magazine. */
  loaded: number;
}

export interface GunNote {
  kind: 'synergy' | 'warn';
  text: string;
}

export interface BuildEval {
  ok: boolean;
  reason: string;
  stats: GunStats;
  notes: GunNote[];
  counts: Record<PartCategory, number>;
  connected: boolean;
  receivers: PlacedPart[];
}

const Z: PartStats = {
  damage: 0, fireRate: 0, projectiles: 0, spread: 0, recoil: 0, range: 0, velocity: 0,
  magSize: 0, reloadTime: 0, weight: 0, handling: 0, heat: 0, sway: 0,
};

function part(
  id: string,
  name: string,
  category: PartCategory,
  rarity: Rarity,
  w: number,
  h: number,
  description: string,
  stats: Partial<PartStats>,
): GunPartDef {
  return {
    id, name, category, rarity, w, h,
    model: `part.${id}`,
    color: RARITY_COLOR[rarity],
    description,
    stats: { ...Z, ...stats },
  };
}

export const GUN_PARTS = {
  rustedReceiver: part('rustedReceiver', 'Rusted Receiver', 'receiver', 'rusted', 3, 2,
    'A pitted action pulled from a wreck. Everything else bolts onto this.',
    { damage: 10, fireRate: 2.4, magSize: 4, weight: 2.4, handling: 4, heat: 0.08, range: 8, velocity: 22, recoil: 8, spread: 4 }),
  pipeReceiver: part('pipeReceiver', 'Pipe Receiver', 'receiver', 'standard', 3, 2,
    'Scrap pipe and a salvaged bolt. Ugly. Fires.',
    { damage: 13, fireRate: 3.0, magSize: 6, weight: 2.2, handling: 6, heat: 0.05, range: 10, velocity: 26, recoil: 6, spread: 3 }),
  militaryReceiver: part('militaryReceiver', 'Military Receiver', 'receiver', 'military', 3, 2,
    'Stamped steel from a real armoury. Tight tolerances.',
    { damage: 16, fireRate: 4.2, magSize: 8, weight: 2.6, handling: 8, heat: 0.03, range: 12, velocity: 30, recoil: 5, spread: 2 }),

  rustedBarrel: part('rustedBarrel', 'Rusted Barrel', 'barrel', 'rusted', 2, 1,
    'A length of pipe. Do not look down it.',
    { damage: 3, range: 6, velocity: 8, weight: 1.1, handling: -1, spread: -0.4, recoil: 1 }),
  longBarrel: part('longBarrel', 'Long Barrel', 'barrel', 'standard', 3, 1,
    'Reach and velocity. Slow to swing onto a target.',
    { damage: 4, range: 10, velocity: 12, weight: 1.6, handling: -3, spread: -1.2, recoil: 1.5 }),
  shortBarrel: part('shortBarrel', 'Stub Barrel', 'barrel', 'standard', 1, 1,
    'Close-in work. Loud, wide, fast to point.',
    { damage: 2, range: 3, velocity: 5, weight: 0.6, handling: 2, spread: 1.4, recoil: 0.5 }),
  protoBarrel: part('protoBarrel', 'Lab Barrel', 'barrel', 'prototype', 3, 1,
    'Lined with something that still ticks. Hot and accurate.',
    { damage: 7, range: 14, velocity: 16, weight: 1.4, handling: -1, spread: -2, heat: 0.04 }),

  woodGrip: part('woodGrip', 'Wood Grip', 'grip', 'rusted', 1, 2,
    'A carved handle. Put it where your hand wants to be.',
    { weight: 0.4, handling: 3, recoil: -2, sway: -1 }),
  tapedGrip: part('tapedGrip', 'Taped Grip', 'grip', 'standard', 1, 2,
    'Cloth tape over scrap. Holds when your gloves are slick.',
    { weight: 0.35, handling: 5, recoil: -3, sway: -1.5 }),

  woodHandle: part('woodHandle', 'Wood Handle', 'handle', 'rusted', 1, 1,
    'A second handhold. Balance, or just something to hang onto.',
    { weight: 0.3, handling: 2, recoil: -1 }),
  polymerHandle: part('polymerHandle', 'Polymer Handle', 'handle', 'military', 1, 1,
    'Light, stiff, does not splinter.',
    { weight: 0.2, handling: 4, recoil: -2, sway: -1 }),

  woodStock: part('woodStock', 'Wood Stock', 'stock', 'rusted', 2, 1,
    'Shoulder it. Recoil goes somewhere that is not your teeth.',
    { weight: 1.2, recoil: -4, sway: -3, handling: 1 }),
  foldingStock: part('foldingStock', 'Folding Stock', 'stock', 'military', 2, 1,
    'Clips tight. Less weight, less help.',
    { weight: 0.7, recoil: -3, sway: -2, handling: 3 }),

  rustedTrigger: part('rustedTrigger', 'Rusted Trigger', 'trigger', 'rusted', 1, 1,
    'One click, one bang. Add more and it gets uglier and faster.',
    { fireRate: 0.4, weight: 0.15, heat: 0.01 }),
  hairTrigger: part('hairTrigger', 'Hair Trigger', 'trigger', 'military', 1, 1,
    'A breath sets it off. Stack them and the gun runs away from you.',
    { fireRate: 1.1, weight: 0.12, heat: 0.02, handling: 1 }),

  stickMag: part('stickMag', 'Stick Mag', 'magazine', 'rusted', 1, 2,
    'Bent tin and a spring that still remembers its job.',
    { magSize: 6, reloadTime: 0.35, weight: 0.6 }),
  drumMag: part('drumMag', 'Drum Mag', 'magazine', 'military', 2, 2,
    'A lot of rounds. A lot of waiting when it is empty.',
    { magSize: 16, reloadTime: 0.8, weight: 1.4, handling: -2 }),

  ironSight: part('ironSight', 'Iron Sight', 'sight', 'rusted', 1, 1,
    'A notch and a post. Only works sitting on the receiver.',
    { spread: -1.5, sway: -1, weight: 0.15 }),
  reflexSight: part('reflexSight', 'Reflex Sight', 'sight', 'military', 1, 1,
    'A glowing pip. Still useless if you bolt it to the barrel.',
    { spread: -2.8, sway: -2, handling: 1, weight: 0.2 }),

  rustedMuzzle: part('rustedMuzzle', 'Rusted Brake', 'muzzle', 'rusted', 1, 1,
    'A cap with holes punched in it. Softens the kick a little.',
    { recoil: -2, spread: -0.4, weight: 0.25, range: 1 }),
  compensator: part('compensator', 'Compensator', 'muzzle', 'military', 1, 1,
    'Vents the blast up. The gun stays on the thing you pointed at.',
    { recoil: -4, spread: -1, weight: 0.3, handling: 1 }),

  rustedRail: part('rustedRail', 'Rusted Rail', 'underbarrel', 'rusted', 2, 1,
    'A bar under the barrel. Hang a hand on it.',
    { weight: 0.4, recoil: -1.5, handling: 1 }),
  laserModule: part('laserModule', 'Laser Module', 'underbarrel', 'prototype', 2, 1,
    'A sickly green dot. Helps until the filter fogs.',
    { weight: 0.35, spread: -1.2, sway: -2, handling: 2 }),

  rustedConverter: part('rustedConverter', 'Powder Converter', 'converter', 'rusted', 1, 1,
    'Feeds scrap cartridges. Fine until it is not.',
    { damage: 1, heat: 0.02, weight: 0.3 }),
  slugConverter: part('slugConverter', 'Slug Converter', 'converter', 'prototype', 1, 1,
    'Crams two rounds into one ugly slug. Hits like a thrown brick.',
    { damage: 8, projectiles: 0, spread: -0.5, recoil: 3, heat: 0.05, weight: 0.4 }),
} as const satisfies Record<string, GunPartDef>;

export type GunPartId = keyof typeof GUN_PARTS;

export const ALL_GUN_PART_IDS = Object.keys(GUN_PARTS) as GunPartId[];

export function gunPart(id: string): GunPartDef | null {
  return (GUN_PARTS as Record<string, GunPartDef>)[id] ?? null;
}

export function isGunPart(id: string): id is GunPartId {
  return id in GUN_PARTS;
}

const EMPTY_COUNTS = {
  receiver: 0, barrel: 0, grip: 0, handle: 0, stock: 0, trigger: 0,
  magazine: 0, sight: 0, muzzle: 0, underbarrel: 0, converter: 0,
} as const satisfies Record<PartCategory, number>;

export function emptyCounts(): Record<PartCategory, number> {
  return { ...EMPTY_COUNTS };
}

export const BASE_GUN_STATS: GunStats = {
  damage: 0,
  fireRate: 0,
  fireMode: 'semi',
  burstCount: 1,
  projectiles: 1,
  spread: 6,
  recoil: 10,
  range: 6,
  velocity: 18,
  magSize: 1,
  reloadTime: 1.4,
  weight: 0,
  handling: 4,
  heat: 0.02,
  sway: 6,
  ammoPerShot: 1,
};

let nextGunId = 1;
let partUid = 1;

export function nextGunInstanceId(): number {
  return nextGunId++;
}

export function nextPartUid(): number {
  return partUid++;
}

export function cloneParts(parts: readonly PlacedPart[]): PlacedPart[] {
  return parts.map((p) => ({ uid: nextPartUid(), part: p.part, x: p.x, y: p.y }));
}

export function makeGun(parts: readonly PlacedPart[], name: string, loaded?: number): GunInstance {
  const copy = cloneParts(parts);
  const mag = Math.max(1, Math.floor(evaluateBuild(copy).stats.magSize));
  return { id: nextGunInstanceId(), name: name.trim() || 'UNNAMED', parts: copy, loaded: loaded ?? mag };
}

/** Occupied cells of a placed part. */
export function partCells(p: PlacedPart): { x: number; y: number }[] {
  const def = gunPart(p.part);
  if (!def) return [];
  const cells: { x: number; y: number }[] = [];
  for (let x = 0; x < def.w; x++) for (let y = 0; y < def.h; y++) cells.push({ x: p.x + x, y: p.y + y });
  return cells;
}

export function inGrid(x: number, y: number, w = 1, h = 1): boolean {
  return x >= 0 && y >= 0 && x + w <= GUN_GRID.cols && y + h <= GUN_GRID.rows;
}

export function cellsOverlap(a: PlacedPart, b: PlacedPart): boolean {
  const da = gunPart(a.part);
  const db = gunPart(b.part);
  if (!da || !db) return false;
  return a.x < b.x + db.w && a.x + da.w > b.x && a.y < b.y + db.h && a.y + da.h > b.y;
}

export function cellsAdjacent(a: PlacedPart, b: PlacedPart): boolean {
  const da = gunPart(a.part);
  const db = gunPart(b.part);
  if (!da || !db) return false;
  const touchX = a.x <= b.x + db.w && a.x + da.w >= b.x;
  const touchY = a.y <= b.y + db.h && a.y + da.h >= b.y;
  const edgeX = a.x + da.w === b.x || b.x + db.w === a.x;
  const edgeY = a.y + da.h === b.y || b.y + db.h === a.y;
  return (edgeX && touchY && a.y < b.y + db.h && a.y + da.h > b.y) || (edgeY && touchX && a.x < b.x + db.w && a.x + da.w > b.x);
}

/** Connected to a receiver through other parts (4-neighbour). */
export function connectedSet(parts: readonly PlacedPart[]): Set<number> {
  const rec = parts.filter((p) => gunPart(p.part)?.category === 'receiver');
  const seen = new Set<number>();
  const q = [...rec];
  for (const r of rec) seen.add(r.uid);
  while (q.length) {
    const cur = q.pop()!;
    for (const p of parts) {
      if (seen.has(p.uid) || !cellsAdjacent(cur, p)) continue;
      seen.add(p.uid);
      q.push(p);
    }
  }
  return seen;
}

export function canPlace(parts: readonly PlacedPart[], partId: string, x: number, y: number, ignoreUid = -1): { ok: boolean; reason: string } {
  const def = gunPart(partId);
  if (!def) return { ok: false, reason: 'UNKNOWN PART' };
  if (!inGrid(x, y, def.w, def.h)) return { ok: false, reason: 'OFF THE BENCH' };
  const ghost: PlacedPart = { uid: -2, part: partId, x, y };
  const others = parts.filter((p) => p.uid !== ignoreUid);
  for (const p of others) {
    if (cellsOverlap(ghost, p)) return { ok: false, reason: 'OVERLAP' };
  }
  const counts = emptyCounts();
  for (const p of others) {
    const d = gunPart(p.part);
    if (d) counts[d.category]++;
  }
  if (counts[def.category] >= MAX_PER_CATEGORY) return { ok: false, reason: `MAX ${MAX_PER_CATEGORY} ${CATEGORY_LABEL[def.category]}` };
  const hasReceiver = def.category === 'receiver' || others.some((p) => gunPart(p.part)?.category === 'receiver');
  if (!hasReceiver) return { ok: false, reason: 'START WITH A RECEIVER' };
  if (def.category !== 'receiver' && others.length > 0 && !others.some((p) => cellsAdjacent(ghost, p))) {
    return { ok: false, reason: 'MUST TOUCH THE GUN' };
  }
  return { ok: true, reason: '' };
}

function clampStat(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Placement rules live here so new parts only need data. Barrels in a row
 * stretch the gun; barrels stacked fire together; triggers pick the fire mode.
 */
/** A working rusted pistol for debug kits and a first turret. */
export function makePipePistol(): GunInstance {
  return {
    id: (Math.random() * 1e9) | 0,
    name: 'PIPE PISTOL',
    loaded: 10,
    parts: [
      { uid: 1, part: 'rustedReceiver', x: 4, y: 2 },
      { uid: 2, part: 'rustedBarrel', x: 7, y: 2 },
      { uid: 3, part: 'woodGrip', x: 4, y: 0 },
      { uid: 4, part: 'rustedTrigger', x: 5, y: 1 },
      { uid: 5, part: 'stickMag', x: 3, y: 2 },
    ],
  };
}

export function evaluateBuild(parts: readonly PlacedPart[]): BuildEval {
  const notes: GunNote[] = [];
  const counts = emptyCounts();
  const receivers: PlacedPart[] = [];
  const barrels: PlacedPart[] = [];
  const grips: PlacedPart[] = [];
  const sights: PlacedPart[] = [];
  let triggers = 0;

  const summed = { ...Z };
  for (const p of parts) {
    const def = gunPart(p.part);
    if (!def) continue;
    counts[def.category]++;
    if (def.category === 'receiver') receivers.push(p);
    if (def.category === 'barrel') barrels.push(p);
    if (def.category === 'grip') grips.push(p);
    if (def.category === 'sight') sights.push(p);
    if (def.category === 'trigger') triggers++;
    const s = def.stats;
    summed.damage += s.damage;
    summed.fireRate += s.fireRate;
    summed.projectiles += s.projectiles;
    summed.spread += s.spread;
    summed.recoil += s.recoil;
    summed.range += s.range;
    summed.velocity += s.velocity;
    summed.magSize += s.magSize;
    summed.reloadTime += s.reloadTime;
    summed.weight += s.weight;
    summed.handling += s.handling;
    summed.heat += s.heat;
    summed.sway += s.sway;
  }

  const connected = parts.length === 0 || connectedSet(parts).size === parts.length;
  if (parts.length > 0 && !connected) notes.push({ kind: 'warn', text: 'A part is floating. Everything has to connect to the receiver.' });

  let chainBonus = 0;
  let parallelBonus = 0;
  for (let i = 0; i < barrels.length; i++) {
    const a = barrels[i];
    const da = gunPart(a.part)!;
    for (let j = i + 1; j < barrels.length; j++) {
      const b = barrels[j];
      const db = gunPart(b.part)!;
      const sameRow = a.y === b.y;
      const chained = sameRow && (a.x + da.w === b.x || b.x + db.w === a.x);
      const overlapX = a.x < b.x + db.w && a.x + da.w > b.x;
      const stacked = overlapX && (a.y + da.h === b.y || b.y + db.h === a.y);
      if (chained) chainBonus++;
      if (stacked) parallelBonus++;
    }
  }
  if (chainBonus > 0) {
    summed.range += chainBonus * 5;
    summed.velocity += chainBonus * 6;
    summed.spread -= chainBonus * 1.2;
    summed.handling -= chainBonus * 2;
    notes.push({ kind: 'synergy', text: `Barrels chained ×${chainBonus}: more reach and speed, slower to handle.` });
  }
  if (parallelBonus > 0) {
    summed.projectiles += parallelBonus;
    summed.spread += parallelBonus * 5;
    summed.recoil += parallelBonus * 3;
    notes.push({ kind: 'synergy', text: `Barrels stacked ×${parallelBonus}: extra projectiles, more spread.` });
  }

  let minX = 99;
  let maxX = 0;
  for (const p of parts) {
    const d = gunPart(p.part);
    if (!d) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x + d.w);
  }
  const midX = (minX + maxX) / 2;
  for (const g of grips) {
    const dg = gunPart(g.part)!;
    const cx = g.x + dg.w / 2;
    if (cx >= midX) {
      summed.recoil -= 3;
      notes.push({ kind: 'synergy', text: 'Front grip: recoil damped.' });
    } else {
      summed.handling += 3;
      notes.push({ kind: 'synergy', text: 'Rear grip: faster handling.' });
    }
  }

  let fireMode: FireMode = 'semi';
  let burstCount = 1;
  if (triggers >= 3) {
    fireMode = 'auto';
    summed.fireRate += (triggers - 1) * 0.7;
    notes.push({ kind: 'synergy', text: `${triggers} triggers: full-auto.` });
  } else if (triggers === 2) {
    fireMode = 'burst';
    burstCount = 3;
    summed.fireRate += 0.5;
    notes.push({ kind: 'synergy', text: 'Two triggers: 3-round burst.' });
  } else if (triggers === 1) {
    notes.push({ kind: 'synergy', text: 'One trigger: semi-auto.' });
  } else if (parts.length > 0) {
    notes.push({ kind: 'warn', text: 'No trigger. It will not fire.' });
  }

  if (counts.magazine > 1) {
    notes.push({ kind: 'synergy', text: `${counts.magazine} magazines: more capacity, slower reload.` });
  }

  if (counts.stock >= 3) {
    summed.weight += 2;
    summed.handling -= 3;
    notes.push({ kind: 'warn', text: 'Too many stocks. The gun is a boat anchor.' });
  } else if (counts.stock > 0) {
    notes.push({ kind: 'synergy', text: 'Stock planted: less recoil and sway.' });
  }

  for (const s of sights) {
    const ds = gunPart(s.part)!;
    const mounted = receivers.some((r) => {
      const dr = gunPart(r.part)!;
      const overlapX = s.x < r.x + dr.w && s.x + ds.w > r.x;
      return overlapX && s.y === r.y + dr.h;
    });
    if (mounted) {
      notes.push({ kind: 'synergy', text: `${gunPart(s.part)!.name} seated on the receiver.` });
    } else {
      summed.spread += -(gunPart(s.part)?.stats.spread ?? 0);
      summed.sway += -(gunPart(s.part)?.stats.sway ?? 0);
      notes.push({ kind: 'warn', text: 'Sight not mounted on the receiver: no effect.' });
    }
  }

  let massX = 0;
  let mass = 0;
  for (const p of parts) {
    const d = gunPart(p.part);
    if (!d) continue;
    const w = Math.max(0.2, d.stats.weight);
    massX += (p.x + d.w / 2) * w;
    mass += w;
  }
  const grip = grips[0] ?? parts.find((p) => gunPart(p.part)?.category === 'handle');
  if (grip && mass > 0) {
    const dg = gunPart(grip.part)!;
    const gx = grip.x + dg.w / 2;
    const com = massX / mass;
    const lever = Math.abs(com - gx);
    if (lever > 2) {
      const extra = (lever - 2) * 1.4;
      summed.recoil += extra;
      summed.sway += extra;
      notes.push({ kind: 'warn', text: 'Weight sits far from the grip. Sway and recoil climb.' });
    }
  }

  let ammoPerShot = 1;
  if (counts.converter > 0) {
    const slug = parts.some((p) => p.part === 'slugConverter');
    if (slug) {
      ammoPerShot = 2;
      notes.push({ kind: 'synergy', text: 'Slug converter: two rounds, one heavy hit.' });
    }
  }

  const stats: GunStats = {
    damage: clampStat(summed.damage, 1, 80),
    fireRate: clampStat(summed.fireRate, 0.4, 14),
    fireMode,
    burstCount,
    projectiles: clampStat(1 + summed.projectiles, 1, 8),
    spread: clampStat(BASE_GUN_STATS.spread + summed.spread, 0.4, 28),
    recoil: clampStat(BASE_GUN_STATS.recoil + summed.recoil, 1, 40),
    range: clampStat(BASE_GUN_STATS.range + summed.range, 4, 48),
    velocity: clampStat(BASE_GUN_STATS.velocity + summed.velocity, 10, 60),
    magSize: clampStat(Math.round(BASE_GUN_STATS.magSize + summed.magSize), 1, 80),
    reloadTime: clampStat(BASE_GUN_STATS.reloadTime + summed.reloadTime, 0.6, 5),
    weight: clampStat(summed.weight, 0.4, 20),
    handling: clampStat(BASE_GUN_STATS.handling + summed.handling, 0, 20),
    heat: clampStat(BASE_GUN_STATS.heat + summed.heat, 0.005, 0.35),
    sway: clampStat(BASE_GUN_STATS.sway + summed.sway, 0, 24),
    ammoPerShot,
  };

  let ok = true;
  let reason = '';
  if (receivers.length === 0) {
    ok = false;
    reason = 'NEEDS A RECEIVER';
  } else if (!connected) {
    ok = false;
    reason = 'PARTS MUST CONNECT';
  } else if (triggers === 0) {
    ok = false;
    reason = 'NEEDS A TRIGGER';
  }

  return { ok, reason, stats, notes, counts, connected, receivers };
}

export const STAT_BARS: { key: keyof GunStats; label: string; max: number; better: 'high' | 'low'; format?: (v: number) => string }[] = [
  { key: 'damage', label: 'DAMAGE', max: 50, better: 'high' },
  { key: 'fireRate', label: 'FIRE RATE', max: 12, better: 'high', format: (v) => `${v.toFixed(1)}/S` },
  { key: 'projectiles', label: 'PROJECTILES', max: 8, better: 'high' },
  { key: 'spread', label: 'SPREAD', max: 24, better: 'low', format: (v) => `${v.toFixed(1)}°` },
  { key: 'recoil', label: 'RECOIL', max: 30, better: 'low' },
  { key: 'range', label: 'RANGE', max: 40, better: 'high', format: (v) => `${v.toFixed(0)}M` },
  { key: 'velocity', label: 'VELOCITY', max: 55, better: 'high' },
  { key: 'magSize', label: 'MAG', max: 40, better: 'high', format: (v) => String(Math.round(v)) },
  { key: 'reloadTime', label: 'RELOAD', max: 4.5, better: 'low', format: (v) => `${v.toFixed(1)}S` },
  { key: 'weight', label: 'WEIGHT', max: 14, better: 'low', format: (v) => `${v.toFixed(1)}` },
  { key: 'handling', label: 'HANDLING', max: 18, better: 'high' },
  { key: 'heat', label: 'JAM RISK', max: 0.25, better: 'low', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'sway', label: 'SWAY', max: 20, better: 'low' },
];
