import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { BIOME_LABEL } from '../world/Biomes';
import type { World } from '../world/World';
import type { Building } from '../gameplay/Building';
import type { Horde } from '../gameplay/Horde';
import { el, q } from './dom';
import type { MapTiles } from './MapTiles';

const SIZE = 196;
const RANGE = 58;
const REVEAL_RADIUS = 34;

/** Top-right minimap, rotated so "up" is the camera's forward. Unexplored ground stays dark. */
export class Minimap {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly caption: HTMLElement;
  private readonly threat: HTMLElement;
  private revealTimer = 0;
  private lastCaption = '';

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly building: Building,
    private readonly horde: Horde,
    private readonly tiles: MapTiles,
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
  }

  update(dt: number, player: THREE.Vector3, facing: number, camForward: THREE.Vector3): void {
    this.revealTimer -= dt;
    if (this.revealTimer <= 0) {
      this.revealTimer = 0.4;
      this.tiles.reveal(player.x, player.z, REVEAL_RADIUS);
    }

    const s = this.world.sample(player.x, player.z);
    const caption = `${BIOME_LABEL[s.biome].toUpperCase()}|${Math.round(s.danger * 100)}`;
    if (caption !== this.lastCaption) {
      this.lastCaption = caption;
      this.caption.textContent = BIOME_LABEL[s.biome].toUpperCase();
      this.threat.textContent = `THREAT ${Math.round(s.danger * 100)}%`;
      this.root.dataset.biome = s.biome;
    }

    const ctx = this.ctx;
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

    const view = RANGE + 4;
    this.tiles.draw(ctx, player.x - view, player.z - view, player.x + view, player.z + view);

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
