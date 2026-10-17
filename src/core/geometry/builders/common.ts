import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { SceneObject } from '../../schema/scene';
import { createMaterial } from '../materials';

export type Builder = (spec: SceneObject) => THREE.Group;

export type BuildContext = {
  group: THREE.Group;
  spec: SceneObject;
  material: (partKey: string) => THREE.MeshStandardMaterial;
};

const DOUBLE_SIDED_PARTS = new Set(['shade']);

export function createContext(spec: SceneObject): BuildContext {
  const group = new THREE.Group();
  group.name = spec.name;
  group.userData.objectId = spec.id;
  group.userData.kind = spec.kind;
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  const material = (partKey: string) => {
    let m = cache.get(partKey);
    if (!m) {
      const matSpec = spec.materials[partKey];
      if (!matSpec) throw new Error(`Missing material slot "${partKey}" for ${spec.kind}`);
      m = createMaterial(matSpec, { doubleSide: DOUBLE_SIDED_PARTS.has(partKey) });
      m.name = `${spec.kind}_${partKey}`;
      cache.set(partKey, m);
    }
    return m;
  };
  return { group, spec, material };
}

export function addPart(
  ctx: BuildContext,
  geometry: THREE.BufferGeometry,
  partKey: string,
  name: string,
  position: [number, number, number],
  rotation?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, ctx.material(partKey));
  mesh.name = name;
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.objectId = ctx.spec.id;
  mesh.userData.partKey = partKey;
  ctx.group.add(mesh);
  return mesh;
}

/** Rounded box with the radius clamped to a safe value for its dimensions. */
export function roundedBox(width: number, height: number, depth: number, radius: number, segments = 2) {
  const r = Math.min(radius, Math.min(width, height, depth) / 2 - 1e-4);
  if (r <= 0.0005) return new THREE.BoxGeometry(width, height, depth);
  return new RoundedBoxGeometry(width, height, depth, segments, r);
}

export const num = (spec: SceneObject, key: string) => spec.params[key] as number;
