import * as THREE from 'three';
import { dampFactor } from '../core/math';

export interface Occluder {
  readonly root: THREE.Object3D;
  readonly meshes: THREE.Mesh[];
  readonly materials: THREE.Material[];
  readonly minOpacity: number;
  opacity: number;
  target: number;
  forced: number | null;
}

/**
 * Fades registered objects (walls, roofs) that block the camera's view of the player.
 * Each occluder gets its own material clones so it can fade independently.
 */
export class OcclusionFader {
  private readonly occluders: Occluder[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly meshToOccluder = new Map<THREE.Object3D, Occluder>();
  private readonly allMeshes: THREE.Mesh[] = [];
  private readonly dir = new THREE.Vector3();

  register(root: THREE.Object3D, minOpacity = 0.18): Occluder {
    const meshes: THREE.Mesh[] = [];
    const materials: THREE.Material[] = [];
    root.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const cloneMat = (m: THREE.Material) => {
        const c = m.clone();
        materials.push(c);
        return c;
      };
      obj.material = Array.isArray(obj.material) ? obj.material.map(cloneMat) : cloneMat(obj.material);
      meshes.push(obj);
    });

    const occluder: Occluder = { root, meshes, materials, minOpacity, opacity: 1, target: 1, forced: null };
    this.occluders.push(occluder);
    for (const m of meshes) {
      this.meshToOccluder.set(m, occluder);
      this.allMeshes.push(m);
    }
    return occluder;
  }

  unregister(o: Occluder): void {
    const i = this.occluders.indexOf(o);
    if (i < 0) return;
    this.occluders.splice(i, 1);
    for (const m of o.meshes) {
      this.meshToOccluder.delete(m);
      const j = this.allMeshes.indexOf(m);
      if (j >= 0) this.allMeshes.splice(j, 1);
    }
    for (const mat of o.materials) mat.dispose();
  }

  update(dt: number, camera: THREE.Camera, targets: readonly THREE.Vector3[]): void {
    for (const o of this.occluders) o.target = o.forced ?? 1;

    const origin = camera.position;
    for (const target of targets) {
      this.dir.subVectors(target, origin);
      const dist = this.dir.length();
      this.dir.divideScalar(dist);
      this.raycaster.set(origin, this.dir);
      this.raycaster.far = dist - 0.2;
      const hits = this.raycaster.intersectObjects(this.allMeshes, false);
      for (const hit of hits) {
        const o = this.meshToOccluder.get(hit.object);
        if (o && o.forced === null) o.target = Math.min(o.target, o.minOpacity);
      }
    }

    const k = dampFactor(12, dt);
    for (const o of this.occluders) {
      const prev = o.opacity;
      o.opacity += (o.target - o.opacity) * k;
      if (Math.abs(o.opacity - o.target) < 0.002) o.opacity = o.target;
      if (prev !== o.opacity) this.applyOpacity(o);
    }
  }

  private applyOpacity(o: Occluder): void {
    const faded = o.opacity < 0.995;
    for (const m of o.materials) {
      if (m.transparent !== faded) {
        m.transparent = faded;
        m.depthWrite = !faded;
        m.needsUpdate = true;
      }
      m.opacity = faded ? o.opacity : 1;
    }
  }
}
