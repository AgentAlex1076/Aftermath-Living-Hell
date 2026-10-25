import * as THREE from 'three';

const CAPACITY = 260;
const GRAVITY = -16;

interface Chip {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  spin: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  maxLife: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Chunky chips that burst out of resource nodes when hit. One instanced draw call. */
export class Debris {
  readonly mesh: THREE.InstancedMesh;
  private readonly chips: Chip[] = [];

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAPACITY);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'debris';
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    scene.add(this.mesh);
  }

  burst(x: number, y: number, z: number, color: string, count: number, dirX = 0, dirZ = 0): void {
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.chips.length >= CAPACITY) this.chips.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      const chip: Chip = {
        pos: new THREE.Vector3(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.4),
        vel: new THREE.Vector3(Math.cos(a) * sp - dirX * 2.5, 3 + Math.random() * 4, Math.sin(a) * sp - dirZ * 2.5),
        rot: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        spin: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
        color: base.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.15),
        size: 0.05 + Math.random() * 0.09,
        life: 0,
        maxLife: 0.9 + Math.random() * 0.7,
      };
      this.chips.push(chip);
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const c = this.chips[i];
      c.life += dt;
      if (c.life >= c.maxLife) {
        this.chips.splice(i, 1);
        continue;
      }
      c.vel.y += GRAVITY * dt;
      c.pos.addScaledVector(c.vel, dt);
      if (c.pos.y < c.size / 2) {
        c.pos.y = c.size / 2;
        c.vel.y *= -0.35;
        c.vel.x *= 0.6;
        c.vel.z *= 0.6;
        c.spin.multiplyScalar(0.6);
      }
      c.rot.x += c.spin.x * dt;
      c.rot.y += c.spin.y * dt;
      c.rot.z += c.spin.z * dt;
    }
    for (const c of this.chips) {
      const fade = 1 - Math.max(0, (c.life - c.maxLife * 0.7) / (c.maxLife * 0.3));
      _q.setFromEuler(c.rot);
      _s.setScalar(c.size * fade);
      _m.compose(c.pos, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, c.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
