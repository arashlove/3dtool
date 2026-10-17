import * as THREE from 'three';
import type { PartInfo, Vec3 } from '../types';
import { triangleCount } from './geometry';

/** A part is any mesh under the lab root tagged with `userData.partId`. */
export type PartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

export function collectParts(root: THREE.Object3D): Map<string, PartMesh> {
  const out = new Map<string, PartMesh>();
  root.traverse((o) => {
    const mesh = o as PartMesh;
    if (mesh.isMesh && typeof mesh.userData.partId === 'string') out.set(mesh.userData.partId, mesh);
  });
  return out;
}

export function materialsOf(mesh: PartMesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/** Cleans mesh names: `node_damagedHelmet_-6514` → `damaged Helmet`, `leg_fl` → `leg fl`. */
export function cleanLabel(name: string): string {
  const cleaned = name
    .replace(/^(node|mesh|object|geometry)[_\s-]*/i, '')
    .replace(/[_\s-]+-?\d{3,}$/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || name || 'part';
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Recomputes a part's metadata from the live scene (after every edit). */
export function describePart(mesh: PartMesh): PartInfo {
  mesh.updateWorldMatrix(true, false);
  const box = new THREE.Box3().setFromObject(mesh, true);
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const mat = materialsOf(mesh)[0] as THREE.MeshStandardMaterial | undefined;
  return {
    id: mesh.userData.partId as string,
    label: (mesh.userData.label as string) ?? mesh.name,
    material: mat?.name || mat?.type || 'material',
    color: mat?.color ? `#${mat.color.getHexString()}` : '#cccccc',
    has_texture: materialsOf(mesh).some((m) => Boolean((m as THREE.MeshStandardMaterial).map)),
    triangles: triangleCount(mesh.geometry),
    center: center.toArray().map(r3) as Vec3,
    size: size.toArray().map(r3) as Vec3,
    visible: mesh.visible,
    decal_of: (mesh.userData.decalOf as string | undefined) ?? null,
  };
}

export function describeAll(root: THREE.Object3D): PartInfo[] {
  return [...collectParts(root).values()].map(describePart);
}

/** World bounds of the visible parts (or of the given ones). */
export function boundsOf(meshes: Iterable<THREE.Object3D>): THREE.Box3 {
  const box = new THREE.Box3();
  for (const m of meshes) {
    if (!m.visible) continue;
    m.updateWorldMatrix(true, false);
    box.union(new THREE.Box3().setFromObject(m, true));
  }
  return box;
}

export function modelSize(root: THREE.Object3D): number {
  const box = boundsOf(collectParts(root).values());
  if (box.isEmpty()) return 1;
  const s = box.getSize(new THREE.Vector3());
  return Math.max(s.x, s.y, s.z, 1e-6);
}

/** A part id that is not used yet, e.g. `part_003_s2`. */
export function uniquePartId(root: THREE.Object3D, base: string, suffix = 's'): string {
  const ids = new Set(collectParts(root).keys());
  for (let n = 1; ; n++) {
    const id = `${base}_${suffix}${n}`;
    if (!ids.has(id)) return id;
  }
}
