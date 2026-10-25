import * as THREE from 'three';
import { Rng } from '../core/rng';
import { mat, mesh, PALETTE } from '../render/materials';
import { corrugatedPanel } from '../models/geometry';
import { ModelRegistry } from '../models/ModelRegistry';
import type { AABB } from './Collision';
import type { Interactable } from './Interactable';

export interface Hut {
  group: THREE.Group;
  /** Groups that fade out when they block the camera's view of the player. */
  occluders: THREE.Object3D[];
  colliders: AABB[];
  spawn: THREE.Vector3;
  interactables: Interactable[];
  lamp: THREE.PointLight;
  ovenLight: THREE.PointLight;
}

const HALF_W = 3.5;
const HALF_D = 3;
const WALL_H = 2.6;
const DOOR_HALF = 0.75;
const PANEL_COLORS = [PALETTE.rust, PALETTE.rustDark, PALETTE.steel, 0x6b5a3f, PALETTE.oxidized];

function addWallRun(
  parent: THREE.Group,
  rng: Rng,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  yMin: number,
  yMax: number,
) {
  const len = Math.hypot(bx - ax, bz - az);
  const dirX = (bx - ax) / len;
  const dirZ = (bz - az) / len;
  const theta = Math.atan2(-dirZ, dirX);
  const count = Math.max(1, Math.ceil(len / 1.15));
  const w = len / count;
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) * w;
    const h = yMax - yMin + (yMin === 0 ? rng.range(-0.12, 0.08) : 0);
    const panel = mesh(
      corrugatedPanel(w + 0.1, h, 5, 0.035),
      mat(rng.pick(PANEL_COLORS), { roughness: 0.75, metalness: 0.35, doubleSided: true }),
    );
    const offset = (i % 2) * 0.03;
    panel.position.set(ax + dirX * t + dirZ * offset, yMin + h / 2, az + dirZ * t - dirX * offset);
    panel.rotation.set(0, theta, rng.range(-0.025, 0.025));
    parent.add(panel);
  }
}

function post(parent: THREE.Group, x: number, z: number, h = WALL_H + 0.25) {
  const p = mesh(new THREE.BoxGeometry(0.16, h, 0.16), mat(PALETTE.woodDark, { roughness: 0.95 }));
  p.position.set(x, h / 2, z);
  parent.add(p);
}

export function buildHut(rng: Rng): Hut {
  const group = new THREE.Group();
  group.name = 'hut';

  const wallN = new THREE.Group();
  const wallS = new THREE.Group();
  const wallE = new THREE.Group();
  const wallW = new THREE.Group();
  const roof = new THREE.Group();
  wallN.name = 'hut.wallN';
  wallS.name = 'hut.wallS';
  wallE.name = 'hut.wallE';
  wallW.name = 'hut.wallW';
  roof.name = 'hut.roof';

  addWallRun(wallN, rng, -HALF_W, -HALF_D, HALF_W, -HALF_D, 0, WALL_H);
  addWallRun(wallE, rng, HALF_W, -HALF_D, HALF_W, HALF_D, 0, WALL_H);
  addWallRun(wallW, rng, -HALF_W, HALF_D, -HALF_W, -HALF_D, 0, WALL_H);
  addWallRun(wallS, rng, -HALF_W, HALF_D, -DOOR_HALF, HALF_D, 0, WALL_H);
  addWallRun(wallS, rng, DOOR_HALF, HALF_D, HALF_W, HALF_D, 0, WALL_H);
  addWallRun(wallS, rng, -DOOR_HALF, HALF_D, DOOR_HALF, HALF_D, 2.15, WALL_H);

  post(wallN, -HALF_W, -HALF_D);
  post(wallN, HALF_W, -HALF_D);
  post(wallS, -HALF_W, HALF_D);
  post(wallS, HALF_W, HALF_D);
  post(wallS, -DOOR_HALF - 0.08, HALF_D, 2.3);
  post(wallS, DOOR_HALF + 0.08, HALF_D, 2.3);
  const lintel = mesh(new THREE.BoxGeometry(DOOR_HALF * 2 + 0.3, 0.14, 0.18), mat(PALETTE.woodDark, { roughness: 0.95 }));
  lintel.position.set(0, 2.18, HALF_D);
  wallS.add(lintel);

  const warning = mesh(new THREE.BoxGeometry(0.7, 0.5, 0.02), mat(PALETTE.hazard, { roughness: 0.8 }));
  warning.position.set(1.7, 1.55, HALF_D + 0.06);
  warning.rotation.z = 0.06;
  wallS.add(warning);
  const warningMark = mesh(new THREE.BoxGeometry(0.22, 0.22, 0.01), mat(PALETTE.rubber));
  warningMark.position.set(1.7, 1.55, HALF_D + 0.075);
  warningMark.rotation.z = Math.PI / 4 + 0.06;
  wallS.add(warningMark);

  const slope = 0.075;
  const sheetW = 2.75;
  for (let i = 0; i < 3; i++) {
    const sheet = mesh(
      corrugatedPanel(sheetW, HALF_D * 2 + 0.9, 7, 0.04),
      mat(rng.pick([PALETTE.rust, PALETTE.rustDark, 0x6b5a3f]), { roughness: 0.8, metalness: 0.3, doubleSided: true }),
    );
    sheet.rotation.x = -Math.PI / 2 + slope;
    sheet.position.set(-HALF_W - 0.35 + sheetW / 2 + i * (sheetW - 0.25), WALL_H + 0.22 + (i % 2) * 0.03, 0);
    roof.add(sheet);
  }
  for (const [x, z] of [[-1.6, -1], [1.9, 1.2]]) {
    const tire = ModelRegistry.create('prop.tire');
    tire.position.set(x, WALL_H + 0.38 + -z * slope, z);
    roof.add(tire);
  }

  const floorMats = [PALETTE.wood, PALETTE.woodDark, 0x4f3b28];
  for (let x = -HALF_W + 0.25; x < HALF_W; x += 0.5) {
    const plank = mesh(new THREE.BoxGeometry(0.47, 0.05, HALF_D * 2 - 0.05), mat(rng.pick(floorMats), { roughness: 0.95 }), { cast: false });
    plank.position.set(x, 0.025, 0);
    group.add(plank);
  }

  const table = ModelRegistry.create('station.craftingTable');
  table.position.set(-1.9, 0.05, -2.45);
  const oven = ModelRegistry.create('station.oven');
  oven.position.set(2.4, 0.05, -2.4);
  const mattress = ModelRegistry.create('prop.mattress');
  mattress.position.set(-2.85, 0.05, 1.05);
  const crateA = ModelRegistry.create('prop.crate', { seed: 11 });
  crateA.position.set(2.65, 0.05, 2.25);
  const crateB = ModelRegistry.create('prop.crate', { seed: 12 });
  crateB.position.set(2.65, 0.85, 2.2);
  crateB.rotation.y = 0.4;
  const lampModel = ModelRegistry.create('prop.hangingLamp');
  lampModel.position.set(0, 2.15, -0.3);
  group.add(table, oven, mattress, crateA, crateB, lampModel);

  const lamp = new THREE.PointLight(0xffb066, 40, 12, 1.6);
  lamp.position.set(0, 2.0, -0.3);
  const ovenLight = new THREE.PointLight(0xff5a14, 6, 4.5, 2);
  ovenLight.position.set(2.28, 0.55, -1.7);
  group.add(lamp, ovenLight);

  group.add(wallN, wallS, wallE, wallW, roof);

  const t = 0.15;
  const colliders: AABB[] = [
    { minX: -HALF_W - t, maxX: HALF_W + t, minZ: -HALF_D - t, maxZ: -HALF_D + t },
    { minX: -HALF_W - t, maxX: -DOOR_HALF, minZ: HALF_D - t, maxZ: HALF_D + t },
    { minX: DOOR_HALF, maxX: HALF_W + t, minZ: HALF_D - t, maxZ: HALF_D + t },
    { minX: HALF_W - t, maxX: HALF_W + t, minZ: -HALF_D, maxZ: HALF_D },
    { minX: -HALF_W - t, maxX: -HALF_W + t, minZ: -HALF_D, maxZ: HALF_D },
    { minX: -2.75, maxX: -1.05, minZ: -2.9, maxZ: -2.0 },
    { minX: 1.9, maxX: 2.9, minZ: -2.85, maxZ: -1.95 },
    { minX: 2.2, maxX: 3.1, minZ: 1.8, maxZ: 2.7 },
  ];

  const interactables: Interactable[] = [
    {
      id: 'craftingTable',
      label: 'Crafting Table',
      position: new THREE.Vector3(-1.9, 0, -1.75),
      radius: 1.4,
      interact: () => 'Crafting recipes unlock in Phase 3.',
    },
    {
      id: 'oven',
      label: 'Oven',
      position: new THREE.Vector3(2.4, 0, -1.65),
      radius: 1.4,
      interact: () => 'Cooking unlocks in Phase 3. It is warm, at least.',
    },
  ];

  return {
    group,
    occluders: [wallN, wallS, wallE, wallW, roof],
    colliders,
    spawn: new THREE.Vector3(0, 0, 0.6),
    interactables,
    lamp,
    ovenLight,
  };
}
