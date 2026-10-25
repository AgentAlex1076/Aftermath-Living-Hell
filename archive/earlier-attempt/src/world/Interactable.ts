import type { Vector3 } from 'three';

export interface Interactable {
  id: string;
  label: string;
  position: Vector3;
  radius: number;
  /** Returns a short message to show the player. */
  interact: () => string;
}
