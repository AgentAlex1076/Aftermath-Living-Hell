import * as THREE from 'three';
import { damp } from '../core/math';

interface Entry {
  root: THREE.Object3D;
  materials: THREE.Material[];
  /** Meshes that cast shadows while opaque; faded occluders stop shadowing what they reveal. */
  shadowCasters: THREE.Mesh[];
  opacity: number;
  target: number;
}

const FADED_OPACITY = 0.18;

/** Fades any registered object that sits between the camera and the points it must keep visible. */
export class OcclusionFader {
  private entries: Entry[] = [];
  private roots: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private dir = new THREE.Vector3();

  add(root: THREE.Object3D) {
    const materials: THREE.Material[] = [];
    const shadowCasters: THREE.Mesh[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.castShadow) shadowCasters.push(mesh);
      const cloneOne = (m: THREE.Material) => {
        const c = m.clone();
        materials.push(c);
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneOne) : cloneOne(mesh.material);
    });
    root.userData.occluderIndex = this.entries.length;
    this.entries.push({ root, materials, shadowCasters, opacity: 1, target: 1 });
    this.roots.push(root);
  }

  update(camera: THREE.Camera, keepVisible: THREE.Vector3[], dt: number) {
    for (const e of this.entries) e.target = 1;

    for (const point of keepVisible) {
      this.dir.subVectors(point, camera.position);
      const dist = this.dir.length();
      this.raycaster.set(camera.position, this.dir.normalize());
      this.raycaster.far = dist - 0.4;
      for (const hit of this.raycaster.intersectObjects(this.roots, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o.userData.occluderIndex === undefined) o = o.parent;
        if (o) this.entries[o.userData.occluderIndex as number].target = FADED_OPACITY;
      }
    }

    for (const e of this.entries) {
      if (Math.abs(e.opacity - e.target) < 0.002) continue;
      e.opacity = damp(e.opacity, e.target, 10, dt);
      if (Math.abs(e.opacity - e.target) < 0.01) e.opacity = e.target;
      const transparent = e.opacity < 0.999;
      for (const m of e.materials) {
        if (m.transparent !== transparent) {
          m.transparent = transparent;
          m.depthWrite = !transparent;
          m.needsUpdate = true;
        }
        m.opacity = e.opacity;
      }
      const casts = e.opacity > 0.5;
      for (const mesh of e.shadowCasters) mesh.castShadow = casts;
    }
  }
}
