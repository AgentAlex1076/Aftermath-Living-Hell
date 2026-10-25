import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { createNoise2D, fbm } from '../core/noise';
import { Rng } from '../core/random';
import { STARTER_SUPPLIES } from '../data/loot';
import { HUT } from '../models/structures';
import type { LightEmitter } from '../render/LightPool';
import type { Occluder, OcclusionFader } from '../render/Occlusion';
import { HomeZone } from './HomeZone';
import type { InteractionSystem } from './Interactables';
import type { World } from './World';

export interface StarterAreaContext {
  scene: THREE.Scene;
  world: World;
  occlusion: OcclusionFader;
  interactions: InteractionSystem;
  seed: number;
  onUseWorkbench: () => void;
  onUseOven: () => void;
  onUseGunBench: () => void;
}

export interface StarterArea {
  spawn: THREE.Vector3;
  homeZone: HomeZone;
  roof: Occluder;
  interior: { minX: number; maxX: number; minZ: number; maxZ: number };
  workbench: THREE.Vector3;
  gunBench: THREE.Vector3;
  ovenLights: LightEmitter[];
}

/** The hand-built home: hut, stations, starter crate, yard junk and the road. Never unloads. */
export function buildStarterArea(ctx: StarterAreaContext): StarterArea {
  const { world } = ctx;
  const { roadZ, roadWidth } = CONFIG.world;
  const rng = new Rng(ctx.seed);
  const seed = () => rng.int(0, 1e9);
  let n = 0;
  const uid = () => `starter:${n++}`;

  const hut = world.spawnProp('structure.hut', 0, 0, 0, ctx.seed).object;
  const roofNode = hut.getObjectByName(hut.userData.roof as string)!;
  const roof = ctx.occlusion.register(roofNode, 0.0);
  world.permanentStructures.push({ x: 0, z: 0, rot: 0, w: HUT.width, d: HUT.depth, kind: 'hut' });

  const backZ = -HUT.depth / 2 + 0.55;
  world.spawnProp('station.craftingTable', -1.55, backZ, 0, seed());
  const ovenLights = world.spawnProp('station.oven', 1.75, backZ + 0.02, 0, seed()).lights;
  world.spawnProp('station.gunBench', 0.15, backZ + 0.02, 0, seed());
  world.spawnProp('prop.mattress', -2.3, 0.85, 0.04, seed());
  world.spawnContainer('crate', 2.35, 1.55, 0.2, seed(), 'starter:hutCrate', null, STARTER_SUPPLIES);

  const workbench = new THREE.Vector3(-1.55, 0, backZ + 0.75);
  const gunBench = new THREE.Vector3(0.15, 0, backZ + 0.75);
  ctx.interactions.add({
    id: 'craftingTable',
    label: 'Crafting Table',
    verb: 'Craft at',
    position: workbench,
    radius: 1.5,
    onInteract: ctx.onUseWorkbench,
  });
  ctx.interactions.add({
    id: 'oven',
    label: 'Oven',
    verb: 'Open',
    position: new THREE.Vector3(1.75, 0, backZ + 0.7),
    radius: 1.4,
    onInteract: ctx.onUseOven,
  });
  ctx.interactions.add({
    id: 'gunBench',
    label: 'Gun Bench',
    verb: 'Build at',
    position: gunBench,
    radius: 1.5,
    onInteract: ctx.onUseGunBench,
  });
  ctx.interactions.add({
    id: 'mattress',
    label: 'Mattress',
    verb: 'Rest',
    position: new THREE.Vector3(-2.3, 0, 0.85),
    radius: 1.4,
    onInteract: () => events.emit('toast', { text: "You can't sleep. Not with them out there.", tone: 'danger' }),
  });

  // Yard junk: all of it can be harvested.
  world.spawnNode('barrel', 4.0, -1.6, 0, seed(), uid());
  world.spawnNode('barrel', 4.25, -0.85, 0.6, seed(), uid());
  world.spawnContainer('crate', -4.3, 1.4, 0.3, seed(), uid());
  world.spawnNode('rubble', 6.5, 3.5, 0, seed(), uid());
  world.spawnNode('toxicBarrel', -8.5, 7.5, 0, seed(), uid());
  world.spawnNode('deadTree', -6.5, -6.5, 1.2, seed(), uid());
  world.spawnNode('deadTree', 9.5, -3.5, 2.6, seed(), uid());
  world.spawnNode('deadTree', -11, 3, 0.4, seed(), uid());
  world.spawnNode('rock', 8, -8.5, 0, seed(), uid());
  world.spawnNode('scrapPile', -10.5, -8, 0.7, seed(), uid());
  world.spawnProp('prop.fence', -7.5, -4, 0.2, seed());
  world.spawnProp('prop.fence', -9.6, 0.2, Math.PI / 2 + 0.15, seed());
  world.spawnProp('prop.fence', 6.8, -5.5, -0.35, seed());

  ctx.scene.add(buildRoad(ctx.seed));
  world.spawnNode('car', -9, roadZ - 1.6, 0.18, seed(), uid());
  world.spawnNode('car', 21, roadZ + 1.2, Math.PI - 0.4, seed(), uid());
  world.spawnProp('prop.lampPost', 3.5, roadZ - roadWidth / 2 - 0.8, -Math.PI / 2, seed());
  world.spawnProp('prop.lampPost', -24, roadZ + roadWidth / 2 + 0.8, Math.PI / 2, seed());
  for (const x of [8, 10.2, -16, -30, 30]) {
    world.spawnProp('prop.barrier', x, roadZ + rng.range(-2.2, 2.2), Math.PI / 2 + rng.range(-0.3, 0.3), seed());
  }

  const homeZone = new HomeZone(new THREE.Vector3(0, 0, 0), CONFIG.homeZone.radius);
  ctx.scene.add(homeZone.mesh);

  return {
    spawn: new THREE.Vector3((HUT.doorMinX + HUT.doorMaxX) / 2, 0, 0.4),
    homeZone,
    roof,
    interior: hut.userData.interior,
    workbench,
    gunBench,
    ovenLights,
  };
}

function buildRoad(seed: number): THREE.Group {
  const { roadZ, roadWidth, halfSize } = CONFIG.world;
  const group = new THREE.Group();
  group.name = 'road';
  const length = halfSize * 2 + 60;
  const geo = new THREE.PlaneGeometry(length, roadWidth, 260, 6);
  geo.rotateX(-Math.PI / 2);
  const noise = createNoise2D(seed + 7);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color('#2c2d2e');
  const light = new THREE.Color('#3d3e3d');
  const dirt = new THREE.Color('#3a352c');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const n = fbm(noise, x * 0.12, z * 0.5, 3);
    c.copy(base).lerp(light, THREE.MathUtils.smoothstep(n, 0.1, 0.5));
    const edge = Math.abs(z) / (roadWidth / 2);
    c.lerp(dirt, THREE.MathUtils.smoothstep(edge + n * 0.4, 0.75, 1.05));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  road.position.set(0, 0.012, roadZ);
  road.receiveShadow = true;
  group.add(road);

  const rng = new Rng(seed + 31);
  const dashGeo = new THREE.PlaneGeometry(1.8, 0.14);
  dashGeo.rotateX(-Math.PI / 2);
  const dashCount = Math.floor(length / 4.5);
  const dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshStandardMaterial({ color: '#8f7f3f', roughness: 0.9 }), dashCount);
  const m = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < dashCount; i++) {
    if (rng.chance(0.2)) continue;
    m.makeTranslation(-length / 2 + i * 4.5, 0.022, roadZ + rng.range(-0.04, 0.04));
    dashes.setMatrixAt(n++, m);
  }
  dashes.count = n;
  dashes.receiveShadow = true;
  group.add(dashes);
  return group;
}
