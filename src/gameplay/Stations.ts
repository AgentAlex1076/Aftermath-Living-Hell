import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { sfx } from '../audio/AudioEngine';
import type { Collider, CollisionWorld } from '../physics/Collision';
import type { LightEmitter } from '../render/LightPool';
import type { FloatingText } from '../ui/FloatingText';
import type { Interactable } from '../world/Interactables';
import type { ContainerInstance, World } from '../world/World';

const PICKUP = 0.6;

export interface StationRig {
  id: string;
  name: string;
  object: THREE.Object3D;
  colliders: Collider[];
  lights: LightEmitter[];
  interact: Interactable;
  /** Kept in sync so crafting range and prompts follow the station. */
  anchor: THREE.Vector3;
  w: number;
  d: number;
  container?: ContainerInstance;
}

interface CarriedLight {
  emitter: LightEmitter;
  x: number;
  y: number;
  z: number;
}

/**
 * The hut's benches, crate and mattress. Mutants cannot break them.
 * Hold E to pick one up; E again, or build mode, sets it down inside the Home Zone.
 */
export class Stations {
  carrying: StationRig | null = null;
  private hold = 0;
  private holdingId: string | null = null;
  private rot = 0;
  private crateOpen = true;
  private readonly lightLocal = new Map<string, CarriedLight[]>();
  private px = 0;
  private pz = 0;

  constructor(
    private readonly stations: readonly StationRig[],
    private readonly collision: CollisionWorld,
    private readonly world: World,
    private readonly floaters: FloatingText,
    private readonly player: { readonly position: THREE.Vector3; readonly facing: number },
  ) {
    for (const s of stations) {
      const base = s.object.position;
      this.lightLocal.set(s.id, s.lights.map((e) => ({
        emitter: e,
        x: e.position.x - base.x,
        y: e.position.y - base.y,
        z: e.position.z - base.z,
      })));
    }
  }

  get carriedName(): string | null {
    return this.carrying?.name ?? null;
  }

  /** Hold progress 0..1 while picking a station up. */
  get pickupProgress(): number {
    return Math.min(1, this.hold / PICKUP);
  }

  /**
   * `down` accumulates the pickup hold on the station you're facing.
   * A press while already carrying tries to set it down in front of you.
   */
  poll(dt: number, down: boolean, hovered: Interactable | null, buildMode: boolean): { verb: string; label: string; consumed: boolean } | null {
    if (this.carrying) {
      if (!buildMode) {
        const facing = this.player.facing;
        this.preview(this.player.position.x + Math.sin(facing) * 1.7, this.player.position.z + Math.cos(facing) * 1.7, facing);
      }
      return { verb: buildMode ? 'Click to place' : 'Place', label: `${this.carrying.name}  ·  Home Zone`, consumed: false };
    }

    const station = hovered ? this.stations.find((s) => s.interact === hovered) : undefined;
    if (station && down) {
      if (this.holdingId !== station.id) {
        this.holdingId = station.id;
        this.hold = 0;
      }
      this.hold += dt;
      if (this.hold >= PICKUP) {
        this.hold = 0;
        this.holdingId = null;
        this.pickUp(station);
        return { verb: 'Picked up', label: station.name, consumed: true };
      }
      return { verb: 'Hold to move', label: station.name, consumed: false };
    }
    this.hold = 0;
    this.holdingId = null;
    return null;
  }

  rotate(): void {
    if (!this.carrying) return;
    this.rot = (this.rot + Math.PI / 2) % (Math.PI * 2);
    this.preview(this.px, this.pz, this.rot);
  }

  preview(x: number, z: number, rot = this.rot): void {
    const s = this.carrying;
    if (!s) return;
    const snap = 0.25;
    this.px = Math.round(x / snap) * snap;
    this.pz = Math.round(z / snap) * snap;
    this.rot = rot;
    const y = this.world.height.at(this.px, this.pz);
    s.object.position.set(this.px, y, this.pz);
    s.object.rotation.y = rot;
    s.anchor.set(this.px, y, this.pz);
    this.syncLights(s);
  }

  /** Sets the carried station down at the current preview. */
  drop(): boolean {
    return this.carrying ? this.placeAt(this.px, this.pz) : false;
  }

  placeAt(x: number, z: number): boolean {
    const s = this.carrying;
    if (!s) return false;
    this.preview(x, z, this.rot);
    const reason = this.reason(s, this.px, this.pz);
    if (reason) {
      this.floaters.spawn(new THREE.Vector3(this.px, s.anchor.y + 1.4, this.pz), reason, 'warn');
      return false;
    }
    s.colliders.push(...this.collision.addFromObject(s.object));
    if (s.container) {
      s.container.x = this.px;
      s.container.z = this.pz;
    }
    s.interact.enabled = s.container ? this.crateOpen : true;
    s.interact.position.copy(s.anchor);
    if (s.id !== 'crate') s.interact.position.z += 0.15;
    this.carrying = null;
    this.floaters.spawn(new THREE.Vector3(this.px, s.anchor.y + 1.2, this.pz), 'SET', 'word');
    sfx('build.place', { x: this.px, z: this.pz, volume: 0.6 });
    events.emit('toast', { text: `${s.name} set down.`, tone: 'info' });
    return true;
  }

  private pickUp(s: StationRig): void {
    this.collision.removeAll(s.colliders);
    s.colliders.length = 0;
    if (s.container) this.crateOpen = s.interact.enabled !== false;
    s.interact.enabled = false;
    this.rot = s.object.rotation.y;
    this.carrying = s;
    events.emit('toast', { text: `Carrying the ${s.name}. E to set it down inside the Home Zone.`, tone: 'info' });
    sfx('build.repair', { x: s.anchor.x, z: s.anchor.z, volume: 0.35, pitch: 0.8 });
  }

  private reason(s: StationRig, x: number, z: number): string {
    if (Math.hypot(x, z) > CONFIG.homeZone.radius - 0.4) return 'OUTSIDE THE HOME ZONE';
    if (this.world.height.waterDepth(x, z) > -0.05) return 'IN THE WATER';
    if (this.world.height.slopeDeg(x, z) > 22 && !this.world.height.isRoad(x, z)) return 'TOO STEEP';
    const swap = Math.abs(Math.sin(this.rot)) > 0.5;
    const hw = (swap ? s.d : s.w) / 2;
    const hd = (swap ? s.w : s.d) / 2;
    if (this.collision.overlapsBox(x - hw, x + hw, z - hd, z + hd)) return 'SOMETHING IN THE WAY';
    const p = this.player.position;
    if (Math.abs(p.x - x) < hw + 0.35 && Math.abs(p.z - z) < hd + 0.35) return "YOU'RE IN THE WAY";
    return '';
  }

  private syncLights(s: StationRig): void {
    const locals = this.lightLocal.get(s.id);
    if (!locals) return;
    const cos = Math.cos(this.rot);
    const sin = Math.sin(this.rot);
    const { x, y, z } = s.object.position;
    for (const l of locals) {
      l.emitter.position.set(x + l.x * cos + l.z * sin, y + l.y, z - l.x * sin + l.z * cos);
    }
  }
}
