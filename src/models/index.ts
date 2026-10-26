import type * as THREE from 'three';
import { models } from './ModelRegistry';
import { buildHazmat } from './hazmat';
import { ALL_GUN_PART_IDS } from '../data/guns';
import { assembleGun, buildAmmoItem, buildCraftedGunItem, buildGunBench, buildGunPart } from './guns';
import { buildCraftingTable, buildHut, buildMattress, buildOven } from './structures';
import { buildBarrel, buildBarrier, buildCar, buildCrate, buildDeadTree, buildFence, buildLampPost, buildRubble, buildSiren } from './props';
import { buildBoulder, buildCarcass, buildScrapPile } from './nodes';
import { buildCabinet, buildLabLocker, buildSalvageCache, buildToolbox } from './containers';
import { buildLabRuin, buildRuinHouse } from './ruins';
import { ITEM_MODELS } from './items';
import { buildPiece, buildStorageBox } from './buildables';
import {
  buildAutoTurret, buildBarbedWire, buildFlameVent, buildFloodlight, buildGasTrap,
  buildGenerator, buildLandmine, buildSandbags, buildShotgunTrap, buildSpikeStrip, buildTripwire,
} from './defenses';
import {
  buildBloater, buildBrute, buildChemist, buildClimber, buildCrawler, buildPatientZero,
  buildScreamer, buildShambler, buildSpitter, buildStalker,
} from './mutants';
import { PIECES, TIER_ORDER, pieceModel, type PieceDef, type PieceId } from '../data/buildables';
import type { Rng } from '../core/random';
import { FOOTBRIDGE_LENGTHS, ROAD_BRIDGE_LENGTHS } from '../world/Height';
import { buildFootbridge, buildRoadBridge } from './traversal';

const DEPLOY_BUILDERS: Partial<Record<PieceId, (rng: Rng) => THREE.Object3D>> = {
  storageBox: buildStorageBox,
  sandbags: buildSandbags,
  spikeStrip: buildSpikeStrip,
  barbedWire: buildBarbedWire,
  landmine: () => buildLandmine(),
  tripwire: () => buildTripwire(),
  gasTrap: () => buildGasTrap(),
  shotgunTrap: () => buildShotgunTrap(),
  generator: () => buildGenerator(),
  autoTurret: () => buildAutoTurret(),
  floodlight: () => buildFloodlight(),
  flameVent: () => buildFlameVent(),
};

export function registerModels(): void {
  models.register('player.hazmat', () => buildHazmat());

  models.register('structure.hut', (rng) => buildHut(rng));
  models.register('station.craftingTable', () => buildCraftingTable());
  models.register('station.oven', () => buildOven());
  models.register('station.gunBench', () => buildGunBench());
  models.register('prop.mattress', (rng) => buildMattress(rng));

  models.register('prop.deadTree', (rng) => buildDeadTree(rng));
  models.register('prop.barrel', (rng) => buildBarrel(rng));
  models.register('prop.barrelToxic', (rng) => buildBarrel(rng, true));
  models.register('prop.crate', (rng) => buildCrate(rng));
  models.register('prop.rubble', (rng) => buildRubble(rng));
  models.register('prop.car', (rng) => buildCar(rng));
  models.register('prop.fence', (rng) => buildFence(rng));
  models.register('prop.lampPost', () => buildLampPost());
  models.register('prop.barrier', () => buildBarrier());
  models.register('prop.siren', () => buildSiren());
  for (const l of FOOTBRIDGE_LENGTHS) models.register(`prop.footbridge.${l}`, (rng) => buildFootbridge(rng, l));
  for (const l of ROAD_BRIDGE_LENGTHS) models.register(`prop.roadBridge.${l}`, (rng) => buildRoadBridge(rng, l));

  models.register('node.rock', (rng) => buildBoulder(rng));
  models.register('node.scrapPile', (rng) => buildScrapPile(rng));
  models.register('node.carcass', (rng) => buildCarcass(rng));

  models.register('container.cabinet', () => buildCabinet());
  models.register('container.toolbox', () => buildToolbox());
  models.register('container.labLocker', () => buildLabLocker());
  models.register('container.salvage', () => buildSalvageCache());

  models.register('structure.ruinHouse', (rng) => buildRuinHouse(rng));
  models.register('structure.labRuin', (rng) => buildLabRuin(rng));

  for (const def of Object.values(PIECES) as PieceDef[]) {
    if (def.kind === 'deployable') {
      const build = DEPLOY_BUILDERS[def.id as PieceId] ?? buildStorageBox;
      models.register(pieceModel(def, 'wood'), (rng) => build(rng));
    } else {
      for (const tier of TIER_ORDER) models.register(pieceModel(def, tier), (rng) => buildPiece(def, tier, rng));
    }
  }

  models.register('enemy.shambler', (rng) => buildShambler(rng));
  models.register('enemy.crawler', (rng) => buildCrawler(rng));
  models.register('enemy.bloater', (rng) => buildBloater(rng));
  models.register('enemy.brute', (rng) => buildBrute(rng));
  models.register('enemy.chemist', (rng) => buildChemist(rng));
  models.register('enemy.spitter', (rng) => buildSpitter(rng));
  models.register('enemy.screamer', (rng) => buildScreamer(rng));
  models.register('enemy.stalker', (rng) => buildStalker(rng));
  models.register('enemy.climber', (rng) => buildClimber(rng));
  models.register('enemy.patientZero', (rng) => buildPatientZero(rng));

  for (const [id, build] of Object.entries(ITEM_MODELS)) models.register(id, () => build());
  models.register('item.ammo', () => buildAmmoItem());
  models.register('item.craftedGun', () => buildCraftedGunItem());
  for (const id of ALL_GUN_PART_IDS) {
    models.register(`part.${id}`, () => buildGunPart(id));
    models.register(`item.${id}`, () => buildGunPart(id));
  }
}

export { assembleGun };


export { models };
