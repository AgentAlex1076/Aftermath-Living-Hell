import * as THREE from 'three';
import { damp } from '../core/math';
import { Rng } from '../core/random';

const FOG_COLOR = new THREE.Color('#4e5752');
const TOXIC_FOG_COLOR = new THREE.Color('#56692c');
const RAIN_FOG_COLOR = new THREE.Color('#3f4a4e');
const FLASH_COLOR = new THREE.Color('#aab4c8');
const NIGHT_FOG_COLOR = new THREE.Color('#14203a');
const TWILIGHT_FOG_COLOR = new THREE.Color('#5c4a42');
const SUN_COLOR = new THREE.Color('#d2d8cb');
const TWILIGHT_SUN_COLOR = new THREE.Color('#e6a074');
const MOON_COLOR = new THREE.Color('#7f9ee6');
const SKY_COLOR = new THREE.Color('#a3ada6');
const NIGHT_SKY_COLOR = new THREE.Color('#3a5690');
const FOG_DENSITY = 0.019;
const TOXIC_FOG_DENSITY = 0.028;
const RAIN_FOG_DENSITY = 0.006;
const SUN = 2.1;
const SKY = 1.7;
/** How much sun and sky survive at full night (moonlight). */
const NIGHT_SUN = 0.28;
const NIGHT_SKY = 0.5;
const LAMP = 7;

const ASH_COUNT = 1800;
const ASH_SIZE = 0.07;
const ASH_BOX = { x: 70, y: 22, z: 70 };

/** Sky, fog, lighting and ambient falling ash. Follows the camera focus. */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly fog: THREE.FogExp2;
  private readonly background: THREE.Color;
  private readonly sunOffset = new THREE.Vector3(-18, 34, 12);
  private readonly sunDir = new THREE.Vector3();
  /** Helmet lamp: keeps the suit readable at night. Always in the scene so the light count never changes. */
  private readonly lamp: THREE.PointLight;
  private readonly ash: THREE.Points;
  private readonly ashSpeeds: Float32Array;
  private toxic = 0;
  private toxicTarget = 0;
  private cutsceneActive = false;
  private cutsceneLightning = 0;
  private cutsceneFogMult = 1.0;
  private rain = 0;
  private flash = 0;
  private time = 0;
  private daylight = 1;
  private twilight = 0;
  private sunProgress = 0.3;

  constructor(scene: THREE.Scene, seed: number) {
    this.background = FOG_COLOR.clone();
    scene.background = this.background;
    this.fog = new THREE.FogExp2(FOG_COLOR.clone(), FOG_DENSITY);
    scene.fog = this.fog;

    this.hemi = new THREE.HemisphereLight('#a3ada6', '#3b352b', SKY);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#d2d8cb', SUN);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 3;
    const s = this.sun.shadow.camera;
    s.left = -30;
    s.right = 30;
    s.top = 30;
    s.bottom = -30;
    s.near = 1;
    s.far = 110;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);

    this.lamp = new THREE.PointLight('#ffe2b4', 0, 9, 2);
    this.lamp.castShadow = false;
    scene.add(this.lamp);

    const { points, speeds } = this.createAsh(seed);
    this.ash = points;
    this.ashSpeeds = speeds;
    scene.add(this.ash);
  }

  /** Controls atmospheric cutscene storm intensity, subtle lightning ambient flash, and fog density */
  setCutsceneStorm(active: boolean, lightningIntensity: number, fogDensityMult = 1.0): void {
    this.cutsceneActive = active;
    this.cutsceneLightning = lightningIntensity;
    this.cutsceneFogMult = fogDensityMult;
  }

  /** Scene pixel ratio / canvas pixel ratio. Point sprites are sized by the canvas ratio, so they need correcting. */
  setPointScale(k: number): void {
    (this.ash.material as THREE.PointsMaterial).size = ASH_SIZE * k;
  }

  /** 0..1 how deep the player is in gas; tints and thickens the fog. */
  setToxic(amount: number): void {
    this.toxicTarget = Math.min(1, amount);
  }

  /** Rain dims the sun and thickens the fog; `flash` is lightning (0..1). */
  setWeather(rain: number, flash: number): void {
    this.rain = rain;
    this.flash = flash;
  }

  /** Time of day: `daylight` 1 day / 0 night, `twilight` the warm dawn/dusk glow, `sunProgress` 0 sunrise → 1 sunset. */
  setDaylight(daylight: number, twilight: number, sunProgress: number): void {
    this.daylight = daylight;
    this.twilight = twilight;
    this.sunProgress = sunProgress;
  }

  /** Where the helmet lamp sits (the player's head). */
  setLampPosition(x: number, y: number, z: number): void {
    this.lamp.position.set(x, y, z);
  }

  update(dt: number, focus: THREE.Vector3): void {
    this.time += dt;

    const snap = 0.5;
    const fx = Math.round(focus.x / snap) * snap;
    const fz = Math.round(focus.z / snap) * snap;
    const day = this.daylight;
    const night = 1 - day;
    // The sun swings east to west over the day and sits lower at dawn and dusk; the moon holds still.
    const swing = (night > 0.5 ? 0.15 : this.sunProgress - 0.5) * 2;
    this.sunDir.copy(this.sunOffset).applyAxisAngle(THREE.Object3D.DEFAULT_UP, swing);
    this.sunDir.y *= 1 - this.twilight * 0.35;
    const fy = Math.round(focus.y / snap) * snap;
    this.sun.target.position.set(fx, fy, fz);
    this.sun.position.set(fx + this.sunDir.x, fy + this.sunDir.y, fz + this.sunDir.z);
    this.sun.color.copy(SUN_COLOR).lerp(MOON_COLOR, night).lerp(TWILIGHT_SUN_COLOR, this.twilight * 0.7);
    this.hemi.color.copy(SKY_COLOR).lerp(NIGHT_SKY_COLOR, night);
    const sunMul = NIGHT_SUN + (1 - NIGHT_SUN) * day;
    const skyMul = NIGHT_SKY + (1 - NIGHT_SKY) * day;

    this.toxic = damp(this.toxic, this.toxicTarget, 2.5, dt);
    this.fog.color.copy(FOG_COLOR)
      .lerp(NIGHT_FOG_COLOR, night * 0.85)
      .lerp(TWILIGHT_FOG_COLOR, this.twilight * 0.35)
      .lerp(RAIN_FOG_COLOR, this.rain * 0.8 * (0.4 + 0.6 * day))
      .lerp(TOXIC_FOG_COLOR, this.toxic * (0.5 + 0.5 * day))
      .lerp(FLASH_COLOR, this.flash * 0.5);

    if (this.cutsceneActive && this.cutsceneLightning > 0.01) {
      // Lightning flash illumination
      const flashColor = new THREE.Color('#e0ffea').lerp(new THREE.Color('#ffffff'), 0.5);
      this.fog.color.lerp(flashColor, this.cutsceneLightning * 0.85);
      this.sun.intensity = SUN * sunMul * (1 - this.rain * 0.45) + (this.flash + this.cutsceneLightning * 2.0) * 2.5;
      this.hemi.intensity = SKY * skyMul * (1 - this.rain * 0.2) + (this.flash + this.cutsceneLightning * 2.0) * 4;
    } else {
      this.sun.intensity = SUN * sunMul * (1 - this.rain * 0.45) + this.flash * 2.5;
      this.hemi.intensity = SKY * skyMul * (1 - this.rain * 0.2) + this.flash * 4;
    }
    this.lamp.intensity = this.cutsceneActive ? 0 : LAMP * night * night;

    const baseDensity = FOG_DENSITY + (TOXIC_FOG_DENSITY - FOG_DENSITY) * this.toxic + RAIN_FOG_DENSITY * this.rain;
    this.fog.density = baseDensity * this.cutsceneFogMult;
    this.background.copy(this.fog.color);
    (this.ash.material as THREE.PointsMaterial).opacity = 0.6 * (1 - this.rain * 0.85);

    this.updateAsh(dt, focus);
  }

  private createAsh(seed: number): { points: THREE.Points; speeds: Float32Array } {
    const rng = new Rng(seed + 101);
    const positions = new Float32Array(ASH_COUNT * 3);
    const speeds = new Float32Array(ASH_COUNT);
    for (let i = 0; i < ASH_COUNT; i++) {
      positions[i * 3] = rng.range(-ASH_BOX.x / 2, ASH_BOX.x / 2);
      positions[i * 3 + 1] = rng.range(0, ASH_BOX.y);
      positions[i * 3 + 2] = rng.range(-ASH_BOX.z / 2, ASH_BOX.z / 2);
      speeds[i] = rng.range(0.4, 1.1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: '#b4b4a8',
      size: ASH_SIZE,
      map: createSoftDotTexture(),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    points.name = 'ash';
    return { points, speeds };
  }

  private updateAsh(dt: number, focus: THREE.Vector3): void {
    const attr = this.ash.geometry.attributes.position as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const windX = Math.sin(this.time * 0.13) * 0.6 + 0.5;
    const windZ = Math.cos(this.time * 0.09) * 0.3;
    const hx = ASH_BOX.x / 2;
    const hz = ASH_BOX.z / 2;

    for (let i = 0; i < ASH_COUNT; i++) {
      const ix = i * 3;
      const sp = this.ashSpeeds[i];
      arr[ix] += (windX + Math.sin(this.time * 1.3 + i) * 0.25) * sp * dt;
      arr[ix + 1] -= sp * dt;
      arr[ix + 2] += (windZ + Math.cos(this.time * 1.1 + i * 0.7) * 0.25) * sp * dt;

      if (arr[ix + 1] < 0) arr[ix + 1] += ASH_BOX.y;
      const dx = arr[ix] - focus.x;
      if (dx > hx) arr[ix] -= ASH_BOX.x;
      else if (dx < -hx) arr[ix] += ASH_BOX.x;
      const dz = arr[ix + 2] - focus.z;
      if (dz > hz) arr[ix + 2] -= ASH_BOX.z;
      else if (dz < -hz) arr[ix + 2] += ASH_BOX.z;
    }
    attr.needsUpdate = true;
  }
}

function createSoftDotTexture(): THREE.Texture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
