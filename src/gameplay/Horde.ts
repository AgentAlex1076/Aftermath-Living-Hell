import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { damp, smoothstep, wrapAngle } from '../core/math';
import { audio, sfx } from '../audio/AudioEngine';
import { ENEMIES, type EnemyDef, type EnemyId } from '../data/enemies';
import { ITEMS, type ItemDef } from '../data/items';
import type { ItemAmount } from '../data/loot';
import { Enemy, dampEnemyFacing } from '../entities/Enemy';
import type { Player } from '../entities/Player';
import { HALF_TAG, type CollisionWorld } from '../physics/Collision';
import { CLIFF_TAG } from '../world/Height';
import { endPoint, pointAlong, type Traversal } from '../world/Traversal';
import type { Debris } from '../render/Debris';
import type { FloatingText } from '../ui/FloatingText';
import type { World } from '../world/World';
import { BUILD_TAG, DEPLOY_TAG, type Building, type Piece } from './Building';
import type { CureTarget } from './Cure';
import type { FlowField, FlowMode } from './FlowField';
import type { Inventory } from './Inventory';
import { MutantFx } from './MutantFx';

const POOL: Record<EnemyId, number> = {
  shambler: 30, crawler: 26, bloater: 10, brute: 6, spitter: 10, screamer: 4, stalker: 8, climber: 12,
  chemist: 2, patientZero: 1,
};
const IGNORE_SLIP = [HALF_TAG];
const IGNORE_CLIMB = [HALF_TAG, BUILD_TAG, DEPLOY_TAG, CLIFF_TAG];
const FRENZY = ENEMIES.screamer.scream!;
const _p = new THREE.Vector3();

export interface SpawnJob {
  id: EnemyId;
  x: number;
  z: number;
  delay: number;
  raid: boolean;
  hpMul?: number;
}

/**
 * Pooled mutants: raid waves, a few roamers, melee against the player and the walls,
 * the specials (acid, shrieks, cloaks, climbing, boss slams) and the loot / gas they leave behind.
 */
export class Horde {
  readonly enemies: Enemy[] = [];
  kills = 0;
  readonly killsByType: Partial<Record<EnemyId, number>> = {};
  /** Contact traps multiply move speed (1 = none). Set by Defenses after it exists. */
  hazardMul: (x: number, z: number) => number = () => 1;
  /** Lit ground (powered floodlights) keeps stalkers from cloaking. Set by Defenses. */
  revealAt: (x: number, z: number) => boolean = () => false;
  /** 0 in daylight, 1 at full night. Roamers notice the player from farther away at night. */
  night = 0;
  readonly fx: MutantFx;
  private readonly pool = new Map<EnemyId, Enemy[]>();
  private readonly queue: SpawnJob[] = [];
  private seed = 1;
  private calledToast = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly collision: CollisionWorld,
    private readonly flow: FlowField,
    private readonly building: Building,
    private readonly world: World,
    private readonly player: Player,
    private readonly inventory: Inventory,
    private readonly debris: Debris,
    private readonly floaters: FloatingText,
    private readonly onMauled: () => void,
    onAcid: () => void,
    private readonly traversal: Traversal,
    private readonly cure: CureTarget,
  ) {
    for (const id of Object.keys(POOL) as EnemyId[]) {
      const list: Enemy[] = [];
      for (let i = 0; i < POOL[id]; i++) {
        const e = new Enemy(ENEMIES[id], i * 9973 + 11);
        this.scene.add(e.object);
        list.push(e);
      }
      this.pool.set(id, list);
    }
    this.fx = new MutantFx(scene, player, building, debris, floaters, onAcid, (x, z) => world.height.at(x, z));
    this.fx.setSplash((x, z, damage) => {
      if (!this.cure.attackable) return;
      if (Math.hypot(x - this.cure.x, z - this.cure.z) < 1.35) this.cure.damage(damage);
    });
    events.on('noise', ({ x, z, radius }) => this.hear(x, z, radius));
  }

  /** Roamers in earshot drop what they're doing and go look. */
  private hear(x: number, z: number, radius: number): void {
    for (const e of this.enemies) {
      if (!e.alive || e.raid) continue;
      if (Math.hypot(e.position.x - x, e.position.z - z) > radius) continue;
      e.alertAt.set(x + (Math.random() - 0.5) * 4, z + (Math.random() - 0.5) * 4);
      e.alertT = CONFIG.horde.investigateTime;
    }
  }

  get raidAlive(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && e.raid) n++;
    for (const j of this.queue) if (j.raid) n++;
    return n;
  }

  get roamAlive(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive && !e.raid) n++;
    return n;
  }

  get aliveCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  /** The boss currently on the field, if any. */
  get boss(): Enemy | null {
    for (const e of this.enemies) if (e.alive && e.def.boss) return e;
    return null;
  }

  enqueue(jobs: readonly SpawnJob[]): void {
    this.queue.push(...jobs);
  }

  /** A kill made without a body on the field (a simulated siege). Counts for score and the Codex. */
  creditKill(id: EnemyId): void {
    this.kills++;
    this.killsByType[id] = (this.killsByType[id] ?? 0) + 1;
    events.emit('enemy:killed', { id });
  }

  /** Pulls the raid off the field (living wave and queued spawns) so a siege can fight it on paper. */
  withdrawRaid(): { id: EnemyId; hp: number }[] {
    const out: { id: EnemyId; hp: number }[] = [];
    for (const e of this.enemies) {
      if (!e.alive || !e.raid) continue;
      out.push({ id: e.def.id, hp: e.hp });
      e.hide();
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const j = this.queue[i];
      if (!j.raid) continue;
      out.push({ id: j.id, hp: ENEMIES[j.id].hp * (j.hpMul ?? 1) });
      this.queue.splice(i, 1);
    }
    return out;
  }

  spawn(id: EnemyId, x: number, z: number, raid: boolean, hpMul = 1): Enemy | null {
    const list = this.pool.get(id);
    const e = list?.find((m) => !m.object.visible && m.state !== 'dead') ?? list?.find((m) => !m.alive);
    if (!e) return null;
    if (!this.enemies.includes(e)) this.enemies.push(e);
    e.spawn(x, z, raid, hpMul, this.world.height.at(x, z));
    if (e.def.boss) {
      sfx(e.def.voice, { x, z, volume: 1.4 });
      events.emit('camera:shake', { amount: 0.3 });
    }
    return e;
  }

  findInCone(pos: THREE.Vector3, facing: number, reach: number, coneDeg: number): Enemy | null {
    const half = (coneDeg * Math.PI) / 360;
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dx = e.position.x - pos.x;
      const dz = e.position.z - pos.z;
      const center = Math.hypot(dx, dz);
      const dist = center - e.def.radius;
      if (dist > reach) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - facing));
      if (ang > half && dist > 0.2) continue;
      const score = dist + ang * 0.7;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /** Closest living mutant within `radius` of a ground point. `y` skips anyone on another terrace. */
  near(x: number, z: number, radius: number, y?: number): Enemy | null {
    let best: Enemy | null = null;
    let bestD = radius;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (y !== undefined && (y < e.position.y - 0.4 || y > e.position.y + e.def.height + 0.5)) continue;
      const d = Math.hypot(e.position.x - x, e.position.z - z) - e.def.radius;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Explosion: hurts every mutant in the radius, fading with distance. */
  blast(x: number, z: number, radius: number, damage: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.position.x - x, e.position.z - z);
      if (d < radius) this.hurt(e, damage * (1 - d / radius));
    }
  }

  /** Bullet or blast hit. Returns true if something died. */
  hurt(e: Enemy, power: number, word = '', fromPlayer = false): boolean {
    if (!e.alive) return false;
    if (fromPlayer) {
      e.grudge = CONFIG.cure.grudgeTime;
      e.grudgeClose = false;
    }
    const dead = e.hit(power);
    _p.set(e.position.x, e.position.y + e.def.height * 0.65 + e.lift, e.position.z);
    this.debris.burst(e.position.x, e.position.y + 0.9 + e.lift, e.position.z, e.def.debrisColor, dead ? 18 : 7);
    this.floaters.spawn(_p, word || e.def.hitWords[Math.floor(Math.random() * e.def.hitWords.length)], 'word', undefined, 0, 0, power);
    sfx(e.def.id === 'bloater' || e.def.id === 'spitter' ? 'hit.goo' : 'hit.flesh', { x: e.position.x, z: e.position.z, pitch: 0.85 + Math.random() * 0.3 });
    events.emit('camera:shake', { amount: dead ? 0.22 : 0.08 });
    if (dead) this.finishKill(e);
    return dead;
  }

  /** Player swing landed. Returns true if it hit a mutant. */
  strike(power: number): boolean {
    const p = this.player;
    const e = this.findInCone(p.position, p.facing, CONFIG.gathering.reach + 0.15, CONFIG.gathering.coneDeg);
    if (!e) return false;
    this.hurt(e, power, '', true);
    return true;
  }

  update(dt: number): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      this.queue[i].delay -= dt;
      if (this.queue[i].delay > 0) continue;
      const j = this.queue.splice(i, 1)[0];
      this.spawn(j.id, j.x, j.z, j.raid, j.hpMul);
    }

    const p = this.player;
    for (const e of this.enemies) {
      if (!e.object.visible) continue;
      if (e.state === 'dead') {
        e.animate(dt);
        if (e.deadT > 1.1) e.hide();
        continue;
      }
      this.step(e, dt, p);
      e.animate(dt);
    }
    this.separate();
    this.fx.update(dt);
  }

  private step(e: Enemy, dt: number, p: Player): void {
    const d = e.def;
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.specialT = Math.max(0, e.specialT - dt);
    e.buffT = Math.max(0, e.buffT - dt);
    if (e.link) {
      this.climbLink(e, dt);
      return;
    }

    const toPlayer = Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z);
    const level = Math.abs(p.position.y - e.position.y) < 1.6 + (d.boss ? 1 : 0) + e.lift;
    this.tickVent(e, dt, p, toPlayer);
    this.tickCloak(e, dt, toPlayer);
    this.tickVoice(e, dt);
    this.tickBrood(e);

    const structure = d.climbs ? null : this.building.pieceNear(e.position.x, e.position.z, CONFIG.raid.structureReach + d.radius);
    const canHitPlayer = level && toPlayer < d.attackRange + CONFIG.player.radius;
    const canHitWall = !!structure && this.building.distanceTo(structure, e.position.x, e.position.z) < CONFIG.raid.structureReach + 0.05;
    const home = Math.hypot(e.position.x, e.position.z) < CONFIG.homeZone.radius + 2;
    const objective = e.raid || home;
    if (e.grudge > 0) {
      e.grudge = Math.max(0, e.grudge - dt);
      if (toPlayer < CONFIG.cure.grudgeClose) e.grudgeClose = true;
      if (e.grudgeClose && toPlayer > CONFIG.cure.grudgeLeash) e.grudge = 0;
    }
    const nightAggro = CONFIG.raid.playerAggro * (1 + (CONFIG.horde.nightAggro - 1) * this.night);
    const bubble = objective ? CONFIG.cure.aggro : nightAggro;
    const provoked = toPlayer < bubble + (e.sticky ? CONFIG.cure.aggroStick : 0) || e.grudge > 0;
    e.sticky = toPlayer < bubble + (e.sticky ? CONFIG.cure.aggroStick : 0);
    const toCure = Math.hypot(this.cure.x - e.position.x, this.cure.z - e.position.z);
    const canHitCure = this.cure.attackable && toCure < d.attackRange + CONFIG.cure.hitPad;

    if (e.state === 'attack') {
      e.attackT += dt / e.attackTime;
      if (!e.attackImpact && e.attackT >= 0.55) {
        e.attackImpact = true;
        this.impact(e, p, canHitPlayer, canHitWall ? structure : null);
      }
      if (e.attackT >= 1) {
        e.state = 'walk';
        e.cooldown = d.attackCooldown;
      }
      return;
    }

    if (this.trySpecial(e, p, toPlayer, canHitWall ? structure : null, provoked, objective)) return;

    const hitPlayer = canHitPlayer && provoked;
    const hitCure = canHitCure && !hitPlayer;
    const hitWall = canHitWall && !hitPlayer && !hitCure && (e.stuck > 0.35 || !provoked);
    if (e.cooldown <= 0 && (hitPlayer || hitCure || hitWall)) {
      e.focus = hitPlayer ? 'player' : hitCure ? 'cure' : 'wall';
      const tx = e.focus === 'player' ? p.position.x : e.focus === 'cure' ? this.cure.x : structure!.x;
      const tz = e.focus === 'player' ? p.position.z : e.focus === 'cure' ? this.cure.z : structure!.z;
      dampEnemyFacing(e, Math.atan2(tx - e.position.x, tz - e.position.z), dt);
      e.beginAttack(e.focus === 'player' ? 'melee' : 'smash', d.attackTime / (e.frenzied ? 1.2 : 1));
      sfx('enemy.swipe', { x: e.position.x, z: e.position.z, volume: 0.7, pitch: d.radius > 0.6 ? 0.7 : 1 });
      return;
    }

    let wx = 0;
    let wz = 0;
    const hold = provoked ? this.holdDistance(e, toPlayer) : 0;
    e.alertT = Math.max(0, e.alertT - dt);
    const route = provoked && !level && !d.climbs && toPlayer < bubble * 2 ? this.traversal.route(e.position.x, e.position.y, e.position.z, p.position.y, CONFIG.traversal.mutantSeek) : null;
    if (route) {
      const dx = route.at.x - e.position.x;
      const dz = route.at.z - e.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.55) {
        e.link = route.link;
        e.linkDir = route.end === 0 ? 1 : -1;
        e.linkS = route.end === 0 ? 0 : route.link.length;
        return;
      }
      wx = dx / dist;
      wz = dz / dist;
    } else if (provoked || (hold > 0 && toPlayer < hold + 3)) {
      const inv = toPlayer || 1;
      wx = (p.position.x - e.position.x) / inv;
      wz = (p.position.z - e.position.z) / inv;
      if (hold > 0 && toPlayer < hold) {
        dampEnemyFacing(e, Math.atan2(wx, wz), dt);
        wx *= toPlayer < hold * 0.7 ? -0.6 : 0;
        wz *= toPlayer < hold * 0.7 ? -0.6 : 0;
      }
    } else if (objective) {
      const mode: FlowMode = d.climbs ? 'climb' : d.slips ? 'crawl' : 'walk';
      const f = this.flow.sample(e.position.x, e.position.z, mode);
      wx = f.x;
      wz = f.z;
      if (wx === 0 && wz === 0) {
        const tx = structure ? structure.x : this.cure.x;
        const tz = structure ? structure.z : this.cure.z;
        const inv = Math.hypot(tx - e.position.x, tz - e.position.z) || 1;
        wx = (tx - e.position.x) / inv;
        wz = (tz - e.position.z) / inv;
      }
    } else if (e.alertT > 0) {
      const dx = e.alertAt.x - e.position.x;
      const dz = e.alertAt.y - e.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.5) e.alertT = 0;
      else {
        wx = dx / dist;
        wz = dz / dist;
      }
    } else {
      this.seed = (this.seed + 1) >>> 0;
      const wander = Math.sin(e.position.x * 0.15 + e.position.z * 0.11 + this.seed * 0.001);
      wx = Math.sin(e.facing + wander * 0.4);
      wz = Math.cos(e.facing + wander * 0.4);
    }

    const climb = d.climbs ? this.climb(e, dt) : 1;
    const len = Math.hypot(wx, wz);
    if (len > 0.05) {
      const back = wx * Math.sin(e.facing) + wz * Math.cos(e.facing) < -0.2;
      wx /= len;
      wz /= len;
      if (!back) dampEnemyFacing(e, Math.atan2(wx, wz), dt);
      e.wish.set(wx, wz);
      const walk = this.world.height.walk(e.position.x, e.position.z);
      const slopeMul = d.climbs ? 1 : walk.mul || 0.15;
      e.speed = d.speed * (back ? 0.5 : 1) * this.hazardMul(e.position.x, e.position.z) * (e.frenzied ? FRENZY.speedMul : 1) * this.enrage(e) * climb * slopeMul;
    } else {
      e.wish.set(0, 0);
      e.speed = 0;
    }

    const prevX = e.position.x;
    const prevZ = e.position.z;
    e.position.x += e.wish.x * e.speed * dt;
    e.position.z += e.wish.y * e.speed * dt;
    this.collision.resolveCircle(e.position, d.radius, d.climbs ? IGNORE_CLIMB : d.slips ? IGNORE_SLIP : []);
    if (!d.climbs && this.world.height.walk(e.position.x, e.position.z).mul <= 0 && this.world.height.walk(prevX, prevZ).mul > 0) {
      e.position.x = prevX;
      e.position.z = prevZ;
    }
    e.position.y = this.world.height.at(e.position.x, e.position.z);
    const moved = Math.hypot(e.position.x - prevX, e.position.z - prevZ);
    e.stuck = e.speed > 0.4 && moved < e.speed * dt * 0.25 ? e.stuck + dt : 0;
  }

  /** Along a traversal link at mutant pace, then back on its feet at the other end. */
  private climbLink(e: Enemy, dt: number): void {
    const link = e.link!;
    e.linkS += e.linkDir * CONFIG.traversal.mutantClimbSpeed * dt;
    e.facing = link.yaw;
    e.speed = 1;
    e.lift = 0;
    pointAlong(link, e.linkS, e.position);
    if (e.linkDir > 0 ? e.linkS < link.length : e.linkS > 0) return;
    e.position.copy(endPoint(link, e.linkDir > 0 ? 1 : 0));
    e.link = null;
    e.stuck = 0;
  }

  /** Ranged mutants stop short of the player. 0 = walk right up. */
  private holdDistance(e: Enemy, toPlayer: number): number {
    if (e.def.spit && (e.raid || toPlayer < e.def.spit.range)) return e.def.spit.keep;
    if (e.def.scream) return 8;
    return 0;
  }

  private enrage(e: Enemy): number {
    return e.def.boss && e.hp < e.maxHp * 0.3 ? 1.4 : 1;
  }

  /** Climbers rise up and over any wall they touch, slowing while they climb. */
  private climb(e: Enemy, dt: number): number {
    const piece = this.building.pieceNear(e.position.x, e.position.z, 0.8);
    let target = 0;
    if (piece && piece.size.h > 0.5) {
      const dist = this.building.distanceTo(piece, e.position.x, e.position.z);
      target = piece.size.h * smoothstep(0.8, 0.05, dist);
    } else if (this.world.height.slopeDeg(e.position.x, e.position.z) > CONFIG.world.walkSlope) {
      target = Math.min(2.4, this.world.height.slopeDeg(e.position.x, e.position.z) * 0.04);
    }
    e.lift = damp(e.lift, target, 12, dt);
    return target > 0.2 ? 0.55 : 1;
  }

  private trySpecial(e: Enemy, p: Player, toPlayer: number, wall: Piece | null, provoked: boolean, objective: boolean): boolean {
    const d = e.def;
    if (e.specialT > 0) return false;
    if (d.spit) {
      let tx = 0;
      let tz = 0;
      let ok = false;
      if (provoked && toPlayer <= d.spit.range) {
        const lead = (toPlayer / d.spit.speed) * 0.5;
        tx = p.position.x + p.actualVelocity.x * lead;
        tz = p.position.z + p.actualVelocity.z * lead;
        ok = true;
      } else if (objective) {
        const toCure = Math.hypot(this.cure.x - e.position.x, this.cure.z - e.position.z);
        if (toCure <= d.spit.range) {
          tx = this.cure.x;
          tz = this.cure.z;
          ok = true;
        } else {
          const piece = wall ?? this.building.pieceNear(e.position.x, e.position.z, d.spit.range * 0.75);
          if (piece) {
            tx = piece.x;
            tz = piece.z;
            ok = true;
          }
        }
      }
      if (!ok) return false;
      e.facing = Math.atan2(tx - e.position.x, tz - e.position.z);
      e.attackAt.set(tx, tz);
      e.beginAttack('spit', 0.75);
      e.specialT = d.spit.every * (0.85 + Math.random() * 0.3);
      return true;
    }
    if (d.scream) {
      const nearHut = e.raid && Math.hypot(e.position.x, e.position.z) < CONFIG.homeZone.radius - 6;
      if (toPlayer > 13 && !nearHut) return false;
      e.beginAttack('scream', 1.1);
      e.specialT = d.scream.every * (0.9 + Math.random() * 0.2);
      this.floaters.spawn(new THREE.Vector3(e.position.x, e.position.y + d.height + 0.6, e.position.z), 'HHHHK...', 'warn');
      return true;
    }
    if (d.slam) {
      const reachWall = !!wall && e.stuck > 0.25;
      const nearCure = this.cure.attackable && Math.hypot(this.cure.x - e.position.x, this.cure.z - e.position.z) < d.slam.radius;
      if (!provoked && !reachWall && !nearCure) return false;
      if (provoked && toPlayer > d.slam.radius * 0.75 && !reachWall && !nearCure) return false;
      e.beginAttack('slam', d.slam.windup / 0.55);
      e.specialT = d.slam.every;
      this.fx.ring(e.position.x, e.position.z, d.slam.radius, '#e0302a', d.slam.windup);
      this.floaters.spawn(new THREE.Vector3(e.position.x, e.position.y + d.height + 0.5, e.position.z), 'HRRRNNGH!', 'warn');
      return true;
    }
    return false;
  }

  private impact(e: Enemy, p: Player, canHitPlayer: boolean, wall: Piece | null): void {
    const d = e.def;
    switch (e.attackKind) {
      case 'spit':
        this.fx.spit(
          e.position.x + Math.sin(e.facing) * 0.45, d.height * 0.8, e.position.z + Math.cos(e.facing) * 0.45,
          e.attackAt.x, e.attackAt.y, d.spit!,
        );
        return;
      case 'scream':
        this.scream(e);
        return;
      case 'slam':
        this.slam(e);
        return;
      default: {
        const mul = e.frenzied ? FRENZY.damageMul : 1;
        if (e.focus === 'player' && canHitPlayer && !p.invulnerable) {
          p.damage(d.damage * mul);
          this.onMauled();
          this.floaters.spawn(p.position.clone().setY(p.position.y + 1.7), d.radius > 0.6 ? 'CRACK!' : 'RIP!', 'word', '#e0302a');
          events.emit('camera:shake', { amount: 0.2 });
        } else if (e.focus === 'cure' && this.cure.attackable) {
          this.cure.damage(d.structureDamage * mul);
        } else if (wall) {
          this.building.damage(wall, d.structureDamage * mul);
        }
      }
    }
  }

  private scream(e: Enemy): void {
    const s = e.def.scream!;
    const { x, z } = e.position;
    sfx('scream', { x, z, volume: 1.3 });
    this.fx.ring(x, z, s.radius, '#e0302a', 0.7);
    this.floaters.spawn(new THREE.Vector3(x, e.position.y + e.def.height + 0.7, z), 'SKREEEEE!', 'word', '#e0302a', 0, 0, 60);
    events.emit('camera:shake', { amount: 0.25 });
    for (const o of this.enemies) {
      if (!o.alive) continue;
      if (Math.hypot(o.position.x - x, o.position.z - z) < s.radius) o.buffT = s.buff;
    }
    if (e.calls >= s.maxCalls) return;
    e.calls += s.calls;
    for (let i = 0; i < s.calls; i++) {
      const id: EnemyId = Math.random() < 0.6 ? 'shambler' : 'crawler';
      if (e.raid) {
        const h = Math.atan2(x, z) + (Math.random() - 0.5) * 0.8;
        const r = CONFIG.raid.spawnMin + Math.random() * (CONFIG.raid.spawnMax - CONFIG.raid.spawnMin);
        this.queue.push({ id, x: Math.sin(h) * r, z: Math.cos(h) * r, delay: 0.6 + i * 0.5, raid: true });
      } else {
        const a = Math.random() * Math.PI * 2;
        this.queue.push({ id, x: x + Math.sin(a) * 18, z: z + Math.cos(a) * 18, delay: 1 + i * 0.6, raid: false });
      }
    }
    if (performance.now() - this.calledToast > 20000) {
      this.calledToast = performance.now();
      events.emit('toast', { text: 'A screamer is calling the horde. Shut it up.', tone: 'danger' });
    }
  }

  private slam(e: Enemy): void {
    const s = e.def.slam!;
    const { x, z } = e.position;
    const p = this.player;
    sfx('boss.slam', { x, z, volume: 1.3 });
    this.fx.ring(x, z, s.radius, '#f2b705', 0.5);
    this.debris.burst(x, 0.3, z, '#5a4a3a', 34);
    this.floaters.spawn(new THREE.Vector3(x, 1.8, z), 'KRA-THOOM!', 'word', '#f2b705', 0, 0, 80);
    events.emit('camera:shake', { amount: 0.65 });
    const dist = Math.hypot(p.position.x - x, p.position.z - z);
    if (dist < s.radius && !p.invulnerable) {
      p.damage(s.damage * (1 - (dist / s.radius) * 0.6));
      this.onMauled();
    }
    for (const piece of [...this.building.pieces]) {
      if (piece.def.kind === 'foundation') continue;
      if (this.building.distanceTo(piece, x, z) < s.radius * 0.8) this.building.damage(piece, s.structureDamage);
    }
    if (this.cure.attackable && Math.hypot(this.cure.x - x, this.cure.z - z) < s.radius * 0.85) this.cure.damage(s.structureDamage);
  }

  private tickVent(e: Enemy, dt: number, p: Player, toPlayer: number): void {
    const v = e.def.vent;
    if (!v) return;
    e.ventT -= dt;
    if (e.ventT > 0) return;
    e.ventT = v.every * (0.85 + Math.random() * 0.3);
    this.world.addPuff(e.position.x, e.position.z, v.gasR, v.life ?? 5);
    sfx('gas.burst', { x: e.position.x, z: e.position.z, volume: e.def.boss ? 1 : 0.5 });
    if (v.damage && toPlayer < v.radius && !p.invulnerable) {
      p.damage(v.damage);
      this.onMauled();
    }
  }

  private tickCloak(e: Enemy, dt: number, toPlayer: number): void {
    const c = e.def.cloak;
    if (!c) return;
    const inGas = this.world.gasAt(e.position.x, e.position.z) > c.gas;
    const shown = toPlayer < 3 || e.state === 'attack' || e.flinch > 0.3 || this.revealAt(e.position.x, e.position.z);
    e.fadeTo(inGas && !shown ? c.opacity : 0.92, dt);
  }

  private tickVoice(e: Enemy, dt: number): void {
    e.voiceT -= dt;
    if (e.voiceT > 0) return;
    e.voiceT = (e.def.boss ? 4 : 5) + Math.random() * 8;
    if (audio.audibility(e.position.x, e.position.z) < 0.08) return;
    sfx(e.def.voice, { x: e.position.x, z: e.position.z, pitch: 0.88 + Math.random() * 0.24 });
  }

  private tickBrood(e: Enemy): void {
    const b = e.def.brood;
    if (!b || e.broodStage >= b.at.length || e.hp > e.maxHp * b.at[e.broodStage]) return;
    e.broodStage++;
    const { x, z } = e.position;
    for (let i = 0; i < b.count; i++) {
      const a = (i / b.count) * Math.PI * 2 + Math.random() * 0.5;
      this.spawn(b.id, x + Math.sin(a) * (e.def.radius + 0.6), z + Math.cos(a) * (e.def.radius + 0.6), e.raid);
    }
    sfx('pop.wet', { x, z, volume: 1.3 });
    this.debris.burst(x, e.position.y + 1.4, z, e.def.debrisColor, 30);
    this.floaters.spawn(new THREE.Vector3(x, e.position.y + e.def.height + 0.4, z), 'BLEEEGH!', 'word', '#8cff3a', 0, 0, 70);
    events.emit('camera:shake', { amount: 0.35 });
    if (e.broodStage === 1) events.emit('toast', { text: `${e.def.name} split open. Something crawled out.`, tone: 'danger' });
  }

  private separate(): void {
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (!a.alive || a.link) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (!b.alive || b.link) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const min = a.def.radius + b.def.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const nx = dx / d;
        const nz = dz / d;
        const wa = b.def.boss ? 2 : a.def.boss ? 0 : 1;
        const wb = a.def.boss ? 2 : b.def.boss ? 0 : 1;
        a.position.x -= nx * push * wa;
        a.position.z -= nz * push * wa;
        b.position.x += nx * push * wb;
        b.position.z += nz * push * wb;
        a.position.y = this.world.height.at(a.position.x, a.position.z);
        b.position.y = this.world.height.at(b.position.x, b.position.z);
      }
    }
  }

  private finishKill(e: Enemy): void {
    const d: EnemyDef = e.def;
    this.kills++;
    this.killsByType[d.id] = (this.killsByType[d.id] ?? 0) + 1;
    events.emit('enemy:killed', { id: d.id });
    const { x, z } = e.position;
    _p.set(x, e.position.y + d.height * 0.8 + e.lift, z);
    this.floaters.spawn(_p.clone().setY(_p.y + 0.4), d.deathWord, 'word', '#f2b705', 0.05, 0, d.boss ? 120 : 40);
    sfx('enemy.death', { x, z, pitch: 1.5 - Math.min(0.8, d.radius) });
    this.give(d.loot, _p);
    if (d.boss) {
      sfx('explosion', { x, z, volume: 0.8 });
      sfx(d.voice, { x, z, pitch: 0.75, volume: 1.4 });
      this.debris.burst(x, 1.6, z, d.debrisColor, 40);
      events.emit('camera:shake', { amount: 0.8 });
      events.emit('toast', { text: `${d.name.toUpperCase()} IS DOWN.`, tone: 'info' });
    }
    if (d.explode) {
      const xp = d.explode;
      this.world.addPuff(x, z, xp.gasR, xp.gasLife);
      this.debris.burst(x, 1.1, z, d.debrisColor, 28);
      sfx('pop.wet', { x, z });
      sfx('gas.burst', { x, z, delay: 0.1 });
      const dist = Math.hypot(this.player.position.x - x, this.player.position.z - z);
      if (dist < xp.radius && !this.player.invulnerable) {
        this.player.damage(xp.damage * (1 - dist / xp.radius));
        this.onMauled();
      }
      for (const o of this.enemies) {
        if (!o.alive || o === e) continue;
        const od = Math.hypot(o.position.x - x, o.position.z - z);
        if (od < xp.radius && o.hit(xp.damage * 0.45 * (1 - od / xp.radius))) this.finishKill(o);
      }
      const wall = this.building.pieceNear(x, z, xp.radius);
      if (wall) this.building.damage(wall, 40);
      events.emit('toast', { text: 'A bloater burst. The air went green.', tone: 'toxic' });
    }
  }

  private give(items: readonly ItemAmount[], at: THREE.Vector3): void {
    items.forEach((a, i) => {
      const got = a.qty - this.inventory.add(a.item, a.qty);
      if (got > 0) {
        const def: ItemDef = ITEMS[a.item];
        this.floaters.spawn(at.clone().setY(at.y + 0.3), `+${got} ${def.name.toUpperCase()}`, 'gain', def.color, 0.08 + i * 0.1, i);
      }
    });
  }
}

export function meleePower(toolPower: number | undefined): number {
  return toolPower && toolPower > 0 ? toolPower : CONFIG.gathering.handPower;
}
