import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { GameLoop } from '../core/GameLoop';
import { Input, type Action } from '../core/Input';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math';
import { Rng } from '../core/random';
import { evaluateBuild, makePipePistol, makeStockGun } from '../data/guns';
import { ALL_ITEM_IDS, ITEMS, type ItemDef, type ItemId } from '../data/items';
import { ALL_ENEMY_IDS, BOSS_IDS, ENEMIES, type EnemyId } from '../data/enemies';
import type { ItemAmount } from '../data/loot';
import { audio, sfx } from '../audio/AudioEngine';
import { Soundscape } from '../audio/Soundscape';
import { formatClock } from '../data/score';
import { OVEN_RECIPES, RECIPES, type Recipe } from '../data/recipes';
import { Player } from '../entities/Player';
import { PlayerAnimator } from '../entities/PlayerAnimator';
import { allPieceIds, hopperAccepts, hopperHint, PIECES, pieceModel } from '../data/buildables';
import { Building, type Piece } from '../gameplay/Building';
import { BuildMode } from '../gameplay/BuildMode';
import { Cure } from '../gameplay/Cure';
import { Stations } from '../gameplay/Stations';
import { seedStarterHut } from '../gameplay/StarterHut';
import { Defenses } from '../gameplay/Defenses';
import { Crafting } from '../gameplay/Crafting';
import { FlowField } from '../gameplay/FlowField';
import { Gathering } from '../gameplay/Gathering';
import { Horde, meleePower } from '../gameplay/Horde';
import { Inventory } from '../gameplay/Inventory';
import { Meta } from '../gameplay/Meta';
import { Oven } from '../gameplay/Oven';
import { Raid } from '../gameplay/Raid';
import { Siege } from '../gameplay/Siege';
import { Shooting } from '../gameplay/Shooting';
import { Survival } from '../gameplay/Survival';
import { BuildUI, pieceIconKey } from '../ui/BuildUI';
import { CraftingPanel, OvenPanel, StoragePanel } from '../ui/StationPanels';
import { assembleGunHeld } from '../models/guns';
import { models, registerModels } from '../models';
import { mergeStatic } from '../models/merge';
import { CollisionWorld } from '../physics/Collision';
import { CameraRig } from '../render/CameraRig';
import { createRenderer } from '../render/createRenderer';
import { Debris } from '../render/Debris';
import { Environment } from '../render/Environment';
import { GasFx } from '../render/GasFx';
import { LightPool } from '../render/LightPool';
import { OcclusionFader } from '../render/Occlusion';
import { PostFX } from '../render/PostFX';
import { Weather } from '../render/Weather';
import { DebugPanel } from '../ui/DebugPanel';
import { FloatingText } from '../ui/FloatingText';
import { Hud } from '../ui/Hud';
import { renderIcons, renderItemIcons } from '../ui/IconRenderer';
import { HotbarView, InventoryView } from '../ui/InventoryUI';
import { MapScreen } from '../ui/MapScreen';
import { MapTiles } from '../ui/MapTiles';
import { Minimap } from '../ui/Minimap';
import { MetaOverlay } from '../ui/MetaScreens';
import { DeathScreen, PauseScreen, StartScreen } from '../ui/Screens';
import { sound } from '../core/Sound';
import { InteractionSystem, type Interactable } from '../world/Interactables';
import { DayNight } from '../world/DayNight';
import { buildStarterArea, type StarterArea } from '../world/StarterArea';
import { setTerrainCutout, setWaterTime } from '../world/Terrain';
import type { LinkEnd, TraversalLink } from '../world/Traversal';
import { World, type ContainerInstance, type FeatureKind } from '../world/World';

type GameState = 'title' | 'intro' | 'playing' | 'paused' | 'dead';

/** Hotbar slots normally; build bar pieces in build mode (which has a 7th). */
const HOTBAR_KEYS: Action[] = ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6', 'hotbar7'];

/** `?seed=123` replays a world; otherwise every run gets a fresh one. */
function runSeed(): number {
  const param = new URLSearchParams(window.location.search).get('seed');
  const parsed = param ? Number.parseInt(param, 10) : NaN;
  return Number.isFinite(parsed) ? parsed >>> 0 : Math.floor(Math.random() * 1e9);
}

export class Game {
  readonly seed = runSeed();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly rig: CameraRig;
  private readonly env: Environment;
  private readonly post: PostFX;
  private readonly weather: Weather;
  private readonly gasFx: GasFx;
  private readonly sound = new Soundscape();
  private lastHealth: number = CONFIG.player.maxHealth;
  private scenePixelRatio = 0;
  private readonly input: Input;
  private readonly loop: GameLoop;
  private readonly collision = new CollisionWorld();
  private readonly occlusion = new OcclusionFader();
  private readonly lights: LightPool;
  private readonly interactions = new InteractionSystem();
  private readonly world: World;
  private readonly area: StarterArea;
  private readonly player: Player;
  private readonly animator: PlayerAnimator;
  private readonly inventory = new Inventory();
  private readonly gathering: Gathering;
  private readonly survival: Survival;
  private readonly crafting: Crafting;
  private readonly oven: Oven;
  private readonly icons: Record<string, string>;
  private readonly craftingPanel: CraftingPanel;
  private readonly ovenPanel: OvenPanel;
  private readonly storagePanel: StoragePanel;
  private readonly shooting: Shooting;
  private readonly defenses: Defenses;
  private readonly building: Building;
  private readonly buildMode: BuildMode;
  private readonly buildUI: BuildUI;
  readonly flow: FlowField;
  private readonly cure: Cure;
  private readonly stations: Stations;
  private useVerb: string | null = null;
  private useLabel = '';
  private eDown = false;
  private eTime = 0;
  readonly horde: Horde;
  readonly raid: Raid;
  readonly siege: Siege;
  readonly dayNight = new DayNight();
  /** Salvage caches dropped by raids, oldest first; emptied ones are cleared when a new one lands. */
  private readonly caches: ContainerInstance[] = [];
  private cacheCount = 0;
  private readonly roamRng: Rng;
  private roamClock = 0;
  private openStorage: Piece | null = null;
  private hammerTarget: Piece | null = null;
  /** Consecutive scrap hits on `hammerTarget` (resets if the 2s window lapses). */
  private demolishHits = 0;
  /** Seconds left before scrap progress resets. */
  private demolishWindow = 0;
  private ovenGlow = 0;
  /** Metres waded since the last splash (and the noise it makes). */
  private wadeDist = 0;
  private rungDist = 0;
  private reachNote = 'not run';
  private readonly debris: Debris;
  private readonly floaters: FloatingText;
  private readonly hud: Hud;
  private readonly inventoryView: InventoryView;
  private readonly minimap: Minimap;
  private readonly mapScreen: MapScreen;
  private readonly pauseScreen: PauseScreen;
  private readonly deathScreen: DeathScreen;
  private readonly meta: Meta;
  private readonly metaOverlay: MetaOverlay;
  private recorded = false;
  private readonly debug: DebugPanel;

  private state: GameState = 'title';
  private introElapsed = 0;
  private introImpactDone = false;
  private introHeartbeatDone = false;
  private introBreathingDone = false;
  private colliderDebug: THREE.LineSegments | null = null;
  private colliderDebugVersion = -1;
  private currentInteractable: Interactable | null = null;
  private insideZone = true;
  private runTime = 0;
  private heldItem: string | null = null;
  private readonly heldModels = new Map<string, THREE.Object3D>();

  private readonly raycaster = new THREE.Raycaster();
  private readonly mouseNdc = new THREE.Vector2();
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -CONFIG.player.aimHeight);
  private readonly aimHit = new THREE.Vector3();
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly groundHit = new THREE.Vector3();
  private hasGroundHit = false;
  private readonly renderPos = new THREE.Vector3();
  private readonly focusTarget = new THREE.Vector3();
  private readonly camForward = new THREE.Vector3();
  private readonly camRight = new THREE.Vector3();
  private readonly occlusionTargets: THREE.Vector3[] = [];
  private flashlightOn = false;
  private readonly flashlight: THREE.SpotLight;

  constructor(appRoot: HTMLElement, uiRoot: HTMLElement) {
    registerModels();

    this.renderer = createRenderer(appRoot);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    this.scene.add(this.rig.camera);
    this.env = new Environment(this.scene, this.seed);
    this.input = new Input(this.renderer.domElement);
    this.lights = new LightPool(this.scene);

    this.world = new World({
      scene: this.scene,
      collision: this.collision,
      occlusion: this.occlusion,
      lights: this.lights,
      interactions: this.interactions,
      seed: this.seed,
      onSearch: (c) => this.gathering.search(c),
      onClimb: (link, end) => this.climb(link, end),
    });
    this.area = buildStarterArea({
      scene: this.scene,
      world: this.world,
      occlusion: this.occlusion,
      interactions: this.interactions,
      seed: this.seed,
      onUseWorkbench: () => this.setInventoryOpen(true, 'craft'),
      onUseOven: () => this.setInventoryOpen(true, 'oven'),
      onUseSiren: () => this.crankSiren(),
    });
    this.world.update(0, this.area.spawn, true);
    this.weather = new Weather(this.scene, this.seed);
    this.gasFx = new GasFx(this.scene, this.world);
    this.post = new PostFX(this.renderer);
    this.syncPixelScale();

    const model = models.create('player.hazmat');
    mergeStatic(model);
    this.scene.add(model);
    this.player = new Player(model);
    this.player.teleport(this.area.spawn.x, this.area.spawn.z, this.world.height.at(this.area.spawn.x, this.area.spawn.z));
    this.player.facing = this.player.prevFacing = Math.PI / 4;
    this.animator = new PlayerAnimator(model);
    this.flashlight = new THREE.SpotLight('#ffe4b8', 0, 26, 0.42, 0.4, 1.15);
    this.flashlight.castShadow = false;
    this.flashlight.position.set(0.12, 1.48, 0.18);
    this.flashlight.target.position.set(0.12, 1.15, 6);
    model.add(this.flashlight, this.flashlight.target);

    this.focusTarget.copy(this.area.spawn).setY(this.world.height.at(this.area.spawn.x, this.area.spawn.z) + 1);
    this.rig.snapTo(this.focusTarget);

    this.debris = new Debris(this.scene);
    this.hud = new Hud(uiRoot);
    this.floaters = new FloatingText(this.hud.root);
    this.survival = new Survival(this.world, this.player);
    this.gathering = new Gathering(
      this.world, this.inventory, this.player, this.debris, this.floaters,
      () => this.onBuildToolHit(),
      () => this.horde.strike(meleePower(this.inventory.equippedTool?.power) * (this.player.buff?.def.melee ?? 1)),
    );
    this.crafting = new Crafting(this.inventory, (r) => this.onCrafted(r));
    this.oven = new Oven(this.inventory);
    this.building = new Building({
      scene: this.scene,
      collision: this.collision,
      occlusion: this.occlusion,
      interactions: this.interactions,
      world: this.world,
      inventory: this.inventory,
      debris: this.debris,
      floaters: this.floaters,
      player: this.player,
      noBuild: [],
      openStorage: (piece) => this.setInventoryOpen(true, 'storage', piece),
      storageGone: (piece) => {
        if (this.openStorage === piece) this.setInventoryOpen(false);
      },
    });
    seedStarterHut(this.building);
    this.cure = new Cure({
      scene: this.scene,
      lights: this.lights,
      world: this.world,
      building: this.building,
      debris: this.debris,
      floaters: this.floaters,
      player: this.player,
      onLost: () => this.die('The cure was lost. Contamination overwhelmed you.'),
    });
    this.stations = new Stations(this.area.stations, this.collision, this.world, this.floaters, this.player);
    this.buildMode = new BuildMode(this.scene, this.building);
    this.flow = new FlowField(this.collision, this.world.height);
    this.horde = new Horde(
      this.scene, this.collision, this.flow, this.building, this.world,
      this.player, this.inventory, this.debris, this.floaters,
      () => this.survival.noteCause('maul'),
      () => this.survival.noteCause('acid'),
      this.world.traversal,
      this.cure,
    );
    this.shooting = new Shooting(
      this.scene, this.player, this.inventory, this.horde, this.building, this.debris, this.floaters, this.world.height,
    );
    this.defenses = new Defenses(
      this.scene, this.building, this.horde, this.shooting, this.player, this.world,
      this.lights, this.debris, this.floaters,
    );
    this.siege = new Siege(this.building, this.defenses, this.horde);
    this.raid = new Raid(this.seed, this.horde, this.siege, {
      homeDistance: () => this.area.homeZone.distanceFromCenter(this.player.position),
    });
    events.on('noise', ({ attention }) => this.raid.addAttention(attention));
    events.on('raid:reward', ({ entries }) => {
      for (const e of entries) if (e.kind === 'cache') this.dropCache(e.items);
    });
    this.roamRng = new Rng(this.seed ^ 0x524f41);
    this.seedRoamers();

    this.icons = {
      ...renderItemIcons(ALL_ITEM_IDS),
      ...renderIcons(allPieceIds().map((id) => ({ key: pieceIconKey(id), model: pieceModel(PIECES[id], 'wood') }))),
      ...renderIcons(ALL_ENEMY_IDS.map((id) => ({ key: `enemy:${id}`, model: ENEMIES[id].model }))),
    };
    const mapTiles = new MapTiles(this.world.biomes, this.world.height);
    this.minimap = new Minimap(this.hud.root, this.world, this.building, this.horde, mapTiles);
    this.mapScreen = new MapScreen(uiRoot, this.world, this.building, mapTiles, () => this.setMapOpen(false));
    new HotbarView(this.hud.root, this.inventory, this.icons);
    this.hud.onCameraControls({
      fixed: () => {
        this.rig.resetFixed();
        this.hud.setCameraMode('fixed', false);
        sfx('ui.click', { pitch: 1.1 });
      },
      free: () => {
        this.rig.setFree(false);
        this.hud.setCameraMode('free', false);
        sfx('ui.click', { pitch: 1.2 });
      },
      lock: () => {
        this.rig.toggleLock();
        this.hud.setCameraMode(this.rig.mode, this.rig.locked);
        sfx('ui.click', { pitch: this.rig.locked ? 0.85 : 1.25 });
      },
    });
    this.buildUI = new BuildUI(this.hud.root, this.building, this.inventory, this.icons, (i) => this.buildMode.setTab(i));
    this.inventoryView = new InventoryView(uiRoot, this.inventory, this.icons, (i) => this.gathering.use(i));
    this.craftingPanel = new CraftingPanel(this.inventoryView.side, this.crafting, this.inventory, this.icons, () => this.nearWorkbench());
    this.ovenPanel = new OvenPanel(this.inventoryView.side, this.oven, this.inventory, this.icons);
    this.storagePanel = new StoragePanel(this.inventoryView.side);
    this.inventory.onChange(() => {
      this.syncHeldItem();
      this.scanParts();
    });

    this.meta = Meta.load();
    this.pauseScreen = new PauseScreen(uiRoot, this.seed, {
      onResume: () => this.setPaused(false),
      onAbandon: () => this.abandon(),
      onCodex: () => this.metaOverlay.showCodex(),
      onLedger: () => this.metaOverlay.showLedger(),
    });
    this.deathScreen = new DeathScreen(uiRoot, {
      onNewRun: () => this.newRun(),
      onCodex: () => this.metaOverlay.showCodex(),
      onLedger: () => this.metaOverlay.showLedger(),
    });
    this.metaOverlay = new MetaOverlay(uiRoot, this.meta, this.icons, (seed) => this.replay(seed));
    new StartScreen(uiRoot, this.meta, {
      onStart: () => this.beginPlay(),
      onCodex: () => this.metaOverlay.showCodex(),
      onLedger: () => this.metaOverlay.showLedger(),
    });
    this.debug = new DebugPanel(uiRoot, {
      toggleColliders: (on) => this.toggleColliderDebug(on),
      toggleInfiniteStamina: (on) => (this.player.infiniteStamina = on),
      toggleGodMode: (on) => (this.player.godMode = on),
      setTimeScale: (s) => (this.loop.timeScale = s),
      teleportHome: () => {
        const { x, z } = this.area.spawn;
        this.player.teleport(x, z, this.world.height.at(x, z));
      },
      teleportAway: () => this.player.teleport(-90, -6, this.world.height.at(-90, -6)),
      teleportFar: () => {
        const p = this.player.position;
        const a = Math.atan2(p.x, p.z);
        const d = Math.hypot(p.x, p.z) + 1000;
        const x = Math.sin(a) * d;
        const z = Math.cos(a) * d;
        this.world.update(0, new THREE.Vector3(x, 0, z), true);
        this.player.teleport(x, z, this.world.height.at(x, z));
      },
      giveGun: () => {
        this.inventory.add('craftedGun', 1, makePipePistol());
      },
      giveRifle: () => {
        this.inventory.add('craftedGun', 1, makeStockGun('scrapRifle'));
      },
      giveKit: () => {
        const kit: [ItemId, number][] = [
          ['hammer', 1], ['crowbar', 1], ['gasFilter', 5], ['bandage', 5],
          ['wood', 240], ['scrap', 200], ['cloth', 60], ['stone', 40], ['charcoal', 12], ['metalPlate', 24],
          ['mutantMeat', 5], ['gunpowder', 36], ['electronics', 24], ['chemicals', 24], ['ammo', 80],
          ['rustedReceiver', 2], ['rustedBarrel', 2], ['woodGrip', 2], ['woodHandle', 1],
          ['woodStock', 1], ['rustedTrigger', 2], ['stickMag', 2], ['ironSight', 1],
          ['rustedMuzzle', 1], ['rustedRail', 1], ['pipeReceiver', 1], ['longBarrel', 1],
        ];
        for (const [item, qty] of kit) this.inventory.add(item, qty);
      },
      shake: () => events.emit('camera:shake', { amount: 0.7 }),
      toggleFreeBuild: (on) => (this.building.free = on),
      damageBuilds: () => {
        for (const piece of [...this.building.pieces]) {
          if (this.building.distanceTo(piece, this.player.position.x, this.player.position.z) < 14) this.building.damage(piece, piece.maxHp * 0.35);
        }
      },
      crackCure: () => this.cure.damage(90),
      addAttention: (amount) => this.raid.addAttention(amount),
      crankSiren: () => this.crankSiren(),
      startRaid: () => this.raid.startNow(),
      skipCountdown: () => this.raid.skipCountdown(),
      killRaid: () => {
        for (const e of this.horde.enemies) if (e.alive && e.raid) this.horde.hurt(e, 1e6);
        this.horde.withdrawRaid();
        for (const u of this.siege.units) u.hp = 0.001;
      },
      setDayPhase: (phase) => this.dayNight.skipTo(phase),
      spawnEnemy: (id) => this.debugSpawn(id),
      toggleFlow: (on) => this.flow.setDebug(this.scene, on),
      togglePost: (on) => (this.post.enabled = on),
      setWeather: (kind) => this.weather.force(kind),
      lightning: () => this.weather.strike(),
      teleportTo: (kind) => this.debugTeleportTo(kind),
      checkReach: () => this.debugReach(),
      killSelf: () => this.die('You flipped the debug switch. The wasteland does not care.'),
      unlockCodex: () => {
        this.meta.unlockAll();
        events.emit('toast', { text: 'CODEX — every page filled.', tone: 'info' });
      },
    });

    events.on('camera:shake', ({ amount }) => this.rig.addTrauma(amount));
    events.on('player:dodge', () => this.rig.addTrauma(0.12));
    events.on('enemy:killed', ({ id }) => this.unlock('enemy', id, ENEMIES[id].name));
    events.on('build:placed', ({ id }) => this.unlock('buildable', id, PIECES[id as keyof typeof PIECES].name));
    events.on('recipe:made', ({ id }) => this.unlock('recipe', id, recipeLabel(id)));
    events.on('gun:assembled', (gun) => this.meta.noteGun(gun));
    window.addEventListener('resize', this.onResize);

    this.loop = new GameLoop(
      CONFIG.fixedStep,
      CONFIG.maxFrameTime,
      (dt) => this.fixedUpdate(dt),
      (alpha, frameDt) => this.render(alpha, frameDt),
    );
  }

  start(): void {
    this.loop.start();
  }

  private beginPlay(): void {
    if (this.state !== 'title') return;
    this.state = 'intro';
    this.introElapsed = 0;
    this.introImpactDone = false;
    this.introHeartbeatDone = false;
    this.introBreathingDone = false;
    this.input.enabled = false;
    this.hud.setCutsceneLetterbox(true);
    this.hud.setVisible(false);
    document.body.classList.add('playing');

    // Horror sound design: toxic wind storm & sky drop roar
    sound.playHorrorDropStorm();
    sound.playHeartbeat();
  }

  private finishIntro(): void {
    if (this.state !== 'intro') return;
    this.state = 'playing';
    this.player.object.position.y = this.player.position.y;
    this.env.setCutsceneStorm(false, 0, 1.0);
    this.input.enabled = true;
    this.hud.setCutsceneLetterbox(false);
    this.hud.setVisible(true);
    this.hud.setCrosshair(0, 0, false);

    if (!this.inventory.slots.some((s) => s?.gun)) this.inventory.add('craftedGun', 1, makePipePistol());
  }

  private setPaused(paused: boolean): void {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    if (paused && this.inventoryView.open) this.setInventoryOpen(false);
    if (paused && this.mapScreen.open) this.setMapOpen(false);
    this.state = paused ? 'paused' : 'playing';
    this.input.enabled = !paused;
    if (paused) this.pauseScreen.setRun(this.liveScore(), this.meta.lifetime.bestScore, this.raid.raidsSurvived, this.runTime);
    this.pauseScreen.setVisible(paused);
    document.body.classList.toggle('playing', !paused);
  }

  /** Opens the backpack with the crafting, oven or storage box panel beside it. */
  private setInventoryOpen(open: boolean, side: 'craft' | 'oven' | 'storage' = 'craft', storage: Piece | null = null): void {
    if (this.state !== 'playing') return;
    if (open) {
      this.setBuildMode(false);
      this.craftingPanel.setVisible(side === 'craft');
      this.ovenPanel.setVisible(side === 'oven');
      this.openStorage = side === 'storage' ? storage : null;
    } else {
      this.openStorage = null;
    }
    const box = this.openStorage?.storage ?? null;
    const hop = this.openStorage ? hopperHint(this.openStorage.def.hopper) : undefined;
    const accept = this.openStorage
      ? (st: { item: ItemId; gun?: unknown }) => hopperAccepts(this.openStorage!.def.hopper, st.item, !!st.gun)
      : undefined;
    this.storagePanel.show(box, this.inventory, hop);
    this.inventoryView.setContainer(box, this.storagePanel.grid, accept);
    if (open !== this.inventoryView.open) sfx(open ? 'ui.open' : 'ui.close');
    this.inventoryView.setOpen(open);
    this.input.enabled = !open;
    document.body.classList.toggle('playing', !open);
  }


  /** The full-screen map. The world keeps running underneath, like the backpack. */
  private setMapOpen(open: boolean): void {
    if (open && this.state !== 'playing') return;
    if (open === this.mapScreen.open) return;
    if (open) {
      this.setBuildMode(false);
      if (this.inventoryView.open) this.setInventoryOpen(false);
    }
    sfx(open ? 'ui.open' : 'ui.close');
    this.mapScreen.setOpen(open);
    if (this.state !== 'playing') return;
    this.input.enabled = !open;
    document.body.classList.toggle('playing', !open);
  }

  private setBuildMode(on: boolean): void {
    if (on && this.state !== 'playing') return;
    if (on === this.buildMode.active) return;
    this.buildMode.setActive(on);
    document.body.classList.toggle('building', on);
    this.hammerTarget = null;
  }

  private isScrapTool(kind: string | undefined): boolean {
    return kind === 'hammer' || kind === 'axe' || kind === 'pickaxe';
  }

  private resetDemolish(): void {
    this.demolishHits = 0;
    this.demolishWindow = 0;
  }

  /**
   * Hammer / axe / pickaxe impact on the aimed piece.
   * Hammer repairs damaged pieces; otherwise each hit advances scrap progress (5 hits, 2s apart).
   */
  private onBuildToolHit(): boolean {
    const tool = this.inventory.equippedTool;
    if (!this.isScrapTool(tool?.kind)) return false;
    const target = this.hammerTarget;
    if (!target || !this.building.pieces.has(target)) return false;

    if (tool!.kind === 'hammer' && target.hp < target.maxHp - 0.5) {
      this.building.repair(target);
      this.resetDemolish();
      return true;
    }

    this.registerDemolishHit(target);
    return true;
  }

  private registerDemolishHit(piece: Piece): void {
    const B = CONFIG.building;
    if (piece !== this.hammerTarget || this.demolishWindow <= 0) this.demolishHits = 0;
    this.demolishHits += 1;
    this.demolishWindow = B.demolishHitWindow;

    const at = new THREE.Vector3(piece.x, piece.y + Math.min(piece.size.h, 1.8), piece.z);
    this.debris.burst(piece.x, piece.y + Math.min(piece.size.h, 1.4) * 0.5, piece.z, '#c4c1b8', 8);
    this.floaters.spawn(at, `${this.demolishHits}/${B.demolishHits}`, 'word', '#f2b705');
    sfx('build.hit', { x: piece.x, z: piece.z, param: piece.tier === 'wood' ? 0 : 1, pitch: 0.85 + Math.random() * 0.2 });
    events.emit('camera:shake', { amount: 0.08 });

    if (this.demolishHits >= B.demolishHits) {
      this.resetDemolish();
      if (this.building.demolish(piece)) this.hammerTarget = null;
    }
  }

  /** Aim at a piece with hammer / axe / pickaxe; R upgrades with the hammer; scrap window ticks down. */
  private updateHammer(dt: number): void {
    const tool = this.inventory.equippedTool;
    const scrap = this.isScrapTool(tool?.kind);
    const target = scrap && this.hasGroundHit ? this.building.pieceAt(this.groundHit.x, this.groundHit.z) : null;
    if (target !== this.hammerTarget) this.resetDemolish();
    this.hammerTarget = target;

    if (this.demolishHits > 0) {
      this.demolishWindow -= dt;
      if (this.demolishWindow <= 0) this.resetDemolish();
    }

    if (!target) return;
    if (tool?.kind === 'hammer' && this.input.wasPressed('reload')) this.building.upgrade(target);
  }

  private updateBuildMode(): void {
    const bm = this.buildMode;
    if (this.input.wasPressed('buildTab') && !this.cure.carried && !this.stations.carrying) bm.nextTab();
    if (this.cure.carried || this.stations.carrying) {
      if (this.input.wasPressed('reload')) this.stations.rotate();
      const hit = this.hasGroundHit ? this.groundHit : null;
      if (hit && this.stations.carrying) this.stations.preview(hit.x, hit.z);
      if (hit && this.cure.carried) this.cure.preview(hit.x, hit.z);
      if (hit && this.input.wasPressed('fire')) {
        if (this.stations.carrying) this.stations.placeAt(hit.x, hit.z);
        else this.cure.hangAt(hit.x, hit.z);
      }
      return;
    }
    this.cure.clearPreview();
    if (this.input.wasPressed('reload')) bm.rotate();
    bm.update(this.hasGroundHit ? this.groundHit : null);
    const pl = bm.placement;
    if (pl && this.input.wasPressed('fire') && !bm.place()) {
      this.floaters.spawn(new THREE.Vector3(pl.x, 1.6, pl.z), pl.reason, 'warn');
    }
  }

  private nearWorkbench(): boolean {
    const w = this.area.workbench;
    return Math.hypot(this.player.position.x - w.x, this.player.position.z - w.z) < CONFIG.crafting.workbenchRange;
  }

  private onCrafted(recipe: Recipe): void {
    this.unlock('recipe', recipe.id, ITEMS[recipe.output].name);
    const def: ItemDef = ITEMS[recipe.output];
    const at = this.player.position.clone().setY(2);
    this.floaters.spawn(at, `+${recipe.qty} ${def.name.toUpperCase()}`, 'gain', def.color);
    if (!this.inventoryView.open) this.floaters.spawn(at.clone().setY(2.4), 'KA-CHUNK!', 'word');
  }

  private newRun(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('seed');
    window.location.href = url.toString();
  }

  private replay(seed: number): void {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(seed));
    window.location.href = url.toString();
  }

  private abandon(): void {
    this.fileRun('You walked away from the wasteland.', true);
    this.newRun();
  }

  private die(cause: string): void {
    if (this.state === 'dead' || this.state === 'title') return;
    this.setBuildMode(false);
    this.setMapOpen(false);
    this.pauseScreen.setVisible(false);
    this.state = 'dead';
    this.inventoryView.setOpen(false);
    this.input.enabled = false;
    this.hud.setCrosshair(0, 0, false);
    this.hud.setVisible(false);
    document.body.classList.remove('playing');
    events.emit('camera:shake', { amount: 0.8 });
    sfx('player.hurt', { pitch: 0.8 });
    sfx('death.sting', { delay: 0.4 });
    const rec = this.fileRun(cause, false);
    window.setTimeout(() => {
      if (rec) this.deathScreen.show(rec);
    }, 900);
  }

  private fileRun(cause: string, abandoned: boolean) {
    if (this.recorded) return null;
    this.recorded = true;
    return this.meta.record({
      ...this.runDraft(),
      cause,
      abandoned,
    });
  }

  private runDraft() {
    return {
      seed: this.seed,
      seconds: this.runTime,
      raids: this.raid.raidsSurvived,
      raidPoints: this.raid.raidPoints,
      kills: this.horde.kills,
      killsByType: this.horde.killsByType,
      bosses: BOSS_IDS.reduce((n, id) => n + (this.horde.killsByType[id] ?? 0), 0),
      built: this.building.built,
      guns: this.meta.gunsCrafted,
      gathered: this.gathering.gathered,
      crafted: this.crafting.crafted,
      searched: this.gathering.searched,
      bestGun: this.meta.bestGun,
    };
  }

  private liveScore(): number {
    return this.meta.scoreNow(this.runDraft()).total;
  }

  private unlock(kind: 'enemy' | 'part' | 'buildable' | 'recipe', id: string, name: string): void {
    this.meta.note(kind, id);
    void name;
  }

  private scanParts(): void {
    const ids: string[] = [];
    for (const s of this.inventory.slots) {
      if (s && ITEMS[s.item].kind === 'gunPart') ids.push(s.item);
    }
    this.meta.noteMany('part', ids);
  }

  private syncHeldItem(): void {
    if (this.cure.carried && !this.cure.previewOn) {
      this.cure.present(this.animator);
      this.heldItem = 'cure';
      return;
    }
    if (this.heldItem === 'cure') {
      this.cure.releaseHand();
      this.heldItem = null;
    }
    const st = this.inventory.selectedStack;
    if (st?.gun) {
      const id = `gun:${st.gun.id}:${st.gun.parts.map((p) => `${p.part}${p.x}${p.y}`).join('')}`;
      if (id === this.heldItem) return;
      this.heldItem = id;
      this.animator.setHeld(assembleGunHeld(st.gun.parts), 'gun');
      return;
    }
    const def: ItemDef | null = st ? ITEMS[st.item] : null;
    const id = def && def.kind !== 'resource' && def.kind !== 'component' && def.kind !== 'ammo' ? def.model : null;
    if (id === this.heldItem) return;
    this.heldItem = id;
    let model: THREE.Object3D | null = null;
    if (id) {
      model = this.heldModels.get(id) ?? models.create(id, 1);
      this.heldModels.set(id, model);
    }
    this.animator.setHeld(model, 'tool');
  }

  /** Hold E to unhook the cure or pick up a station. A short tap still uses whatever you're facing. */
  private pollCarry(dt: number): void {
    if (!this.buildMode.active) this.cure.clearPreview();
    const down = this.input.isDown('interact');
    const hovered = this.currentInteractable;
    const cureUi = this.cure.poll(dt, down);
    const cureHolds = !!cureUi && (cureUi.verb.startsWith('Hold') || cureUi.consumed);
    const stationUi = this.stations.poll(dt, cureHolds || this.cure.carried ? false : down, hovered, this.buildMode.active);
    const prompt = cureUi ?? stationUi;
    this.useVerb = prompt?.verb ?? null;
    this.useLabel = prompt?.label ?? '';

    if (!down && this.eDown) {
      const tap = this.eTime < 0.28 && !cureUi?.consumed && !stationUi?.consumed;
      if (tap && !this.buildMode.active) {
        if (this.stations.carrying) this.stations.drop();
        else if (this.cure.carried && !hovered) this.cure.hangInFront();
        else if (hovered && !this.cure.alerting) {
          hovered.onInteract();
          events.emit('player:interact', { id: hovered.id });
        }
      }
      this.eTime = 0;
    }
    if (down) this.eTime += dt;
    this.eDown = down;
    this.syncHeldItem();
  }

  private fixedUpdate(dt: number): void {
    if (this.state !== 'playing') {
      this.input.endTick();
      return;
    }
    this.runTime += dt;
    const p = this.player;

    if (this.input.wasPressed('build')) this.setBuildMode(!this.buildMode.active);
    HOTBAR_KEYS.forEach((key, i) => {
      if (!this.input.wasPressed(key)) return;
      if (this.buildMode.active) this.buildMode.select(i);
      else this.inventory.select(i);
    });

    this.updateAim();
    p.update(dt, this.input, this.rig, this.collision, this.world.height);
    this.updateWater(dt);

    const gunOut = !!this.inventory.equippedGun && !this.buildMode.active && p.state !== 'climbing';
    this.shooting.update(
      dt,
      gunOut && this.input.isDown('fire'),
      gunOut && this.input.wasPressed('reload'),
    );
    if (!gunOut) {
      this.player.load = 0;
      this.player.aiming = false;
      this.gathering.update(dt, this.input.isDown('fire') && !this.buildMode.active && !(this.input.isDown('orbit') && this.rig.canOrbit));
    }
    if (this.buildMode.active) this.updateBuildMode();
    else this.updateHammer(dt);

    this.currentInteractable = p.state === 'climbing' ? null : this.interactions.findBest(p.position, p.facing);
    this.pollCarry(dt);

    const inside = this.area.homeZone.contains(p.position);
    if (inside !== this.insideZone) {
      this.insideZone = inside;
      events.emit('zone:changed', { inside });
    }

    this.dayNight.update(dt);
    const night = this.dayNight.night;
    this.horde.night = night;
    this.flow.setGoal(this.cure.x, this.cure.z);
    this.flow.update(dt);
    this.horde.update(dt);
    this.defenses.update(dt);
    this.raid.update(dt, night);
    this.syncSiren();
    this.refreshRoamers(dt);

    this.crafting.update(dt);
    this.oven.update(dt);
    this.survival.update(dt);
    if (!p.alive) this.die(this.survival.deathMessage());
    this.input.endTick();
  }

  /** E at the end of a traversal link: take it. */
  private climb(link: TraversalLink, end: LinkEnd): void {
    if (this.buildMode.active) this.setBuildMode(false);
    if (this.player.startClimb(link, end)) this.rungDist = 0;
  }

  /** Splashes and noise while wading, rung clanks while climbing. */
  private updateWater(dt: number): void {
    const p = this.player;
    if (p.state === 'climbing') {
      this.rungDist += CONFIG.traversal.climbSpeed * dt;
      if (this.rungDist > 0.34) {
        this.rungDist = 0;
        sfx('build.repair', { x: p.position.x, z: p.position.z, volume: 0.22, pitch: 1.5 + Math.random() * 0.2 });
      }
      return;
    }
    const speed = Math.hypot(p.actualVelocity.x, p.actualVelocity.z);
    if (p.wade <= 0 || speed < 0.6) {
      this.wadeDist = 0;
      return;
    }
    this.wadeDist += speed * dt;
    if (this.wadeDist < 1.3) return;
    this.wadeDist = 0;
    const { x, z } = p.position;
    const y = this.world.height.waterSurface(x, z);
    this.debris.burst(x, y + 0.05, z, this.survival.inToxicWater ? '#9ccf3a' : '#8a9894', 6);
    events.emit('noise', { x, z, attention: CONFIG.horde.noise.wade, radius: CONFIG.horde.hearing.wade });
  }

  private debugTeleportTo(kind: FeatureKind): void {
    const p = this.player.position;
    const at = this.world.findFeature(kind, p.x, p.z);
    if (!at) {
      events.emit('toast', { text: `No ${kind} within 2.5 km.`, tone: 'warn' });
      return;
    }
    const dist = Math.hypot(at.x - p.x, at.z - p.z);
    this.world.update(0, at, true);
    this.player.teleport(at.x, at.z, this.world.height.at(at.x, at.z));
    events.emit('toast', { text: `Nearest ${kind}: ${Math.round(dist)} m away.`, tone: 'info' });
  }

  private debugReach(): void {
    const r = this.world.reachability();
    const pct = r.walkable ? (r.reached / r.walkable) * 100 : 0;
    this.reachNote = `${pct.toFixed(1)}% of ${r.walkable} cells (${r.ms} ms)`;
    console.info('[reach]', r, this.reachNote);
    events.emit('toast', { text: `Reachable from the hut: ${this.reachNote}`, tone: 'info' });
  }

  private updateAim(): void {
    if (!this.input.mouseInWindow || !this.input.enabled || (this.input.isDown('orbit') && this.rig.canOrbit)) {
      if (!(this.input.isDown('orbit') && this.rig.canOrbit)) {
        this.player.setAim(null);
        this.hasGroundHit = false;
      }
      return;
    }
    this.mouseNdc.set(this.input.mouseNdc.x, this.input.mouseNdc.y);
    this.raycaster.setFromCamera(this.mouseNdc, this.rig.camera);
    const hit = this.world.height.march(this.raycaster.ray.origin, this.raycaster.ray.direction, 120, this.groundHit);
    if (hit) {
      this.hasGroundHit = true;
      this.aimHit.copy(hit);
      this.aimHit.y += CONFIG.player.aimHeight;
      this.player.setAim(this.aimHit);
      return;
    }
    this.aimPlane.constant = -(this.player.position.y + CONFIG.player.aimHeight);
    this.groundPlane.constant = -this.player.position.y;
    const planeHit = this.raycaster.ray.intersectPlane(this.aimPlane, this.aimHit);
    this.player.setAim(planeHit);
    this.hasGroundHit = this.raycaster.ray.intersectPlane(this.groundPlane, this.groundHit) !== null;
  }

  private render(alpha: number, frameDt: number): void {
    if (this.input.wasPressedThisFrame('pause')) {
      if (this.metaOverlay.open) this.metaOverlay.hide();
      else if (this.mapScreen.open) this.setMapOpen(false);
      else if (this.inventoryView.splitting) this.inventoryView.closeSplit();
      else if (this.inventoryView.open) this.setInventoryOpen(false);
      else if (this.buildMode.active) this.setBuildMode(false);
      else this.setPaused(this.state === 'playing');
    }
    if (this.input.wasPressedThisFrame('flashlight') && this.state === 'playing') this.toggleFlashlight();
    if (this.input.wasPressedThisFrame('inventory') && this.state === 'playing' && !this.mapScreen.open) this.setInventoryOpen(!this.inventoryView.open);
    if (this.input.wasPressedThisFrame('map') && this.state === 'playing') this.setMapOpen(!this.mapScreen.open);
    if (this.input.wasPressedThisFrame('debug')) this.debug.toggle();
    if (this.input.wasPressedThisFrame('help') && this.state === 'playing') this.hud.toggleHelp();
    if (this.input.wasPressedThisFrame('mute')) {
      const muted = audio.toggleMute();
      this.pauseScreen.syncSound();
      events.emit('toast', { text: muted ? 'SOUND OFF. N to bring it back.' : 'SOUND ON.', tone: 'info' });
    }

    const playing = this.state === 'playing' && !this.inventoryView.open && !this.mapScreen.open;
    const dt = this.state === 'paused' ? 0 : frameDt * this.loop.timeScale;
    const p = this.player;

    this.renderPos.lerpVectors(p.prevPosition, p.position, alpha);
    const facing = p.prevFacing + wrapAngle(p.facing - p.prevFacing) * alpha;

    if (this.state === 'intro') {
      this.introElapsed += dt;
      const t = this.introElapsed;
      const tFallEnd = 0.95;
      const tStandEnd = 2.90;
      const tTotal = 4.75;

      const groundY = this.world.height.at(this.renderPos.x, this.renderPos.z);
      let fallY = groundY;
      let lightningIntensity = 0;

      if (t < tFallEnd) {
        const u = clamp(t / tFallEnd, 0, 1);
        // Accelerating gravity drop from high in the sky (36m -> ground)
        fallY = groundY + 36 * (1 - u * u);

        // Toxic thunderstorm: lightning flashes around t=0.25 and t=0.65
        if ((t > 0.22 && t < 0.32) || (t > 0.62 && t < 0.72)) {
          lightningIntensity = Math.sin(t * 35) > 0 ? 1.0 : 0.4;
          if (t > 0.62 && !this.introHeartbeatDone) {
            this.introHeartbeatDone = true;
            sound.playThunder();
            sound.playHeartbeat();
          }
        }
        // Thicker fog and volumetric light shafts in upper atmosphere
        this.env.setCutsceneStorm(true, lightningIntensity, 1.45);
      } else if (!this.introImpactDone) {
        this.introImpactDone = true;
        sound.playImpactSplat();
        events.emit('camera:shake', { amount: 1.0 });

        // Ground shockwave: dirt crater, suspension dust, and debris
        this.debris.burst(this.renderPos.x, groundY + 0.15, this.renderPos.z, '#5a4e3e', 48); // Dirt crater
        this.debris.burst(this.renderPos.x, groundY + 0.22, this.renderPos.z, '#8f836f', 36); // Fine dust
        this.debris.burst(this.renderPos.x, groundY + 0.35, this.renderPos.z, '#4a4237', 24); // Soil chunks
        this.debris.burst(this.renderPos.x, groundY + 0.30, this.renderPos.z, '#6a7848', 18); // Toxic earth bits
      }

      if (t >= tFallEnd && t < tStandEnd) {
        // Ground level settling fog
        this.env.setCutsceneStorm(true, 0, 1.15);
      }

      if (t >= 2.05 && !this.introBreathingDone) {
        this.introBreathingDone = true;
        sound.playMaskBreathing();
      }

      p.object.position.set(this.renderPos.x, fallY, this.renderPos.z);
      p.object.rotation.y = facing;
      this.animator.updateIntroCutscene(t);

      // --- CINEMATIC CONTINUOUS DYNAMIC CAMERA ---
      // A unified, seamless Steadicam path that descends with the character,
      // catches the ground impact with realistic camera shake, and cranes around smoothly as he rises.
      let targetYaw: number;
      let targetPitch: number;
      let targetDist: number;
      let targetFocusY: number;

      if (t < tFallEnd) {
        // Phase 1 (0.00..0.95s): Following the drop downwards with wind turbulence
        const u = t / tFallEnd;
        targetYaw = lerp(20, 24, u);
        targetPitch = lerp(28, 16, smoothstep(0, 1, u));
        targetDist = lerp(10.5, 5.2, u);
        targetFocusY = fallY * 0.4 + 0.85;
      } else if (t < tStandEnd) {
        // Phase 2 (0.95..2.90s): Ground-level close shot following the impact, prone push-up and kneeling
        const u = (t - tFallEnd) / (tStandEnd - tFallEnd);
        const e = smoothstep(0, 1, u);
        targetYaw = lerp(24, 75, e);
        targetPitch = lerp(16, 22, e);
        targetDist = lerp(5.2, 5.8, e);
        targetFocusY = groundY + lerp(0.5, 0.85, e);
      } else {
        // Phase 3 (2.90..4.75s): Standing tall, checking mask, and smoothly panning back to gameplay
        const u = (t - tStandEnd) / (tTotal - tStandEnd);
        const e = smoothstep(0, 1, u);

        targetYaw = lerp(75, CONFIG.camera.yawDeg, e);
        targetPitch = lerp(22, CONFIG.camera.pitchDeg, e);
        targetDist = lerp(5.8, CONFIG.camera.distance, e);
        targetFocusY = groundY + lerp(0.85, 1.0, e);
      }

      this.focusTarget.set(this.renderPos.x, targetFocusY, this.renderPos.z);
      this.rig.updateCutscene(dt, this.focusTarget, targetYaw, targetPitch, targetDist);

      this.input.consumeWheel();
      this.input.consumeMouseDelta();

      if (t >= tTotal) {
        this.finishIntro();
      }
    } else {
      p.object.position.copy(this.renderPos);
      p.object.rotation.y = facing;
      if (this.state !== 'dead') this.animator.update(dt, p, facing);
      else p.object.rotation.z = Math.min(Math.PI / 2, p.object.rotation.z + dt * 4);

      this.focusTarget.copy(this.renderPos);
      const orbit = this.input.consumeMouseDelta();
      if (playing && this.input.isDown('orbit') && this.rig.canOrbit) this.rig.orbit(orbit.x, orbit.y);
      this.rig.update(
        dt,
        this.renderPos,
        playing && !(this.input.isDown('orbit') && this.rig.canOrbit) && p.hasAimPoint ? p.aimPoint : null,
        this.input.consumeWheel(),
      );
    }

    this.world.update(dt, this.renderPos);
    setWaterTime(this.world.clock, this.scene.fog?.color);
    this.weather.update(dt, this.rig.currentFocus);
    this.env.setToxic(this.survival.air);
    this.env.setWeather(this.weather.rain, this.weather.flash);
    const dn = this.dayNight;
    this.env.setDaylight(dn.daylight, dn.twilight, dn.sunProgress);
    this.env.setLampPosition(this.renderPos.x + Math.sin(facing) * 0.6, this.renderPos.y + 2.2, this.renderPos.z + Math.cos(facing) * 0.6);
    setTerrainCutout(this.renderPos.x, this.renderPos.y + 1.05, this.renderPos.z);
    this.env.update(dt, this.rig.currentFocus);
    this.gasFx.update(dt, this.rig.currentFocus, this.renderPos, this.weather.rain);
    this.ovenGlow = damp(this.ovenGlow, this.oven.lit ? 1 : 0, 3, dt);
    for (const e of this.area.ovenLights) e.gain = this.ovenGlow;
    this.lights.update(dt, this.rig.currentFocus);
    this.debris.update(dt);
    this.building.update(dt, this.rig.camera.position);
    this.buildMode.render(dt, playing ? this.hammerTarget : null);
    this.area.homeZone.update(dt, this.insideZone);

    this.occlusion.update(dt, this.rig.camera, this.gatherOcclusion());

    if (this.colliderDebug?.visible && this.colliderDebugVersion !== this.collision.version) this.rebuildColliderDebug();

    const hurt = this.lastHealth - p.health;
    if (hurt > 1.5 && this.state === 'playing') {
      this.post.pulseHurt(hurt / CONFIG.player.maxHealth);
      sfx('player.hurt', { pitch: 0.9 + Math.random() * 0.2 });
    }
    this.lastHealth = p.health;
    this.post.setLowHealth(p.alive && p.health < 30 ? (1 - p.health / 30) * 0.55 : 0);
    this.post.update(dt, {
      toxic: Math.max(this.survival.air, this.survival.inToxicWater ? this.survival.gas * 0.35 : 0) * (p.filter <= 0 ? 1.1 : 0.4),
      flash: this.weather.flash,
      wet: this.weather.rain,
      night: smoothstep(0.35, 1, dn.night),
      twilight: dn.twilight,
    });
    this.post.render(this.scene, this.rig.camera, frameDt);
    if (this.currentScenePixelRatio() !== this.scenePixelRatio) this.syncPixelScale();
    this.floaters.update(dt, this.rig.camera);

    this.rig.groundRight(this.camRight);
    audio.setListener(this.renderPos.x, this.renderPos.z, this.camRight.x, this.camRight.z);
    this.sound.update(frameDt, {
      playing: this.state === 'playing' || this.state === 'paused',
      paused: this.state === 'paused',
      dead: this.state === 'dead',
      raid: this.raid.state === 'raid',
      boss: !!this.horde.boss,
      countdown: this.raid.state === 'calling' || this.raid.state === 'inbound' ? this.raid.timeLeft : Infinity,
      gas: this.survival.gas,
      rain: this.weather.rain,
      speed: Math.hypot(p.actualVelocity.x, p.actualVelocity.z),
      sprinting: p.sprinting,
      wading: p.wade > 0,
      stamina: p.stamina / CONFIG.player.stamina.max,
      x: this.renderPos.x,
      z: this.renderPos.z,
    });
    const boss = this.horde.boss;
    this.hud.setBoss(boss ? boss.def.name : null, boss ? boss.hp / boss.maxHp : 0, !!boss && boss.hp < boss.maxHp * 0.3);

    this.hud.setHealth(p.health, CONFIG.player.maxHealth, p.healthMax);
    this.hud.setFilter(p.filter, CONFIG.player.maxFilter);
    this.hud.setStamina(p.stamina, CONFIG.player.stamina.max, p.staminaMax, p.exhausted);
    this.hud.setBuff(p.buff);
    this.hud.setGas(this.survival.gas, p.filter <= 0, this.survival.inToxicWater && this.survival.air < this.survival.gas);
    const job = this.crafting.queue[0];
    this.hud.setCraft(job ? (this.icons[job.recipe.output] ?? null) : null, this.crafting.progress, this.crafting.queue.length, !!job?.blocked);
    this.hud.setOven(this.oven.lit, this.oven.jobs.length, this.oven.outputCount);
    this.craftingPanel.update();
    this.ovenPanel.update();
    const fromCenter = this.area.homeZone.distanceFromCenter(this.renderPos);
    this.rig.groundForward(this.camForward);
    this.rig.groundRight(this.camRight);
    const hx = this.area.homeZone.center.x - this.renderPos.x;
    const hz = this.area.homeZone.center.z - this.renderPos.z;
    const homeAngle = Math.atan2(hx * this.camRight.x + hz * this.camRight.z, hx * this.camForward.x + hz * this.camForward.z);
    const urgent = this.raid.state !== 'calm' && this.raid.state !== 'calling';
    this.hud.setZone(this.insideZone, fromCenter - this.area.homeZone.radius, homeAngle, urgent);
    this.hud.setRaid({
      state: this.raid.state,
      attention: this.raid.attention,
      timeLeft: this.raid.timeLeft,
      raidNumber: this.raid.raidNumber,
      remaining: this.raid.state === 'siege' ? this.siege.count : this.horde.raidAlive,
    });
    this.hud.setDay(dn.clock, dn.day, dn.phase);
    this.hud.setFlashlight(this.flashlightOn);
    const gun = this.inventory.equippedGun;
    const gs = gun ? evaluateBuild(gun.parts).stats : null;
    this.hud.setAmmo(
      !!gs,
      gun?.loaded ?? 0,
      gs?.magSize ?? 0,
      this.inventory.count('ammo'),
      gs ? gs.fireMode : '',
      this.shooting.jammed,
      this.shooting.reloading ? this.shooting.reloadT / Math.max(0.2, gs?.reloadTime ?? 1) : 0,
    );
    const it = playing ? this.currentInteractable : null;
    this.hud.setPrompt(playing && this.useVerb ? this.useVerb : it ? it.verb : null, playing && this.useVerb ? this.useLabel : (it?.label ?? ''));
    this.hud.setCureBreach(playing && this.cure.alerting, this.cure.secondsLeft);
    this.hud.setCarrying(playing && this.cure.carried);

    this.hud.setCrosshair(this.input.mouseScreen.x, this.input.mouseScreen.y, playing && this.input.mouseInWindow && !this.input.mouseOverUi);

    const bm = this.buildMode;
    this.buildUI.setBuild(playing && bm.active, bm.tab, bm.selected, bm.placement, this.input.mouseScreen.x, this.input.mouseScreen.y);
    const card = playing && !bm.active && this.hammerTarget && this.building.pieces.has(this.hammerTarget) ? this.hammerTarget : null;
    const needed = CONFIG.building.demolishHits;
    const scrapProgress = this.demolishHits > 0 ? this.demolishHits / needed : 0;
    this.buildUI.setPieceCard(card, scrapProgress, this.inventory.equippedTool?.kind ?? null);
    this.rig.groundForward(this.camForward);
    this.minimap.update(dt, this.renderPos, facing, this.camForward);
    this.mapScreen.update(this.renderPos, facing, this.camForward);

    this.debug.update(frameDt, () => {
      const info = this.renderer.info.render;
      return {
        state: this.state,
        seed: this.seed,
        draws: info.calls,
        triangles: info.triangles.toLocaleString(),
        resolution: `${this.scenePixelRatio.toFixed(3)}x of ${this.renderer.getPixelRatio()}x`,
        pos: `${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(1)}`,
        slope: `${p.slope.toFixed(0)}°${this.world.height.isRoad(p.position.x, p.position.z) ? ' road' : ''}`,
        height: `home Δ ${this.world.height.offsetX.toFixed(0)},${this.world.height.offsetZ.toFixed(0)} cache ${this.world.height.cachedChunks}`,
        biome: `${this.world.sample(p.position.x, p.position.z).biome}`,
        water: (() => {
          const w = this.world.waterAt(p.position.x, p.position.z);
          return w.depth > 0 ? `${w.depth.toFixed(2)} m ${this.world.height.waterKind(p.position.x, p.position.z)}${w.toxic ? ' toxic' : ''}${p.wade > 0 ? ' wading' : ''}` : 'dry';
        })(),
        links: `${this.world.traversal.count} live${p.link ? `, on one ${(p.climbProgress * 100).toFixed(0)}%` : ''}`,
        district: `${this.world.regions.districtAt(p.position.x, p.position.z).district} · road ${this.world.regions.clearance(p.position.x, p.position.z, 12).toFixed(1)} m`,
        reach: this.reachNote,
        gas: this.survival.gas.toFixed(2),
        buff: p.buff ? `${p.buff.def.label} ${p.buff.remaining.toFixed(1)}s` : 'none',
        chunks: `${this.world.loadedChunks} loaded, ${this.world.groundTiles} ground, ${this.world.cachedPlans} plans, ${this.world.changes.chunkCount} changed`,
        threat: `${Math.round(this.world.sample(p.position.x, p.position.z).danger * 100)}% at ${Math.round(Math.hypot(p.position.x, p.position.z))}m`,
        nodes: this.world.nodes.size,
        colliders: this.collision.colliders.size,
        lights: this.lights.emitterCount,
        pieces: this.building.pieces.size,
        move: p.state + (p.sprinting ? ' +sprint' : '') + (p.swinging ? ' +swing' : ''),
        zone: `${this.insideZone ? 'inside' : 'outside'} (${fromCenter.toFixed(1)}m)`,
        raid: `${this.raid.state} #${this.raid.raidNumber} ${this.raid.state === 'siege' ? `${this.siege.count} on paper` : this.raid.active ? `${this.horde.raidAlive} left` : this.raid.state === 'calm' ? `cd ${Math.ceil(this.raid.cooldown)}s` : formatClock(this.raid.timeLeft)} · ${this.raid.raidPoints} pts`,
        horde: `${this.raid.attention.toFixed(1)}% +${this.raid.passiveRate.toFixed(3)}/s wave ×${this.raid.waveScale.toFixed(2)} reward ×${this.raid.rewardScale.toFixed(2)}`,
        time: `${dn.clock} day ${dn.day} ${dn.phase} light ${dn.daylight.toFixed(2)}`,
        kills: this.horde.kills,
        weather: `${this.weather.kind} rain ${this.weather.rain.toFixed(2)} wet ${this.weather.wet.toFixed(2)}`,
        audio: audio.ctx ? `${audio.ctx.state}${audio.muted ? ' (muted)' : ''}` : 'locked',
        timeScale: this.loop.timeScale,
      };
    });

    this.input.endFrame();
  }

  private toggleColliderDebug(on: boolean): void {
    if (on) this.rebuildColliderDebug();
    if (this.colliderDebug) this.colliderDebug.visible = on;
  }

  private rebuildColliderDebug(): void {
    if (this.colliderDebug) {
      this.scene.remove(this.colliderDebug);
      this.colliderDebug.geometry.dispose();
    }
    this.colliderDebug = this.collision.createDebugMesh((x, z) => this.world.height.at(x, z));
    this.colliderDebugVersion = this.collision.version;
    this.scene.add(this.colliderDebug);
  }

  private crankSiren(): void {
    const at = this.area.siren.position;
    if (this.raid.call()) {
      events.emit('camera:shake', { amount: 0.25 });
      this.floaters.spawn(new THREE.Vector3(at.x, 3.3, at.z), 'WRRRRRRRRR!', 'word', '#e0302a', 0, 0, 70);
      return;
    }
    events.emit('toast', { text: `The siren won't help now: ${(this.raid.callBlocked ?? 'not yet').toLowerCase()}.`, tone: 'warn' });
  }

  private toggleFlashlight(): void {
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? 22 : 0;
    sfx('ui.click', { pitch: this.flashlightOn ? 1.25 : 0.7 });
  }

  /** Player plus every living mutant, so walls/roofs fade when something is lurking inside. */
  private gatherOcclusion(): THREE.Vector3[] {
    let n = 0;
    const take = () => {
      let v = this.occlusionTargets[n];
      if (!v) {
        v = new THREE.Vector3();
        this.occlusionTargets[n] = v;
      }
      n++;
      return v;
    };
    take().copy(this.renderPos).setY(this.renderPos.y + 0.9);
    take().copy(this.renderPos).setY(this.renderPos.y + 1.8);
    const samples: { x: number; z: number }[] = [{ x: this.renderPos.x, z: this.renderPos.z }];
    for (const e of this.horde.enemies) {
      if (!e.alive) continue;
      take().copy(e.position).setY(e.position.y + e.lift + e.def.height * 0.65);
      samples.push({ x: e.position.x, z: e.position.z });
    }
    this.building.fadeRoofs(samples);
    return this.occlusionTargets.slice(0, n);
  }

  /** Siren prompt shows what cranking it would bring; the lamp spins while a raid is coming or on. */
  private syncSiren(): void {
    const siren = this.area.siren;
    const blocked = this.raid.callBlocked;
    if (blocked) {
      siren.verb = 'Siren';
      siren.label = blocked;
    } else {
      const H = CONFIG.horde;
      const nightCall = this.dayNight.night > 0.5;
      const wave = lerp(H.callScaleMin, H.callScaleMax, this.raid.attention / 100) * (nightCall ? H.nightWave : 1);
      siren.verb = 'Crank';
      siren.label = `Signal Siren — call the raid (wave ×${wave.toFixed(2)}${nightCall ? ', night' : ''})`;
    }
    const on = this.raid.state !== 'calm' ? 1 : 0;
    for (const l of this.area.sirenLights) l.gain = on;
  }

  /** Drops a raid's salvage cache in the yard in front of the hut, clearing out emptied old ones. */
  private dropCache(items: ItemAmount[]): void {
    if (!items.length) return;
    for (let i = this.caches.length - 1; i >= 0; i--) {
      const c = this.caches[i];
      if (this.world.contentsOf(c).length > 0) continue;
      this.world.removeContainer(c);
      this.caches.splice(i, 1);
    }
    const rng = new Rng((this.seed ^ 0xc4c4e) + this.cacheCount * 7919);
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 24; tries++) {
      const a = rng.range(-1.2, 1.2) + (tries > 12 ? Math.PI : 0);
      const r = rng.range(5.5, 11);
      x = Math.sin(a) * r;
      z = Math.cos(a) * r;
      if (!this.collision.overlapsBox(x - 0.8, x + 0.8, z - 0.6, z + 0.6)) break;
    }
    const uid = `cache:${this.cacheCount++}`;
    const cache = this.world.spawnContainer('salvage', x, z, rng.range(0, Math.PI * 2), rng.int(0, 1e9), uid, null, items);
    this.caches.push(cache);
    const gy = this.world.height.at(x, z);
    this.debris.burst(x, gy + 0.5, z, '#d9a71a', 18);
    this.floaters.spawn(new THREE.Vector3(x, gy + 1.4, z), 'SALVAGE!', 'word', '#f2b705');
  }

  private seedRoamers(): void {
    for (let i = 0; i < CONFIG.raid.roamCount; i++) this.spawnRoamer();
  }

  private refreshRoamers(dt: number): void {
    if (this.raid.active) return;
    this.roamClock += dt;
    const cap = Math.round(lerp(CONFIG.raid.roamCount, CONFIG.horde.roamCountNight, this.dayNight.night));
    if (this.roamClock < (this.dayNight.night > 0.5 ? 7 : 14) || this.horde.roamAlive >= cap) return;
    this.roamClock = 0;
    this.spawnRoamer();
  }

  /** Wanderers between raids. Stalkers haunt the gas; the odd spitter or screamer turns up elsewhere. */
  private spawnRoamer(): void {
    const rng = this.roamRng;
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(CONFIG.raid.roamMin, CONFIG.raid.roamMax);
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const roll = rng.next();
    let id: EnemyId = roll < 0.35 ? 'crawler' : roll < 0.47 ? 'spitter' : roll < 0.52 ? 'screamer' : 'shambler';
    if (this.world.gasAt(x, z) > 0.2 && rng.chance(0.55)) id = 'stalker';
    this.horde.spawn(id, x, z, false);
  }

  private debugSpawn(id: EnemyId): void {
    const p = this.player;
    this.horde.spawn(id, p.position.x + Math.sin(p.facing) * 6, p.position.z + Math.cos(p.facing) * 6, false);
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.rig.resize(window.innerWidth / window.innerHeight);
    this.post.setSize(window.innerWidth, window.innerHeight);
    this.syncPixelScale();
  };

  /** Point sprites are sized in pixels, so they follow the resolution the scene is drawn at. */
  private syncPixelScale(): void {
    this.scenePixelRatio = this.currentScenePixelRatio();
    this.weather.setPixelScale(window.innerHeight * this.scenePixelRatio, CONFIG.camera.fov);
    this.env.setPointScale(this.scenePixelRatio / this.renderer.getPixelRatio());
  }

  private currentScenePixelRatio(): number {
    return this.post.enabled ? this.post.scenePixelRatio : this.renderer.getPixelRatio();
  }
}

function recipeLabel(id: string): string {
  const craft = RECIPES.find((r) => r.id === id);
  if (craft) return ITEMS[craft.output].name;
  const oven = OVEN_RECIPES.find((r) => r.id === id);
  return oven ? ITEMS[oven.output.item].name : id;
}
