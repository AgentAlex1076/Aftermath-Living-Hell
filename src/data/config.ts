export const CONFIG = {
  fixedStep: 1 / 60,
  maxFrameTime: 0.25,

  world: {
    /** Half the side length of the playable square, centered on the hut. */
    halfSize: 192,
    chunkSize: 32,
    loadRadius: 2,
    unloadRadius: 3,
    /** No generated content this close to the hut (the hand-built starter yard lives here). */
    starterClearRadius: 15,
    roadZ: 16,
    roadWidth: 7,
  },

  player: {
    radius: 0.42,
    maxHealth: 100,
    maxFilter: 100,
    walkSpeed: 5.0,
    sprintSpeed: 8.2,
    backpedalMultiplier: 0.82,
    swingMoveMultiplier: 0.6,
    acceleration: 14,
    turnSpeed: 20,
    aimHeight: 1.0,
    dodge: {
      speed: 13.5,
      duration: 0.36,
      cooldown: 0.45,
      staminaCost: 25,
      invulnerableTime: 0.28,
    },
    stamina: {
      max: 100,
      sprintDrain: 20,
      regen: 26,
      regenDelay: 0.8,
      exhaustedThreshold: 25,
    },
  },

  gathering: {
    reach: 2.1,
    coneDeg: 75,
    handPower: 10,
    /** Fraction of a tool's power applied when it's the wrong tool for the node. */
    wrongToolMultiplier: 0.35,
    handSwingTime: 0.5,
  },

  survival: {
    maxHunger: 100,
    startHunger: 80,
    /** Hunger lost per second (100 → 0 in about 7 minutes). */
    hungerDrain: 0.24,
    sprintHungerMultiplier: 1.7,
    /** Health lost per second while starving. */
    starveDamage: 1.5,
    /** Passive healing while well fed and breathing clean air. */
    regenHungerThreshold: 60,
    regenPerSecond: 0.4,
    regenHungerCost: 0.15,
  },

  crafting: {
    queueLimit: 8,
    /** How close the Crafting Table must be for workbench recipes. */
    workbenchRange: 3.2,
  },

  gas: {
    /** Filter units drained per second at full gas intensity. */
    filterDrain: 3,
    /** Health lost per second in gas with an empty filter. */
    damageNoFilter: 9,
  },

  inventory: {
    hotbarSlots: 6,
    backpackSlots: 24,
  },

  lights: {
    poolSize: 8,
    maxRange: 42,
  },

  camera: {
    fov: 38,
    yawDeg: 45,
    pitchDeg: 54,
    distance: 20,
    minDistance: 12,
    maxDistance: 38,
    zoomStep: 0.0025,
    followSharpness: 7,
    zoomSharpness: 10,
    lookAhead: 0.2,
    maxLookAhead: 4.5,
    maxShake: 0.6,
  },

  homeZone: {
    radius: 30,
  },

  raid: {
    minCountdown: 90,
    maxCountdown: 300,
    warnings: [60, 30, 10] as const,
    /** Ring outside the Home Zone where the wave appears. */
    spawnMin: 38,
    spawnMax: 46,
    fieldRadius: 52,
    fieldCell: 1.5,
    roamCount: 3,
    roamMin: 48,
    roamMax: 88,
    /** How close the player has to be before an enemy leaves the flow field and chases. */
    playerAggro: 7.5,
    structureReach: 1.15,
  },

  building: {
    /** Side of a foundation; walls sit on the grid lines between cells. */
    cell: 3,
    wallHeight: 2.6,
    halfWallHeight: 1.2,
    wallThickness: 0.22,
    /** How far from the player a piece can be placed. */
    range: 7.5,
    /** How far from the player the hammer can reach a piece (to its nearest point). */
    hammerReach: 3.2,
    /** Fraction of max HP restored per hammer hit. */
    repairPerHit: 0.2,
    /** Repairing a piece from 0 to full costs this fraction of its tier cost. */
    repairCostFactor: 0.5,
    /** Fraction of the current tier cost returned on demolish. */
    refundFactor: 0.5,
    demolishHoldTime: 0.7,
  },

  interact: {
    radius: 1.9,
  },

  guns: {
    cols: 12,
    rows: 6,
    maxPerCategory: 5,
    /** World metres per bench cell when the assembled gun is built. */
    cell: 0.085,
    benchRange: 3.2,
    /** Move-speed penalty is weight / (weight + this). */
    weightSoft: 10,
  },

  combat: {
    pool: 48,
    radius: 0.07,
    hitWords: ['BLAM!', 'KRAK!', 'POW!', 'BANG!'] as const,
    aimSpread: 0.42,
    aimMove: 0.72,
    heatDecay: 0.35,
    jamClearTime: 0.55,
  },

  defenses: {
    /** How far a generator feeds powered pieces. */
    powerRadius: 16,
    /** Seconds of burn per log while something in range is drawing power. */
    fuelBurn: 5,
    spikeDps: 22,
    spikeSlow: 0.55,
    barbedDps: 14,
    barbedSlow: 0.38,
    mineArm: 1.15,
    mineRadius: 3.4,
    mineDamage: 90,
    tripArm: 0.7,
    tripWidth: 0.38,
    tripRadius: 3.1,
    tripDamage: 75,
    gasArm: 0.85,
    gasTrigger: 1.15,
    gasR: 4.6,
    gasLife: 8,
    shotgunRange: 8,
    shotgunCone: 0.62,
    shotgunCooldown: 2.2,
    shotgun: {
      damage: 9,
      fireRate: 1,
      fireMode: 'semi' as const,
      burstCount: 1,
      projectiles: 8,
      spread: 14,
      recoil: 4,
      range: 9,
      velocity: 36,
      magSize: 1,
      reloadTime: 1,
      weight: 0,
      handling: 0,
      heat: 0,
      sway: 0,
      ammoPerShot: 1,
    },
    turretTurn: 8,
    flameRange: 6.4,
    flameCone: 0.55,
    flameDps: 32,
    flameChemPerSecond: 0.4,
  },
} as const;
