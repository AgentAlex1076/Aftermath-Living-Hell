import * as THREE from 'three';
import type { Interactable, InteractionSystem } from './Interactables';

export type LinkKind = 'ladder' | 'zipline';

/**
 * A way between two spots: two endpoints and a path the player and mutants can follow. Nothing
 * places one yet; ziplines, vehicles and fast travel plug into this shape.
 */
export interface TraversalLink {
  readonly id: string;
  readonly kind: LinkKind;
  /** World points from end 0 (the foot) to end 1 (the top). */
  readonly path: readonly THREE.Vector3[];
  readonly length: number;
  /** Yaw a climber faces while on it (toward the cliff). */
  readonly yaw: number;
}

export type LinkEnd = 0 | 1;

export interface LinkRoute {
  link: TraversalLink;
  /** The end to get on at. */
  end: LinkEnd;
  at: THREE.Vector3;
}

export function makeLink(id: string, kind: LinkKind, path: THREE.Vector3[]): TraversalLink {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += path[i].distanceTo(path[i - 1]);
  const a = path[0];
  const b = path[path.length - 1];
  return { id, kind, path, length, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

/** The point `s` metres along a link from end 0. */
export function pointAlong(link: TraversalLink, s: number, out: THREE.Vector3): THREE.Vector3 {
  const p = link.path;
  let left = Math.max(0, Math.min(s, link.length));
  for (let i = 1; i < p.length; i++) {
    const seg = p[i].distanceTo(p[i - 1]);
    if (left <= seg || i === p.length - 1) return out.lerpVectors(p[i - 1], p[i], seg > 0 ? Math.min(1, left / seg) : 1);
    left -= seg;
  }
  return out.copy(p[p.length - 1]);
}

/** Path index of an end. */
export function endPoint(link: TraversalLink, end: LinkEnd): THREE.Vector3 {
  return end === 0 ? link.path[0] : link.path[link.path.length - 1];
}

/** Every live traversal link, with an "E" prompt at both ends. */
export class Traversal {
  private readonly links = new Map<TraversalLink, Interactable[]>();

  constructor(
    private readonly interactions: InteractionSystem,
    private readonly onUse: (link: TraversalLink, end: LinkEnd) => void,
  ) {}

  get count(): number {
    return this.links.size;
  }

  all(): IterableIterator<TraversalLink> {
    return this.links.keys();
  }

  add(link: TraversalLink): void {
    if (this.links.has(link)) return;
    const ends = ([0, 1] as const).map((end) => this.interactions.add({
      id: `${link.id}:${end}`,
      label: link.kind === 'ladder' ? 'Ladder' : 'Zipline',
      verb: end === 0 ? 'Climb up' : 'Climb down',
      position: endPoint(link, end).clone(),
      radius: 1.3,
      maxDy: 1.2,
      onInteract: () => this.onUse(link, end),
    }));
    this.links.set(link, ends);
  }

  remove(link: TraversalLink): void {
    const ends = this.links.get(link);
    if (!ends) return;
    for (const it of ends) this.interactions.remove(it);
    this.links.delete(link);
  }

  /**
   * For something at (x, y, z) that wants to reach height `targetY`: the nearest link end within
   * `reach` on its own level whose other end is closer to that height.
   */
  route(x: number, y: number, z: number, targetY: number, reach: number): LinkRoute | null {
    let best: LinkRoute | null = null;
    let bestD = reach;
    for (const link of this.links.keys()) {
      for (const end of [0, 1] as const) {
        const a = endPoint(link, end);
        const b = endPoint(link, end === 0 ? 1 : 0);
        if (Math.abs(a.y - y) > 1.2) continue;
        if (Math.abs(b.y - targetY) >= Math.abs(a.y - targetY) - 1) continue;
        const d = Math.hypot(a.x - x, a.z - z);
        if (d < bestD) {
          bestD = d;
          best = { link, end, at: a };
        }
      }
    }
    return best;
  }
}
