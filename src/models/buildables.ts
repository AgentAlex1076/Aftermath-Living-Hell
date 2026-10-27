import * as THREE from 'three';
import type { Rng } from '../core/random';
import { CONFIG } from '../data/config';
import type { PieceDef, TierId, WallShape } from '../data/buildables';
import type { LocalCollider } from '../physics/Collision';
import { box, cyl, group, mesh } from './build';
import { mat, uniqueMat, type MaterialKey } from './materials';

const B = CONFIG.building;
const L = B.cell;
const T = B.wallThickness;
const q = (v: number, step = 0.01) => Math.max(step, Math.round(v / step) * step);

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Openings cut into walls, in wall-local coordinates (x along the wall, y up). */
export const WALL_OPENINGS: Partial<Record<WallShape, Rect>> = {
  doorway: { x0: -0.68, x1: 0.68, y0: 0, y1: 2.15 },
  window: { x0: -0.75, x1: 0.75, y0: 1.05, y1: 1.75 },
};

export const DOOR_SIZE = { width: 1.24, height: 2.1 } as const;

export function wallHeight(shape: WallShape): number {
  return shape === 'half' ? B.halfWallHeight : B.wallHeight;
}

const PLANKS: MaterialKey[] = ['wood', 'woodLight', 'woodDark', 'woodRot', 'wood'];
const SHEETS: MaterialKey[] = ['rust', 'rustLight', 'corrugated', 'rust'];
const POST: Record<TierId, { size: number; mat: MaterialKey; trim: MaterialKey }> = {
  // Different sizes per tier so posts of mixed-tier walls meeting at a corner never share faces.
  wood: { size: 0.26, mat: 'woodDark', trim: 'woodDark' },
  scrap: { size: 0.28, mat: 'rust', trim: 'iron' },
  armored: { size: 0.3, mat: 'iron', trim: 'hazardYellow' },
};

function wallRects(shape: WallShape): Rect[] {
  const H = wallHeight(shape);
  const gap = WALL_OPENINGS[shape];
  if (!gap) return [{ x0: -L / 2, x1: L / 2, y0: 0, y1: H }];
  const out: Rect[] = [
    { x0: -L / 2, x1: gap.x0, y0: 0, y1: H },
    { x0: gap.x1, x1: L / 2, y0: 0, y1: H },
    { x0: gap.x0, x1: gap.x1, y0: gap.y1, y1: H },
  ];
  if (gap.y0 > 0) out.push({ x0: gap.x0, x1: gap.x1, y0: 0, y1: gap.y0 });
  return out;
}

function woodFill(g: THREE.Group, r: Rect, H: number, rng: Rng): void {
  const w = r.x1 - r.x0;
  const n = Math.max(1, Math.round(w / 0.3));
  const pw = w / n;
  for (let k = 0; k < n; k++) {
    const x = r.x0 + pw * (k + 0.5);
    const top = r.y1 >= H - 0.01 ? r.y1 + rng.range(-0.14, 0.04) : r.y1;
    const h = q(top - r.y0, 0.05);
    g.add(
      box(q(pw * 0.94), h, T * 0.7, mat(rng.pick(PLANKS)), {
        pos: [x, r.y0 + h / 2, rng.range(-0.012, 0.012)],
        rot: [0, 0, rng.range(-0.012, 0.012)],
      }),
    );
  }
  for (const y of [0.45, H - 0.45]) {
    if (y < r.y0 + 0.1 || y > r.y1 - 0.1) continue;
    for (const side of [1, -1]) g.add(box(q(w), 0.1, 0.05, mat('woodDark'), { pos: [(r.x0 + r.x1) / 2, y, side * (T * 0.35 + 0.025)] }));
  }
}

function scrapFill(g: THREE.Group, r: Rect, H: number, rng: Rng): void {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  const mid = (r.x0 + r.x1) / 2;
  g.add(box(q(w), q(h), T * 0.45, mat('metalDark'), { pos: [mid, r.y0 + h / 2, 0] }));
  const n = Math.max(1, Math.round(w / 0.95));
  const sw = w / n;
  for (let k = 0; k < n; k++) {
    const sh = q(h * (r.y1 >= H - 0.01 ? rng.range(0.9, 1) : 1), 0.05);
    const x = r.x0 + sw * (k + 0.5);
    const m = mat(rng.pick(SHEETS));
    g.add(box(q(sw * 1.03), sh, T * 0.72, m, { pos: [x, r.y0 + sh / 2, 0], rot: [0, 0, rng.range(-0.025, 0.025)] }));
    if (sw > 0.4) {
      for (const c of [-0.3, 0, 0.3]) g.add(box(0.05, q(sh * 0.96, 0.05), T * 0.84, m, { pos: [x + c * sw, r.y0 + sh / 2, 0] }));
    }
    if (sh > 0.45 && sw > 0.3) {
      for (const ry of [r.y0 + 0.14, r.y0 + sh - 0.14]) {
        for (const rx of [x - sw * 0.38, x + sw * 0.38]) g.add(box(0.05, 0.05, T * 0.95, mat('iron'), { pos: [rx, ry, 0] }));
      }
    }
  }
  if (h > 1) g.add(box(q(w), 0.08, T * 0.9, mat('iron'), { pos: [mid, r.y0 + h * 0.5, 0] }));
}

function armoredFill(g: THREE.Group, r: Rect, rng: Rng): void {
  const w = r.x1 - r.x0;
  const h = r.y1 - r.y0;
  g.add(box(q(w), q(h), T * 0.6, mat('iron'), { pos: [(r.x0 + r.x1) / 2, r.y0 + h / 2, 0] }));
  const cols = Math.max(1, Math.round(w / 1.0));
  const rows = Math.max(1, Math.round(h / 0.9));
  const pw = w / cols;
  const ph = h / rows;
  for (let c = 0; c < cols; c++) {
    for (let k = 0; k < rows; k++) {
      const px = r.x0 + pw * (c + 0.5);
      const py = r.y0 + ph * (k + 0.5);
      const m = mat((c + k + (rng.chance(0.2) ? 1 : 0)) % 2 ? 'metalDark' : 'gunMetal');
      g.add(box(q(pw - 0.05), q(ph - 0.05), T * 0.95, m, { pos: [px, py, 0] }));
      if (pw < 0.35 || ph < 0.35) continue;
      for (const bx of [-1, 1]) {
        for (const by of [-1, 1]) g.add(box(0.06, 0.06, T * 1.08, mat('whiteMetal'), { pos: [px + bx * (pw / 2 - 0.12), py + by * (ph / 2 - 0.12), 0] }));
      }
    }
  }
  if (r.y0 === 0) {
    const segs = Math.max(2, Math.round(w / 0.3));
    const sw = w / segs;
    for (let s = 0; s < segs; s++) {
      g.add(box(q(sw), 0.22, T * 1.04, mat(s % 2 ? 'tape' : 'hazardYellow'), { pos: [r.x0 + sw * (s + 0.5), 0.2, 0] }));
    }
  }
}

/** A wall on a grid edge, running along local X and centered at the origin. */
function buildWall(shape: WallShape, tier: TierId, rng: Rng): THREE.Object3D {
  const g = group(`wall-${shape}`);
  const H = wallHeight(shape);
  for (const r of wallRects(shape)) {
    if (tier === 'wood') woodFill(g, r, H, rng);
    else if (tier === 'scrap') scrapFill(g, r, H, rng);
    else armoredFill(g, r, rng);
  }

  const post = POST[tier];
  for (const x of [-L / 2, L / 2]) g.add(box(post.size, q(H + 0.08), post.size, mat(post.mat), { pos: [x, (H + 0.08) / 2, 0] }));
  if (tier === 'armored') g.add(box(L, 0.08, T * 1.1, mat('iron'), { pos: [0, H + 0.02, 0] }));

  const gap = WALL_OPENINGS[shape];
  if (gap) {
    const trim = mat(post.trim);
    const gh = gap.y1 - gap.y0;
    for (const x of [gap.x0 - 0.04, gap.x1 + 0.04]) g.add(box(0.08, q(gh), T * 1.12, trim, { pos: [x, gap.y0 + gh / 2, 0] }));
    g.add(box(q(gap.x1 - gap.x0 + 0.16), 0.1, T * 1.12, trim, { pos: [0, gap.y1 + 0.05, 0] }));
    if (gap.y0 > 0) g.add(box(q(gap.x1 - gap.x0 + 0.16), 0.08, T * 1.3, trim, { pos: [0, gap.y0 - 0.04, 0] }));
  }

  const hw = L / 2 + 0.14;
  const hd = T / 2 + 0.03;
  const colliders: LocalCollider[] =
    shape === 'doorway' && gap
      ? [
          { kind: 'box', x: (-hw + gap.x0) / 2, z: 0, hw: (gap.x0 + hw) / 2, hd },
          { kind: 'box', x: (gap.x1 + hw) / 2, z: 0, hw: (hw - gap.x1) / 2, hd },
        ]
      : [{ kind: 'box', x: 0, z: 0, hw, hd }];
  g.userData.colliders = colliders;
  return g;
}

/** A 3 m floor slab centered at the origin. Flat enough to walk over without a collider. */
function buildFoundation(tier: TierId, rng: Rng): THREE.Object3D {
  const g = group('foundation');
  const flat = { shadow: false };
  const edge = (h: number, w: number, m: MaterialKey) => {
    for (const s of [1, -1]) {
      g.add(box(L, h, w, mat(m), { ...flat, pos: [0, h / 2, s * (L / 2 - w / 2)] }));
      g.add(box(w, h, L - w * 2, mat(m), { ...flat, pos: [s * (L / 2 - w / 2), h / 2, 0] }));
    }
  };
  if (tier === 'wood') {
    g.add(box(L, 0.04, L, mat('woodDark'), { ...flat, pos: [0, 0.02, 0] }));
    for (let k = 0; k < 10; k++) {
      g.add(box(L - 0.24, 0.03, 0.28, mat(rng.pick(PLANKS)), { ...flat, pos: [rng.range(-0.03, 0.03), 0.055, -L / 2 + 0.3 * (k + 0.5)] }));
    }
    edge(0.09, 0.14, 'woodDark');
  } else if (tier === 'scrap') {
    g.add(box(L, 0.05, L, mat('metalDark'), { ...flat, pos: [0, 0.025, 0] }));
    for (const px of [-0.74, 0.74]) {
      for (const pz of [-0.74, 0.74]) {
        g.add(box(1.42, 0.03, 1.42, mat(rng.pick(SHEETS)), { ...flat, pos: [px, 0.065, pz], rot: [0, rng.range(-0.02, 0.02), 0] }));
        for (const rx of [-0.6, 0.6]) {
          for (const rz of [-0.6, 0.6]) g.add(box(0.05, 0.035, 0.05, mat('iron'), { ...flat, pos: [px + rx, 0.08, pz + rz] }));
        }
      }
    }
    edge(0.1, 0.1, 'iron');
  } else {
    g.add(box(L, 0.08, L, mat('concrete'), { ...flat, pos: [0, 0.04, 0] }));
    g.add(box(L - 0.2, 0.085, 0.04, mat('concreteDark'), { ...flat, pos: [0, 0.0425, 0] }));
    g.add(box(0.04, 0.085, L - 0.2, mat('concreteDark'), { ...flat, pos: [0, 0.0425, 0] }));
    edge(0.1, 0.12, 'iron');
    for (const cx of [-1, 1]) {
      for (const cz of [-1, 1]) g.add(box(0.36, 0.105, 0.36, mat('hazardYellow'), { ...flat, pos: [cx * (L / 2 - 0.18), 0.0525, cz * (L / 2 - 0.18)] }));
    }
  }
  return g;
}

/** A door for a doorway. The panel swings on the `hinge` node (kept separate when merged). */
function buildDoor(tier: TierId, rng: Rng): THREE.Object3D {
  const g = group('door');
  const { width: W, height: H } = DOOR_SIZE;
  const hinge = group('hinge');
  hinge.position.set(-W / 2, 0.02, 0);
  const cx = W / 2;
  if (tier === 'wood') {
    for (let k = 0; k < 4; k++) {
      hinge.add(box(q(W / 4 - 0.01), H, 0.07, mat(rng.pick(PLANKS)), { pos: [W / 8 + (W / 4) * k, H / 2, 0] }));
    }
    for (const y of [0.35, H - 0.35]) hinge.add(box(W - 0.08, 0.14, 0.1, mat('woodDark'), { pos: [cx, y, 0] }));
    const span = H - 0.7;
    hinge.add(box(0.12, Math.hypot(span, W - 0.25), 0.09, mat('woodDark'), { pos: [cx, H / 2, 0], rot: [0, 0, Math.atan2(W - 0.25, span)] }));
  } else if (tier === 'scrap') {
    hinge.add(box(W, H, 0.05, mat('metalDark'), { pos: [cx, H / 2, 0] }));
    const m = mat(rng.pick(SHEETS));
    hinge.add(box(W - 0.12, H - 0.12, 0.08, m, { pos: [cx, H / 2, 0] }));
    for (const x of [0.3, 0.62, 0.94]) hinge.add(box(0.05, H - 0.16, 0.1, m, { pos: [x, H / 2, 0] }));
    for (const y of [0.06, H - 0.06]) hinge.add(box(W, 0.12, 0.1, mat('iron'), { pos: [cx, y, 0] }));
    for (const x of [0.06, W - 0.06]) hinge.add(box(0.12, H, 0.1, mat('iron'), { pos: [x, H / 2, 0] }));
  } else {
    hinge.add(box(W, H, 0.1, mat('gunMetal'), { pos: [cx, H / 2, 0] }));
    hinge.add(box(W - 0.2, H * 0.45, 0.12, mat('metalDark'), { pos: [cx, H * 0.62, 0] }));
    hinge.add(box(0.44, 0.07, 0.13, mat('glassDark'), { pos: [cx, 1.62, 0] }));
    const segs = 4;
    for (let s = 0; s < segs; s++) {
      hinge.add(box(q(W / segs), 0.2, 0.12, mat(s % 2 ? 'tape' : 'hazardYellow'), { pos: [(W / segs) * (s + 0.5), 0.22, 0] }));
    }
    for (const x of [0.12, W - 0.12]) {
      for (const y of [0.5, 1.0, 1.95]) hinge.add(box(0.06, 0.06, 0.14, mat('whiteMetal'), { pos: [x, y, 0] }));
    }
  }
  hinge.add(box(0.05, 0.2, 0.18, mat('iron'), { pos: [W - 0.14, 1.0, 0] }));
  for (const y of [0.3, H - 0.3]) hinge.add(cyl(0.035, 0.035, 0.16, mat('iron'), { pos: [0.02, y, 0], segments: 8 }));
  g.add(hinge);
  g.userData.animated = ['hinge'];
  return g;
}

/** Corrugated sheet geometry reused across roof cells (same look as the old hut roof). */
function corrugatedSheet(width: number, length: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, length, 22, 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, Math.sin((pos.getX(i) / width) * Math.PI * 12) * 0.028);
  }
  geo.computeVertexNormals();
  return geo;
}

const roofSheetCache = new Map<string, THREE.BufferGeometry>();
function roofSheetGeo(width: number, length: number): THREE.BufferGeometry {
  const key = `${width.toFixed(3)}:${length.toFixed(3)}`;
  let g = roofSheetCache.get(key);
  if (!g) {
    g = corrugatedSheet(width, length);
    roofSheetCache.set(key, g);
  }
  return g;
}

/** A pitched corrugated panel over one foundation cell. No ground collider — mutants walk underneath. */
function buildRoof(tier: TierId, rng: Rng): THREE.Object3D {
  const g = group('roof');
  const rise = 0.55;
  const overhang = 0.12;
  const span = L / 2 + overhang;
  const slopeLen = Math.hypot(span, rise) + 0.04;
  const angle = Math.atan2(rise, span);
  const sheetW = 1.05;
  const sheetGeo = roofSheetGeo(sheetW, slopeLen);
  const sheetKeys: MaterialKey[] =
    tier === 'armored' ? ['iron', 'iron', 'metalDark'] : tier === 'scrap' ? SHEETS : ['rust', 'rustLight', 'corrugated', 'rust'];
  const trim = tier === 'armored' ? 'hazardYellow' : tier === 'scrap' ? 'iron' : 'woodDark';
  const sheetCount = Math.ceil((L + overhang * 2) / (sheetW * 0.92));
  for (const side of [1, -1] as const) {
    for (let i = 0; i < sheetCount; i++) {
      const x = -(L / 2 + overhang) + sheetW / 2 + i * sheetW * 0.92;
      const sheetMat = uniqueMat(rng.pick(sheetKeys));
      sheetMat.side = THREE.DoubleSide;
      sheetMat.shadowSide = THREE.DoubleSide;
      g.add(
        mesh(sheetGeo, sheetMat, {
          pos: [x, rise / 2 + 0.04 + i * 0.003, side * (span / 2)],
          rot: [side * angle, 0, rng.range(-0.015, 0.015)],
        }),
      );
    }
  }
  g.add(box(L + overhang * 2, 0.1, 0.14, mat(trim), { pos: [0, rise + 0.02, 0] }));
  if (tier === 'wood') {
    for (const x of [-L / 2 + 0.08, L / 2 - 0.08]) g.add(box(0.1, rise, 0.1, mat('woodDark'), { pos: [x, rise / 2, 0] }));
  } else if (tier === 'armored') {
    g.add(box(L - 0.3, 0.05, 0.08, mat('hazardYellow'), { pos: [0, rise * 0.45, span * 0.4] }));
  }
  return g;
}

export function buildPiece(def: PieceDef, tier: TierId, rng: Rng): THREE.Object3D {
  if (def.kind === 'foundation') return buildFoundation(tier, rng);
  if (def.kind === 'roof') return buildRoof(tier, rng);
  if (def.kind === 'door') return buildDoor(tier, rng);
  return buildWall(def.shape ?? 'full', tier, rng);
}

export function buildStorageBox(rng: Rng): THREE.Object3D {
  const g = group('storageBox');
  const w = 1.1;
  const d = 0.66;
  g.add(box(w, 0.56, d, mat(rng.chance(0.5) ? 'wood' : 'woodLight'), { pos: [0, 0.33, 0] }));
  for (const y of [0.2, 0.4]) g.add(box(w + 0.01, 0.03, d + 0.01, mat('woodDark'), { pos: [0, y, 0] }));
  g.add(box(w + 0.04, 0.12, d + 0.04, mat('woodLight'), { pos: [0, 0.67, 0], rot: [rng.range(-0.02, 0.02), 0, 0] }));
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      g.add(box(0.08, 0.66, 0.08, mat('iron'), { pos: [x * (w / 2 - 0.02), 0.36, z * (d / 2 - 0.02)] }));
      g.add(box(0.1, 0.05, 0.1, mat('metalDark'), { pos: [x * (w / 2 - 0.08), 0.025, z * (d / 2 - 0.08)] }));
    }
  }
  g.add(box(0.12, 0.14, 0.04, mat('iron'), { pos: [0, 0.58, d / 2 + 0.03] }));
  g.add(box(0.42, 0.1, 0.012, mat('hazardYellow'), { pos: [0, 0.32, d / 2 + 0.006] }));
  for (const x of [-1, 1]) g.add(box(0.03, 0.06, 0.22, mat('metalDark'), { pos: [x * (w / 2 + 0.02), 0.5, 0] }));
  const colliders: LocalCollider[] = [{ kind: 'box', x: 0, z: 0, hw: w / 2 + 0.04, hd: d / 2 + 0.04 }];
  g.userData.colliders = colliders;
  return g;
}
