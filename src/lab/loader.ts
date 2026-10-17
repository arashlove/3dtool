import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { disposeObject, sceneMaster } from '@/core/geometry/ThreeSceneMaster';
import type { SceneDocument } from '@/core/schema/scene';
import { connectedComponents, subGeometry } from './engine/geometry';
import { cleanLabel, type PartMesh } from './engine/parts';

/**
 * Structural segmentation: turns a scene into addressable parts `part_000`, `part_001`… Meshes can
 * be split into connected components (a single "Legs" mesh becomes four legs) within a part budget.
 * No AI is involved.
 */

export const MAX_PARTS = 256;
export const MAX_UPLOAD_MB = 100;

export type LoadedModel = { root: THREE.Group; name: string; stats: { meshes: number; parts: number; triangles: number } };

/** The object a part belongs to (a Studio object, or one imported file); selected and moved together. */
export type PartGroup = { id: string; label: string };

type Source = { mesh: THREE.Mesh; label: string; group: PartGroup };

function partsFromSources(sources: Source[], split: boolean): { root: THREE.Group; parts: number; triangles: number } {
  const root = new THREE.Group();
  root.name = 'lab-root';
  // Components per mesh; un-split the most fragmented meshes first until the budget fits.
  const components = sources.map((s) => (split ? connectedComponents(s.mesh.geometry) : null));
  const count = () => components.reduce((n, c) => n + (c && c.length > 1 ? c.length : 1), 0);
  while (count() > MAX_PARTS) {
    let worst = -1;
    components.forEach((c, i) => {
      if (c && c.length > 1 && (worst < 0 || c.length > components[worst]!.length)) worst = i;
    });
    if (worst < 0) break;
    components[worst] = null;
  }

  let n = 0;
  let triangles = 0;
  const nextId = () => `part_${String(n++).padStart(3, '0')}`;
  sources.forEach(({ mesh, label, group }, i) => {
    mesh.updateWorldMatrix(true, false);
    const pieces = components[i] && components[i]!.length > 1 ? components[i]! : null;
    const geometries = pieces ? pieces.map((faces) => subGeometry(mesh.geometry, faces)) : [mesh.geometry.clone()];
    geometries.forEach((geometry, k) => {
      const material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      const part = new THREE.Mesh(geometry, material) as PartMesh;
      // Bake the world transform into the part's own transform so parts are independent.
      mesh.matrixWorld.decompose(part.position, part.quaternion, part.scale);
      part.castShadow = true;
      part.receiveShadow = true;
      const partLabel = pieces ? `${label} ${k + 1}` : label;
      part.name = partLabel;
      part.userData = { partId: nextId(), label: partLabel, groupId: group.id, groupLabel: group.label };
      triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3;
      root.add(part);
    });
  });
  return { root, parts: n, triangles: Math.round(triangles) };
}

function collectSources(scene: THREE.Object3D, describe: (mesh: THREE.Mesh) => { label: string; group: PartGroup }): Source[] {
  scene.updateMatrixWorld(true);
  const sources: Source[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.visible && mesh.geometry?.attributes.position) sources.push({ mesh, ...describe(mesh) });
  });
  return sources;
}

/** Builds lab parts from the Shape Studio document (its procedural Three.js objects). */
export function loadFromStudio(doc: SceneDocument, split: boolean): LoadedModel {
  const scene = sceneMaster.buildExportScene(doc);
  const sources = collectSources(scene, (mesh) => {
    const object = doc.objects.find((o) => o.id === mesh.userData.objectId);
    const part = cleanLabel(mesh.name);
    return object
      ? { label: `${object.name} ${part}`, group: { id: `obj_${object.id}`, label: object.name } }
      : { label: part, group: { id: 'obj_other', label: 'Other' } };
  });
  try {
    const { root, parts, triangles } = partsFromSources(sources, split);
    return { root, name: doc.title, stats: { meshes: sources.length, parts, triangles } };
  } finally {
    disposeObject(scene);
  }
}

let gltfLoader: GLTFLoader | null = null;
function loader(): GLTFLoader {
  if (gltfLoader) return gltfLoader;
  const draco = new DRACOLoader();
  // Same-origin copies are not shipped; jsDelivr is CORS-enabled and allowed by COEP.
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/draco/gltf/');
  gltfLoader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
  return gltfLoader;
}

/** Parses glTF data in the browser (Draco and Meshopt supported). */
export async function loadGlbBuffer(buffer: ArrayBuffer, name: string, split: boolean, allowJson = false): Promise<LoadedModel> {
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength)));
  if (magic !== 'glTF' && !allowJson) throw new Error('That is not a binary glTF (.glb) file.');
  const gltf = await loader().parseAsync(buffer, '');
  const group = { id: 'glb_1', label: name };
  const sources = collectSources(gltf.scene, (mesh) => ({ label: cleanLabel(mesh.name || mesh.parent?.name || 'part'), group }));
  if (sources.length === 0) throw new Error('The file contains no meshes.');
  const { root, parts, triangles } = partsFromSources(sources, split);
  return { root, name, stats: { meshes: sources.length, parts, triangles } };
}

export async function loadGlbFile(file: File, split: boolean): Promise<LoadedModel> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`Files are limited to ${MAX_UPLOAD_MB} MB.`);
  return loadGlbBuffer(await file.arrayBuffer(), file.name.replace(/\.(glb|gltf)$/i, ''), split, /\.gltf$/i.test(file.name));
}

/**
 * Prepares a loaded model for adding to an existing scene: scales it to `height`, stands it on the
 * ground to the right of `occupied`, and renumbers its part ids after the existing ones.
 */
export function placeBeside(
  loaded: LoadedModel,
  existing: Iterable<THREE.Object3D>,
  occupied: THREE.Box3,
  height: number | null,
): PartMesh[] {
  const parts = [...loaded.root.children] as PartMesh[];
  loaded.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(loaded.root, true);
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 1e-6);
  // Keep a file's own size (glTF units are metres) unless it is implausible for a scene object.
  const scale = height !== null ? height / Math.max(size.y, 1e-6) : largest > 20 || largest < 0.02 ? 1 / largest : 1;
  height = size.y * scale;
  const gap = Math.max(0.15, height * 0.2);
  const targetMinX = occupied.isEmpty() ? -(size.x * scale) / 2 : occupied.max.x + gap;
  const targetCenterZ = occupied.isEmpty() ? 0 : (occupied.min.z + occupied.max.z) / 2;
  const m = new THREE.Matrix4()
    .makeTranslation(targetMinX, 0, targetCenterZ)
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-box.min.x, -box.min.y, -(box.min.z + box.max.z) / 2));
  let next = 0;
  let glb = 0;
  for (const o of existing) {
    const n = /^part_(\d+)/.exec(o.userData.partId as string);
    if (n) next = Math.max(next, Number(n[1]) + 1);
    const g = /^glb_(\d+)$/.exec((o.userData.groupId as string) ?? '');
    if (g) glb = Math.max(glb, Number(g[1]));
  }
  const groupId = `glb_${glb + 1}`;
  for (const part of parts) {
    part.applyMatrix4(m);
    part.userData.partId = `part_${String(next++).padStart(3, '0')}`;
    part.userData.label = `${loaded.name} ${part.userData.label as string}`.slice(0, 80);
    part.userData.groupId = groupId;
    part.userData.groupLabel = loaded.name;
    part.removeFromParent();
  }
  return parts;
}
