import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { BIOME_LABEL } from '../world/Biomes';
import type { World } from '../world/World';
import type { Building } from '../gameplay/Building';
import type { Horde } from '../gameplay/Horde';
import { el, q } from './dom';

const SIZE = 196;
const RANGE = 58;
const MAP_RES = 2;
const REVEAL_RADIUS = 34;

/** Top-right minimap, rotated so "up" is the camera's forward. Unexplored ground stays dark. */
export class Minimap {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly caption: HTMLElement;
  private readonly threat: HTMLElement;
  private readonly base: HTMLCanvasElement;
  private readonly explored: HTMLCanvasElement;
  private readonly composite: HTMLCanvasElement;
  private readonly mapPx: number;
  private revealTimer = 0;
  private lastCaption = '';
  private dirty = true;

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly building: Building,
    private readonly horde: Horde,
  ) {
    this.root = el('div', 'minimap');
    this.root.innerHTML = `<canvas></canvas><div class="minimap-caption"><span class="mm-biome"></span><span class="mm-threat"></span></div>`;
    parent.appendChild(this.root);
    this.canvas = q<HTMLCanvasElement>(this.root, 'canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = SIZE * dpr;
    this.canvas.height = SIZE * dpr;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.caption = q(this.root, '.mm-biome');
    this.threat = q(this.root, '.mm-threat');

    const half = CONFIG.world.halfSize;
    this.mapPx = Math.round((half * 2) / MAP_RES);
    this.base = this.bake();
    this.explored = document.createElement('canvas');
    this.explored.width = this.explored.height = this.mapPx;
    this.composite = document.createElement('canvas');
    this.composite.width = this.composite.height = this.mapPx;
  }

  private bake(): HTMLCanvasElement {
    const half = CONFIG.world.halfSize;
    const c = document.createElement('canvas');
    c.width = c.height = this.mapPx;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(this.mapPx, this.mapPx);
    const col = new THREE.Color();
    for (let py = 0; py < this.mapPx; py++) {
      for (let px = 0; px < this.mapPx; px++) {
        const x = -half + (px + 0.5) * MAP_RES;
        const z = -half + (py + 0.5) * MAP_RES;
        this.world.biomes.groundColor(x, z, col);
        const t = this.world.biomes.toxicity(x, z);
        col.convertLinearToSRGB();
        const i = (py * this.mapPx + px) * 4;
        img.data[i] = Math.min(255, col.r * 255 * 1.25 + t * 20);
        img.data[i + 1] = Math.min(255, col.g * 255 * 1.25 + t * 60);
        img.data[i + 2] = Math.min(255, col.b * 255 * 1.25);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const { roadZ, roadWidth } = CONFIG.world;
    ctx.fillStyle = 'rgba(30, 30, 32, 0.95)';
    ctx.fillRect(0, (roadZ - roadWidth / 2 + half) / MAP_RES, this.mapPx, roadWidth / MAP_RES);
    return c;
  }

  private reveal(x: number, z: number): void {
    const half = CONFIG.world.halfSize;
    const ctx = this.explored.getContext('2d')!;
    const px = (x + half) / MAP_RES;
    const pz = (z + half) / MAP_RES;
    const r = REVEAL_RADIUS / MAP_RES;
    const g = ctx.createRadialGradient(px, pz, r * 0.55, px, pz, r);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, pz, r, 0, Math.PI * 2);
    ctx.fill();
    this.dirty = true;
  }

  private rebuildComposite(): void {
    const ctx = this.composite.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.mapPx, this.mapPx);
    ctx.drawImage(this.explored, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(this.base, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    this.dirty = false;
  }

  update(dt: number, player: THREE.Vector3, facing: number, camForward: THREE.Vector3): void {
    this.revealTimer -= dt;
    if (this.revealTimer <= 0) {
      this.revealTimer = 0.4;
      this.reveal(player.x, player.z);
    }
    if (this.dirty) this.rebuildComposite();

    const s = this.world.sample(player.x, player.z);
    const caption = `${BIOME_LABEL[s.biome].toUpperCase()}|${Math.round(s.danger * 100)}`;
    if (caption !== this.lastCaption) {
      this.lastCaption = caption;
      this.caption.textContent = BIOME_LABEL[s.biome].toUpperCase();
      this.threat.textContent = `THREAT ${Math.round(s.danger * 100)}%`;
      this.root.dataset.biome = s.biome;
    }

    const ctx = this.ctx;
    const half = CONFIG.world.halfSize;
    const scale = SIZE / 2 / RANGE;
    const rot = -Math.PI / 2 - Math.atan2(camForward.z, camForward.x);

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0d0f0e';
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.translate(-player.x, -player.z);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.composite, -half, -half, half * 2, half * 2);

    ctx.strokeStyle = 'rgba(242, 183, 5, 0.85)';
    ctx.lineWidth = 1.2 / scale * 1.6;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.arc(0, 0, CONFIG.homeZone.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const near = (x: number, z: number) => Math.abs(x - player.x) < RANGE * 1.5 && Math.abs(z - player.z) < RANGE * 1.5;
    for (const st of this.world.structures()) {
      if (!near(st.x, st.z)) continue;
      ctx.save();
      ctx.translate(st.x, st.z);
      ctx.rotate(-st.rot);
      ctx.fillStyle = st.kind === 'hut' ? '#f2b705' : st.kind === 'lab' ? '#cfd8d2' : '#9a8a78';
      ctx.strokeStyle = '#0b0b0d';
      ctx.lineWidth = 0.8;
      ctx.fillRect(-st.w / 2, -st.d / 2, st.w, st.d);
      ctx.strokeRect(-st.w / 2, -st.d / 2, st.w, st.d);
      ctx.restore();
    }
    for (const pass of ['foundation', 'other'] as const) {
      for (const p of this.building.pieces) {
        if ((p.def.kind === 'foundation') !== (pass === 'foundation') || !near(p.x, p.z)) continue;
        ctx.save();
        ctx.translate(p.x, p.z);
        ctx.rotate(-p.rot);
        if (pass === 'foundation') {
          ctx.fillStyle = 'rgba(201, 168, 90, 0.75)';
          ctx.fillRect(-p.size.w / 2, -p.size.d / 2, p.size.w, p.size.d);
        } else {
          ctx.fillStyle = p.def.kind === 'deployable' ? '#f1e7cf' : p.def.kind === 'door' ? '#f2b705' : '#1a1a1c';
          const d = Math.max(p.size.d, 0.6);
          ctx.fillRect(-p.size.w / 2, -d / 2, p.size.w, d);
        }
        ctx.restore();
      }
    }
    for (const n of this.world.nodes) {
      if (!near(n.x, n.z)) continue;
      ctx.fillStyle = n.def.minimapColor;
      ctx.beginPath();
      ctx.arc(n.x, n.z, Math.max(0.9, n.radius * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const c of this.world.containers) {
      if (!near(c.x, c.z)) continue;
      const open = c.interactable.enabled !== false;
      ctx.fillStyle = open ? '#f1e7cf' : '#55524b';
      ctx.strokeStyle = '#0b0b0d';
      ctx.lineWidth = 0.6;
      ctx.fillRect(c.x - 1.1, c.z - 1.1, 2.2, 2.2);
      ctx.strokeRect(c.x - 1.1, c.z - 1.1, 2.2, 2.2);
    }
    for (const e of this.horde.enemies) {
      if (!e.alive || e.cloaked || !near(e.position.x, e.position.z)) continue;
      ctx.fillStyle = e.def.color;
      ctx.strokeStyle = '#0b0b0d';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(e.position.x, e.position.z, Math.max(1.1, e.def.radius * 1.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // Player arrow, rotated by facing relative to the map.
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    const a = Math.atan2(fz, fx) + rot;
    ctx.save();
    ctx.translate(SIZE / 2, SIZE / 2);
    ctx.rotate(a + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6.5, 7);
    ctx.lineTo(0, 3.5);
    ctx.lineTo(-6.5, 7);
    ctx.closePath();
    ctx.fillStyle = '#f2b705';
    ctx.strokeStyle = '#0b0b0d';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
