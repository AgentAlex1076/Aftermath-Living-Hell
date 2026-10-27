import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { clamp, lerp } from '../core/math';
import { sfx } from '../audio/AudioEngine';
import { buildCure } from '../models/cure';
import type { PlayerAnimator } from '../entities/PlayerAnimator';
import type { LightEmitter, LightPool } from '../render/LightPool';
import type { Debris } from '../render/Debris';
import type { FloatingText } from '../ui/FloatingText';
import type { World } from '../world/World';
import type { Building } from './Building';

const C = CONFIG.cure;

/** What the horde chases and, while the flask is intact and hung, what it can break. */
export interface CureTarget {
  readonly x: number;
  readonly z: number;
  readonly attackable: boolean;
  damage(amount: number): void;
}

export interface CureContext {
  scene: THREE.Scene;
  lights: LightPool;
  world: World;
  building: Building;
  debris: Debris;
  floaters: FloatingText;
  player: { readonly position: THREE.Vector3; readonly facing: number };
  onLost: () => void;
}

type Mode = 'hung' | 'carried' | 'shattered';

const HAND = new THREE.Vector3(0.04, 0.06, 0.02);

/**
 * The cure: a chained flask of cyan serum. Hung, it is the horde's objective.
 * Carried, they come for whoever holds it. Shattered, you have half a minute to reseal it.
 */
export class Cure implements CureTarget {
  readonly model = buildCure();
  private readonly light: LightEmitter;
  private readonly bar: THREE.Sprite;
  private readonly barCtx: CanvasRenderingContext2D;
  private readonly barTex: THREE.CanvasTexture;
  private mode: Mode = 'hung';
  private hp: number = C.hp;
  private readonly maxHp = C.hp;
  private ax = 0;
  private az = 0;
  private ay = 0;
  private breach = 0;
  private breached = false;
  private lost = false;
  private channel = 0;
  private channelKind: 'unhook' | 'repair' | null = null;
  /** The key that finished a hold must be released before the next hold starts. */
  private waitUp = false;
  private beat = 0.4;
  private siren = 0;
  private crackStage = 0;
  private barShown = -1;
  private time = 0;
  previewOn = false;
  private inHand = false;

  constructor(private readonly ctx: CureContext) {
    const roof = ctx.building.roofOver(0, 0);
    this.ay = roof ? roof.y + 0.04 : ctx.world.height.at(0, 0) + CONFIG.building.wallHeight;
    ctx.scene.add(this.model.root);
    this.placeMount(0, this.ay, 0);

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    this.barCtx = canvas.getContext('2d')!;
    this.barTex = new THREE.CanvasTexture(canvas);
    this.bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.barTex, transparent: true, depthTest: false }));
    this.bar.scale.set(0.9, 0.22, 1);
    this.bar.position.y = 0.48;
    this.bar.renderOrder = 12;
    this.bar.visible = false;
    this.model.flask.add(this.bar);

    this.light = ctx.lights.add(new THREE.Vector3(0, this.ay - 0.7, 0), {
      pos: [0, 0, 0], color: '#3ad7ff', intensity: 22, distance: 11, style: 'pulse', emissive: this.model.serumMat,
    });
    this.syncVisuals(true);
  }

  get x(): number {
    return this.mode === 'carried' ? this.ctx.player.position.x : this.ax;
  }

  get z(): number {
    return this.mode === 'carried' ? this.ctx.player.position.z : this.az;
  }

  get attackable(): boolean {
    return this.mode === 'hung' && this.hp > 0;
  }

  get carried(): boolean {
    return this.mode === 'carried';
  }

  get alerting(): boolean {
    return this.breached && !this.lost;
  }

  get secondsLeft(): number {
    return this.breach;
  }

  /** 0..1 while a hold is in progress, or null when the prompt is a tap. */
  get holdProgress(): number | null {
    if (!this.channelKind) return null;
    const need = this.channelKind === 'repair' ? C.repairTime : C.unhookTime;
    return clamp(this.channel / need, 0, 1);
  }

  damage(amount: number): void {
    if (!this.attackable || amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    const stage = this.hp > this.maxHp * 0.66 ? 0 : this.hp > this.maxHp * 0.33 ? 1 : 2;
    if (stage !== this.crackStage) {
      this.crackStage = stage;
      sfx('cure.crack', { x: this.ax, z: this.az, pitch: 1.15 - stage * 0.18 });
    } else {
      sfx('cure.crack', { x: this.ax, z: this.az, volume: 0.45, pitch: 1.3 });
    }
    this.ctx.debris.burst(this.ax, this.ay - 0.7, this.az, '#7ef6ff', 8);
    this.ctx.floaters.spawn(new THREE.Vector3(this.ax, this.ay - 0.2, this.az), 'KRSSHH!', 'word', '#7ef6ff', 0, 0, amount);
    events.emit('camera:shake', { amount: 0.12 });
    this.paintBar();
    if (this.hp <= 0) this.shatter();
    else this.syncVisuals(false);
  }

  /**
   * Call once per sim tick, before the generic E press.
   * Returns a prompt when the cure wants the interact key, and whether it already consumed a hold.
   */
  poll(dt: number, down: boolean): { verb: string; label: string; consumed: boolean } | null {
    this.time += dt;
    this.tickBreach(dt);
    this.tickVapor();
    this.followLight();

    if (this.lost) return null;
    if (!down) this.waitUp = false;
    const p = this.ctx.player.position;
    const dist = Math.hypot(p.x - this.ax, p.z - this.az);
    const holding = down && !this.waitUp;

    if (this.mode === 'shattered') {
      if (dist < 2.3) {
        if (holding) {
          this.channelKind = 'repair';
          this.channel += dt;
          if (this.channel >= C.repairTime) {
            this.channel = 0;
            this.channelKind = null;
            this.waitUp = true;
            this.reseal();
            return { verb: 'Sealed', label: 'the cure', consumed: true };
          }
        } else if (this.channelKind === 'repair') {
          this.channel = 0;
          this.channelKind = null;
        }
        const pct = Math.round(clamp(this.channel / C.repairTime, 0, 1) * 100);
        return { verb: 'Hold to seal', label: pct > 0 ? `the cure  ${pct}%` : 'the cure', consumed: false };
      }
      if (this.channelKind === 'repair') {
        this.channel = 0;
        this.channelKind = null;
      }
      return null;
    }

    if (this.mode === 'hung' && dist < 1.65) {
      if (holding) {
        this.channelKind = 'unhook';
        this.channel += dt;
        if (this.channel >= C.unhookTime) {
          this.channel = 0;
          this.channelKind = null;
          this.waitUp = true;
          this.take();
          return { verb: 'Unhooked', label: 'the cure', consumed: true };
        }
      } else if (this.channelKind === 'unhook') {
        this.channel = 0;
        this.channelKind = null;
      }
      return { verb: 'Hold to unhook', label: 'the cure', consumed: false };
    }

    if (this.channelKind) {
      this.channel = 0;
      this.channelKind = null;
    }

    if (this.mode === 'carried') {
      return { verb: this.previewOn ? 'Click to hang' : 'Hang', label: 'the cure  ·  E on a beam, or B', consumed: false };
    }
    return null;
  }

  /** Tap E while carrying: hang on the beam or wall in front of you. */
  hangInFront(): boolean {
    const p = this.ctx.player.position;
    const x = p.x + Math.sin(this.ctx.player.facing) * 0.85;
    const z = p.z + Math.cos(this.ctx.player.facing) * 0.85;
    return this.hangAt(x, z);
  }

  /** Build-mode ghost: show the flask where a click would hang it. */
  preview(x: number, z: number): void {
    this.previewOn = true;
    const spot = this.hangPoint(x, z);
    this.model.root.visible = true;
    if (this.inHand) this.stowFlask();
    if (spot) this.placeMount(spot.x, spot.y, spot.z);
    else this.placeMount(x, this.ctx.world.height.at(x, z) + CONFIG.building.wallHeight, z);
    this.model.serumMat.emissive.set(spot ? '#3ad7ff' : '#ff5a4a');
  }

  clearPreview(): void {
    if (!this.previewOn) return;
    this.previewOn = false;
    this.model.serumMat.emissive.set('#3ad7ff');
    if (this.mode === 'carried') this.model.root.visible = false;
    else this.placeMount(this.ax, this.ay, this.az);
  }

  /** Left click in build mode. */
  hangAt(x: number, z: number): boolean {
    const spot = this.hangPoint(x, z);
    if (!spot) {
      this.ctx.floaters.spawn(new THREE.Vector3(x, 1.6, z), this.hangReason(x, z), 'warn');
      return false;
    }
    this.previewOn = false;
    this.hang(spot.x, spot.y, spot.z);
    return true;
  }

  /** Puts the flask in the right hand. Idempotent. */
  present(animator: PlayerAnimator): void {
    if (this.mode !== 'carried' || this.previewOn) return;
    if (this.inHand) return;
    this.inHand = true;
    this.model.flask.scale.setScalar(0.62);
    this.model.flask.position.copy(HAND);
    this.model.flask.rotation.set(0.4, 0.2, 0.3);
    animator.setHeld(this.model.flask, 'tool');
  }

  /** Parents the flask back under its chains before another held item takes the hand. */
  releaseHand(): void {
    if (!this.inHand) return;
    this.stowFlask();
  }

  private take(): void {
    this.mode = 'carried';
    this.model.root.visible = false;
    this.model.vapor.visible = false;
    events.emit('toast', { text: 'The cure is in your hands. They will come for you.', tone: 'warn' });
    sfx('cure.unhook', { x: this.ax, z: this.az });
  }

  private hang(x: number, y: number, z: number): void {
    this.mode = 'hung';
    this.previewOn = false;
    this.model.root.visible = true;
    this.stowFlask();
    this.placeMount(x, y, z);
    this.ax = x;
    this.ay = y;
    this.az = z;
    this.syncVisuals(false);
    this.ctx.floaters.spawn(new THREE.Vector3(x, y - 0.3, z), 'CLINK', 'word', '#7ef6ff');
    sfx('cure.hang', { x, z });
    events.emit('toast', { text: 'The cure is hung. The horde will go for it.', tone: 'info' });
  }

  private shatter(): void {
    this.mode = 'shattered';
    this.breached = true;
    this.breach = C.countdown;
    this.beat = 0.2;
    this.siren = 0;
    this.syncVisuals(false);
    this.model.vapor.visible = true;
    this.ctx.debris.burst(this.ax, this.ay - 0.75, this.az, '#bff6ff', 22);
    events.emit('camera:shake', { amount: 0.45 });
    events.emit('toast', { text: 'The cure shattered. Seal it before the vapor takes you.', tone: 'danger' });
    sfx('cure.shatter', { x: this.ax, z: this.az });
    sfx('cure.alarm', { x: this.ax, z: this.az, volume: 1.1 });
  }

  private reseal(): void {
    this.hp = this.maxHp;
    this.crackStage = 0;
    this.mode = 'hung';
    this.breached = false;
    this.breach = 0;
    this.model.vapor.visible = false;
    this.syncVisuals(true);
    this.ctx.debris.burst(this.ax, this.ay - 0.7, this.az, '#7ef6ff', 12);
    this.ctx.floaters.spawn(new THREE.Vector3(this.ax, this.ay - 0.2, this.az), 'SEALED', 'word', '#7ef6ff');
    events.emit('toast', { text: 'The flask is whole again. The alarm dies.', tone: 'info' });
    sfx('cure.seal', { x: this.ax, z: this.az });
    events.emit('camera:shake', { amount: 0.08 });
  }

  private tickBreach(dt: number): void {
    if (!this.breached || this.lost) return;
    this.breach = Math.max(0, this.breach - dt);
    this.beat -= dt;
    if (this.beat <= 0) {
      const u = 1 - this.breach / C.countdown;
      sfx('cure.heart', { pitch: 1 + u * 0.5, volume: 0.4 + u * 0.45 });
      this.beat = lerp(0.92, 0.38, u);
    }
    this.siren -= dt;
    if (this.siren <= 0) {
      sfx('cure.alarm', { x: this.ax, z: this.az, volume: 0.7 });
      this.siren = 1.7;
    }
    if (this.breach <= 0) {
      this.lost = true;
      this.ctx.onLost();
    }
  }

  private tickVapor(): void {
    if (!this.model.vapor.visible) return;
    const t = this.time;
    this.model.vapor.children.forEach((puff, i) => {
      const wobble = Math.sin(t * 1.4 + i) * 0.12;
      puff.position.set(Math.cos(t * 0.7 + i) * 0.15, 0.15 + i * 0.2 + wobble, Math.sin(t * 0.9 + i * 1.7) * 0.15);
      const s = 0.85 + Math.sin(t * 2 + i) * 0.12;
      puff.scale.setScalar(s);
    });
  }

  private followLight(): void {
    const flask = this.model.flask;
    const world = flask.getWorldPosition(new THREE.Vector3());
    this.light.position.copy(world);
    this.light.gain = this.mode === 'shattered' ? 0.35 : 1;
  }

  private placeMount(x: number, y: number, z: number): void {
    this.model.root.position.set(x, y, z);
  }

  private stowFlask(): void {
    this.inHand = false;
    this.model.flask.scale.setScalar(1);
    this.model.flask.position.set(0, -0.86, 0);
    this.model.flask.rotation.set(0, 0, 0);
    this.model.root.add(this.model.flask);
  }

  private hangPoint(x: number, z: number): { x: number; y: number; z: number } | null {
    if (Math.hypot(x, z) > C.hangRadius) return null;
    const roof = this.ctx.building.roofOver(x, z);
    if (roof) return { x, y: roof.y + 0.02, z };
    const wall = this.ctx.building.nearestEdge(x, z, 1.45);
    if (!wall) return null;
    const dx = x - wall.x;
    const dz = z - wall.z;
    const len = Math.hypot(dx, dz) || 1;
    const hx = wall.x + (dx / len) * 0.42;
    const hz = wall.z + (dz / len) * 0.42;
    return { x: hx, y: wall.y + CONFIG.building.wallHeight - 0.08, z: hz };
  }

  private hangReason(x: number, z: number): string {
    if (Math.hypot(x, z) > C.hangRadius) return 'TOO FAR FROM THE HUT';
    return 'NEED A ROOF OR A WALL';
  }

  private syncVisuals(full: boolean): void {
    const gone = this.mode === 'shattered';
    for (const g of this.model.glass) g.visible = !gone;
    this.model.serum.visible = !gone;
    this.model.shards.visible = gone;
    this.model.cracks.forEach((c, i) => {
      c.visible = !gone && i < this.crackStage;
    });
    if (full) this.paintBar();
    else this.paintBar();
    this.bar.visible = this.mode !== 'carried' && this.hp < this.maxHp - 0.5;
  }

  private paintBar(): void {
    const frac = clamp(this.hp / this.maxHp, 0, 1);
    if (Math.abs(frac - this.barShown) < 0.01 && this.barShown >= 0) return;
    this.barShown = frac;
    const g = this.barCtx;
    g.clearRect(0, 0, 128, 32);
    g.fillStyle = '#14120e';
    g.fillRect(4, 8, 120, 16);
    g.fillStyle = frac > 0.55 ? '#3ad7ff' : frac > 0.25 ? '#e3b21b' : '#e0302a';
    g.fillRect(6, 10, 116 * frac, 12);
    g.strokeStyle = '#1a120c';
    g.lineWidth = 3;
    g.strokeRect(4, 8, 120, 16);
    this.barTex.needsUpdate = true;
    this.bar.visible = this.mode !== 'carried' && frac < 0.995;
  }
}
