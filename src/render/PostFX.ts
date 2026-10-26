import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { damp } from '../core/math';
import { AdaptiveResolution } from './AdaptiveResolution';

/**
 * The single full-screen pass: adds bloom, tone maps (ACES) and converts to sRGB, then applies
 * the grade, vignette, grain, toxic tint and hurt / lightning flashes in display space.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tBloom: { value: null as THREE.Texture | null },
    toneMappingExposure: { value: 1 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uSat: { value: 0.84 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.42 },
    uToxic: { value: 0 },
    uHurt: { value: 0 },
    uFlash: { value: 0 },
    uWet: { value: 0 },
    uNight: { value: 0 },
    uTwilight: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #include <tonemapping_pars_fragment>
    uniform sampler2D tDiffuse;
    uniform sampler2D tBloom;
    uniform vec2 uRes;
    uniform float uTime, uSat, uGrain, uVignette, uToxic, uHurt, uFlash, uWet, uNight, uTwilight;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 display(vec2 uv) {
      vec3 hdr = texture2D(tDiffuse, uv).rgb + texture2D(tBloom, uv).rgb;
      return sRGBTransferOETF(vec4(ACESFilmicToneMapping(hdr), 1.0)).rgb;
    }
    void main() {
      vec2 d = vUv - 0.5;
      float edge = length(d * vec2(uRes.x / uRes.y, 1.0));
      // A touch of lens fringing at the edges, more when hurt.
      vec2 ca = d * (0.0025 + uHurt * 0.006) * edge;
      vec3 col = vec3(display(vUv + ca).r, display(vUv).g, display(vUv - ca).b);
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, uSat - uWet * 0.08);
      // Split tone: sickly green-teal shadows, dusty warm highlights.
      col *= mix(vec3(0.92, 1.03, 0.97), vec3(1.04, 1.0, 0.92), smoothstep(0.05, 0.75, luma));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
      // Time of day, after the split tone so it isn't neutralised: moonlit blue nights, low warm sun.
      // Mostly shadows and midtones, so lamps and fires stay warm against the blue.
      col *= mix(vec3(1.0), vec3(0.74, 0.9, 1.38), uNight * (1.0 - smoothstep(0.2, 0.65, luma) * 0.75));
      col += vec3(0.0, 0.014, 0.04) * uNight * (1.0 - luma);
      col *= mix(vec3(1.0), vec3(1.22, 0.97, 0.74), uTwilight);
      col = mix(col, col * vec3(0.82, 1.1, 0.55) + vec3(0.015, 0.04, 0.0), uToxic * 0.55);
      col += uFlash * vec3(0.5, 0.56, 0.66) * (0.35 + luma);
      float v = smoothstep(0.38, 1.0, edge * 1.15);
      col *= 1.0 - v * (uVignette + uWet * 0.08);
      col = mix(col, vec3(0.55, 0.04, 0.03), v * uHurt * 0.85);
      float n = hash(floor(vUv * uRes) + fract(uTime * 7.31) * 113.0) - 0.5;
      col += n * uGrain * (1.1 - luma * 0.6);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

/**
 * Bloom on toxic glows and lamps, then the comic-dystopia grade on top.
 * The scene renders at an adaptive resolution; bloom and the grade stay at the canvas resolution
 * so glow size and grain don't shift when the scene resolution changes.
 */
export class PostFX {
  enabled = true;
  readonly resolution: AdaptiveResolution;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  private readonly gradeQuad: FullScreenQuad;
  private readonly cssSize = new THREE.Vector2();
  private readonly oldClear = new THREE.Color();
  private hurt = 0;
  private hurtTarget = 0;
  private toxic = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.resolution = new AdaptiveResolution(renderer.getPixelRatio());
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.4, 1.05);
    this.grade = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(GradeShader.uniforms),
      vertexShader: GradeShader.vertexShader,
      fragmentShader: GradeShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
      // Tone mapping happens inside the shader, together with the bloom add.
      toneMapped: false,
    });
    this.gradeQuad = new FullScreenQuad(this.grade);
    renderer.info.autoReset = false;
    this.setSize(window.innerWidth, window.innerHeight);
  }

  /** Pixel ratio the 3D scene is currently drawn at. */
  get scenePixelRatio(): number {
    return this.resolution.current;
  }

  setSize(w: number, h: number): void {
    this.cssSize.set(w, h);
    const px = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.bloom.setSize(px.x, px.y);
    this.grade.uniforms.uRes.value.set(px.x, px.y);
    this.resizeTarget();
  }

  /** A hit landed: `amount` is roughly the fraction of health lost. */
  pulseHurt(amount: number): void {
    this.hurt = Math.min(1, this.hurt + amount * 4 + 0.25);
  }

  /** Persistent red edges, e.g. while health is low. */
  setLowHealth(v: number): void {
    this.hurtTarget = v;
  }

  update(dt: number, s: { toxic: number; flash: number; wet: number; night: number; twilight: number }): void {
    const u = this.grade.uniforms;
    u.uTime.value += dt;
    u.uNight.value = s.night;
    u.uTwilight.value = s.twilight;
    this.hurt = damp(this.hurt, this.hurtTarget, 3.5, dt);
    this.toxic = damp(this.toxic, Math.min(1, s.toxic), 2.5, dt);
    u.uHurt.value = this.hurt;
    u.uToxic.value = this.toxic;
    u.uFlash.value = s.flash;
    u.uWet.value = s.wet;
    this.bloom.strength = 0.45 + s.flash * 0.6 + this.toxic * 0.15;
  }

  /** `frameDt` is real seconds since the last frame; it drives the adaptive resolution. */
  render(scene: THREE.Scene, camera: THREE.Camera, frameDt: number): void {
    const r = this.renderer;
    r.info.reset();
    if (!this.enabled) {
      r.setRenderTarget(null);
      r.render(scene, camera);
      return;
    }
    if (this.resolution.sample(frameDt) !== null) this.resizeTarget();

    r.setRenderTarget(this.target);
    r.render(scene, camera);
    this.renderBloom();

    const u = this.grade.uniforms;
    u.tDiffuse.value = this.target.texture;
    u.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture;
    u.toneMappingExposure.value = r.toneMappingExposure;
    r.setRenderTarget(null);
    this.gradeQuad.render(r);
  }

  private resizeTarget(): void {
    const pr = this.resolution.current;
    this.target.setSize(Math.max(1, Math.round(this.cssSize.x * pr)), Math.max(1, Math.round(this.cssSize.y * pr)));
  }

  /** UnrealBloomPass's bright pass, blur chain and mip composite, minus its full-screen blend back onto the scene. */
  private renderBloom(): void {
    const r = this.renderer;
    const b = this.bloom;
    const quad = this.quad;
    r.getClearColor(this.oldClear);
    const oldAlpha = r.getClearAlpha();
    const oldAutoClear = r.autoClear;
    r.autoClear = false;
    r.setClearColor(b.clearColor, 0);

    const high = b.highPassUniforms as Record<string, THREE.IUniform>;
    high.tDiffuse.value = this.target.texture;
    high.luminosityThreshold.value = b.threshold;
    quad.material = b.materialHighPassFilter;
    r.setRenderTarget(b.renderTargetBright);
    r.clear();
    quad.render(r);

    let input = b.renderTargetBright;
    for (let i = 0; i < b.nMips; i++) {
      const blur = b.separableBlurMaterials[i];
      quad.material = blur;
      blur.uniforms.colorTexture.value = input.texture;
      blur.uniforms.direction.value = BLUR_X;
      r.setRenderTarget(b.renderTargetsHorizontal[i]);
      r.clear();
      quad.render(r);
      blur.uniforms.colorTexture.value = b.renderTargetsHorizontal[i].texture;
      blur.uniforms.direction.value = BLUR_Y;
      r.setRenderTarget(b.renderTargetsVertical[i]);
      r.clear();
      quad.render(r);
      input = b.renderTargetsVertical[i];
    }

    const comp = b.compositeMaterial;
    comp.uniforms.bloomStrength.value = b.strength;
    comp.uniforms.bloomRadius.value = b.radius;
    comp.uniforms.bloomTintColors.value = b.bloomTintColors;
    quad.material = comp;
    r.setRenderTarget(b.renderTargetsHorizontal[0]);
    r.clear();
    quad.render(r);

    r.setClearColor(this.oldClear, oldAlpha);
    r.autoClear = oldAutoClear;
  }
}

const BLUR_X = new THREE.Vector2(1, 0);
const BLUR_Y = new THREE.Vector2(0, 1);
