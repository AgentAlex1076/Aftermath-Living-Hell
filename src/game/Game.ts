import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { GameLoop } from '../core/GameLoop';
import { Input, type Action } from '../core/Input';
import { clamp, damp, lerp, smoothstep, wrapAngle } from '../core/math';
import { Rng } from '../core/random';
import { evaluateBuild, makePipePistol } from '../data/guns';
import { ALL_ITEM_IDS, ITEMS, type ItemDef, type ItemId } from '../data/items';
import { ALL_ENEMY_IDS, BOSS_IDS, ENEMIES, type EnemyId } from '../data/enemies';
import { audio, sfx } from '../audio/AudioEngine';
import { Soundscape } from '../audio/Soundscape';
import { formatClock } from '../data/score';
import { OVEN_RECIPES, RECIPES, type Recipe } from '../data/recipes';
import { Player } from '../entities/Player';
import { PlayerAnimator } from '../entities/PlayerAnimator';
import { allPieceIds, hopperAccepts, hopperHint, PIECES, pieceModel } from '../data/buildables';
import { Building, type Piece } from '../gameplay/Building';
import { BuildMode } from '../gameplay/BuildMode';
import { Defenses } from '../gameplay/Defenses';
import { Crafting } from '../gameplay/Crafting';
import { FlowField } from '../gameplay/FlowField';
import { Gathering } from '../gameplay/Gathering';
import { Horde, meleePower } from '../gameplay/Horde';
import { Inventory } from '../gameplay/Inventory';
import { Meta } from '../gameplay/Meta';
import { Oven } from '../gameplay/Oven';
import { Raid, type PenaltyReason } from '../gameplay/Raid';
import { Shooting } from '../gameplay/Shooting';
import { Survival } from '../gameplay/Survival';
import { BuildUI, pieceIconKey } from '../ui/BuildUI';
import { GunBench } from '../ui/GunBench';
import { CraftingPanel, OvenPanel, StoragePanel } from '../ui/StationPanels';
import { assembleGunHeld } from '../models/guns';
import { models, registerModels } from '../models';
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
import { Minimap } from '../ui/Minimap';
import { MetaOverlay } from '../ui/MetaScreens';
import { DeathScreen, PauseScreen, StartScreen } from '../ui/Screens';
import { sound } from '../core/Sound';
import { InteractionSystem, type Interactable } from '../world/Interactables';
import { buildStarterArea, type StarterArea } from '../world/StarterArea';
import { World } from '../world/World';

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
  private readonly gunBench: GunBench;
  private readonly shooting: Shooting;
  private readonly defenses: Defenses;
  private readonly building: Building;
  private readonly buildMode: BuildMode;
  private readonly buildUI: BuildUI;
  readonly flow: FlowField;
  readonly horde: Horde;
  readonly raid: Raid;
  private readonly roamRng: Rng;
  private roamClock = 0;
  private openStorage: Piece | null = null;
  private hammerTarget: Piece | null = null;
  private demolishTime = 0;
  private demolishArmed = true;
  private shownBuildHint = false;
  private shownGunHint = false;
  private ovenGlow = 0;
  private readonly debris: Debris;
  private readonly floaters: FloatingText;
  private readonly hud: Hud;
  private readonly inventoryView: InventoryView;
  private readonly minimap: Minimap;
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
  private readonly occlusionTargets = [new THREE.Vector3(), new THREE.Vector3()];

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
    });
    this.area = buildStarterArea({
      scene: this.scene,
      world: this.world,
      occlusion: this.occlusion,
      interactions: this.interactions,
      seed: this.seed,
      onUseWorkbench: () => this.setInventoryOpen(true, 'craft'),
      onUseOven: () => this.setInventoryOpen(true, 'oven'),
      onUseGunBench: () => this.setGunBenchOpen(true),
    });
    this.world.update(0, this.area.spawn, true);
    this.weather = new Weather(this.scene, this.seed);
    this.gasFx = new GasFx(this.scene, this.world);
    this.post = new PostFX(this.renderer, this.scene, this.rig.camera);
    this.weather.setPixelScale(window.innerHeight * this.renderer.getPixelRatio(), CONFIG.camera.fov);

    const model = models.create('player.hazmat');
    this.scene.add(model);
    this.player = new Player(model);
    this.player.teleport(this.area.spawn.x, this.area.spawn.z);
    this.player.facing = this.player.prevFacing = Math.PI / 4;
    this.animator = new PlayerAnimator(model);

    this.focusTarget.copy(this.area.spawn).setY(1);
    this.rig.snapTo(this.focusTarget);

    this.debris = new Debris(this.scene);
    this.hud = new Hud(uiRoot);
    this.floaters = new FloatingText(this.hud.root);
    this.survival = new Survival(this.world, this.player);
    this.gathering = new Gathering(
      this.world, this.inventory, this.player, this.debris, this.floaters,
      (n) => this.survival.eat(n),
      () => this.onHammerHit(),
      () => this.horde.strike(meleePower(this.inventory.equippedTool?.power)),
    );
    this.crafting = new Crafting(this.inventory, (r) => this.onCrafted(r));
    this.oven = new Oven(this.inventory);
    const hut = this.area.interior;
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
      noBuild: [{ minX: hut.minX, maxX: hut.maxX, minZ: hut.minZ, maxZ: hut.maxZ }],
      openStorage: (piece) => this.setInventoryOpen(true, 'storage', piece),
      storageGone: (piece) => {
        if (this.openStorage === piece) this.setInventoryOpen(false);
      },
    });
    this.buildMode = new BuildMode(this.scene, this.building);
    this.flow = new FlowField(this.collision);
    this.horde = new Horde(
      this.scene, this.collision, this.flow, this.building, this.world,
      this.player, this.inventory, this.debris, this.floaters,
      () => this.survival.noteCause('maul'),
      () => this.survival.noteCause('acid'),
    );
    this.raid = new Raid(this.seed, this.horde, {
      insideZone: () => this.area.homeZone.contains(this.player.position),
      applyPenalty: (reason) => this.applyPenalty(reason),
    });
    this.shooting = new Shooting(
      this.scene, this.player, this.inventory, this.horde, this.building, this.debris, this.floaters,
    );
    this.defenses = new Defenses(
      this.scene, this.building, this.horde, this.shooting, this.player, this.world,
      this.lights, this.debris, this.floaters,
    );
    this.roamRng = new Rng(this.seed ^ 0x524f41);
    this.seedRoamers();

    this.icons = {
      ...renderItemIcons(ALL_ITEM_IDS),
      ...renderIcons(allPieceIds().map((id) => ({ key: pieceIconKey(id), model: pieceModel(PIECES[id], 'wood') }))),
      ...renderIcons(ALL_ENEMY_IDS.map((id) => ({ key: `enemy:${id}`, model: ENEMIES[id].model }))),
    };
    this.minimap = new Minimap(this.hud.root, this.world, this.building, this.horde);
    new HotbarView(this.hud.root, this.inventory, this.icons);
    this.buildUI = new BuildUI(this.hud.root, this.building, this.inventory, this.icons, (i) => this.buildMode.setTab(i));
    this.inventoryView = new InventoryView(uiRoot, this.inventory, this.icons, (i) => this.gathering.use(i));
    this.craftingPanel = new CraftingPanel(this.inventoryView.side, this.crafting, this.inventory, this.icons, () => this.nearWorkbench());
    this.ovenPanel = new OvenPanel(this.inventoryView.side, this.oven, this.inventory, this.icons);
    this.storagePanel = new StoragePanel(this.inventoryView.side);
    this.gunBench = new GunBench(uiRoot, this.inventory, this.icons);
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
      teleportHome: () => this.player.teleport(this.area.spawn.x, this.area.spawn.z),
      openGunBench: () => this.setGunBenchOpen(true),
      giveGun: () => {
        this.inventory.add('craftedGun', 1, makePipePistol());
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
      skipRaid: (seconds) => this.raid.skipTo(seconds),
      startRaid: () => this.raid.startNow(),
      spawnEnemy: (id) => this.debugSpawn(id),
      toggleFlow: (on) => this.flow.setDebug(this.scene, on),
      togglePost: (on) => (this.post.enabled = on),
      setWeather: (kind) => this.weather.force(kind),
      lightning: () => this.weather.strike(),
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
    this.player.object.position.y = 0;
    this.env.setCutsceneStorm(false, 0, 1.0);
    this.input.enabled = true;
    this.hud.setCutsceneLetterbox(false);
    this.hud.setVisible(true);
    this.hud.setCrosshair(0, 0, false);

    window.setTimeout(() => events.emit('toast', { text: 'Your gear is in the crate by the door. Grab it.', tone: 'info' }), 700);
    window.setTimeout(() => events.emit('toast', { text: 'The Gun Bench is between the table and the oven. A receiver is the core.', tone: 'info' }), 2800);
    window.setTimeout(() => events.emit('toast', { text: 'Stay close to the hut. Something is moving in the fog.', tone: 'warn' }), 5200);
  }

  private setPaused(paused: boolean): void {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    if (paused && this.inventoryView.open) this.setInventoryOpen(false);
    if (paused && this.gunBench.isOpen) this.setGunBenchOpen(false);
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
      this.setGunBenchOpen(false);
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

  private setGunBenchOpen(open: boolean): void {
    if (this.state !== 'playing') return;
    if (open) {
      this.setBuildMode(false);
      if (this.inventoryView.open) this.setInventoryOpen(false);
    }
    if (open !== this.gunBench.isOpen) sfx(open ? 'ui.open' : 'ui.close');
    this.gunBench.setOpen(open);
    this.input.enabled = !open;
    document.body.classList.toggle('playing', !open);
    if (open && !this.shownGunHint) {
      this.shownGunHint = true;
      events.emit('toast', { text: 'Receiver first. Every part has to connect. Where you put it changes how it shoots.', tone: 'info' });
    }
  }

  private setBuildMode(on: boolean): void {
    if (on && this.state !== 'playing') return;
    if (on === this.buildMode.active) return;
    if (on) this.setGunBenchOpen(false);
    this.buildMode.setActive(on);
    document.body.classList.toggle('building', on);
    this.hammerTarget = null;
    if (on && !this.shownBuildHint) {
      this.shownBuildHint = true;
      events.emit('toast', { text: 'Foundations first. Q flips to traps and power.', tone: 'info' });
    }
  }

  /** The hammer's swing landed: repair whatever it's pointed at. */
  private onHammerHit(): void {
    const target = this.hammerTarget;
    if (target && this.building.pieces.has(target)) this.building.repair(target);
  }

  /** Hammer equipped (outside build mode): aim at a piece, R upgrades, hold X demolishes. */
  private updateHammer(dt: number): void {
    const hammer = this.inventory.equippedTool?.kind === 'hammer';
    const target = hammer && this.hasGroundHit ? this.building.pieceAt(this.groundHit.x, this.groundHit.z) : null;
    if (target !== this.hammerTarget) this.demolishTime = 0;
    this.hammerTarget = target;
    if (!this.input.isDown('demolish')) {
      this.demolishTime = 0;
      this.demolishArmed = true;
    }
    if (!target) return;
    if (this.input.wasPressed('reload')) this.building.upgrade(target);
    if (this.demolishArmed && this.input.isDown('demolish')) {
      this.demolishTime += dt;
      if (this.demolishTime >= CONFIG.building.demolishHoldTime) {
        this.demolishTime = 0;
        this.demolishArmed = false;
        if (this.building.demolish(target)) this.hammerTarget = null;
      }
    }
  }

  private updateBuildMode(): void {
    const bm = this.buildMode;
    if (this.input.wasPressed('buildTab')) bm.nextTab();
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
    this.setGunBenchOpen(false);
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
    if (!this.meta.note(kind, id)) return;
    events.emit('toast', { text: `CODEX — ${name.toUpperCase()} logged.`, tone: 'info' });
  }

  private scanParts(): void {
    const ids: string[] = [];
    for (const s of this.inventory.slots) {
      if (s && ITEMS[s.item].kind === 'gunPart') ids.push(s.item);
    }
    const fresh = this.meta.noteMany('part', ids);
    if (fresh.length === 1) {
      events.emit('toast', { text: `CODEX — ${ITEMS[fresh[0] as ItemId].name.toUpperCase()} logged.`, tone: 'info' });
    } else if (fresh.length > 1) {
      events.emit('toast', { text: `CODEX — ${fresh.length} parts logged.`, tone: 'info' });
    }
  }

  private syncHeldItem(): void {
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
    p.update(dt, this.input, this.rig, this.collision);
    const limit = CONFIG.world.halfSize - 0.5;
    p.position.x = clamp(p.position.x, -limit, limit);
    p.position.z = clamp(p.position.z, -limit, limit);

    const gunOut = !!this.inventory.equippedGun && !this.buildMode.active;
    this.shooting.update(
      dt,
      gunOut && this.input.isDown('fire'),
      gunOut && this.input.wasPressed('reload'),
      gunOut && this.input.isDown('aim'),
    );
    if (!gunOut) {
      this.player.load = 0;
      this.player.aiming = false;
      this.gathering.update(dt, this.input.isDown('fire') && !this.buildMode.active);
    }
    if (this.buildMode.active) this.updateBuildMode();
    else this.updateHammer(dt);

    this.currentInteractable = this.interactions.findBest(p.position, p.facing);
    if (this.currentInteractable && this.input.wasPressed('interact')) {
      this.currentInteractable.onInteract();
      events.emit('player:interact', { id: this.currentInteractable.id });
    }

    const inside = this.area.homeZone.contains(p.position);
    if (inside !== this.insideZone) {
      this.insideZone = inside;
      events.emit('zone:changed', { inside });
      events.emit('toast', inside
        ? { text: 'Back inside the Home Zone.', tone: 'info' }
        : { text: 'You left the Home Zone. Be back before the raid hits.', tone: 'danger' });
    }

    this.flow.update(dt);
    this.horde.update(dt);
    this.defenses.update(dt);
    this.raid.update(dt);
    this.refreshRoamers(dt);

    this.crafting.update(dt);
    this.oven.update(dt);
    this.survival.update(dt);
    if (!p.alive) this.die(this.survival.deathMessage());
    this.input.endTick();
  }

  private updateAim(): void {
    if (!this.input.mouseInWindow || !this.input.enabled) {
      this.player.setAim(null);
      this.hasGroundHit = false;
      return;
    }
    this.mouseNdc.set(this.input.mouseNdc.x, this.input.mouseNdc.y);
    this.raycaster.setFromCamera(this.mouseNdc, this.rig.camera);
    const hit = this.raycaster.ray.intersectPlane(this.aimPlane, this.aimHit);
    this.player.setAim(hit);
    this.hasGroundHit = this.raycaster.ray.intersectPlane(this.groundPlane, this.groundHit) !== null;
  }

  private render(alpha: number, frameDt: number): void {
    if (this.input.wasPressedThisFrame('pause')) {
      if (this.metaOverlay.open) this.metaOverlay.hide();
      else if (this.inventoryView.open) this.setInventoryOpen(false);
      else if (this.gunBench.isOpen) this.setGunBenchOpen(false);
      else if (this.buildMode.active) this.setBuildMode(false);
      else this.setPaused(this.state === 'playing');
    }
    if (this.input.wasPressedThisFrame('inventory') && this.state === 'playing' && !this.gunBench.isOpen) this.setInventoryOpen(!this.inventoryView.open);
    if (this.input.wasPressedThisFrame('debug')) this.debug.toggle();
    if (this.input.wasPressedThisFrame('help') && this.state === 'playing') this.hud.toggleHelp();
    if (this.input.wasPressedThisFrame('mute')) {
      const muted = audio.toggleMute();
      this.pauseScreen.syncSound();
      events.emit('toast', { text: muted ? 'SOUND OFF. M to bring it back.' : 'SOUND ON.', tone: 'info' });
    }

    const playing = this.state === 'playing' && !this.inventoryView.open && !this.gunBench.isOpen;
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

      let fallY = 0;
      let lightningIntensity = 0;

      if (t < tFallEnd) {
        const u = clamp(t / tFallEnd, 0, 1);
        // Accelerating gravity drop from high in the sky (36m -> 0m)
        fallY = 36 * (1 - u * u);

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
        this.debris.burst(this.renderPos.x, 0.15, this.renderPos.z, '#5a4e3e', 48); // Dirt crater
        this.debris.burst(this.renderPos.x, 0.22, this.renderPos.z, '#8f836f', 36); // Fine dust
        this.debris.burst(this.renderPos.x, 0.35, this.renderPos.z, '#4a4237', 24); // Soil chunks
        this.debris.burst(this.renderPos.x, 0.30, this.renderPos.z, '#6a7848', 18); // Toxic earth bits
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
        targetFocusY = lerp(0.5, 0.85, e);
      } else {
        // Phase 3 (2.90..4.75s): Standing tall, checking mask, and smoothly panning back to gameplay
        const u = (t - tStandEnd) / (tTotal - tStandEnd);
        const e = smoothstep(0, 1, u);

        targetYaw = lerp(75, CONFIG.camera.yawDeg, e);
        targetPitch = lerp(22, CONFIG.camera.pitchDeg, e);
        targetDist = lerp(5.8, CONFIG.camera.distance, e);
        targetFocusY = lerp(0.85, 1.0, e);
      }

      this.focusTarget.set(this.renderPos.x, targetFocusY, this.renderPos.z);
      this.rig.updateCutscene(dt, this.focusTarget, targetYaw, targetPitch, targetDist);

      this.input.consumeWheel();

      if (t >= tTotal) {
        this.finishIntro();
      }
    } else {
      p.object.position.copy(this.renderPos);
      p.object.rotation.y = facing;
      if (this.state !== 'dead') this.animator.update(dt, p, facing);
      else p.object.rotation.z = Math.min(Math.PI / 2, p.object.rotation.z + dt * 4);

      this.focusTarget.copy(this.renderPos).setY(1);
      this.rig.update(
        dt,
        this.renderPos,
        playing && p.hasAimPoint ? p.aimPoint : null,
        this.input.consumeWheel(),
      );
    }

    this.world.update(dt, this.renderPos);
    this.weather.update(dt, this.rig.currentFocus);
    this.env.setToxic(this.survival.gas);
    this.env.setWeather(this.weather.rain, this.weather.flash);
    this.env.update(dt, this.rig.currentFocus);
    this.gasFx.update(dt, this.rig.currentFocus, this.renderPos, this.weather.rain);
    this.ovenGlow = damp(this.ovenGlow, this.oven.lit ? 1 : 0, 3, dt);
    for (const e of this.area.ovenLights) e.gain = this.ovenGlow;
    this.lights.update(dt, this.rig.currentFocus);
    this.debris.update(dt);
    this.building.update(dt);
    this.buildMode.render(dt, playing ? this.hammerTarget : null);
    this.area.homeZone.update(dt, this.insideZone);

    const i = this.area.interior;
    const inHut = this.renderPos.x > i.minX - 0.2 && this.renderPos.x < i.maxX + 0.2 && this.renderPos.z > i.minZ - 0.2 && this.renderPos.z < i.maxZ + 0.2;
    this.area.roof.forced = inHut ? 0 : null;
    this.occlusionTargets[0].copy(this.renderPos).setY(0.9);
    this.occlusionTargets[1].copy(this.renderPos).setY(1.8);
    this.occlusion.update(dt, this.rig.camera, this.occlusionTargets);

    if (this.colliderDebug?.visible && this.colliderDebugVersion !== this.collision.version) this.rebuildColliderDebug();

    const hurt = this.lastHealth - p.health;
    if (hurt > 1.5 && this.state === 'playing') {
      this.post.pulseHurt(hurt / CONFIG.player.maxHealth);
      sfx('player.hurt', { pitch: 0.9 + Math.random() * 0.2 });
    }
    this.lastHealth = p.health;
    this.post.setLowHealth(p.alive && p.health < 30 ? (1 - p.health / 30) * 0.55 : 0);
    this.post.update(dt, {
      toxic: this.survival.gas * (p.filter <= 0 ? 1.1 : 0.4),
      flash: this.weather.flash,
      wet: this.weather.rain,
    });
    this.post.render(this.scene, this.rig.camera);
    this.floaters.update(dt, this.rig.camera);

    this.rig.groundRight(this.camRight);
    audio.setListener(this.renderPos.x, this.renderPos.z, this.camRight.x, this.camRight.z);
    this.sound.update(frameDt, {
      playing: this.state === 'playing' || this.state === 'paused',
      paused: this.state === 'paused',
      dead: this.state === 'dead',
      raid: this.raid.active,
      boss: !!this.horde.boss,
      countdown: this.raid.timeLeft,
      gas: this.survival.gas,
      rain: this.weather.rain,
      speed: Math.hypot(p.actualVelocity.x, p.actualVelocity.z),
      sprinting: p.sprinting,
      stamina: p.stamina / CONFIG.player.stamina.max,
      x: this.renderPos.x,
      z: this.renderPos.z,
    });
    const boss = this.horde.boss;
    this.hud.setBoss(boss ? boss.def.name : null, boss ? boss.hp / boss.maxHp : 0, !!boss && boss.hp < boss.maxHp * 0.3);

    this.hud.setHealth(p.health, CONFIG.player.maxHealth);
    this.hud.setHunger(p.hunger, CONFIG.survival.maxHunger);
    this.hud.setFilter(p.filter, CONFIG.player.maxFilter);
    this.hud.setStamina(p.stamina, CONFIG.player.stamina.max, p.exhausted);
    this.hud.setGas(this.survival.gas, p.filter <= 0);
    const job = this.crafting.queue[0];
    this.hud.setCraft(job ? (this.icons[job.recipe.output] ?? null) : null, this.crafting.progress, this.crafting.queue.length, !!job?.blocked);
    this.hud.setOven(this.oven.lit, this.oven.jobs.length, this.oven.outputCount);
    this.craftingPanel.update();
    this.ovenPanel.update();
    const fromCenter = this.area.homeZone.distanceFromCenter(this.renderPos);
    this.hud.setZone(this.insideZone, fromCenter - this.area.homeZone.radius);
    this.hud.setRaid(this.raid.active, this.raid.timeLeft, this.raid.raidNumber, this.horde.raidAlive);
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
    this.gunBench.update(dt);
    const it = playing ? this.currentInteractable : null;
    this.hud.setPrompt(it ? it.verb : null, it?.label);

    this.hud.setCrosshair(this.input.mouseScreen.x, this.input.mouseScreen.y, playing && this.input.mouseInWindow);

    const bm = this.buildMode;
    this.buildUI.setBuild(playing && bm.active, bm.tab, bm.selected, bm.placement, this.input.mouseScreen.x, this.input.mouseScreen.y);
    const card = playing && !bm.active && this.hammerTarget && this.building.pieces.has(this.hammerTarget) ? this.hammerTarget : null;
    this.buildUI.setPieceCard(card, this.demolishTime / CONFIG.building.demolishHoldTime);
    this.rig.groundForward(this.camForward);
    this.minimap.update(dt, this.renderPos, facing, this.camForward);

    this.debug.update(frameDt, () => {
      const info = this.renderer.info.render;
      return {
        state: this.state,
        seed: this.seed,
        draws: info.calls,
        triangles: info.triangles.toLocaleString(),
        pos: `${p.position.x.toFixed(1)}, ${p.position.z.toFixed(1)}`,
        biome: `${this.world.sample(p.position.x, p.position.z).biome}`,
        gas: this.survival.gas.toFixed(2),
        hunger: p.hunger.toFixed(1),
        chunks: this.world.loadedChunks,
        nodes: this.world.nodes.size,
        colliders: this.collision.colliders.size,
        lights: this.lights.emitterCount,
        pieces: this.building.pieces.size,
        move: p.state + (p.sprinting ? ' +sprint' : '') + (p.swinging ? ' +swing' : ''),
        zone: `${this.insideZone ? 'inside' : 'outside'} (${fromCenter.toFixed(1)}m)`,
        raid: `${this.raid.state} #${this.raid.raidNumber} ${this.raid.active ? `${this.horde.raidAlive} left` : formatClock(this.raid.timeLeft)}`,
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
    this.colliderDebug = this.collision.createDebugMesh();
    this.colliderDebugVersion = this.collision.version;
    this.scene.add(this.colliderDebug);
  }

  private applyPenalty(reason: PenaltyReason): void {
    this.setInventoryOpen(false);
    this.setGunBenchOpen(false);
    this.setBuildMode(false);
    this.inventory.clear();
    this.player.teleport(this.area.spawn.x, this.area.spawn.z);
    events.emit('camera:shake', { amount: 0.55 });
    events.emit('toast', {
      text: reason === 'timer'
        ? 'You were away when the raid hit. Everything you were carrying is gone.'
        : 'You left during the raid. Everything you were carrying is gone.',
      tone: 'danger',
    });
  }

  private seedRoamers(): void {
    for (let i = 0; i < CONFIG.raid.roamCount; i++) this.spawnRoamer();
  }

  private refreshRoamers(dt: number): void {
    if (this.raid.active) return;
    this.roamClock += dt;
    if (this.roamClock < 14 || this.horde.roamAlive >= CONFIG.raid.roamCount) return;
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
    this.weather.setPixelScale(window.innerHeight * this.renderer.getPixelRatio(), CONFIG.camera.fov);
  };
}

function recipeLabel(id: string): string {
  const craft = RECIPES.find((r) => r.id === id);
  if (craft) return ITEMS[craft.output].name;
  const oven = OVEN_RECIPES.find((r) => r.id === id);
  return oven ? ITEMS[oven.output.item].name : id;
}
