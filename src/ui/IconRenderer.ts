import * as THREE from 'three';
import { ITEMS, type ItemDef, type ItemId } from '../data/items';
import { assembleGun } from '../models/guns';
import { models } from '../models/ModelRegistry';
import type { Stack } from '../gameplay/Inventory';

const SIZE = 128;

export interface IconRequest {
  key: string;
  model: string;
  /** Tools are tilted so the head reads; everything else gets a 3/4 turn. */
  tilt?: boolean;
}

/** Renders 3D models once into PNG data URLs, keyed by `key`. */
export function renderIcons(requests: readonly IconRequest[]): Record<string, string> {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e0', '#3a3530', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.6);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#b8ff8a', 1.4);
  rim.position.set(-3, 1, -2);
  scene.add(rim);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const out: Record<string, string> = {};

  for (const req of requests) {
    const model = models.create(req.model, 1);
    const pivot = new THREE.Group();
    pivot.add(model);
    if (req.tilt) model.rotation.set(0, 0, -0.75);
    else model.rotation.set(0, 0.5, 0);
    scene.add(pivot);

    box.setFromObject(pivot);
    box.getSize(size);
    box.getCenter(center);
    model.position.sub(center);
    const radius = size.length() / 2;
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 0.92;
    camera.position.set(0, 0, 0).add(new THREE.Vector3(0.55, 0.75, 1).normalize().multiplyScalar(dist));
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    out[req.key] = renderer.domElement.toDataURL('image/png');
    scene.remove(pivot);
  }

  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

/** Inventory icons for every item, keyed by item id. */
export function renderItemIcons(ids: readonly ItemId[]): Record<string, string> {
  return renderIcons(
    ids.map((id) => {
      const def: ItemDef = ITEMS[id];
      return { key: id, model: def.model, tilt: def.kind === 'tool' || def.kind === 'gunPart' };
    }),
  );
}

const gunIconCache = new Map<string, string>();
let iconRenderer: THREE.WebGLRenderer | null = null;

function iconScene(): { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  if (!iconRenderer) {
    iconRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    iconRenderer.setSize(SIZE, SIZE, false);
    iconRenderer.setPixelRatio(1);
    iconRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    iconRenderer.toneMappingExposure = 1.35;
    iconRenderer.setClearColor(0x000000, 0);
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e0', '#3a3530', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.6);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#b8ff8a', 1.4);
  rim.position.set(-3, 1, -2);
  scene.add(rim);
  return { renderer: iconRenderer, scene, camera: new THREE.PerspectiveCamera(28, 1, 0.01, 50) };
}

/** Renders an already-built object (an assembled gun) to a PNG data URL. */
export function renderObjectIcon(key: string, object: THREE.Object3D): string {
  const hit = gunIconCache.get(key);
  if (hit) return hit;
  const { renderer, scene, camera } = iconScene();
  const pivot = new THREE.Group();
  pivot.add(object);
  object.rotation.set(0.15, 0.7, 0.1);
  scene.add(pivot);
  const box = new THREE.Box3().setFromObject(pivot);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  object.position.sub(center);
  const radius = Math.max(0.05, size.length() / 2);
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 0.95;
  camera.position.copy(new THREE.Vector3(0.55, 0.55, 1).normalize().multiplyScalar(dist));
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  gunIconCache.set(key, url);
  return url;
}

export function stackIcon(stack: Stack, icons: Record<string, string>): string {
  if (stack.gun) {
    const sig = `gun:${stack.gun.parts.map((p) => `${p.part}@${p.x},${p.y}`).join('|')}`;
    return renderObjectIcon(sig, assembleGun(stack.gun.parts));
  }
  return icons[stack.item] ?? '';
}
