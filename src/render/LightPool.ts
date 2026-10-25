import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { smoothstep } from '../core/math';

export type FlickerStyle = 'steady' | 'fire' | 'faulty' | 'pulse';

/** Light declared by a model in local space (`userData.lights`). No real light is created for it. */
export interface LightDesc {
  pos: readonly [number, number, number];
  color: string;
  intensity: number;
  distance: number;
  style: FlickerStyle;
  emissive?: THREE.MeshStandardMaterial;
}

export interface LightEmitter {
  readonly position: THREE.Vector3;
  readonly color: THREE.Color;
  readonly base: number;
  readonly distance: number;
  readonly style: FlickerStyle;
  readonly emissive: THREE.MeshStandardMaterial | null;
  readonly emissiveBase: number;
  readonly seed: number;
  glitchIn: number;
  glitchLeft: number;
  current: number;
  /** Gameplay-driven dimmer (0 = off), e.g. an oven that's gone cold. */
  gain: number;
}

const _v = new THREE.Vector3();

/**
 * A fixed number of real PointLights shared by any number of virtual emitters. Keeping the
 * light count constant avoids shader recompiles (hitches) as world chunks stream in and out.
 */
export class LightPool {
  private readonly lights: THREE.PointLight[] = [];
  private readonly emitters = new Set<LightEmitter>();
  private readonly ranked: LightEmitter[] = [];
  private time = 0;

  constructor(scene: THREE.Scene, size: number = CONFIG.lights.poolSize) {
    for (let i = 0; i < size; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push(l);
    }
  }

  /** Registers every light declared on `obj` (and its children). Call after the object is placed. */
  addFromObject(obj: THREE.Object3D): LightEmitter[] {
    const out: LightEmitter[] = [];
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const descs = o.userData.lights as LightDesc[] | undefined;
      if (!descs) return;
      for (const d of descs) {
        _v.set(d.pos[0], d.pos[1], d.pos[2]);
        o.localToWorld(_v);
        out.push(this.add(_v, d));
      }
    });
    return out;
  }

  add(position: THREE.Vector3, d: LightDesc): LightEmitter {
    const e: LightEmitter = {
      position: position.clone(),
      color: new THREE.Color(d.color),
      base: d.intensity,
      distance: d.distance,
      style: d.style,
      emissive: d.emissive ?? null,
      emissiveBase: d.emissive?.emissiveIntensity ?? 1,
      seed: Math.random() * 100,
      glitchIn: 2 + Math.random() * 5,
      glitchLeft: 0,
      current: d.intensity,
      gain: 1,
    };
    this.emitters.add(e);
    return e;
  }

  remove(e: LightEmitter): void {
    this.emitters.delete(e);
  }

  removeAll(list: readonly LightEmitter[]): void {
    for (const e of list) this.emitters.delete(e);
  }

  get emitterCount(): number {
    return this.emitters.size;
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;
    const maxRange = CONFIG.lights.maxRange;
    this.ranked.length = 0;

    for (const e of this.emitters) {
      const k = flickerFactor(e, this.time, dt) * e.gain;
      e.current = e.base * k;
      if (e.emissive) e.emissive.emissiveIntensity = e.emissiveBase * Math.max(k, 0.04);
      if (e.gain > 0.01 && e.position.distanceToSquared(focus) < maxRange * maxRange) this.ranked.push(e);
    }

    this.ranked.sort((a, b) => a.position.distanceToSquared(focus) - b.position.distanceToSquared(focus));

    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i];
      const e = this.ranked[i];
      if (!e) {
        light.intensity = 0;
        continue;
      }
      const dist = e.position.distanceTo(focus);
      light.position.copy(e.position);
      light.color.copy(e.color);
      light.distance = e.distance;
      light.intensity = e.current * smoothstep(maxRange, maxRange * 0.7, dist);
    }
  }
}

function flickerFactor(e: LightEmitter, t: number, dt: number): number {
  switch (e.style) {
    case 'fire':
      return 0.78 + 0.12 * Math.sin(t * 9.1 + e.seed) + 0.07 * Math.sin(t * 23.7 + e.seed * 2) + 0.05 * Math.sin(t * 3.3);
    case 'pulse':
      return 0.72 + 0.28 * Math.sin(t * 1.6 + e.seed);
    case 'faulty':
      if (e.glitchLeft > 0) {
        e.glitchLeft -= dt;
        if (e.glitchLeft <= 0) e.glitchIn = 1.5 + Math.random() * 6;
        return Math.sin(t * 61 + e.seed) > 0.1 ? 1 : 0.05;
      }
      e.glitchIn -= dt;
      if (e.glitchIn <= 0) e.glitchLeft = 0.15 + Math.random() * 0.5;
      return 0.94 + 0.06 * Math.sin(t * 50 + e.seed);
    default:
      return 1;
  }
}
