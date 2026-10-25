import * as THREE from 'three';
import { el } from './dom';

export type FloatKind = 'word' | 'gain' | 'warn';

interface Floater {
  node: HTMLElement;
  pos: THREE.Vector3;
  /** Extra screen-space drop in px, so simultaneous pickups list instead of overlapping. */
  stackPx: number;
  life: number;
  maxLife: number;
  rise: number;
}

const _v = new THREE.Vector3();
const MAX = 40;

/** Comic onomatopoeia and "+12 WOOD" pickups anchored to world positions. */
export class FloatingText {
  private readonly root: HTMLDivElement;
  private readonly items: Floater[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('div', 'floaters');
    parent.appendChild(this.root);
  }

  /** `power` (damage dealt) scales comic words up: a shotgun blast shouts louder than a punch. */
  spawn(pos: THREE.Vector3, text: string, kind: FloatKind, color?: string, delay = 0, stack = 0, power = 0): void {
    const node = el('div', `floater floater-${kind}`);
    const inner = el('span');
    inner.textContent = text;
    node.appendChild(inner);
    if (color) node.style.setProperty('--c', color);
    if (power > 0) node.style.setProperty('--k', (0.8 + Math.min(power, 63) / 45).toFixed(2));
    node.style.setProperty('--r', `${(Math.random() - 0.5) * (kind === 'word' ? 18 : 6)}deg`);
    inner.style.animationDelay = `${delay}s`;
    node.style.opacity = '0';
    this.root.appendChild(node);
    const maxLife = kind === 'word' ? 0.75 : 1.4;
    const jitter = kind === 'gain' ? 0 : 0.5;
    this.items.push({
      node,
      stackPx: stack * 32,
      pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * jitter, 0, (Math.random() - 0.5) * jitter)),
      life: -delay,
      maxLife,
      rise: kind === 'word' ? 0.7 : 1.3,
    });
    while (this.items.length > MAX) this.items.shift()!.node.remove();
  }

  update(dt: number, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life += dt;
      if (f.life >= f.maxLife) {
        f.node.remove();
        this.items.splice(i, 1);
        continue;
      }
      if (f.life < 0) continue;
      const t = f.life / f.maxLife;
      _v.copy(f.pos);
      _v.y += (1 - (1 - t) * (1 - t)) * f.rise;
      _v.project(camera);
      const x = (_v.x * 0.5 + 0.5) * w;
      const y = (-_v.y * 0.5 + 0.5) * h + f.stackPx;
      f.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      f.node.style.opacity = String(t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1);
    }
  }

  clear(): void {
    for (const f of this.items) f.node.remove();
    this.items.length = 0;
  }
}
