import * as THREE from 'three';
import { Rng } from '../core/rng';
import type { HeightFn } from './Terrain';

let softTexture: THREE.Texture | null = null;

function getSoftTexture() {
  if (softTexture) return softTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  softTexture = new THREE.CanvasTexture(canvas);
  softTexture.colorSpace = THREE.SRGBColorSpace;
  return softTexture;
}

interface Puff {
  sprite: THREE.Sprite;
  angle: number;
  dist: number;
  speed: number;
  baseY: number;
  phase: number;
}

/** A pocket of toxic gas. Drains the gas mask filter while the player stands inside. */
export class GasZone {
  readonly group = new THREE.Group();
  private puffs: Puff[] = [];
  private light: THREE.PointLight;

  constructor(
    readonly center: THREE.Vector3,
    readonly radius: number,
    rng: Rng,
    heightAt: HeightFn,
  ) {
    const y = heightAt(center.x, center.z);
    const count = Math.round(radius * 3.2);
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: getSoftTexture(),
        color: new THREE.Color().setHSL(0.24 + rng.range(-0.03, 0.03), 0.45, rng.range(0.28, 0.4)),
        transparent: true,
        opacity: rng.range(0.22, 0.4),
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      const s = rng.range(4, 8);
      sprite.scale.set(s, s * 0.6, 1);
      const puff: Puff = {
        sprite,
        angle: rng.range(0, Math.PI * 2),
        dist: Math.sqrt(rng.next()) * radius * 0.85,
        speed: rng.range(0.03, 0.12) * (rng.chance(0.5) ? 1 : -1),
        baseY: y + rng.range(0.6, 2.4),
        phase: rng.range(0, Math.PI * 2),
      };
      this.puffs.push(puff);
      this.group.add(sprite);
    }
    this.light = new THREE.PointLight(0x9cff4a, 18, radius * 2.4, 1.6);
    this.light.position.set(center.x, y + 1.5, center.z);
    this.group.add(this.light);
  }

  contains(p: THREE.Vector3) {
    return Math.hypot(p.x - this.center.x, p.z - this.center.z) <= this.radius;
  }

  update(time: number) {
    for (const p of this.puffs) {
      const a = p.angle + time * p.speed;
      p.sprite.position.set(
        this.center.x + Math.cos(a) * p.dist,
        p.baseY + Math.sin(time * 0.4 + p.phase) * 0.3,
        this.center.z + Math.sin(a) * p.dist,
      );
    }
    this.light.intensity = 16 + Math.sin(time * 1.3) * 4;
  }
}
