import * as THREE from 'three';
import { events } from '../core/EventBus';
import { sfx } from '../audio/AudioEngine';
import type { EnemyDef } from '../data/enemies';
import type { Player } from '../entities/Player';
import type { Debris } from '../render/Debris';
import type { FloatingText } from '../ui/FloatingText';
import type { Building } from './Building';

type Spit = NonNullable<EnemyDef['spit']>;

interface Glob {
  mesh: THREE.Mesh;
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  tz: number;
  t: number;
  dur: number;
  arc: number;
  spec: Spit;
  active: boolean;
}

interface Mark {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  grow: number;
  active: boolean;
}

const GLOBS = 16;
const SPLATS = 14;
const RINGS = 6;
const globGeo = new THREE.SphereGeometry(0.16, 10, 8);
const splatGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);

/** Acid globs and the marks mutants leave on the ground: splats and shockwave rings. */
export class MutantFx {
  private readonly globs: Glob[] = [];
  private readonly splats: Mark[] = [];
  private readonly rings: Mark[] = [];
  private readonly globMat = new THREE.MeshStandardMaterial({ color: '#b6ff4a', emissive: '#6cd61a', emissiveIntensity: 2.4, roughness: 0.3 });

  constructor(
    scene: THREE.Scene,
    private readonly player: Player,
    private readonly building: Building,
    private readonly debris: Debris,
    private readonly floaters: FloatingText,
    private readonly onAcid: () => void,
  ) {
    for (let i = 0; i < GLOBS; i++) {
      const mesh = new THREE.Mesh(globGeo, this.globMat);
      mesh.visible = false;
      mesh.castShadow = true;
      scene.add(mesh);
      this.globs.push({ mesh, fx: 0, fy: 0, fz: 0, tx: 0, tz: 0, t: 0, dur: 1, arc: 1, spec: null as unknown as Spit, active: false });
    }
    for (let i = 0; i < SPLATS; i++) this.splats.push(this.mark(scene, splatGeo, '#8fd62a', 0.55));
    for (let i = 0; i < RINGS; i++) this.rings.push(this.mark(scene, ringGeo, '#f2b705', 0.8));
  }

  /** Lob acid from a mutant's mouth to a ground point. */
  spit(x: number, y: number, z: number, tx: number, tz: number, spec: Spit): void {
    const g = this.globs.find((o) => !o.active);
    if (!g) return;
    const dist = Math.hypot(tx - x, tz - z);
    Object.assign(g, { fx: x, fy: y, fz: z, tx, tz, t: 0, dur: Math.max(0.35, dist / spec.speed), arc: 1.2 + dist * 0.18, spec, active: true });
    g.mesh.visible = true;
    g.mesh.position.set(x, y, z);
    sfx('spit', { x, z });
  }

  /** Expanding ground ring (screams, slams). */
  ring(x: number, z: number, radius: number, color: string, life = 0.55): void {
    const r = this.rings.find((o) => !o.active) ?? this.rings[0];
    (r.mesh.material as THREE.MeshBasicMaterial).color.set(color);
    r.mesh.position.set(x, 0.06, z);
    r.grow = radius;
    r.life = r.maxLife = life;
    r.active = true;
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const g of this.globs) {
      if (!g.active) continue;
      g.t += dt / g.dur;
      const t = Math.min(1, g.t);
      g.mesh.position.set(
        g.fx + (g.tx - g.fx) * t,
        g.fy * (1 - t) + 0.1 + Math.sin(t * Math.PI) * g.arc,
        g.fz + (g.tz - g.fz) * t,
      );
      g.mesh.scale.setScalar(1 + Math.sin(t * Math.PI * 6) * 0.12);
      if (g.t >= 1) this.land(g);
    }
    for (const s of this.splats) {
      if (!s.active) continue;
      s.life -= dt;
      const k = s.life / s.maxLife;
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.min(1, k * 2.5);
      if (s.life <= 0) this.retire(s);
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= dt;
      const k = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(0.3 + r.grow * (1 - (1 - k) ** 3));
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
      if (r.life <= 0) this.retire(r);
    }
  }

  private land(g: Glob): void {
    g.active = false;
    g.mesh.visible = false;
    const { tx, tz, spec } = g;
    this.debris.burst(tx, 0.3, tz, '#b6ff4a', 12);
    this.floaters.spawn(new THREE.Vector3(tx, 1.1, tz), 'HSSSS!', 'word', '#b6ff4a');
    sfx('acid', { x: tx, z: tz });
    const s = this.splats.find((o) => !o.active) ?? this.splats[0];
    s.mesh.position.set(tx, 0.035, tz);
    s.mesh.scale.setScalar(spec.splash * (0.9 + Math.random() * 0.3));
    s.life = s.maxLife = 3.2;
    s.active = true;
    s.mesh.visible = true;

    const p = this.player;
    const d = Math.hypot(p.position.x - tx, p.position.z - tz);
    if (d < spec.splash + 0.3 && !p.invulnerable) {
      p.damage(spec.damage * (d < spec.splash * 0.5 ? 1 : 0.6));
      this.onAcid();
      this.floaters.spawn(p.position.clone().setY(1.8), 'SIZZLE!', 'word', '#b6ff4a');
      events.emit('camera:shake', { amount: 0.15 });
    }
    const piece = this.building.pieceNear(tx, tz, spec.splash);
    if (piece) this.building.damage(piece, spec.structureDamage);
  }

  private mark(scene: THREE.Scene, geo: THREE.BufferGeometry, color: string, opacity: number): Mark {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    return { mesh, life: 0, maxLife: 1, grow: 1, active: false };
  }

  private retire(m: Mark): void {
    m.active = false;
    m.mesh.visible = false;
  }
}
