import * as THREE from 'three';
import { ITEMS, type ItemDef, type ItemId } from '../data/items';
import { models } from '../models/ModelRegistry';

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
      return { key: id, model: def.model, tilt: def.kind === 'tool' };
    }),
  );
}
