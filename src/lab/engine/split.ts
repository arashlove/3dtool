import * as THREE from 'three';
import type { Region } from '../types';
import { cornerIndex, subGeometry, triangleCount } from './geometry';
import { collectParts, uniquePartId, type PartMesh } from './parts';
import type { HistoryEntry } from './transaction';
import { Transaction } from './transaction';

/** Adds a new part next to `source` with the same transform and a cloned material. */
export function spawnSibling(tx: Transaction, root: THREE.Object3D, source: PartMesh, geometry: THREE.BufferGeometry, label: string): PartMesh {
  const material = Array.isArray(source.material) ? source.material.map((m) => m.clone()) : source.material.clone();
  const mesh = new THREE.Mesh(geometry, material) as PartMesh;
  mesh.name = label;
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  mesh.castShadow = source.castShadow;
  mesh.receiveShadow = source.receiveShadow;
  mesh.visible = source.visible;
  mesh.userData = { ...source.userData, partId: uniquePartId(root, source.userData.partId as string), label };
  delete mesh.userData.decalOf;
  tx.add(mesh, source.parent ?? root);
  return mesh;
}

const REGION_NAMES: Record<Region['axis'], [string, string, string]> = {
  x: ['left', 'middle', 'right'],
  y: ['bottom', 'middle', 'top'],
  z: ['back', 'middle', 'front'],
};

function regionName(region: Region): string {
  const [lo, mid, hi] = REGION_NAMES[region.axis];
  if (region.start <= 0.01 && region.end >= 0.99) return 'all';
  if (region.start <= 0.01) return lo;
  if (region.end >= 0.99) return hi;
  return mid;
}

/**
 * Moves the faces whose world centroid lies within [start, end] of the part's bbox along `axis`
 * into a new sibling part (e.g. "Vase (top)") and returns it. Returns the mesh itself when the
 * region covers every face, or null when it covers none.
 */
export function splitRegion(tx: Transaction, root: THREE.Object3D, mesh: PartMesh, region: Region): PartMesh | null {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const box = new THREE.Box3().setFromObject(mesh, true);
  const i = { x: 0, y: 1, z: 2 }[region.axis];
  const lo = box.min.getComponent(i);
  const len = Math.max(box.max.getComponent(i) - lo, 1e-9);
  const inside: number[] = [];
  const outside: number[] = [];
  const v = new THREE.Vector3();
  for (let f = 0; f < triangleCount(g); f++) {
    let c = 0;
    for (let k = 0; k < 3; k++) c += v.fromBufferAttribute(pos, cornerIndex(g, f, k)).applyMatrix4(mesh.matrixWorld).getComponent(i);
    const t = (c / 3 - lo) / len;
    (t >= region.start && t <= region.end ? inside : outside).push(f);
  }
  if (inside.length === 0) return null;
  if (outside.length === 0) return mesh;
  const label = `${mesh.userData.label as string} (${regionName(region)})`;
  const part = spawnSibling(tx, root, mesh, subGeometry(g, inside), label);
  tx.setGeometry(mesh, subGeometry(g, outside));
  return part;
}

export type FaceLabelResult = { entry: HistoryEntry | null; created: number; skipped: string[] };

/**
 * Splits parts by per-triangle labels. The largest group keeps the original mesh; every other group
 * becomes a sibling part. Everything is one transaction, so one undo reverts the whole split.
 */
export function applyFaceLabels(
  root: THREE.Object3D,
  faceLabels: Record<string, Int16Array>,
  name: (label: number, original: PartMesh, split: boolean) => string,
  historyLabel: string,
): FaceLabelResult {
  const parts = collectParts(root);
  const tx = new Transaction();
  const skipped: string[] = [];
  let created = 0;
  try {
    for (const [id, labels] of Object.entries(faceLabels)) {
      const mesh = parts.get(id);
      if (!mesh) continue;
      if (labels.length !== triangleCount(mesh.geometry)) {
        skipped.push(id);
        continue;
      }
      const groups = new Map<number, number[]>();
      labels.forEach((l, f) => {
        const list = groups.get(l);
        if (list) list.push(f);
        else groups.set(l, [f]);
      });
      const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
      const split = ordered.length > 1;
      if (!split) {
        const label = name(ordered[0]?.[0] ?? 0, mesh, false);
        if (label !== mesh.userData.label) tx.setLabel(mesh, label);
        continue;
      }
      const source = mesh.geometry;
      for (const [label, faces] of ordered.slice(1)) {
        spawnSibling(tx, root, mesh, subGeometry(source, faces), name(label, mesh, true));
        created++;
      }
      const [keepLabel, keepFaces] = ordered[0];
      tx.setLabel(mesh, name(keepLabel, mesh, true));
      tx.setGeometry(mesh, subGeometry(source, keepFaces));
    }
  } catch (e) {
    tx.rollback();
    throw e;
  }
  return { entry: tx.changed ? tx.commit(historyLabel) : null, created, skipped };
}
