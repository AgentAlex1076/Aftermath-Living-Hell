import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { Rng } from '../core/random';
import { STARTER_SUPPLIES } from '../data/loot';
import { HUT } from '../models/structures';
import type { LightEmitter } from '../render/LightPool';
import type { OcclusionFader } from '../render/Occlusion';
import type { StationRig } from '../gameplay/Stations';
import { HomeZone } from './HomeZone';
import type { Interactable, InteractionSystem } from './Interactables';
import type { World } from './World';

export interface StarterAreaContext {
  scene: THREE.Scene;
  world: World;
  occlusion: OcclusionFader;
  interactions: InteractionSystem;
  seed: number;
  onUseWorkbench: () => void;
  onUseOven: () => void;
  onUseSiren: () => void;
}

export interface StarterArea {
  spawn: THREE.Vector3;
  homeZone: HomeZone;
  interior: { minX: number; maxX: number; minZ: number; maxZ: number };
  workbench: THREE.Vector3;
  ovenLights: LightEmitter[];
  /** The signal siren by the door; Game keeps its prompt and lamp in sync with the raid state. */
  siren: Interactable;
  sirenLights: LightEmitter[];
  /** Benches and the crate. Indestructible, and the player can carry them. */
  stations: StationRig[];
}

/** The hand-built home: hut, stations, starter crate, yard junk and the wrecks along the road. Never unloads. */
export function buildStarterArea(ctx: StarterAreaContext): StarterArea {
  const { world } = ctx;
  const { roadZ, roadWidth } = CONFIG.world;
  const rng = new Rng(ctx.seed);
  const seed = () => rng.int(0, 1e9);
  let n = 0;
  const uid = () => `starter:${n++}`;

  world.permanentStructures.push({ x: 0, z: 0, rot: 0, w: HUT.width, d: HUT.depth, kind: 'hut' });

  const backZ = -HUT.depth / 2 + 0.7;
  const table = world.spawnProp('station.craftingTable', -1.55, backZ, 0, seed());
  const oven = world.spawnProp('station.oven', 1.75, backZ + 0.02, 0, seed());
  const gun = world.spawnProp('station.gunBench', 0.15, backZ + 0.02, 0, seed());
  const mattressProp = world.spawnProp('prop.mattress', -2.3, 0.55, 0.04, seed());
  const crate = world.spawnContainer('crate', 2.2, 1.15, 0.2, seed(), 'starter:hutCrate', null, STARTER_SUPPLIES);
  crate.breakable = false;

  const workbench = new THREE.Vector3(-1.55, 0, backZ + 0.75);
  const ovenAt = new THREE.Vector3(1.75, 0, backZ + 0.7);
  const gunAt = new THREE.Vector3(0.15, 0, backZ + 0.7);
  const mattressAt = new THREE.Vector3(-2.3, 0, 0.55);
  const crateAt = new THREE.Vector3(2.2, 0, 1.15);
  const tableUse = ctx.interactions.add({
    id: 'craftingTable',
    label: 'Crafting Table',
    verb: 'Craft at',
    position: workbench,
    radius: 1.5,
    onInteract: ctx.onUseWorkbench,
  });
  const ovenUse = ctx.interactions.add({
    id: 'oven',
    label: 'Oven',
    verb: 'Open',
    position: ovenAt,
    radius: 1.4,
    onInteract: ctx.onUseOven,
  });
  const gunUse = ctx.interactions.add({
    id: 'gunBench',
    label: 'Gun Bench',
    verb: 'Build at',
    position: gunAt,
    radius: 1.5,
    onInteract: () => events.emit('toast', { text: 'Open your pack and drag parts onto a gun.', tone: 'info' }),
  });
  const mattressUse = ctx.interactions.add({
    id: 'mattress',
    label: 'Mattress',
    verb: 'Rest',
    position: mattressAt,
    radius: 1.4,
    onInteract: () => events.emit('toast', { text: "You can't sleep. Not with them out there.", tone: 'danger' }),
  });

  // Flush on the solid south wall (west of the doorway), facing the yard.
  const sirenX = -1.5;
  const sirenZ = HUT.depth / 2 + 0.08;
  const sirenProp = world.spawnProp('prop.siren', sirenX, sirenZ, 0, seed());
  const sirenLights = sirenProp.lights;
  for (const l of sirenLights) l.gain = 0;
  const sirenAt = new THREE.Vector3(sirenX, 0, sirenZ + 0.35);
  const siren = ctx.interactions.add({
    id: 'siren',
    label: 'Signal Siren',
    verb: 'Crank',
    position: sirenAt,
    radius: 1.6,
    onInteract: ctx.onUseSiren,
  });

  const stations: StationRig[] = [
    { id: 'craftingTable', name: 'Crafting Table', object: table.object, colliders: table.colliders, lights: table.lights, interact: tableUse, anchor: workbench, w: 1.8, d: 0.9 },
    { id: 'oven', name: 'Oven', object: oven.object, colliders: oven.colliders, lights: oven.lights, interact: ovenUse, anchor: ovenAt, w: 1.2, d: 0.9 },
    { id: 'gunBench', name: 'Gun Bench', object: gun.object, colliders: gun.colliders, lights: gun.lights, interact: gunUse, anchor: gunAt, w: 1.7, d: 0.8 },
    { id: 'mattress', name: 'Mattress', object: mattressProp.object, colliders: mattressProp.colliders, lights: mattressProp.lights, interact: mattressUse, anchor: mattressAt, w: 1.3, d: 0.7 },
    { id: 'crate', name: 'Supply Crate', object: crate.object, colliders: crate.colliders, lights: [], interact: crate.interactable, anchor: crateAt, w: 0.9, d: 0.7, container: crate },
    // Siren stays on the wall — not a movable station.
  ];

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
  world.spawnNode('fence', -7.5, -4, 0.2, seed(), uid());
  world.spawnNode('fence', -9.6, 0.2, Math.PI / 2 + 0.15, seed(), uid());
  world.spawnNode('fence', 6.8, -5.5, -0.35, seed(), uid());

  world.spawnNode('car', -9, roadZ - 1.6, 0.18, seed(), uid());
  world.spawnNode('car', 21, roadZ + 1.2, Math.PI - 0.4, seed(), uid());
  world.spawnProp('prop.lampPost', 3.5, roadZ - roadWidth / 2 - 0.8, -Math.PI / 2, seed());
  world.spawnProp('prop.lampPost', -24, roadZ + roadWidth / 2 + 0.8, Math.PI / 2, seed());
  for (const x of [8, 10.2, -16, -30, 30]) {
    world.spawnNode('barrier', x, roadZ + rng.range(-2.2, 2.2), Math.PI / 2 + rng.range(-0.3, 0.3), seed(), uid());
  }

  const homeZone = new HomeZone(new THREE.Vector3(0, 0, 0), CONFIG.homeZone.radius);
  ctx.scene.add(homeZone.mesh);

  return {
    spawn: new THREE.Vector3(1.2, 0, 1.4),
    homeZone,
    interior: { minX: -HUT.width / 2, maxX: HUT.width / 2, minZ: -HUT.depth / 2, maxZ: HUT.depth / 2 },
    workbench,
    ovenLights: oven.lights,
    siren,
    sirenLights,
    stations,
  };
}
