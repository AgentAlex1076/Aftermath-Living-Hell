import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { GameLoop } from '../core/GameLoop';
import { Input, type Action } from '../core/Input';
import { clamp, damp, wrapAngle } from '../core/math';
import { Rng } from '../core/random';
import { ALL_ITEM_IDS, ITEMS, type ItemDef } from '../data/items';
import type { EnemyId } from '../data/enemies';
import { Player } from '../entities/Player';
import { PlayerAnimator } from '../entities/PlayerAnimator';
import { BUILD_BAR, PIECES, pieceModel } from '../data/buildables';
import { Building, type Piece } from '../gameplay/Building';
import { BuildMode } from '../gameplay/BuildMode';
import { Crafting } from '../gameplay/Crafting';
import { FlowField } from '../gameplay/FlowField';
import { Gathering } from '../gameplay/Gathering';
import { Horde, meleePower } from '../gameplay/Horde';
import { Inventory } from '../gameplay/Inventory';
import { Oven } from '../gameplay/Oven';
import { Raid, type PenaltyReason } from '../gameplay/Raid';
import { Survival } from '../gameplay/Survival';
import type { Recipe } from '../data/recipes';
import { BuildUI, pieceIconKey } from '../ui/BuildUI';
import { CraftingPanel, OvenPanel, StoragePanel } from '../ui/StationPanels';
import { models, registerModels } from '../models';
import { CollisionWorld } from '../physics/Collision';
import { CameraRig } from '../render/CameraRig';
import { createRenderer } from '../render/createRenderer';
import { Debris } from '../render/Debris';
import { Environment } from '../render/Environment';
import { LightPool } from '../render/LightPool';
import { OcclusionFader } from '../render/Occlusion';
import { DebugPanel } from '../ui/DebugPanel';
import { FloatingText } from '../ui/FloatingText';
import { Hud } from '../ui/Hud';
import { renderIcons, renderItemIcons } from '../ui/IconRenderer';
import { HotbarView, InventoryView } from '../ui/InventoryUI';
import { Minimap } from '../ui/Minimap';
import { DeathScreen, PauseScreen, StartScreen } from '../ui/Screens';
import { InteractionSystem, type Interactable } from '../world/Interactables';
import { buildStarterArea, type StarterArea } from '../world/StarterArea';
import { World } from '../world/World';

type GameState = 'title' | 'playing' | 'paused' | 'dead';

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
  private ovenGlow = 0;
  private readonly debris: Debris;
  private readonly floaters: FloatingText;
  private readonly hud: Hud;
  private readonly inventoryView: InventoryView;
  private readonly minimap: Minimap;
  private readonly pauseScreen: PauseScreen;
  private readonly deathScreen: DeathScreen;
  private readonly debug: DebugPanel;

  private state: GameState = 'title';
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
  private readonly occlusionTargets = [new THREE.Vector3(), new THREE.Vector3()];

  constructor(appRoot: HTMLElement, uiRoot: HTMLElement) {
    registerModels();

    this.renderer = createRenderer(appRoot);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
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
    });
    this.world.update(0, this.area.spawn, true);

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
    );
    this.raid = new Raid(this.seed, this.horde, {
      insideZone: () => this.area.homeZone.contains(this.player.position),
      applyPenalty: (reason) => this.applyPenalty(reason),
    });
    this.roamRng = new Rng(this.seed ^ 0x524f41);
    this.seedRoamers();

    this.icons = {
      ...renderItemIcons(ALL_ITEM_IDS),
      ...renderIcons(BUILD_BAR.map((id) => ({ key: pieceIconKey(id), model: pieceModel(PIECES[id], 'wood') }))),
    };
    this.minimap = new Minimap(this.hud.root, this.world, this.building, this.horde);
    new HotbarView(this.hud.root, this.inventory, this.icons);
    this.buildUI = new BuildUI(this.hud.root, this.building, this.inventory, this.icons);
    this.inventoryView = new InventoryView(uiRoot, this.inventory, this.icons, (i) => this.gathering.use(i));
    this.craftingPanel = new CraftingPanel(this.inventoryView.side, this.crafting, this.inventory, this.icons, () => this.nearWorkbench());
    this.ovenPanel = new OvenPanel(this.inventoryView.side, this.oven, this.inventory, this.icons);
    this.storagePanel = new StoragePanel(this.inventoryView.side);
    this.inventory.onChange(() => this.syncHeldItem());

    this.pauseScreen = new PauseScreen(uiRoot, this.seed, () => this.setPaused(false), () => this.newRun());
    this.deathScreen = new DeathScreen(uiRoot, () => this.newRun());
    this.debug = new DebugPanel(uiRoot, {
      toggleColliders: (on) => this.toggleColliderDebug(on),
      toggleInfiniteStamina: (on) => (this.player.infiniteStamina = on),
      toggleGodMode: (on) => (this.player.godMode = on),
      setTimeScale: (s) => (this.loop.timeScale = s),
      teleportHome: () => this.player.teleport(this.area.spawn.x, this.area.spawn.z),
      giveKit: () => {
        for (const [item, qty] of [['hammer', 1], ['crowbar', 1], ['gasFilter', 5], ['bandage', 5], ['wood', 400], ['scrap', 300], ['cloth', 40], ['charcoal', 12], ['metalPlate', 40], ['mutantMeat', 5]] as const) this.inventory.add(item, qty);
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
    });
    new StartScreen(uiRoot, () => this.beginPlay());

    events.on('camera:shake', ({ amount }) => this.rig.addTrauma(amount));
    events.on('player:dodge', () => this.rig.addTrauma(0.12));
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
    this.state = 'playing';
    this.input.enabled = true;
    this.hud.setVisible(true);
    document.body.classList.add('playing');
    window.setTimeout(() => events.emit('toast', { text: 'Your gear is in the crate by the door. Grab it.', tone: 'info' }), 700);
    window.setTimeout(() => events.emit('toast', { text: 'Stay close to the hut. Something is moving in the fog.', tone: 'warn' }), 4200);
  }

  private setPaused(paused: boolean): void {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    if (paused && this.inventoryView.open) this.setInventoryOpen(false);
    this.state = paused ? 'paused' : 'playing';
    this.input.enabled = !paused;
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
    this.storagePanel.show(box, this.inventory);
    this.inventoryView.setContainer(box, this.storagePanel.grid);
    this.inventoryView.setOpen(open);
    this.input.enabled = !open;
    document.body.classList.toggle('playing', !open);
  }

  private setBuildMode(on: boolean): void {
    if (on && this.state !== 'playing') return;
    if (on === this.buildMode.active) return;
    this.buildMode.setActive(on);
    document.body.classList.toggle('building', on);
    this.hammerTarget = null;
    if (on && !this.shownBuildHint) {
      this.shownBuildHint = true;
      events.emit('toast', { text: 'Foundations go down first. Walls snap to their edges.', tone: 'info' });
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

  private die(cause: string): void {
    if (this.state === 'dead') return;
    this.setBuildMode(false);
    this.state = 'dead';
    this.inventoryView.setOpen(false);
    this.input.enabled = false;
    document.body.classList.remove('playing');
    events.emit('camera:shake', { amount: 0.8 });
    window.setTimeout(() => {
      this.deathScreen.show({
        cause,
        seconds: this.runTime,
        gathered: this.gathering.gathered,
        crafted: this.crafting.crafted,
        searched: this.gathering.searched,
        built: this.building.built,
        raids: this.raid.raidsSurvived,
        kills: this.horde.kills,
        seed: this.seed,
      });
    }, 900);
  }

  private syncHeldItem(): void {
    const st = this.inventory.selectedStack;
    const def: ItemDef | null = st ? ITEMS[st.item] : null;
    const id = def && def.kind !== 'resource' ? def.model : null;
    if (id === this.heldItem) return;
    this.heldItem = id;
    let model: THREE.Object3D | null = null;
    if (id) {
      model = this.heldModels.get(id) ?? models.create(id, 1);
      this.heldModels.set(id, model);
    }
    this.animator.setHeld(model);
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

    this.gathering.update(dt, this.input.isDown('fire') && !this.buildMode.active);
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
      if (this.inventoryView.open) this.setInventoryOpen(false);
      else if (this.buildMode.active) this.setBuildMode(false);
      else this.setPaused(this.state === 'playing');
    }
    if (this.input.wasPressedThisFrame('inventory') && this.state === 'playing') this.setInventoryOpen(!this.inventoryView.open);
    if (this.input.wasPressedThisFrame('debug')) this.debug.toggle();
    if (this.input.wasPressedThisFrame('help') && this.state === 'playing') this.hud.toggleHelp();

    const playing = this.state === 'playing' && !this.inventoryView.open;
    const dt = this.state === 'paused' ? 0 : frameDt * this.loop.timeScale;
    const p = this.player;

    this.renderPos.lerpVectors(p.prevPosition, p.position, alpha);
    const facing = p.prevFacing + wrapAngle(p.facing - p.prevFacing) * alpha;
    p.object.position.copy(this.renderPos);
    p.object.rotation.y = facing;
    if (this.state !== 'dead') this.animator.update(dt, p, facing);
    else p.object.rotation.z = Math.min(Math.PI / 2, p.object.rotation.z + dt * 4);

    this.focusTarget.copy(this.renderPos).setY(1);
    this.rig.update(dt, this.focusTarget, playing && p.hasAimPoint ? p.aimPoint : null, this.input.consumeWheel());
    this.world.update(dt, this.renderPos);
    this.env.setToxic(this.survival.gas);
    this.env.update(dt, this.rig.currentFocus);
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

    this.renderer.render(this.scene, this.rig.camera);
    this.floaters.update(dt, this.rig.camera);

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
    const it = playing ? this.currentInteractable : null;
    this.hud.setPrompt(it ? it.verb : null, it?.label);
    this.hud.setCrosshair(this.input.mouseScreen.x, this.input.mouseScreen.y, playing && this.input.mouseInWindow);
    const bm = this.buildMode;
    this.buildUI.setBuild(playing && bm.active, bm.selected, bm.placement, this.input.mouseScreen.x, this.input.mouseScreen.y);
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

  private spawnRoamer(): void {
    const a = this.roamRng.range(0, Math.PI * 2);
    const r = this.roamRng.range(CONFIG.raid.roamMin, CONFIG.raid.roamMax);
    this.horde.spawn(this.roamRng.chance(0.35) ? 'crawler' : 'shambler', Math.sin(a) * r, Math.cos(a) * r, false);
  }

  private debugSpawn(id: EnemyId): void {
    const p = this.player;
    this.horde.spawn(id, p.position.x + Math.sin(p.facing) * 6, p.position.z + Math.cos(p.facing) * 6, false);
  }

  private onResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.rig.resize(window.innerWidth / window.innerHeight);
  };
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
