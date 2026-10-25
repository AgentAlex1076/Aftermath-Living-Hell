import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { damp } from '../core/math';

/** Runs after tone mapping, in display space: grade, vignette, grain, toxic tint, hurt and lightning flashes. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uSat: { value: 0.84 },
    uGrain: { value: 0.045 },
    uVignette: { value: 0.42 },
    uToxic: { value: 0 },
    uHurt: { value: 0 },
    uFlash: { value: 0 },
    uWet: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uRes;
    uniform float uTime, uSat, uGrain, uVignette, uToxic, uHurt, uFlash, uWet;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float edge = length(d * vec2(uRes.x / uRes.y, 1.0));
      // A touch of lens fringing at the edges, more when hurt.
      vec2 ca = d * (0.0025 + uHurt * 0.006) * edge;
      vec3 col = vec3(texture2D(tDiffuse, vUv + ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ca).b);
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, uSat - uWet * 0.08);
      // Split tone: sickly green-teal shadows, dusty warm highlights.
      col *= mix(vec3(0.92, 1.03, 0.97), vec3(1.04, 1.0, 0.92), smoothstep(0.05, 0.75, luma));
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
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

/** Bloom on toxic glows and lamps, then the comic-dystopia grade on top. */
export class PostFX {
  enabled = true;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private readonly renderPass: RenderPass;
  private hurt = 0;
  private hurtTarget = 0;
  private toxic = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.4, 1.05);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.grade);
    this.setSize(window.innerWidth, window.innerHeight);
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const px = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.grade.uniforms.uRes.value.set(px.x, px.y);
  }

  /** A hit landed: `amount` is roughly the fraction of health lost. */
  pulseHurt(amount: number): void {
    this.hurt = Math.min(1, this.hurt + amount * 4 + 0.25);
  }

  /** Persistent red edges, e.g. while health is low. */
  setLowHealth(v: number): void {
    this.hurtTarget = v;
  }

  update(dt: number, s: { toxic: number; flash: number; wet: number }): void {
    const u = this.grade.uniforms;
    u.uTime.value += dt;
    this.hurt = damp(this.hurt, this.hurtTarget, 3.5, dt);
    this.toxic = damp(this.toxic, Math.min(1, s.toxic), 2.5, dt);
    u.uHurt.value = this.hurt;
    u.uToxic.value = this.toxic;
    u.uFlash.value = s.flash;
    u.uWet.value = s.wet;
    this.bloom.strength = 0.45 + s.flash * 0.6 + this.toxic * 0.15;
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.camera = camera;
    this.composer.render();
  }
}
