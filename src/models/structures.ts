import * as THREE from 'three';
import type { Rng } from '../core/random';
import { FLOORABLE_TAG, type LocalCollider } from '../physics/Collision';
import type { LightDesc } from '../render/LightPool';
import { box, cyl, group, mesh, sphere, torus } from './build';
import { mat, uniqueMat, type MaterialKey } from './materials';

export const HUT = {
  width: 6,
  /** Width and depth are multiples of the 3 m building grid, so player walls line up with the hut. */
  depth: 6,
  height: 2.5,
  wallThickness: 0.16,
  doorMinX: 0.6,
  doorMaxX: 1.8,
  doorHeight: 2.05,
  roofRise: 0.95,
  overhang: 0.4,
} as const;

const PLANK_MATS: MaterialKey[] = ['wood', 'woodLight', 'woodDark', 'woodRot', 'wood'];
const q = (v: number, step = 0.05) => Math.round(v / step) * step;

function corrugatedSheet(width: number, length: number): THREE.BufferGeometry {
  const geo = new THREE.PlaneGeometry(width, length, 28, 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, Math.sin((pos.getX(i) / width) * Math.PI * 14) * 0.03);
  }
  geo.computeVertexNormals();
  return geo;
}

interface WallSpec {
  name: string;
  length: number;
  /** Gaps along the wall (local coordinate along its length), with a vertical span left open. */
  gaps: { from: number; to: number; bottom: number; top: number }[];
}

/** Builds a plank wall running along local +X, centered at the origin. */
function plankWall(rng: Rng, spec: WallSpec): THREE.Group {
  const g = group(spec.name);
  const plankW = 0.3;
  const t = HUT.wallThickness;
  const count = Math.round(spec.length / plankW);
  for (let i = 0; i < count; i++) {
    const x = -spec.length / 2 + plankW * (i + 0.5);
    const isEdge = i === 0 || i === count - 1;
    if (!isEdge && rng.chance(0.05)) continue;

    const top = q(HUT.height + rng.range(-0.18, 0.06));
    const gap = spec.gaps.find((gp) => x > gp.from && x < gp.to);
    const spans: [number, number][] = gap
      ? [
          [0, gap.bottom],
          [gap.top, top],
        ]
      : [[0, top]];

    const m = mat(rng.pick(PLANK_MATS));
    for (const [y0, y1] of spans) {
      const h = q(y1 - y0);
      if (h < 0.1) continue;
      g.add(
        box(plankW * 0.94, h, t, m, {
          pos: [x, y0 + h / 2, rng.range(-0.015, 0.015)],
          rot: [0, 0, rng.range(-0.015, 0.015)],
        }),
      );
    }
  }
  for (const railY of [0.45, 2.0]) {
    g.add(box(spec.length, 0.1, 0.06, mat('woodDark'), { pos: [0, railY, -t / 2 - 0.03] }));
  }
  return g;
}

export function buildHut(rng: Rng): THREE.Object3D {
  const { width: W, depth: D, height: H, wallThickness: T } = HUT;
  const hut = group('hut');

  const floor = group('floor');
  const boardD = 0.28;
  for (let z = -D / 2 + boardD / 2; z < D / 2; z += boardD) {
    floor.add(box(W, 0.04, boardD * 0.95, mat(rng.pick(PLANK_MATS)), { pos: [0, 0, z], shadow: false }));
  }
  hut.add(floor);

  const wallS = plankWall(rng, {
    name: 'wallS',
    length: W,
    gaps: [{ from: HUT.doorMinX, to: HUT.doorMaxX, bottom: 0, top: HUT.doorHeight }],
  });
  wallS.position.z = D / 2;
  const door = group('door', box(1.1, 1.95, 0.07, mat('woodDark'), { pos: [0.55, 1.0, 0] }));
  door.add(box(1.0, 0.12, 0.09, mat('wood'), { pos: [0.55, 0.5, 0.01] }), box(1.0, 0.12, 0.09, mat('wood'), { pos: [0.55, 1.5, 0.01] }));
  door.position.set(HUT.doorMinX, 0.03, 0.05);
  door.rotation.y = -1.95;
  wallS.add(door);
  wallS.add(box(1.3, 0.12, 0.2, mat('woodDark'), { pos: [(HUT.doorMinX + HUT.doorMaxX) / 2, HUT.doorHeight + 0.06, 0] }));

  const wallN = plankWall(rng, { name: 'wallN', length: W, gaps: [] });
  wallN.position.z = -D / 2;
  wallN.rotation.y = Math.PI;

  const wallE = plankWall(rng, { name: 'wallE', length: D, gaps: [{ from: -1.0, to: 0.2, bottom: 1.0, top: 1.8 }] });
  wallE.position.x = W / 2;
  wallE.rotation.y = Math.PI / 2;
  wallE.add(box(1.5, 0.14, 0.05, mat('woodLight'), { pos: [-0.4, 1.35, 0.1], rot: [0, 0, 0.45] }));

  const wallW = plankWall(rng, { name: 'wallW', length: D, gaps: [{ from: -0.6, to: 0.6, bottom: 1.0, top: 1.75 }] });
  wallW.position.x = -W / 2;
  wallW.rotation.y = -Math.PI / 2;
  wallW.add(box(1.4, 0.14, 0.05, mat('wood'), { pos: [0, 1.25, 0.1], rot: [0, 0, -0.3] }), box(1.4, 0.14, 0.05, mat('woodRot'), { pos: [0, 1.55, 0.1], rot: [0, 0, 0.12] }));

  for (const [cx, cz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const post = box(0.22, H + 0.15, 0.22, mat('woodDark'), { pos: [cx * (W / 2), (H + 0.15) / 2, cz * (D / 2)] });
    (cz === 1 ? wallS : wallN).attach(post);
  }

  const roof = group('roof');
  const rise = HUT.roofRise;
  const halfSpan = D / 2 + HUT.overhang;
  const slopeLen = Math.hypot(halfSpan, rise) + 0.05;
  const angle = Math.atan2(rise, halfSpan);
  const sheetW = 1.32;
  const sheetGeo = corrugatedSheet(sheetW, slopeLen);
  const sheetMats = (['rust', 'rustLight', 'corrugated'] as const).map((k) => {
    const m = uniqueMat(k);
    m.side = THREE.DoubleSide;
    m.shadowSide = THREE.DoubleSide;
    return m;
  });
  const sheetCount = Math.ceil((W + HUT.overhang * 2) / (sheetW * 0.92));
  for (const side of [1, -1]) {
    for (let i = 0; i < sheetCount; i++) {
      if (side === 1 && i === 2) continue;
      const x = -(W / 2 + HUT.overhang) + sheetW / 2 + i * sheetW * 0.92;
      const sheetMat = sheetMats[rng.chance(0.35) ? 0 : rng.chance(0.3) ? 1 : 2];
      const sheet = mesh(sheetGeo, sheetMat, {
        pos: [x, H + rise / 2 + 0.06 + i * 0.004, side * (halfSpan / 2)],
        rot: [side * angle, 0, rng.range(-0.02, 0.02)],
      });
      roof.add(sheet);
    }
  }
  roof.add(box(W + HUT.overhang * 2, 0.14, 0.16, mat('woodDark'), { pos: [0, H + rise, 0] }));

  const gableShape = new THREE.Shape();
  gableShape.moveTo(-D / 2, 0);
  gableShape.lineTo(D / 2, 0);
  gableShape.lineTo(0, rise);
  gableShape.closePath();
  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: T, bevelEnabled: false });
  gableGeo.translate(0, 0, -T / 2);
  for (const side of [1, -1]) {
    const gable = mesh(gableGeo, mat('woodRot'), { pos: [side * (W / 2), H - 0.12, 0], rot: [0, Math.PI / 2, 0] });
    roof.add(gable);
  }

  hut.add(wallS, wallN, wallE, wallW, roof);

  const lamp = group('lamp');
  const bulbMat = uniqueMat('bulbWarm');
  lamp.add(
    cyl(0.008, 0.008, 0.85, mat('rubber'), { pos: [0, H + rise - 0.5, 0], shadow: false }),
    cyl(0.03, 0.03, 0.06, mat('metalDark'), { pos: [0, H + rise - 0.95, 0], shadow: false }),
    sphere(0.055, bulbMat, { pos: [0, H + rise - 1.02, 0], shadow: false }),
  );
  const lampLights: LightDesc[] = [{ pos: [0, H + rise - 1.15, 0], color: '#ffb35a', intensity: 16, distance: 10, style: 'faulty', emissive: bulbMat }];
  lamp.userData.lights = lampLights;
  lamp.position.set(-0.4, 0, 0.3);
  hut.add(lamp);

  const colliders: LocalCollider[] = [
    { kind: 'box', x: 0, z: -D / 2, hw: W / 2 + T / 2, hd: T / 2 + 0.02 },
    { kind: 'box', x: (-W / 2 + HUT.doorMinX) / 2, z: D / 2, hw: (HUT.doorMinX + W / 2) / 2, hd: T / 2 + 0.02 },
    { kind: 'box', x: (HUT.doorMaxX + W / 2) / 2, z: D / 2, hw: (W / 2 - HUT.doorMaxX) / 2, hd: T / 2 + 0.02 },
    { kind: 'box', x: W / 2, z: 0, hw: T / 2 + 0.02, hd: D / 2 },
    { kind: 'box', x: -W / 2, z: 0, hw: T / 2 + 0.02, hd: D / 2 },
    { kind: 'box', x: HUT.doorMinX - 0.2, z: D / 2 + 0.56, hw: 0.12, hd: 0.5, tag: FLOORABLE_TAG },
  ];
  hut.userData.colliders = colliders;
  hut.userData.occluders = ['wallS', 'wallN', 'wallE', 'wallW'];
  hut.userData.roof = 'roof';
  hut.userData.interior = { minX: -W / 2, maxX: W / 2, minZ: -D / 2, maxZ: D / 2 };
  return hut;
}

export function buildCraftingTable(): THREE.Object3D {
  const g = group('craftingTable');
  g.add(box(1.7, 0.08, 0.8, mat('woodLight'), { pos: [0, 0.9, 0] }));
  for (const [x, z] of [
    [-0.78, -0.33],
    [0.78, -0.33],
    [-0.78, 0.33],
    [0.78, 0.33],
  ]) {
    g.add(box(0.09, 0.88, 0.09, mat('woodDark'), { pos: [x, 0.44, z] }));
  }
  g.add(box(1.6, 0.05, 0.7, mat('wood'), { pos: [0, 0.25, 0] }));
  g.add(box(1.7, 0.85, 0.05, mat('woodRot'), { pos: [0, 1.38, -0.38] }));

  g.add(
    box(0.05, 0.3, 0.02, mat('metalDark'), { pos: [-0.55, 1.45, -0.34], rot: [0, 0, 0.2] }),
    box(0.2, 0.06, 0.03, mat('metalDark'), { pos: [-0.6, 1.6, -0.34], rot: [0, 0, 0.2] }),
    box(0.42, 0.14, 0.01, mat('metalDark'), { pos: [-0.1, 1.5, -0.34] }),
    box(0.12, 0.05, 0.03, mat('woodDark'), { pos: [0.16, 1.5, -0.33] }),
    box(0.04, 0.26, 0.03, mat('woodDark'), { pos: [0.45, 1.42, -0.33], rot: [0, 0, -0.1] }),
    box(0.14, 0.06, 0.05, mat('iron'), { pos: [0.46, 1.56, -0.33], rot: [0, 0, -0.1] }),
  );

  const vice = group(
    'vice',
    box(0.2, 0.08, 0.22, mat('iron'), { pos: [0, 0.04, 0] }),
    box(0.22, 0.12, 0.05, mat('iron'), { pos: [0, 0.14, -0.05] }),
    box(0.22, 0.12, 0.05, mat('iron'), { pos: [0, 0.14, 0.06] }),
    cyl(0.012, 0.012, 0.28, mat('metalDark'), { pos: [0, 0.12, 0.16], rot: [0, 0, Math.PI / 2] }),
  );
  vice.position.set(0.62, 0.94, 0.25);
  g.add(vice);

  g.add(
    cyl(0.07, 0.07, 0.025, mat('rust'), { pos: [-0.3, 0.955, 0.15], segments: 10 }),
    box(0.3, 0.06, 0.09, mat('gunMetal'), { pos: [0.05, 0.97, 0.05], rot: [0, 0.4, 0] }),
    box(0.06, 0.12, 0.05, mat('gunGrip'), { pos: [-0.08, 0.98, 0.0], rot: [0, 0.4, 0.3] }),
    cyl(0.02, 0.02, 0.26, mat('gunMetal'), { pos: [0.3, 0.96, -0.1], rot: [Math.PI / 2, 0, 0.9], segments: 8 }),
  );

  const colliders: LocalCollider[] = [{ kind: 'box', x: 0, z: 0, hw: 0.88, hd: 0.42 }];
  g.userData.colliders = colliders;
  return g;
}

export function buildOven(): THREE.Object3D {
  const g = group('oven');
  const iron = mat('iron');
  g.add(box(0.8, 0.62, 0.62, iron, { pos: [0, 0.5, 0] }));
  g.add(box(0.86, 0.05, 0.68, mat('metalDark'), { pos: [0, 0.835, 0] }));
  for (const [x, z] of [
    [-0.33, -0.24],
    [0.33, -0.24],
    [-0.33, 0.24],
    [0.33, 0.24],
  ]) {
    g.add(cyl(0.035, 0.045, 0.2, iron, { pos: [x, 0.1, z], segments: 8 }));
  }
  g.add(box(0.44, 0.36, 0.04, mat('metalDark'), { pos: [-0.08, 0.5, 0.32] }));
  const emberMat = uniqueMat('ember');
  g.add(box(0.3, 0.1, 0.02, emberMat, { pos: [-0.08, 0.56, 0.345], shadow: false }));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.012, 0.11, 0.025, iron, { pos: [-0.2 + i * 0.08, 0.56, 0.35], shadow: false }));
  }
  g.add(cyl(0.02, 0.02, 0.08, mat('metalDark'), { pos: [0.18, 0.5, 0.36], rot: [Math.PI / 2, 0, 0], segments: 8 }));
  for (let i = 0; i < 3; i++) {
    g.add(box(0.02, 0.04, 0.4, mat('metalDark'), { pos: [0.41, 0.4 + i * 0.08, 0] }));
  }

  g.add(cyl(0.09, 0.09, 2.95, mat('metalDark'), { pos: [0.2, 0.86 + 1.475, -0.14], segments: 12 }));
  g.add(cyl(0.11, 0.11, 0.08, iron, { pos: [0.2, 0.86 + 2.95, -0.14], segments: 12 }));
  g.add(cyl(0.16, 0.16, 0.04, iron, { pos: [0.2, 0.86 + 3.05, -0.14], segments: 12 }));

  g.add(cyl(0.14, 0.13, 0.16, mat('rust'), { pos: [-0.16, 0.94, 0.05], segments: 14 }));
  g.add(torus(0.07, 0.01, mat('metalDark'), { pos: [-0.16, 1.04, 0.05], rot: [0, 0, 0], arc: Math.PI }));

  const colliders: LocalCollider[] = [{ kind: 'box', x: 0, z: 0, hw: 0.45, hd: 0.36 }];
  const lights: LightDesc[] = [{ pos: [-0.08, 0.55, 0.7], color: '#ff7a33', intensity: 10, distance: 7, style: 'fire', emissive: emberMat }];
  g.userData.colliders = colliders;
  g.userData.lights = lights;
  return g;
}

export function buildMattress(rng: Rng): THREE.Object3D {
  const g = group('mattress');
  g.add(box(0.95, 0.16, 1.9, mat('cloth'), { pos: [0, 0.08, 0] }));
  g.add(box(0.5, 0.02, 0.6, mat('clothStain'), { pos: [0.1, 0.165, 0.2], rot: [0, rng.range(-0.4, 0.4), 0] }));
  g.add(box(0.6, 0.12, 0.32, mat('clothStain'), { pos: [0, 0.2, -0.72], rot: [0, 0.08, 0] }));
  g.add(box(0.8, 0.04, 0.9, mat('woodRot'), { pos: [0.05, 0.18, 0.35], rot: [0, -0.12, 0.05] }));
  return g;
}
