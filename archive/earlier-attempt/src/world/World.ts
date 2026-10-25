import * as THREE from 'three';
import { Rng } from '../core/rng';
import { Atmosphere } from './Atmosphere';
import { CollisionWorld } from './Collision';
import { GasZone } from './GasZone';
import { HomeZone } from './HomeZone';
import { buildHut, type Hut } from './Hut';
import type { Interactable } from './Interactable';
import { scatterGasSource, scatterProps } from './Scatter';
import { buildGround, buildRoad, makeHeightFn, WORLD_HALF_SIZE, type HeightFn, type TerrainLayout } from './Terrain';

export const HOME_ZONE_RADIUS = 30;

export class World {
  readonly collision = new CollisionWorld();
  readonly heightAt: HeightFn;
  readonly homeZone: HomeZone;
  readonly gasZones: GasZone[] = [];
  readonly interactables: Interactable[];
  readonly occluders: THREE.Object3D[];
  readonly atmosphere: Atmosphere;
  readonly spawnPoint: THREE.Vector3;
  private hut: Hut;
  private debugColliders: THREE.Object3D | null = null;

  constructor(
    private scene: THREE.Scene,
    readonly seed: number,
  ) {
    const rng = new Rng(seed);
    const gasCenters = [0, 1, 2].map((i) => {
      const angle = rng.range(0, Math.PI * 2) + i * 2.1;
      const dist = rng.range(42, 85);
      return { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist, r: rng.range(8, 12) };
    });

    const layout: TerrainLayout = {
      seed,
      roadZ: 14 + rng.range(-3, 3),
      roadHalfWidth: 3.5,
      homeRadiusFlat: 9,
      stains: gasCenters,
    };
    this.heightAt = makeHeightFn(layout);
    this.atmosphere = new Atmosphere(scene);

    scene.add(buildGround(layout, this.heightAt));
    scene.add(buildRoad(layout, rng.fork()));

    this.hut = buildHut(rng.fork());
    scene.add(this.hut.group);
    for (const c of this.hut.colliders) this.collision.addBox(c);
    this.spawnPoint = this.hut.spawn.clone();
    this.interactables = [...this.hut.interactables];

    this.homeZone = new HomeZone(new THREE.Vector3(0, 0, 0), HOME_ZONE_RADIUS, this.heightAt);
    scene.add(this.homeZone.mesh);

    const scatterCtx = {
      rng: rng.fork(),
      layout,
      heightAt: this.heightAt,
      collision: this.collision,
      keepClear: [{ x: 0, z: 0, r: 9 }, ...gasCenters.map((g) => ({ x: g.x, z: g.z, r: g.r * 0.6 }))],
    };
    const scatter = scatterProps(scatterCtx);
    scene.add(scatter.group);

    for (const g of gasCenters) {
      const zone = new GasZone(new THREE.Vector3(g.x, 0, g.z), g.r, rng.fork(), this.heightAt);
      this.gasZones.push(zone);
      scene.add(zone.group);
      scatterGasSource(scatterCtx, g.x, g.z, g.r, scatter.group);
    }

    const half = WORLD_HALF_SIZE;
    this.collision.addBox({ minX: -half - 5, maxX: half + 5, minZ: -half - 5, maxZ: -half });
    this.collision.addBox({ minX: -half - 5, maxX: half + 5, minZ: half, maxZ: half + 5 });
    this.collision.addBox({ minX: -half - 5, maxX: -half, minZ: -half, maxZ: half });
    this.collision.addBox({ minX: half, maxX: half + 5, minZ: -half, maxZ: half });

    this.occluders = [...this.hut.occluders, ...scatter.occluders];
  }

  gasZoneAt(p: THREE.Vector3) {
    return this.gasZones.find((z) => z.contains(p)) ?? null;
  }

  nearestInteractable(p: THREE.Vector3) {
    let best: Interactable | null = null;
    let bestDist = Infinity;
    for (const it of this.interactables) {
      const d = Math.hypot(p.x - it.position.x, p.z - it.position.z);
      if (d <= it.radius && d < bestDist) {
        best = it;
        bestDist = d;
      }
    }
    return best;
  }

  setCollidersVisible(visible: boolean) {
    if (visible && !this.debugColliders) {
      this.debugColliders = this.collision.buildDebugView(this.heightAt);
      this.scene.add(this.debugColliders);
    }
    if (this.debugColliders) this.debugColliders.visible = visible;
  }

  get collidersVisible() {
    return this.debugColliders?.visible ?? false;
  }

  update(dt: number, time: number, focus: THREE.Vector3, raidActive: boolean) {
    this.atmosphere.update(dt, time, focus);
    this.homeZone.update(dt, time, raidActive);
    for (const zone of this.gasZones) zone.update(time);

    const flicker = Math.sin(time * 13) * Math.sin(time * 7.3) * Math.sin(time * 2.1);
    this.hut.lamp.intensity = 40 + flicker * 10 + (Math.sin(time * 41) > 0.97 ? -25 : 0);
    this.hut.ovenLight.intensity = 6 + Math.sin(time * 9) * 1.2 + Math.sin(time * 23) * 0.6;
  }
}
