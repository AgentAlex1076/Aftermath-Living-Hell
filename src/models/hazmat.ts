import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { box, capsule, cyl, group, mesh, sphere, torus } from './build';
import { mat } from './materials';

type V3 = readonly [number, number, number];

interface PartOpts {
  pos?: V3;
  rot?: V3;
  scale?: V3;
  name?: string;
  shadow?: boolean;
}

const rboxCache = new Map<string, THREE.BufferGeometry>();

function rbox(
  w: number,
  h: number,
  d: number,
  radius: number,
  material: THREE.Material,
  opts?: PartOpts,
): THREE.Mesh {
  const key = `rbox:${w}:${h}:${d}:${radius}`;
  let geo = rboxCache.get(key);
  if (!geo) {
    geo = new RoundedBoxGeometry(w, h, d, 4, radius);
    rboxCache.set(key, geo);
  }
  return mesh(geo, material, opts);
}

interface HazmatPalette {
  suit: THREE.MeshStandardMaterial;
  suitShade: THREE.MeshStandardMaterial;
  visorGlass: THREE.MeshPhysicalMaterial;
  visorRim: THREE.MeshStandardMaterial;
  seamStrip: THREE.MeshStandardMaterial;
  respirator: THREE.MeshStandardMaterial;
  respiratorDark: THREE.MeshStandardMaterial;
  strap: THREE.MeshStandardMaterial;
  pouchBody: THREE.MeshStandardMaterial;
  pouchFlap: THREE.MeshStandardMaterial;
  buckle: THREE.MeshStandardMaterial;
  cuff: THREE.MeshStandardMaterial;
  gloveBoot: THREE.MeshStandardMaterial;
  soleHose: THREE.MeshStandardMaterial;
}

let cachedPalette: HazmatPalette | null = null;

function getPalette(): HazmatPalette {
  if (cachedPalette) return cachedPalette;

  cachedPalette = {
    // Rich, clean, satin golden-yellow hazmat fabric (matches reference images perfectly)
    suit: new THREE.MeshStandardMaterial({
      color: '#f6cb28',
      roughness: 0.48,
      metalness: 0.04,
      name: 'hazmatSuit',
    }),
    // Slightly darker warm ochre for recessed creases and accents
    suitShade: new THREE.MeshStandardMaterial({
      color: '#d69f16',
      roughness: 0.58,
      metalness: 0.04,
      name: 'hazmatSuitShade',
    }),
    // Smooth, glossy, dark panoramic bubble visor with purple/teal iridescence & clean specular sheen
    visorGlass: new THREE.MeshPhysicalMaterial({
      color: '#1a1824',
      roughness: 0.08,
      metalness: 0.35,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      iridescence: 0.9,
      iridescenceIOR: 1.5,
      emissive: '#1c152b',
      emissiveIntensity: 0.35,
      name: 'hazmatVisorGlass',
    }),
    // Matte dark charcoal rubber gasket bezel around visor
    visorRim: new THREE.MeshStandardMaterial({
      color: '#32363a',
      roughness: 0.6,
      metalness: 0.12,
      name: 'hazmatVisorRim',
    }),
    // Medium-dark slate grey for front storm flap and seam strips
    seamStrip: new THREE.MeshStandardMaterial({
      color: '#4a4f54',
      roughness: 0.65,
      metalness: 0.08,
      name: 'hazmatSeamStrip',
    }),
    // Dark olive-grey for the respirator housing and filter canister bodies
    respirator: new THREE.MeshStandardMaterial({
      color: '#444842',
      roughness: 0.52,
      metalness: 0.14,
      name: 'hazmatRespirator',
    }),
    // Deep dark interior for filter recesses and grille louvers
    respiratorDark: new THREE.MeshStandardMaterial({
      color: '#1e211f',
      roughness: 0.72,
      metalness: 0.2,
      name: 'hazmatRespiratorDark',
    }),
    // Tactical webbing strap material
    strap: new THREE.MeshStandardMaterial({
      color: '#353835',
      roughness: 0.75,
      metalness: 0.06,
      name: 'hazmatStrap',
    }),
    // Tactical pouch body (military olive-drab grey)
    pouchBody: new THREE.MeshStandardMaterial({
      color: '#464a42',
      roughness: 0.7,
      metalness: 0.06,
      name: 'hazmatPouchBody',
    }),
    // Pouch flap (slightly lighter for crisp readability)
    pouchFlap: new THREE.MeshStandardMaterial({
      color: '#52574e',
      roughness: 0.65,
      metalness: 0.08,
      name: 'hazmatPouchFlap',
    }),
    // Dark metallic buckles, snaps, and latches
    buckle: new THREE.MeshStandardMaterial({
      color: '#2a2d30',
      roughness: 0.38,
      metalness: 0.55,
      name: 'hazmatBuckle',
    }),
    // Flared gauntlet cuffs & boot collars
    cuff: new THREE.MeshStandardMaterial({
      color: '#3e4348',
      roughness: 0.6,
      metalness: 0.1,
      name: 'hazmatCuff',
    }),
    // Heavy charcoal rubber gloves and boot uppers
    gloveBoot: new THREE.MeshStandardMaterial({
      color: '#282c30',
      roughness: 0.62,
      metalness: 0.08,
      name: 'hazmatGloveBoot',
    }),
    // Corrugated hoses and lugged soles
    soleHose: new THREE.MeshStandardMaterial({
      color: '#1b1d20',
      roughness: 0.75,
      metalness: 0.06,
      name: 'hazmatSoleHose',
    }),
  };

  return cachedPalette;
}

/** Builds a tactical utility pouch with rounded body, overlapping top flap, and snap stud. */
function buildPouch(
  w: number,
  h: number,
  d: number,
  p: HazmatPalette,
  opts: PartOpts = {},
): THREE.Group {
  const g = group('pouch');
  if (opts.pos) g.position.set(...opts.pos);
  if (opts.rot) g.rotation.set(...opts.rot);
  if (opts.scale) g.scale.set(...opts.scale);

  const r = Math.min(w, h, d) * 0.22;
  const flapH = h * 0.44;
  g.add(
    rbox(w, h, d, r, p.pouchBody, { pos: [0, 0, 0] }),
    rbox(w * 1.05, flapH, d * 1.08, r * 0.9, p.pouchFlap, {
      pos: [0, h * 0.5 - flapH * 0.44, d * 0.03],
      rot: [0.06, 0, 0],
    }),
    cyl(0.009, 0.009, 0.008, p.buckle, {
      pos: [0, h * 0.5 - flapH * 0.68, d * 0.55],
      rot: [Math.PI / 2, 0, 0],
      segments: 12,
    }),
  );
  return g;
}

/** Builds a smooth curved rubber hose along a 3D path. */
function buildCurvedHose(pts: V3[], radius: number, p: HazmatPalette): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const tubeGeo = new THREE.TubeGeometry(curve, 28, radius, 14, false);
  return mesh(tubeGeo, p.soleHose);
}

/** Builds a contoured strap along a 3D curve without distorting Z coordinates. */
function buildCurvedStrap(pts: V3[], radius: number, material: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const tubeGeo = new THREE.TubeGeometry(curve, 32, radius, 14, false);
  return mesh(tubeGeo, material);
}

/**
 * Hazmat survivor, built facing +Z. Named nodes are driven by PlayerAnimator:
 * rollPivot, body, hips, head, armL/armR, forearmL/forearmR, handL/handR, legL/legR, shinL/shinR, gun.
 */
export function buildHazmat(): THREE.Object3D {
  const p = getPalette();

  const root = group('hazmat');
  const rollPivot = group('rollPivot');
  rollPivot.position.y = 0.9;
  const body = group('body');
  body.position.y = -0.9;
  rollPivot.add(body);
  root.add(rollPivot);

  const hips = group('hips');
  hips.position.y = 0.9;
  body.add(hips);

  // ============================================================================
  // 1. TORSO, SUIT FOLDS, STORM FLAP & CONTOURED CHEST HARNESS
  // ============================================================================
  hips.add(
    // Clean, smooth mid-poly hazmat torso: broad shoulders tapering smoothly to the waist
    capsule(0.23, 0.18, p.suit, { pos: [0, 0.25, 0], scale: [1.16, 0.95, 0.88], name: 'torso' }),
    // Subtle fabric fold at lower belly just above belt
    torus(0.238, 0.022, p.suit, {
      pos: [0, 0.09, 0.008],
      rot: [Math.PI / 2, 0, 0],
      scale: [1.14, 0.88, 1],
    }),
    // Pelvis saddle below the belt connecting seamlessly to the thighs
    sphere(0.228, p.suit, { pos: [0, -0.05, 0], scale: [1.12, 0.78, 0.85], wSeg: 22, hSeg: 16 }),

    // Front center vertical storm flap / waterproof zipper strip
    rbox(0.034, 0.44, 0.016, 0.005, p.seamStrip, { pos: [0, 0.25, 0.206], rot: [-0.02, 0, 0] }),

    // Horizontal chest harness strap connecting left & right shoulder straps & central buckle
    rbox(0.27, 0.038, 0.02, 0.006, p.strap, { pos: [0, 0.33, 0.21], rot: [-0.04, 0, 0] }),
    rbox(0.058, 0.046, 0.026, 0.007, p.buckle, { pos: [0, 0.33, 0.216], rot: [-0.04, 0, 0] }),
    rbox(0.022, 0.034, 0.03, 0.004, p.seamStrip, { pos: [0, 0.33, 0.218], rot: [-0.04, 0, 0] }),
  );

  // Left & Right Contoured Backpack Shoulder Straps (cleanly hugging chest and underarms)
  for (const side of [-1, 1] as const) {
    hips.add(
      buildCurvedStrap(
        [
          [side * 0.095, 0.42, -0.19],
          [side * 0.145, 0.485, -0.08],
          [side * 0.15, 0.485, 0.04],
          [side * 0.142, 0.41, 0.178],
          [side * 0.136, 0.31, 0.204],
          [side * 0.175, 0.2, 0.158],
          [side * 0.23, 0.16, 0.0],
          [side * 0.145, 0.17, -0.185],
        ],
        0.022,
        p.strap,
      ),
      // Strap adjustment buckle on upper chest
      rbox(0.056, 0.024, 0.024, 0.005, p.buckle, {
        pos: [side * 0.142, 0.405, 0.184],
        rot: [-0.45, side * 0.14, 0],
      }),
    );
  }

  // Left Chest Tactical Radio/Utility Pouch (+X is character's left)
  hips.add(
    buildPouch(0.092, 0.12, 0.054, p, {
      pos: [0.138, 0.32, 0.218],
      rot: [-0.05, 0.2, -0.03],
    }),
  );

  // ============================================================================
  // 2. WAIST UTILITY BELT & POUCHES
  // ============================================================================
  hips.add(
    // Main webbing waist belt
    cyl(0.262, 0.258, 0.076, p.strap, {
      pos: [0, 0.015, 0.004],
      scale: [1.14, 1, 0.88],
      segments: 28,
    }),
    // Center quick-release tactical belt buckle
    rbox(0.084, 0.08, 0.028, 0.008, p.buckle, { pos: [0, 0.015, 0.234] }),
    rbox(0.044, 0.058, 0.034, 0.006, p.seamStrip, { pos: [0, 0.015, 0.237] }),
    rbox(0.014, 0.084, 0.03, 0.004, p.seamStrip, { pos: [-0.044, 0.015, 0.232] }),
    rbox(0.014, 0.084, 0.03, 0.004, p.seamStrip, { pos: [0.044, 0.015, 0.232] }),

    // Front-Right Belt Pouch (next to center buckle)
    buildPouch(0.102, 0.114, 0.064, p, { pos: [-0.114, 0.012, 0.222], rot: [0, -0.32, 0] }),
    // Front-Left Belt Pouch (next to center buckle)
    buildPouch(0.102, 0.114, 0.064, p, { pos: [0.136, 0.012, 0.212], rot: [0, 0.4, 0] }),
    // Right Hip Side Belt Pouch
    buildPouch(0.096, 0.11, 0.06, p, { pos: [-0.245, 0.015, 0.125], rot: [0, -0.95, 0] }),
    // Left Hip Side Belt Pouch
    buildPouch(0.096, 0.11, 0.06, p, { pos: [0.262, 0.015, 0.092], rot: [0, 1.12, 0] }),
    // Rear-Right & Rear-Left Belt Pouches
    buildPouch(0.092, 0.104, 0.054, p, { pos: [-0.22, 0.015, -0.138], rot: [0, -2.35, 0] }),
    buildPouch(0.092, 0.104, 0.054, p, { pos: [0.22, 0.015, -0.138], rot: [0, 2.35, 0] }),
  );

  // ============================================================================
  // 3. YELLOW MOLDED BACKPACK AIR UNIT & 4 CURVED BREATHING HOSES
  // ============================================================================
  const tank = group(
    'tank',
    // Twin integrated yellow cylinder lobes
    capsule(0.096, 0.27, p.suit, { pos: [-0.076, 0, -0.01], scale: [0.96, 1, 0.92] }),
    capsule(0.096, 0.27, p.suit, { pos: [0.076, 0, -0.01], scale: [0.96, 1, 0.92] }),
    // Central molded yellow casing uniting the twin cylinders
    rbox(0.29, 0.41, 0.148, 0.04, p.suit, { pos: [0, 0, 0.0] }),
    // Recessed vertical center channel down the back face
    box(0.032, 0.42, 0.024, p.suitShade, { pos: [0, 0, -0.068] }),
    // Upper molded horizontal bumper rib & dark center latch
    rbox(0.315, 0.086, 0.054, 0.018, p.suit, { pos: [0, 0.102, -0.058] }),
    rbox(0.042, 0.06, 0.058, 0.01, p.buckle, { pos: [0, 0.102, -0.062] }),
    // Lower molded horizontal bumper rib & dark center latch
    rbox(0.315, 0.086, 0.054, 0.018, p.suit, { pos: [0, -0.102, -0.058] }),
    rbox(0.042, 0.06, 0.058, 0.01, p.buckle, { pos: [0, -0.102, -0.062] }),
    // Backrest pad against spine
    rbox(0.235, 0.33, 0.038, 0.012, p.strap, { pos: [0, 0, 0.07] }),
  );

  for (const side of [-1, 1] as const) {
    tank.add(
      cyl(0.035, 0.04, 0.042, p.visorRim, { pos: [side * 0.076, 0.228, -0.01], segments: 16 }),
      cyl(0.035, 0.04, 0.042, p.visorRim, { pos: [side * 0.076, -0.228, -0.01], segments: 16 }),
    );
  }
  tank.position.set(0, 0.3, -0.245);
  tank.rotation.x = -0.05;
  hips.add(tank);

  // Four smooth curved black rubber breathing hoses
  for (const side of [-1, 1] as const) {
    hips.add(
      // Top breathing hose: arches above the tank and curves down & forward around the neck into the respirator
      buildCurvedHose(
        [
          [side * 0.076, 0.515, -0.258],
          [side * 0.125, 0.655, -0.248],
          [side * 0.195, 0.64, -0.12],
          [side * 0.19, 0.515, 0.015],
          [side * 0.145, 0.495, 0.125],
        ],
        0.022,
        p,
      ),
      // Bottom air hose: loops down from bottom of tank and curves forward under the waist
      buildCurvedHose(
        [
          [side * 0.076, 0.075, -0.238],
          [side * 0.115, -0.055, -0.258],
          [side * 0.175, -0.075, -0.17],
          [side * 0.208, 0.0, -0.078],
        ],
        0.02,
        p,
      ),
    );
  }

  // ============================================================================
  // 4. HEAD, PADDED HOOD, LARGE PANORAMIC BUBBLE VISOR & DUAL-FILTER RESPIRATOR
  // ============================================================================
  const head = group('head');
  head.position.set(0, 0.5, 0.02);

  head.add(
    // Padded yellow neck collar folds at base of hood
    torus(0.155, 0.044, p.suit, {
      pos: [0, -0.025, -0.008],
      rot: [Math.PI / 2 + 0.08, 0, 0],
      scale: [1.08, 1.04, 0.86],
      name: 'collar',
    }),
    torus(0.145, 0.03, p.suitShade, {
      pos: [0, 0.008, -0.002],
      rot: [Math.PI / 2 + 0.05, 0, 0],
      scale: [1.04, 1.02, 0.8],
    }),

    // Main rounded yellow hazmat hood (smooth stylized dome)
    sphere(0.226, p.suit, {
      pos: [0, 0.155, -0.015],
      scale: [1.05, 1.05, 1.03],
      wSeg: 32,
      hSeg: 24,
      name: 'hood',
    }),
    // Lower cheek/neck fullness
    sphere(0.204, p.suit, {
      pos: [0, 0.078, 0.005],
      scale: [1.05, 0.82, 0.98],
      wSeg: 24,
      hSeg: 18,
    }),
    // Center hood seam ridge
    torus(0.228, 0.008, p.suitShade, {
      pos: [0, 0.158, -0.015],
      rot: [0, Math.PI / 2, 0.35],
      arc: Math.PI * 1.05,
    }),

    // Wide Panoramic Visor Rubber Gasket Frame (clean, sleek, perfectly bordered)
    sphere(0.196, p.visorRim, {
      pos: [0, 0.158, 0.086],
      scale: [1.04, 0.88, 0.86],
      wSeg: 32,
      hSeg: 24,
    }),
    // Large Iridescent Dark Curved Bubble Visor Dome
    sphere(0.188, p.visorGlass, {
      pos: [0, 0.158, 0.104],
      scale: [1.0, 0.84, 0.86],
      wSeg: 36,
      hSeg: 28,
    }),
  );

  // Circular Temple / Ear Valve Ports on both sides of the hood
  for (const side of [-1, 1] as const) {
    const earPort = group(
      `earPort_${side > 0 ? 'L' : 'R'}`,
      cyl(0.035, 0.037, 0.022, p.visorRim, { rot: [0, 0, Math.PI / 2], segments: 18 }),
      torus(0.03, 0.006, p.seamStrip, { pos: [side * 0.01, 0, 0], rot: [0, Math.PI / 2, 0] }),
      cyl(0.023, 0.023, 0.024, p.respiratorDark, { rot: [0, 0, Math.PI / 2], segments: 16 }),
    );
    earPort.position.set(side * 0.216, 0.138, 0.042);
    earPort.rotation.set(0, -side * 0.26, -side * 0.06);
    head.add(earPort);
  }

  // Lower-Face Respirator / Gas Mask Assembly
  const maskGroup = group('respirator');
  maskGroup.add(
    // Contoured respirator snout housing
    rbox(0.225, 0.09, 0.118, 0.032, p.respirator, { pos: [0, 0.016, 0.18], rot: [0.12, 0, 0] }),
    cyl(0.052, 0.058, 0.075, p.respirator, {
      pos: [0, 0.014, 0.21],
      rot: [Math.PI / 2 + 0.12, 0, 0],
      segments: 20,
    }),
  );

  // Center Voice Diaphragm / Grille with Vertical Louvers
  const voiceGrille = group(
    'voiceGrille',
    cyl(0.046, 0.05, 0.028, p.respirator, { rot: [Math.PI / 2, 0, 0], segments: 20 }),
    torus(0.04, 0.007, p.seamStrip, { pos: [0, 0, 0.014] }),
    cyl(0.035, 0.035, 0.012, p.respiratorDark, {
      pos: [0, 0, 0.011],
      rot: [Math.PI / 2, 0, 0],
      segments: 18,
    }),
    // Vertical louver bars
    box(0.006, 0.052, 0.008, p.seamStrip, { pos: [0, 0, 0.016] }),
    box(0.005, 0.042, 0.008, p.seamStrip, { pos: [-0.014, 0, 0.016] }),
    box(0.005, 0.042, 0.008, p.seamStrip, { pos: [0.014, 0, 0.016] }),
  );
  voiceGrille.position.set(0, 0.012, 0.244);
  voiceGrille.rotation.x = 0.14;
  maskGroup.add(voiceGrille);

  // Dual Angled Cheek Filter Canisters + Side Hose Couplings
  for (const side of [-1, 1] as const) {
    const cheekFilter = group(
      `cheekFilter_${side > 0 ? 'L' : 'R'}`,
      cyl(0.062, 0.058, 0.058, p.respirator, { rot: [Math.PI / 2, 0, 0], segments: 22 }),
      torus(0.056, 0.009, p.seamStrip, { pos: [0, 0, 0.027] }),
      cyl(0.048, 0.048, 0.012, p.respiratorDark, {
        pos: [0, 0, 0.025],
        rot: [Math.PI / 2, 0, 0],
        segments: 20,
      }),
      torus(0.03, 0.006, p.seamStrip, { pos: [0, 0, 0.03] }),
      cyl(0.014, 0.014, 0.016, p.respirator, {
        pos: [0, 0, 0.027],
        rot: [Math.PI / 2, 0, 0],
        segments: 16,
      }),
    );
    cheekFilter.position.set(side * 0.13, 0.008, 0.19);
    cheekFilter.rotation.set(0.22, side * 0.68, 0);
    maskGroup.add(cheekFilter);

    // Side rubber collar coupling wrapping back from cheek filters toward breathing hoses
    maskGroup.add(
      capsule(0.024, 0.09, p.visorRim, {
        pos: [side * 0.162, 0.002, 0.115],
        rot: [Math.PI / 2 - 0.08, -side * 0.36, 0],
      }),
    );
  }

  head.add(maskGroup);
  hips.add(head);

  // ============================================================================
  // 5. ARMS, DELTOID SHOULDERS, FLARED GAUNTLETS & ARTICULATED GLOVES
  // ============================================================================
  for (const side of [1, -1] as const) {
    const s = side === 1 ? 'L' : 'R';
    const arm = group(`arm${s}`);
    arm.position.set(side * 0.335, 0.485, 0);
    arm.add(
      // Smooth deltoid shoulder cap & upper arm sleeve centered at shoulder pivot
      sphere(0.106, p.suit, { pos: [0, 0, 0], scale: [1.04, 1.02, 1.02] }),
      capsule(0.102, 0.24, p.suit, {
        pos: [0, -0.12, 0],
        scale: [1.02, 1, 1.02],
      }),
    );

    const forearm = group(`forearm${s}`);
    forearm.position.set(0, -0.24, 0);
    forearm.add(
      // Upper yellow forearm sleeve centered at elbow pivot
      capsule(0.094, 0.13, p.suit, { pos: [0, -0.065, 0] }),
      // Flared rubber gauntlet cuff overlapping the sleeve
      torus(0.104, 0.014, p.cuff, { pos: [0, -0.105, 0], rot: [Math.PI / 2, 0, 0] }),
      cyl(0.108, 0.094, 0.092, p.cuff, { pos: [0, -0.15, 0], segments: 20 }),
      // Wrist constriction ring
      torus(0.088, 0.011, p.visorRim, { pos: [0, -0.195, 0], rot: [Math.PI / 2, 0, 0] }),

      // Sculpted heavy rubber glove palm & back of hand
      rbox(0.106, 0.106, 0.084, 0.028, p.gloveBoot, { pos: [0, -0.238, 0.008] }),
      capsule(0.028, 0.058, p.gloveBoot, {
        pos: [0, -0.284, 0.012],
        rot: [0, 0, Math.PI / 2],
      }),

      // Articulated Thumb (2 segments on inner/front side of hand)
      capsule(0.023, 0.038, p.gloveBoot, {
        pos: [-side * 0.052, -0.232, 0.035],
        rot: [0.45, 0, side * 0.42],
      }),
      capsule(0.02, 0.032, p.gloveBoot, {
        pos: [-side * 0.048, -0.27, 0.058],
        rot: [0.95, -side * 0.28, side * 0.15],
      }),
    );

    // Four articulated fingers (Index, Middle, Ring, Pinky) curled into a natural grip
    const fingerOffsets = [-0.033, -0.011, 0.011, 0.033];
    const fingerLengths = [0.034, 0.037, 0.034, 0.028];
    for (let f = 0; f < 4; f++) {
      const fx = -side * fingerOffsets[f];
      const fl = fingerLengths[f];
      forearm.add(
        capsule(0.017, fl, p.gloveBoot, {
          pos: [fx, -0.302, 0.022],
          rot: [0.45, 0, 0],
        }),
        capsule(0.015, fl * 0.85, p.gloveBoot, {
          pos: [fx, -0.323, 0.046],
          rot: [1.35, 0, 0],
        }),
      );
    }

    // Held items are authored with the grip at the origin and the handle along +Y; this points it forward.
    const hand = group(`hand${s}`);
    hand.position.set(0, -0.275, 0.025);
    hand.rotation.x = Math.PI / 2;
    forearm.add(hand);
    arm.add(forearm);
    hips.add(arm);

    // ============================================================================
    // 6. SMOOTH BAGGY HAZMAT TROUSERS, RIGHT THIGH HOLSTER & HEAVY LUGGED BOOTS
    // ============================================================================
    const leg = group(`leg${s}`);
    leg.position.set(side * 0.165, 0.84, 0);
    leg.add(
      // Smooth full upper thigh suit volume with top hemisphere centered at hip pivot
      capsule(0.13, 0.34, p.suit, { pos: [0, -0.19, 0], scale: [1.03, 1, 1.01] }),
    );

    // Right Thigh Drop-Leg Tactical Pouch & Horizontal Leg Strap (-X is character's right leg)
    if (side === -1) {
      leg.add(
        // Clean horizontal webbing strap wrapping completely outside the right thigh capsule
        cyl(0.141, 0.139, 0.046, p.strap, {
          pos: [0, -0.175, 0],
          rot: [0, 0, 0.08],
          scale: [1.05, 1, 1.04],
          segments: 24,
        }),
        // Front thigh strap buckle keeper
        rbox(0.05, 0.052, 0.026, 0.006, p.buckle, {
          pos: [0.0, -0.175, 0.143],
          rot: [0, 0, 0.08],
        }),
        // Vertical hanger strap from waist belt to thigh pouch
        rbox(0.04, 0.16, 0.022, 0.005, p.strap, {
          pos: [-0.122, -0.045, 0.042],
          rot: [0, -0.25, -0.06],
        }),
        // Large right thigh cargo / holster pouch
        buildPouch(0.126, 0.16, 0.076, p, {
          pos: [-0.126, -0.145, 0.048],
          rot: [0.04, -0.95, -0.05],
        }),
      );
    }

    const shin = group(`shin${s}`);
    shin.position.y = -0.4;
    shin.add(
      // Smooth bloused lower pant leg tucked cleanly inside the boot collar (no z-fighting)
      capsule(0.116, 0.14, p.suit, { pos: [0, -0.07, 0], scale: [1.03, 1, 1.01] }),

      // Heavy Rubber Hazmat Boot: rolled top cuff collar wider than shin trouser tuck
      torus(0.106, 0.02, p.cuff, {
        pos: [0, -0.172, 0.004],
        rot: [Math.PI / 2, 0, 0],
        scale: [1.04, 1.05, 0.92],
      }),
      cyl(0.114, 0.104, 0.05, p.cuff, { pos: [0, -0.194, 0.004], segments: 20 }),

      // Boot shaft & ankle crease
      cyl(0.102, 0.095, 0.165, p.gloveBoot, { pos: [0, -0.282, 0.004], segments: 20 }),
      torus(0.092, 0.012, p.gloveBoot, {
        pos: [0, -0.325, 0.008],
        rot: [Math.PI / 2 + 0.08, 0, 0],
      }),

      // Boot foot & bulbous steel-toe box
      rbox(0.174, 0.11, 0.235, 0.038, p.gloveBoot, { pos: [0, -0.365, 0.035] }),
      capsule(0.076, 0.085, p.gloveBoot, {
        pos: [0, -0.34, 0.065],
        rot: [Math.PI / 3, 0, 0],
        scale: [1.06, 1, 0.9],
      }),
      sphere(0.096, p.gloveBoot, {
        pos: [0, -0.365, 0.122],
        scale: [1.0, 0.78, 1.12],
        wSeg: 20,
        hSeg: 16,
      }),

      // Boot sole welt rim & thick lugged outsole (bottom flush at y = -0.44 -> world y = 0.0)
      rbox(0.19, 0.024, 0.288, 0.012, p.cuff, { pos: [0, -0.405, 0.05] }),
      cyl(0.1, 0.102, 0.024, p.cuff, {
        pos: [0, -0.405, 0.128],
        scale: [1.0, 1, 1.05],
        segments: 20,
      }),
      rbox(0.194, 0.038, 0.292, 0.012, p.soleHose, { pos: [0, -0.421, 0.05] }),
      cyl(0.102, 0.104, 0.038, p.soleHose, {
        pos: [0, -0.421, 0.13],
        scale: [1.0, 1, 1.05],
        segments: 20,
      }),
    );

    leg.add(shin);
    body.add(leg);
  }

  // Legacy hidden gun node preserved for compatibility
  const gun = group(
    'gun',
    box(0.07, 0.11, 0.42, mat('gunMetal'), { pos: [0, 0, 0] }),
    cyl(0.022, 0.022, 0.32, mat('gunMetal'), { pos: [0, 0.02, 0.36], rot: [Math.PI / 2, 0, 0], segments: 10 }),
    box(0.05, 0.16, 0.07, mat('gunMetal'), { pos: [0, -0.12, 0.06], rot: [0.2, 0, 0] }),
    box(0.05, 0.12, 0.06, mat('gunGrip'), { pos: [0, -0.1, -0.12], rot: [-0.35, 0, 0] }),
    box(0.06, 0.09, 0.22, mat('gunGrip'), { pos: [0, -0.02, -0.3] }),
    box(0.03, 0.04, 0.1, mat('metalDark'), { pos: [0, 0.075, 0.02] }),
  );
  gun.position.set(-0.07, 0.34, 0.44);
  gun.visible = false;
  hips.add(gun);

  // `gun` is listed so merging keeps it as its own (hidden) mesh instead of folding it into the hips.
  root.userData.animated = [
    'rollPivot', 'body', 'hips', 'head', 'armL', 'armR', 'forearmL', 'forearmR',
    'handL', 'handR', 'legL', 'legR', 'shinL', 'shinR', 'gun',
  ];

  return root;
}
