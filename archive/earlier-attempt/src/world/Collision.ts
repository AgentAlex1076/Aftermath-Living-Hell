import * as THREE from 'three';
import { clamp } from '../core/math';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

/** Static ground-plane collision: the player and enemies are circles, the world is boxes and circles. */
export class CollisionWorld {
  readonly boxes: AABB[] = [];
  readonly circles: CircleCollider[] = [];

  addBox(box: AABB) {
    this.boxes.push(box);
  }

  addBoxAt(x: number, z: number, halfX: number, halfZ: number) {
    this.addBox({ minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ });
  }

  addCircle(circle: CircleCollider) {
    this.circles.push(circle);
  }

  /** Pushes a circle at `p` out of every overlapping collider. Mutates `p`. */
  resolveCircle(p: THREE.Vector3, r: number) {
    for (let iteration = 0; iteration < 3; iteration++) {
      let moved = false;
      for (const b of this.boxes) {
        const cx = clamp(p.x, b.minX, b.maxX);
        const cz = clamp(p.z, b.minZ, b.maxZ);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        moved = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = (r - d) / d;
          p.x += dx * push;
          p.z += dz * push;
        } else {
          const left = p.x - b.minX;
          const right = b.maxX - p.x;
          const down = p.z - b.minZ;
          const up = b.maxZ - p.z;
          const min = Math.min(left, right, down, up);
          if (min === left) p.x = b.minX - r;
          else if (min === right) p.x = b.maxX + r;
          else if (min === down) p.z = b.minZ - r;
          else p.z = b.maxZ + r;
        }
      }
      for (const c of this.circles) {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const minD = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) / d;
        p.x += dx * push;
        p.z += dz * push;
        moved = true;
      }
      if (!moved) break;
    }
  }

  buildDebugView(heightAt: (x: number, z: number) => number) {
    const points: number[] = [];
    const y = (x: number, z: number) => heightAt(x, z) + 0.15;
    for (const b of this.boxes) {
      const c: [number, number][] = [
        [b.minX, b.minZ],
        [b.maxX, b.minZ],
        [b.maxX, b.maxZ],
        [b.minX, b.maxZ],
      ];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = c[i];
        const [bx, bz] = c[(i + 1) % 4];
        points.push(ax, y(ax, az), az, bx, y(bx, bz), bz);
      }
    }
    const seg = 16;
    for (const c of this.circles) {
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const x0 = c.x + Math.cos(a0) * c.r;
        const z0 = c.z + Math.sin(a0) * c.r;
        const x1 = c.x + Math.cos(a1) * c.r;
        const z1 = c.z + Math.sin(a1) * c.r;
        points.push(x0, y(x0, z0), z0, x1, y(x1, z1), z1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff3df2, depthTest: false }));
    lines.renderOrder = 999;
    return lines;
  }
}
