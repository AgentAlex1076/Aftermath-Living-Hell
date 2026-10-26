import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { clamp, smoothstep } from '../core/math';
import type { Biomes } from '../world/Biomes';
import type { HeightField } from '../world/Height';

const WATER = new THREE.Color('#2d4650');
const TOXIC_WATER = new THREE.Color('#4f7a18');
const DEEP = new THREE.Color('#16262c');

/** Metres per map pixel. */
const RES = 2;
/** Each tile bakes one extra pixel on every side and overlaps its neighbours, hiding seams. */
const PAD = 1;
const S = CONFIG.world.chunkSize;
const PX = S / RES + PAD * 2;
/** Baked ground for tiles not drawn this long (ms) is dropped; the explored mask is kept. */
const EVICT_AFTER = 20000;

interface Tile {
  cx: number;
  cz: number;
  /** Where the player has been: alpha 1 = seen. The one part of a tile that can't be rebuilt. */
  explored: HTMLCanvasElement;
  base: HTMLCanvasElement | null;
  composite: HTMLCanvasElement | null;
  dirty: boolean;
  usedAt: number;
}

const tileKey = (cx: number, cz: number) => `${cx},${cz}`;

function canvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  return c;
}

/**
 * The explored map, one small canvas per chunk, so it grows with the endless world instead of
 * being one fixed image. Ground colour is baked lazily for tiles that are both seen and on screen.
 */
export class MapTiles {
  private readonly tiles = new Map<string, Tile>();
  private lastEvict = 0;

  constructor(private readonly biomes: Biomes, private readonly height?: HeightField) {}

  get count(): number {
    return this.tiles.size;
  }

  /** Whether the ground at a point has been revealed (reads one pixel of the explored mask). */
  isExplored(x: number, z: number): boolean {
    const cx = Math.floor(x / S);
    const cz = Math.floor(z / S);
    const t = this.tiles.get(tileKey(cx, cz));
    if (!t) return false;
    const px = Math.floor((x - cx * S) / RES) + PAD;
    const pz = Math.floor((z - cz * S) / RES) + PAD;
    return t.explored.getContext('2d', { willReadFrequently: true })!.getImageData(px, pz, 1, 1).data[3] > 100;
  }

  /** Fades in a circle of explored ground around a point. */
  reveal(x: number, z: number, radius: number): void {
    const r = radius / RES;
    for (let cx = Math.floor((x - radius) / S); cx <= Math.floor((x + radius) / S); cx++) {
      for (let cz = Math.floor((z - radius) / S); cz <= Math.floor((z + radius) / S); cz++) {
        const t = this.tile(cx, cz);
        const ctx = t.explored.getContext('2d', { willReadFrequently: true })!;
        const px = (x - cx * S) / RES + PAD;
        const pz = (z - cz * S) / RES + PAD;
        const g = ctx.createRadialGradient(px, pz, r * 0.55, px, pz, r);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, pz, r, 0, Math.PI * 2);
        ctx.fill();
        t.dirty = true;
      }
    }
  }

  /**
   * Draws explored ground overlapping a world-space rect into a context already transformed to
   * world metres. Bakes at most `bakeBudget` new tiles, so opening a big map fills in over a few frames.
   */
  draw(ctx: CanvasRenderingContext2D, minX: number, minZ: number, maxX: number, maxZ: number, bakeBudget = 3): void {
    const now = performance.now();
    const c0 = Math.floor(minX / S);
    const c1 = Math.floor(maxX / S);
    const r0 = Math.floor(minZ / S);
    const r1 = Math.floor(maxZ / S);
    const visible: Tile[] = [];
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > this.tiles.size) {
      for (const t of this.tiles.values()) if (t.cx >= c0 && t.cx <= c1 && t.cz >= r0 && t.cz <= r1) visible.push(t);
    } else {
      for (let cx = c0; cx <= c1; cx++) {
        for (let cz = r0; cz <= r1; cz++) {
          const t = this.tiles.get(tileKey(cx, cz));
          if (t) visible.push(t);
        }
      }
    }

    ctx.imageSmoothingEnabled = true;
    for (const t of visible) {
      t.usedAt = now;
      if (!t.base) {
        if (bakeBudget <= 0) continue;
        bakeBudget--;
        t.base = this.bake(t.cx, t.cz);
      }
      if (t.dirty || !t.composite) this.compose(t);
      ctx.drawImage(t.composite!, t.cx * S - PAD * RES, t.cz * S - PAD * RES, PX * RES, PX * RES);
    }

    if (now - this.lastEvict > 5000) {
      this.lastEvict = now;
      for (const t of this.tiles.values()) {
        if (t.base && now - t.usedAt > EVICT_AFTER) t.base = t.composite = null;
      }
    }
  }

  private tile(cx: number, cz: number): Tile {
    const key = tileKey(cx, cz);
    let t = this.tiles.get(key);
    if (!t) {
      t = { cx, cz, explored: canvas(), base: null, composite: null, dirty: true, usedAt: 0 };
      this.tiles.set(key, t);
    }
    return t;
  }

  private compose(t: Tile): void {
    t.composite ??= canvas();
    const ctx = t.composite.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, PX, PX);
    ctx.drawImage(t.explored, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(t.base!, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    t.dirty = false;
  }

  private bake(cx: number, cz: number): HTMLCanvasElement {
    const c = canvas();
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(PX, PX);
    const col = new THREE.Color();
    const x0 = cx * S - PAD * RES;
    const z0 = cz * S - PAD * RES;
    for (let py = 0; py < PX; py++) {
      for (let px = 0; px < PX; px++) {
        const x = x0 + (px + 0.5) * RES;
        const z = z0 + (py + 0.5) * RES;
        this.biomes.groundColor(x, z, col);
        let t = this.biomes.toxicity(x, z);
        const shade = 1 - clamp((this.height?.slopeDeg(x, z) ?? 0) / 70, 0, 0.42);
        col.multiplyScalar(shade);
        const depth = this.height?.waterDepth(x, z) ?? -1;
        if (depth > 0.05) {
          const toxic = t > 0.3 || this.height!.waterKind(x, z) === 'crater';
          col.copy(toxic ? TOXIC_WATER : WATER).lerp(DEEP, smoothstep(0.2, 1.6, depth) * 0.6);
          if (!toxic) t = 0;
        }
        col.convertLinearToSRGB();
        const i = (py * PX + px) * 4;
        img.data[i] = Math.min(255, col.r * 255 * 1.25 + t * 20);
        img.data[i + 1] = Math.min(255, col.g * 255 * 1.25 + t * 60);
        img.data[i + 2] = Math.min(255, col.b * 255 * 1.25);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (this.height) this.bakeLayout(ctx, cx, cz, x0, z0);
    return c;
  }

  /** Fields, yard floors and every road through the tile, drawn over the ground colour. */
  private bakeLayout(ctx: CanvasRenderingContext2D, cx: number, cz: number, x0: number, z0: number): void {
    const regions = this.height!.regions;
    ctx.save();
    ctx.scale(1 / RES, 1 / RES);
    ctx.translate(-x0, -z0);
    for (const reg of regions.regionsNear(cx * S + S / 2, cz * S + S / 2)) {
      for (const d of reg.decals) {
        if (d.kind !== 'field' && d.kind !== 'pad') continue;
        const ext = S / 2 + Math.max(d.w, d.d);
        if (Math.abs(d.x - (cx * S + S / 2)) > ext || Math.abs(d.z - (cz * S + S / 2)) > ext) continue;
        ctx.save();
        ctx.translate(d.x, d.z);
        ctx.rotate(-d.rot);
        ctx.fillStyle = d.kind === 'field' ? 'rgba(92, 74, 46, 0.85)' : 'rgba(110, 108, 100, 0.85)';
        ctx.fillRect(-d.w / 2, -d.d / 2, d.w, d.d);
        ctx.restore();
      }
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const road of regions.roadsIn(cx, cz)) {
      ctx.strokeStyle = road.kind === 'highway' ? 'rgba(28, 28, 30, 0.95)' : 'rgba(40, 40, 42, 0.9)';
      ctx.lineWidth = road.width;
      ctx.beginPath();
      for (let k = 0; k < road.n; k++) {
        if (k === 0) ctx.moveTo(road.pts[0], road.pts[1]);
        else ctx.lineTo(road.pts[k * 2], road.pts[k * 2 + 1]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}
