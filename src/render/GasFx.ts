import * as THREE from 'three';
import { createGasMaterial, gasGeometry } from '../world/Decor';
import type { World } from '../world/World';

const MAX_PUFFS = 40;
const SHEETS = 7;
const MIST = 44;
const MIST_BOX = 72;

const _m = new THREE.Matrix4();
const _c = new THREE.Color();

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Visible gas for transient puffs (bloaters, traps, drums, the Chemist, Stalker veils), plus a
 * low drifting ground mist around the camera that thickens in the rain.
 */
export class GasFx {
  private readonly puffMat = createGasMaterial('#7da62a', '#c4f046', [0.9, 2.6]);
  private readonly mistMat = createGasMaterial('#5d6760', '#808a80', [1.5, 5]);
  private readonly puffs: THREE.InstancedMesh;
  private readonly mist: THREE.InstancedMesh;
  private readonly mistPos: Float32Array;
  private time = 0;

  constructor(scene: THREE.Scene, private readonly world: World) {
    this.puffs = new THREE.InstancedMesh(gasGeometry, this.puffMat, MAX_PUFFS * SHEETS);
    this.puffs.count = 0;
    this.puffs.frustumCulled = false;
    this.puffs.renderOrder = 5;
    this.puffs.name = 'gas-puffs';
    this.puffs.setColorAt(0, _c.setRGB(0, 0, 0));
    scene.add(this.puffs);

    this.mist = new THREE.InstancedMesh(gasGeometry, this.mistMat, MIST);
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 3;
    this.mist.name = 'ground-mist';
    this.mistPos = new Float32Array(MIST * 2);
    for (let i = 0; i < MIST; i++) {
      this.mistPos[i * 2] = (hash(i * 3.1) - 0.5) * MIST_BOX;
      this.mistPos[i * 2 + 1] = (hash(i * 7.7 + 2) - 0.5) * MIST_BOX;
      this.mist.setColorAt(i, _c.setRGB(0, hash(i * 1.3 + 9), 0));
    }
    scene.add(this.mist);
  }

  update(dt: number, focus: THREE.Vector3, player: THREE.Vector3, rain: number): void {
    this.time += dt;
    for (const m of [this.puffMat, this.mistMat]) {
      m.uniforms.uTime.value = this.time;
      m.uniforms.uPlayer.value.copy(player);
    }
    this.updatePuffs();
    this.updateMist(focus, rain);
  }

  private updatePuffs(): void {
    let n = 0;
    const list = this.world.activePuffs;
    for (let p = Math.max(0, list.length - MAX_PUFFS); p < list.length; p++) {
      const puff = list[p];
      const age = puff.maxLife - puff.life;
      const grow = Math.min(1, age / 0.45);
      const fade = Math.min(1, puff.life / (puff.maxLife * 0.5));
      const ease = 1 - (1 - grow) ** 3;
      for (let k = 0; k < SHEETS; k++) {
        const h = puff.seed * 91 + k * 13.37;
        const a = hash(h) * Math.PI * 2;
        const d = puff.r * 0.5 * hash(h + 1) * (0.4 + ease * 0.6);
        const size = puff.r * (1.2 + hash(h + 2) * 0.6) * (0.35 + ease * 0.65);
        const y = 0.25 + (k % 3) * 0.55 + hash(h + 3) * 0.3 + age * 0.04;
        _m.makeScale(size, size, size).setPosition(puff.x + Math.sin(a) * d, y, puff.z + Math.cos(a) * d);
        this.puffs.setMatrixAt(n, _m);
        this.puffs.setColorAt(n, _c.setRGB(0.3 * fade * (0.5 + ease * 0.5), hash(h + 4), 0));
        n++;
      }
    }
    this.puffs.count = n;
    this.puffs.visible = n > 0;
    if (!n) return;
    this.puffs.instanceMatrix.needsUpdate = true;
    if (this.puffs.instanceColor) this.puffs.instanceColor.needsUpdate = true;
  }

  private updateMist(focus: THREE.Vector3, rain: number): void {
    const half = MIST_BOX / 2;
    const alpha = 0.1 + rain * 0.09;
    for (let i = 0; i < MIST; i++) {
      let x = this.mistPos[i * 2] + this.time * 0.25;
      let z = this.mistPos[i * 2 + 1] + this.time * 0.08;
      x = focus.x + ((((x - focus.x + half) % MIST_BOX) + MIST_BOX) % MIST_BOX) - half;
      z = focus.z + ((((z - focus.z + half) % MIST_BOX) + MIST_BOX) % MIST_BOX) - half;
      const s = 9 + hash(i * 5.1) * 7;
      _m.makeScale(s, s, s).setPosition(x, 0.15 + hash(i * 2.9) * 0.5, z);
      this.mist.setMatrixAt(i, _m);
      const edge = Math.max(Math.abs(x - focus.x), Math.abs(z - focus.z)) / half;
      this.mist.setColorAt(i, _c.setRGB(alpha * Math.min(1, (1 - edge) * 3), hash(i * 1.3 + 9), 0));
    }
    this.mist.instanceMatrix.needsUpdate = true;
    if (this.mist.instanceColor) this.mist.instanceColor.needsUpdate = true;
  }
}
