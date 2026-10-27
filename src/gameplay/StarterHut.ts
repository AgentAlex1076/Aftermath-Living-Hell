import { CONFIG } from '../data/config';
import { PIECES } from '../data/buildables';
import { edgeTransform, type Building, type Edge } from './Building';

const L = CONFIG.building.cell;

/**
 * The starter hut's walls, door and roof as ordinary wood pieces on the 3 m grid.
 * Four foundations cover x/z -3..3. The south-east edge is the doorway.
 */
export function seedStarterHut(building: Building): void {
  const cells: [number, number][] = [[-1, -1], [-1, 0], [0, -1], [0, 0]];
  for (const [i, j] of cells) {
    building.grant(PIECES.foundation, 'wood', i * L + L / 2, j * L + L / 2, 0, [i, j], null);
  }

  const edges: { e: Edge; id: 'wall' | 'doorway' }[] = [
    { e: { i: -1, j: -1, axis: 'x' }, id: 'wall' },
    { e: { i: 0, j: -1, axis: 'x' }, id: 'wall' },
    { e: { i: -1, j: 1, axis: 'x' }, id: 'wall' },
    { e: { i: 0, j: 1, axis: 'x' }, id: 'doorway' },
    { e: { i: -1, j: -1, axis: 'z' }, id: 'wall' },
    { e: { i: -1, j: 0, axis: 'z' }, id: 'wall' },
    { e: { i: 1, j: -1, axis: 'z' }, id: 'wall' },
    { e: { i: 1, j: 0, axis: 'z' }, id: 'wall' },
  ];
  let doorway: Edge | null = null;
  for (const w of edges) {
    const t = edgeTransform(w.e);
    building.grant(PIECES[w.id], 'wood', t.x, t.z, t.rot, null, w.e);
    if (w.id === 'doorway') doorway = w.e;
  }
  if (doorway) {
    const t = edgeTransform(doorway);
    const door = building.grant(PIECES.door, 'wood', t.x, t.z, t.rot, null, doorway);
    building.forceOpen(door);
  }
  for (const [i, j] of cells) {
    building.grant(PIECES.roof, 'wood', i * L + L / 2, j * L + L / 2, 0, [i, j], null);
  }
}
