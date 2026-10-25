import * as THREE from 'three';
import { damp } from '../core/math';

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <common>
  #include <fog_pars_fragment>
  uniform float uTime;
  uniform float uRadius;
  uniform float uWidth;
  uniform float uOpacity;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vLocal;
  void main() {
    float r = length(vLocal);
    float a = atan(vLocal.y, vLocal.x);
    float edge = clamp((r - (uRadius - uWidth)) / uWidth, 0.0, 1.0);
    float stripes = step(0.5, fract(a * uRadius / 1.4 + edge * 0.9 - uTime * 0.18));
    vec3 col = mix(uColorB, uColorA, stripes);
    float alpha = uOpacity * smoothstep(0.0, 0.12, edge) * smoothstep(1.0, 0.88, edge);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const SAFE_COLOR = new THREE.Color('#e3b21b');
const DANGER_COLOR = new THREE.Color('#e2332b');

/** The circle around the hut that the player must be inside when a raid starts. */
export class HomeZone {
  readonly center: THREE.Vector3;
  readonly radius: number;
  readonly mesh: THREE.Mesh;
  private readonly uniforms: {
    uTime: { value: number };
    uRadius: { value: number };
    uWidth: { value: number };
    uOpacity: { value: number };
    uColorA: { value: THREE.Color };
    uColorB: { value: THREE.Color };
  };
  private danger = 0;

  constructor(center: THREE.Vector3, radius: number) {
    this.center = center.clone();
    this.radius = radius;
    const width = 0.55;
    this.uniforms = {
      uTime: { value: 0 },
      uRadius: { value: radius },
      uWidth: { value: width },
      uOpacity: { value: 0.5 },
      uColorA: { value: SAFE_COLOR.clone() },
      uColorB: { value: new THREE.Color('#141414') },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...this.uniforms },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: true,
    });

    const geo = new THREE.RingGeometry(radius - width, radius, 256, 1);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(this.center.x, 0.035, this.center.z);
    this.mesh.renderOrder = 2;
    this.mesh.name = 'homeZone';
  }

  contains(p: THREE.Vector3): boolean {
    return this.distanceFromCenter(p) <= this.radius;
  }

  distanceFromCenter(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.center.x, p.z - this.center.z);
  }

  update(dt: number, playerInside: boolean): void {
    this.uniforms.uTime.value += dt;
    this.danger = damp(this.danger, playerInside ? 0 : 1, 4, dt);
    this.uniforms.uColorA.value.copy(SAFE_COLOR).lerp(DANGER_COLOR, this.danger);
    this.uniforms.uOpacity.value = 0.45 + this.danger * (0.25 + 0.15 * Math.sin(this.uniforms.uTime.value * 6));
  }
}
