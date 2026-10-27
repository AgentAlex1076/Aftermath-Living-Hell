export const CONFIG = {
  fixedStep: 1 / 60,
  maxFrameTime: 0.25,

  world: {
    chunkSize: 32,
    loadRadius: 2,
    unloadRadius: 3,
    /** Ground tiles stream one chunk wider than content, so loaded props never sit at a bare edge. */
    groundRadius: 3,
    /** Chunk layouts farther than this (in chunks) are dropped; they regenerate from the seed. */
    planKeepRadius: 6,
    /** Threat reaches 100% this far from the hut, then keeps climbing with no cap. */
    threatFull: 182,
    /** Extra threat per metre past `threatFull` (another 100% every 400 m). */
    threatPerMetre: 1 / 400,
    /** No generated content this close to the hut (the hand-built starter yard lives here). */
    starterClearRadius: 15,
    /** The home road runs east–west through the yard at this z; highways are this wide. */
    roadZ: 16,
    roadWidth: 7,
    streetWidth: 5.5,
    /**
     * Height field. `heightScale` 0 is flat (the Phase 13 look); 1 is the full overhaul.
     * Layers and slope rules live in `Height.ts`.
     */
    heightScale: 1,
    homeSearch: 180,
    homeFlatten: 30,
    homeBlend: 16,
    walkSlope: 30,
    steepSlope: 45,
    steepMul: 0.6,
    roadMul: 1.1,
    /** Extra flow-field cost per metre climbed. */
    climbCost: 0.75,
    /**
     * Water. Deeper than `deepWater` blocks (merged colliders, like cliffs); shallower than that but
     * past `wadeDepth` is a ford: `wadeMul` speed, no sprint, and loud. Rivers stay this far from the hut.
     */
    deepWater: 0.95,
    wadeDepth: 0.12,
    wadeMul: 0.6,
    riverHome: [100, 140] as const,
  },

  traversal: {
    /** Metres per second along a traversal link. */
    climbSpeed: 2.3,
    mutantClimbSpeed: 1.5,
    /** A mutant this far from a link end will go for it to reach a player on the other level. */
    mutantSeek: 10,
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
    /** Passive HP regen per second while out of combat and breathing clean air. */
    regenPerSecond: 0.55,
    /** Seconds without taking damage before out-of-combat regen starts. */
    regenCombatDelay: 10,
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
    /** Standing in Marsh or crater water counts as gas this strong (more as it gets deeper). */
    toxicWater: 0.6,
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
    minPitchDeg: 16,
    maxPitchDeg: 80,
    distance: 20,
    minDistance: 12,
    maxDistance: 46,
    zoomStep: 0.0025,
    followSharpness: 10,
    zoomSharpness: 12,
    /** How quickly free-cam orbit angles catch up to the drag target. */
    orbitSharpness: 14,
    lookAhead: 0.2,
    maxLookAhead: 4.5,
    maxShake: 0.6,
    /** Degrees of yaw/pitch per pixel while holding RMB. */
    orbitYaw: 0.16,
    orbitPitch: 0.12,
  },

  homeZone: {
    radius: 30,
  },

  /** One real second is one game minute; the cycle starts at 05:00 (first light). */
  dayNight: {
    cycle: 1440,
    dawn: 120,
    day: 840,
    dusk: 120,
    /** Seconds into the cycle when a run begins (07:30). */
    start: 150,
  },

  horde: {
    /** Attention (0–100) per second in daylight at the start of a run: about 14 minutes to fill. */
    passive: 0.12,
    /** Extra passive gain per raid survived, as a fraction of `passive`. */
    passivePerRaid: 0.06,
    nightMultiplier: 2,
    /** After a raid, attention restarts at this much per raid survived, up to `maxFloor`. */
    floorPerRaid: 2.5,
    maxFloor: 35,
    thresholds: [50, 75] as const,
    callWindup: 15,
    callCooldown: 60,
    /** Wave and reward scale when the siren is cranked at 0% and at 100% attention. */
    callScaleMin: 0.75,
    callScaleMax: 1.5,
    nightWave: 1.25,
    nightReward: 1.35,
    /** Return window before a forced raid at 100% attention. */
    forcedWarning: 120,
    forcedWarningNight: 90,
    warnings: [60, 30, 10] as const,
    /** Farther than this from the hut when a raid lands (or comes back within it): the base fights without you. */
    siegeRange: 60,
    /** Walk this far from the hut during a raid and the rest of it is fought without you. */
    leaveRange: 75,
    /** A siege that hasn't broken through after this long gives up: the base held. */
    siegeMaxTime: 180,
    /** Seconds from the wave appearing to it reaching the outer walls. */
    siegeApproach: 8,
    /** How many mutants at the front of a siege wave can hit the walls at once. */
    siegeFront: 6,
    /** Fraction of each stack lost from storage boxes behind a breached side. */
    breachLoss: [0.3, 0.6] as const,
    /** A held siege pays this fraction of the score and cache. */
    heldShare: 0.5,
    /** Map landmarks revealed per cleared raid (landmarks arrive in Phase 17). */
    reveals: [1, 2] as const,
    /** Attention added by noise. Gunshots scale from `shot` to `shotHeavy` with how heavy the gun hits. */
    noise: {
      shot: 0.15,
      shotHeavy: 0.55,
      turret: 0.12,
      explosion: 1.6,
      generator: 0.06,
      pry: 0.8,
      labLocker: 2.5,
      /** Per splashing stride through a ford. */
      wade: 0.04,
    },
    /** Roamers this close to a noise walk over to investigate. */
    hearing: { shot: 32, explosion: 45, generator: 18, pry: 16, wade: 14 },
    investigateTime: 14,
    roamCountNight: 6,
    nightAggro: 1.6,
  },

  raid: {
    /** Ring outside the Home Zone where the wave appears. */
    spawnMin: 38,
    spawnMax: 46,
    fieldRadius: 52,
    fieldCell: 1.5,
    roamCount: 3,
    roamMin: 48,
    roamMax: 88,
    /** How close the player has to be before an enemy leaves the flow field and chases, outside the Home Zone. */
    playerAggro: 7.5,
    structureReach: 1.15,
  },

  /** The hanging cure. Mutants path to it; losing it ends the run. */
  cure: {
    hp: 250,
    /** Proximity at which a mutant drops the cure and swings at you. */
    aggro: 5.5,
    /** Extra metres of stickiness so they don't flicker on the bubble's edge. */
    aggroStick: 1.3,
    /** Chase time after you damage one, unless you back off past `grudgeLeash`. */
    grudgeTime: 8,
    /** Once a provoked mutant has gotten this close, leaving `grudgeLeash` sends it back to the cure. */
    grudgeClose: 8,
    grudgeLeash: 11,
    /** Melee reach added to the mutant's own attack range. */
    hitPad: 0.4,
    unhookTime: 0.5,
    repairTime: 5,
    /** How long the shattered flask gives you to reseal it. */
    countdown: 30,
    /** Hang points have to sit inside the flow field, which is centered on the hut. */
    hangRadius: 46,
    interactRadius: 2.15,
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
    /** Fraction of the current tier cost returned when you scrap a piece. */
    refundFactor: 0.5,
    /** Consecutive tool hits needed to scrap a piece (hammer / axe / pickaxe). */
    demolishHits: 5,
    /** Max seconds between scrap hits before the count resets. */
    demolishHitWindow: 2,
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
    shotgunStartAmmo: 20,
    shotgunLowAmmo: 5,
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
