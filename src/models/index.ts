import { models } from './ModelRegistry';
import { buildHazmat } from './hazmat';
import { buildCraftingTable, buildHut, buildMattress, buildOven } from './structures';
import { buildBarrel, buildBarrier, buildCar, buildCrate, buildDeadTree, buildFence, buildLampPost, buildRubble } from './props';
import { buildBoulder, buildCarcass, buildScrapPile } from './nodes';
import { buildCabinet, buildLabLocker, buildToolbox } from './containers';
import { buildLabRuin, buildRuinHouse } from './ruins';
import { ITEM_MODELS } from './items';
import { buildPiece, buildStorageBox } from './buildables';
import { buildBloater, buildBrute, buildChemist, buildCrawler, buildShambler } from './mutants';
import { PIECES, TIER_ORDER, pieceModel, type PieceDef } from '../data/buildables';

export function registerModels(): void {
  models.register('player.hazmat', () => buildHazmat());

  models.register('structure.hut', (rng) => buildHut(rng));
  models.register('station.craftingTable', () => buildCraftingTable());
  models.register('station.oven', () => buildOven());
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

  models.register('node.rock', (rng) => buildBoulder(rng));
  models.register('node.scrapPile', (rng) => buildScrapPile(rng));
  models.register('node.carcass', (rng) => buildCarcass(rng));

  models.register('container.cabinet', () => buildCabinet());
  models.register('container.toolbox', () => buildToolbox());
  models.register('container.labLocker', () => buildLabLocker());

  models.register('structure.ruinHouse', (rng) => buildRuinHouse(rng));
  models.register('structure.labRuin', (rng) => buildLabRuin(rng));

  for (const def of Object.values(PIECES) as PieceDef[]) {
    if (def.kind === 'deployable') models.register(pieceModel(def, 'wood'), (rng) => buildStorageBox(rng));
    else for (const tier of TIER_ORDER) models.register(pieceModel(def, tier), (rng) => buildPiece(def, tier, rng));
  }

  models.register('enemy.shambler', (rng) => buildShambler(rng));
  models.register('enemy.crawler', (rng) => buildCrawler(rng));
  models.register('enemy.bloater', (rng) => buildBloater(rng));
  models.register('enemy.brute', (rng) => buildBrute(rng));
  models.register('enemy.chemist', (rng) => buildChemist(rng));

  for (const [id, build] of Object.entries(ITEM_MODELS)) models.register(id, () => build());
}

export { models };
