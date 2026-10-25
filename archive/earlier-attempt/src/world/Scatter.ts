import * as THREE from 'three';
import { Rng } from '../core/rng';
import { ModelRegistry } from '../models/ModelRegistry';
import type { CollisionWorld } from './Collision';
import { WORLD_HALF_SIZE, type HeightFn, type TerrainLayout } from './Terrain';

export interface ScatterResult {
  group: THREE.Group;
  /** Tall props that should fade when they hide the player. */
  occluders: THREE.Object3D[];
}

interface ScatterContext {
  rng: Rng;
  layout: TerrainLayout;
  heightAt: HeightFn;
  collision: CollisionWorld;
  keepClear: { x: number; z: number; r: number }[];
}

function isClear(ctx: ScatterContext, x: number, z: number, margin: number, allowRoad = false) {
  if (!allowRoad && Math.abs(z - ctx.layout.roadZ) < ctx.layout.roadHalfWidth + margin) return false;
  for (const k of ctx.keepClear) {
    if (Math.hypot(x - k.x, z - k.z) < k.r + margin) return false;
  }
  return true;
}

function randomPoint(ctx: ScatterContext, margin: number, allowRoad = false, tries = 30): [number, number] | null {
  const extent = WORLD_HALF_SIZE - 4;
  for (let i = 0; i < tries; i++) {
    const x = ctx.rng.range(-extent, extent);
    const z = ctx.rng.range(-extent, extent);
    if (isClear(ctx, x, z, margin, allowRoad)) return [x, z];
  }
  return null;
}

export function scatterProps(ctx: ScatterContext): ScatterResult {
  const group = new THREE.Group();
  group.name = 'scatter';
  const occluders: THREE.Object3D[] = [];
  const { rng, heightAt, collision } = ctx;

  const place = (obj: THREE.Object3D, x: number, z: number, rotY = rng.range(0, Math.PI * 2)) => {
    obj.position.set(x, heightAt(x, z), z);
    obj.rotation.y = rotY;
    group.add(obj);
    return obj;
  };

  for (let i = 0; i < 150; i++) {
    const p = randomPoint(ctx, 2);
    if (!p) continue;
    const tree = place(ModelRegistry.create('nature.deadTree', { seed: rng.int(1, 1e9) }), p[0], p[1]);
    collision.addCircle({ x: p[0], z: p[1], r: 0.3 });
    occluders.push(tree);
  }

  for (let i = 0; i < 90; i++) {
    const p = randomPoint(ctx, 1.5);
    if (!p) continue;
    const rock = place(ModelRegistry.create('nature.rock', { seed: rng.int(1, 1e9) }), p[0], p[1]);
    const r = (rock.userData.radius as number) ?? 0.8;
    collision.addCircle({ x: p[0], z: p[1], r: r * 0.85 });
  }

  for (let i = 0; i < 30; i++) {
    const p = randomPoint(ctx, 1.5);
    if (!p) continue;
    place(ModelRegistry.create('prop.rubble', { seed: rng.int(1, 1e9) }), p[0], p[1]);
    collision.addCircle({ x: p[0], z: p[1], r: 0.7 });
  }

  for (let i = 0; i < 9; i++) {
    const x = rng.range(-WORLD_HALF_SIZE + 10, WORLD_HALF_SIZE - 10);
    const z = ctx.layout.roadZ + rng.range(-1.8, 1.8);
    if (!isClear(ctx, x, z, 3, true)) continue;
    const rot = rng.range(-0.35, 0.35) + (rng.chance(0.5) ? 0 : Math.PI);
    const car = place(ModelRegistry.create('prop.wreckedCar', { seed: rng.int(1, 1e9) }), x, z, rot);
    occluders.push(car);
    for (const along of [-1.4, 0, 1.4]) {
      collision.addCircle({ x: x + Math.cos(rot) * along, z: z - Math.sin(rot) * along, r: 0.95 });
    }
  }

  for (let i = 0; i < 10; i++) {
    const p = randomPoint(ctx, 2);
    if (!p) continue;
    const count = rng.int(1, 3);
    for (let j = 0; j < count; j++) {
      const x = p[0] + rng.range(-1.2, 1.2);
      const z = p[1] + rng.range(-1.2, 1.2);
      place(ModelRegistry.create('prop.toxicBarrel', { seed: rng.int(1, 1e9) }), x, z);
      collision.addCircle({ x, z, r: 0.32 });
    }
  }

  return { group, occluders };
}

/** Leaking barrels around a gas pocket so the source of the gas reads at a glance. */
export function scatterGasSource(ctx: ScatterContext, cx: number, cz: number, radius: number, group: THREE.Group) {
  const { rng, heightAt, collision } = ctx;
  const count = rng.int(5, 8);
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(1.5, radius * 0.55);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const barrel = ModelRegistry.create('prop.toxicBarrel', { seed: rng.int(1, 1e9) });
    barrel.position.set(x, heightAt(x, z), z);
    barrel.rotation.y = rng.range(0, Math.PI * 2);
    if (rng.chance(0.4)) {
      barrel.rotation.z = Math.PI / 2;
      barrel.position.y += 0.3;
    }
    group.add(barrel);
    collision.addCircle({ x, z, r: 0.4 });
  }
}
