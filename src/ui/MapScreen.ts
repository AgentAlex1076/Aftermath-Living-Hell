import type * as THREE from 'three';
import { CONFIG } from '../data/config';
import type { Building } from '../gameplay/Building';
import { BIOME_LABEL } from '../world/Biomes';
import type { KnownStructure } from '../world/ChangeStore';
import type { World } from '../world/World';
import { el, q } from './dom';
import type { MapTiles } from './MapTiles';

const MIN_SCALE = 0.12;
const MAX_SCALE = 6;
const SCALE_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

/**
 * Full-screen map (M). Same orientation as the minimap and the camera, so "up" on the map is
 * "forward" in the game. Drag to pan, wheel to zoom; it follows you until you drag it away.
 */
export class MapScreen {
  private readonly root: HTMLDivElement;
  private readonly view: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stats: Record<'biome' | 'threat' | 'home', HTMLElement>;
  private readonly scaleBar: HTMLElement;
  private readonly scaleLabel: HTMLElement;
  private isOpen = false;
  private follow = true;
  private viewX = 0;
  private viewZ = 0;
  private scale = 1.4;
  private rot = 0;
  private drag: { x: number; y: number } | null = null;
  private lastStats = '';
  /** Structures whose ground has been revealed; checked every few frames until they are. */
  private readonly seen = new WeakSet<KnownStructure>();
  private frame = 0;

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly building: Building,
    private readonly tiles: MapTiles,
    onClose: () => void,
  ) {
    this.root = el('div', 'map-screen');
    this.root.dataset.uiCapture = '';
    this.root.innerHTML = `
      <div class="map-panel">
        <header class="map-head">
          <span class="map-title">MAP</span>
          <span class="map-stat" data-k="biome"></span>
          <span class="map-stat" data-k="threat"></span>
          <span class="map-stat" data-k="home"></span>
          <span class="map-actions">
            <button type="button" class="r-btn ghost small" data-a="me">ON ME</button>
            <button type="button" class="r-btn ghost small" data-a="home">HOME</button>
            <button type="button" class="r-btn ghost" data-a="close">CLOSE</button>
          </span>
        </header>
        <div class="map-view">
          <canvas></canvas>
          <div class="map-scale"><span></span><b></b></div>
        </div>
        <footer class="map-foot">
          <span class="map-key"><i class="k-hut"></i>Hut</span>
          <span class="map-key"><i class="k-ruin"></i>Ruin</span>
          <span class="map-key"><i class="k-lab"></i>Lab</span>
          <span class="map-key"><i class="k-threat"></i>Threat ring</span>
          <span class="map-hint"><kbd>DRAG</kbd> pan <kbd>WHEEL</kbd> zoom <kbd>M</kbd> / <kbd>ESC</kbd> close</span>
        </footer>
      </div>
    `;
    parent.appendChild(this.root);
    this.view = q(this.root, '.map-view');
    this.canvas = q<HTMLCanvasElement>(this.root, 'canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.stats = {
      biome: q(this.root, '[data-k="biome"]'),
      threat: q(this.root, '[data-k="threat"]'),
      home: q(this.root, '[data-k="home"]'),
    };
    this.scaleBar = q(this.root, '.map-scale span');
    this.scaleLabel = q(this.root, '.map-scale b');

    q(this.root, '[data-a="close"]').addEventListener('click', onClose);
    q(this.root, '[data-a="me"]').addEventListener('click', () => (this.follow = true));
    q(this.root, '[data-a="home"]').addEventListener('click', () => {
      this.follow = false;
      this.viewX = 0;
      this.viewZ = 0;
    });
    this.root.addEventListener('click', (e) => {
      if (e.target instanceof HTMLButtonElement) e.target.blur();
    });

    this.view.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.drag = { x: e.clientX, y: e.clientY };
      this.view.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.drag) return;
      const [dx, dz] = this.toWorld(e.clientX - this.drag.x, e.clientY - this.drag.y);
      this.drag = { x: e.clientX, y: e.clientY };
      if (dx === 0 && dz === 0) return;
      this.follow = false;
      this.viewX -= dx;
      this.viewZ -= dz;
    });
    window.addEventListener('mouseup', () => {
      this.drag = null;
      this.view.classList.remove('dragging');
    });
    this.view.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = this.view.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const [ax, az] = this.toWorld(cx, cy);
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, this.scale * Math.exp(-e.deltaY * 0.0015)));
      const [bx, bz] = this.toWorld(cx, cy, next);
      // Keep the point under the cursor fixed while zooming.
      this.viewX += ax - bx;
      this.viewZ += az - bz;
      this.scale = next;
      if (this.follow && (Math.abs(cx) > 4 || Math.abs(cy) > 4)) this.follow = false;
    }, { passive: false });
  }

  get open(): boolean {
    return this.isOpen;
  }

  setOpen(open: boolean): void {
    this.isOpen = open;
    this.root.classList.toggle('open', open);
    if (open) this.follow = true;
    else {
      this.drag = null;
      this.view.classList.remove('dragging');
    }
  }

  update(player: THREE.Vector3, facing: number, camForward: THREE.Vector3): void {
    if (!this.isOpen) return;
    this.rot = -Math.PI / 2 - Math.atan2(camForward.z, camForward.x);
    if (this.follow) {
      this.viewX = player.x;
      this.viewZ = player.z;
    }
    this.updateStats(player);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.view.clientWidth;
    const h = this.view.clientHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    const s = this.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0d0f0e';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(this.rot);
    ctx.scale(s, s);
    ctx.translate(-this.viewX, -this.viewZ);

    const reach = Math.hypot(w, h) / 2 / s + 4;
    const minX = this.viewX - reach;
    const maxX = this.viewX + reach;
    const minZ = this.viewZ - reach;
    const maxZ = this.viewZ + reach;
    this.drawGrid(ctx, minX, minZ, maxX, maxZ);
    this.tiles.draw(ctx, minX, minZ, maxX, maxZ, 6);

    const px = 1 / s;
    ctx.strokeStyle = 'rgba(242, 183, 5, 0.85)';
    ctx.lineWidth = 2 * px;
    ctx.setLineDash([6 * px, 4 * px]);
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.homeZone.radius, 0, Math.PI * 2);
    ctx.stroke();
    const rings = this.threatRings(Math.hypot(this.viewX, this.viewZ) + reach);
    ctx.strokeStyle = 'rgba(224, 48, 42, 0.6)';
    ctx.setLineDash([10 * px, 7 * px]);
    for (const r of rings) {
      ctx.beginPath();
      ctx.arc(0, 0, r.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const p of this.building.pieces) {
      if (p.def.kind !== 'foundation' || p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ) continue;
      ctx.save();
      ctx.translate(p.x, p.z);
      ctx.rotate(-p.rot);
      ctx.fillStyle = 'rgba(201, 168, 90, 0.85)';
      ctx.fillRect(-p.size.w / 2, -p.size.d / 2, p.size.w, p.size.d);
      ctx.restore();
    }
    const outline = Math.max(0.8, 1.5 * px);
    const recheck = ++this.frame % 20 === 0;
    for (const st of this.world.changes.structures()) {
      if (!this.seen.has(st)) {
        if (!recheck || !this.tiles.isExplored(st.x, st.z)) continue;
        this.seen.add(st);
      }
      if (st.x < minX || st.x > maxX || st.z < minZ || st.z > maxZ) continue;
      this.drawStructure(ctx, st.x, st.z, st.rot, st.w, st.d, st.kind === 'lab' ? '#cfd8d2' : '#9a8a78', outline);
    }
    for (const st of this.world.permanentStructures) {
      this.drawStructure(ctx, st.x, st.z, st.rot, Math.max(st.w, 10 * px), Math.max(st.d, 10 * px), '#f2b705', outline);
    }
    ctx.restore();

    this.drawRingLabels(ctx, rings, w, h);
    this.drawPlayer(ctx, player, facing, w, h);
    this.updateScaleBar();
  }

  /** World offset for a screen offset (CSS px), undoing the map's rotation. */
  private toWorld(sx: number, sy: number, scale = this.scale): [number, number] {
    const c = Math.cos(-this.rot);
    const n = Math.sin(-this.rot);
    return [(sx * c - sy * n) / scale, (sx * n + sy * c) / scale];
  }

  private toScreen(x: number, z: number, w: number, h: number): [number, number] {
    const dx = (x - this.viewX) * this.scale;
    const dz = (z - this.viewZ) * this.scale;
    const c = Math.cos(this.rot);
    const n = Math.sin(this.rot);
    return [w / 2 + dx * c - dz * n, h / 2 + dx * n + dz * c];
  }

  private drawGrid(ctx: CanvasRenderingContext2D, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const step = CONFIG.world.chunkSize * (this.scale < 0.5 ? 16 : 4);
    ctx.strokeStyle = 'rgba(241, 231, 207, 0.06)';
    ctx.lineWidth = 1 / this.scale;
    ctx.beginPath();
    for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step) {
      ctx.moveTo(x, minZ);
      ctx.lineTo(x, maxZ);
    }
    for (let z = Math.ceil(minZ / step) * step; z <= maxZ; z += step) {
      ctx.moveTo(minX, z);
      ctx.lineTo(maxX, z);
    }
    ctx.stroke();
  }

  /** Distances from the hut where threat crosses each whole 100%. */
  private threatRings(maxDist: number): { pct: number; radius: number }[] {
    const { threatFull, threatPerMetre } = CONFIG.world;
    const out: { pct: number; radius: number }[] = [];
    for (let k = 1; k <= 50; k++) {
      const radius = threatFull + (k - 1) / threatPerMetre;
      if (radius > maxDist) break;
      out.push({ pct: k * 100, radius });
    }
    return out;
  }

  private drawRingLabels(ctx: CanvasRenderingContext2D, rings: { pct: number; radius: number }[], w: number, h: number): void {
    // Label each ring at its point nearest the view centre (straight up from the hut when centred on it).
    const d = Math.hypot(this.viewX, this.viewZ);
    const [ux, uz] = d > 1 ? [this.viewX / d, this.viewZ / d] : this.toWorld(0, -1, 1);
    ctx.font = 'italic 800 13px "Barlow Condensed", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of rings) {
      const [sx, sy] = this.toScreen(ux * r.radius, uz * r.radius, w, h);
      if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
      const text = `THREAT ${r.pct}%`;
      const tw = ctx.measureText(text).width + 12;
      ctx.fillStyle = '#e0302a';
      ctx.fillRect(sx - tw / 2, sy - 9, tw, 18);
      ctx.fillStyle = '#f1e7cf';
      ctx.fillText(text, sx, sy + 1);
    }
  }

  private drawStructure(
    ctx: CanvasRenderingContext2D, x: number, z: number, rot: number, w: number, d: number, fill: string, outline: number,
  ): void {
    ctx.save();
    ctx.translate(x, z);
    ctx.rotate(-rot);
    ctx.fillStyle = fill;
    ctx.strokeStyle = '#0b0b0d';
    ctx.lineWidth = outline;
    ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, player: THREE.Vector3, facing: number, w: number, h: number): void {
    let [sx, sy] = this.toScreen(player.x, player.z, w, h);
    const a = Math.atan2(Math.cos(facing), Math.sin(facing)) + this.rot;
    const m = 18;
    const off = sx < m || sx > w - m || sy < m || sy > h - m;
    if (off) {
      // Off-screen: pin the arrow to the edge, pointing toward the player.
      sx = Math.min(w - m, Math.max(m, sx));
      sy = Math.min(h - m, Math.max(m, sy));
    }
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((off ? Math.atan2(sy - h / 2, sx - w / 2) : a) + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 8.5);
    ctx.lineTo(0, 4.5);
    ctx.lineTo(-8, 8.5);
    ctx.closePath();
    ctx.fillStyle = off ? '#f1e7cf' : '#f2b705';
    ctx.strokeStyle = '#0b0b0d';
    ctx.lineWidth = 2.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private updateScaleBar(): void {
    const metres = SCALE_STEPS.find((m) => m * this.scale >= 70) ?? SCALE_STEPS[SCALE_STEPS.length - 1];
    this.scaleBar.style.width = `${Math.round(metres * this.scale)}px`;
    this.scaleLabel.textContent = metres >= 1000 ? `${metres / 1000} KM` : `${metres} M`;
  }

  private updateStats(player: THREE.Vector3): void {
    const s = this.world.sample(player.x, player.z);
    const d = Math.hypot(player.x, player.z);
    const home = d < CONFIG.homeZone.radius ? 'HOME ZONE' : d >= 1000 ? `${(d / 1000).toFixed(2)} KM FROM HOME` : `${Math.round(d)} M FROM HOME`;
    const key = `${s.biome}|${Math.round(s.danger * 100)}|${home}`;
    if (key === this.lastStats) return;
    this.lastStats = key;
    this.stats.biome.innerHTML = `<b>${BIOME_LABEL[s.biome].toUpperCase()}</b>`;
    this.stats.threat.innerHTML = `THREAT <b>${Math.round(s.danger * 100)}%</b>`;
    this.stats.home.innerHTML = `<b>${home}</b>`;
  }
}
