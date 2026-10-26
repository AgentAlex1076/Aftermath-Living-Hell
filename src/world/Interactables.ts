import * as THREE from 'three';

export interface Interactable {
  id: string;
  label: string;
  verb: string;
  position: THREE.Vector3;
  radius: number;
  /** When false, the interactable is skipped (e.g. an already-searched crate). */
  enabled?: boolean;
  /** Only reachable from within this much height (a link's top end is not in reach from its foot). */
  maxDy?: number;
  onInteract: () => void;
}

/** Finds the best interactable for the player: close by and roughly in front of them. */
export class InteractionSystem {
  private readonly items = new Set<Interactable>();

  add(item: Interactable): Interactable {
    this.items.add(item);
    return item;
  }

  remove(item: Interactable): void {
    this.items.delete(item);
  }

  findBest(pos: THREE.Vector3, facing: number): Interactable | null {
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);
    let best: Interactable | null = null;
    let bestScore = Infinity;
    for (const item of this.items) {
      if (item.enabled === false) continue;
      if (item.maxDy !== undefined && Math.abs(item.position.y - pos.y) > item.maxDy) continue;
      const dx = item.position.x - pos.x;
      const dz = item.position.z - pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > item.radius) continue;
      const facingDot = dist > 0.001 ? (dx * fx + dz * fz) / dist : 1;
      const score = dist - facingDot * 0.6;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
    return best;
  }
}
