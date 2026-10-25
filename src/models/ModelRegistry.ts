import type * as THREE from 'three';
import { Rng } from '../core/random';

export type ModelFactory = (rng: Rng) => THREE.Object3D;

/**
 * Central lookup for every visual model by id. Gameplay code only ever asks for an id, so
 * a code-built model can later be replaced by a loaded .glb without touching gameplay.
 */
export class ModelRegistry {
  private readonly factories = new Map<string, ModelFactory>();

  register(id: string, factory: ModelFactory): void {
    this.factories.set(id, factory);
  }

  has(id: string): boolean {
    return this.factories.has(id);
  }

  create(id: string, seed = 0): THREE.Object3D {
    const factory = this.factories.get(id);
    if (!factory) throw new Error(`Unknown model id "${id}"`);
    const obj = factory(new Rng(seed));
    obj.userData.modelId = id;
    return obj;
  }
}

export const models = new ModelRegistry();
