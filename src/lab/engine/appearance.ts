import * as THREE from 'three';
import type { Operation } from '../types';
import { cornerIndex, triangleCount } from './geometry';
import type { PartMesh } from './parts';
import type { Transaction } from './transaction';

type PBR = THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;

/** Maps that relied on the old UV layout and are cleared when a new texture is projected. */
const UV_DEPENDENT_MAPS = ['normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'emissiveMap', 'displacementMap'] as const;

/**
 * Per-triangle planar UVs along each face's dominant world-space normal axis, scaled by
 * `tiling / max(size)`. The geometry becomes non-indexed (triangle order is preserved).
 */
export function boxProjectUVs(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4, tiling: number): THREE.BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const pos = g.attributes.position;
  const faces = triangleCount(g);
  const box = new THREE.Box3();
  const world: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(matrixWorld);
    world.push(v);
    box.expandByPoint(v);
  }
  const size = box.getSize(new THREE.Vector3());
  const scale = tiling / Math.max(size.x, size.y, size.z, 1e-6);
  const uv = new Float32Array(pos.count * 2);
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let f = 0; f < faces; f++) {
    const [a, b, c] = [0, 1, 2].map((k) => world[cornerIndex(g, f, k)]);
    const n = ab.subVectors(b, a).cross(ac.subVectors(c, a));
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const vi = cornerIndex(g, f, k);
      const p = world[vi];
      let u: number;
      let v: number;
      if (ax >= ay && ax >= az) [u, v] = [(n.x > 0 ? -p.z : p.z) - box.min.z, p.y - box.min.y];
      else if (ay >= az) [u, v] = [p.x - box.min.x, (n.y > 0 ? -p.z : p.z) - box.min.z];
      else [u, v] = [(n.z > 0 ? p.x : -p.x) - box.min.x, p.y - box.min.y];
      uv[vi * 2] = u * scale;
      uv[vi * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Colour, PBR and texture operations on one part. */
export function applyAppearance(tx: Transaction, mesh: PartMesh, op: Operation, texture?: THREE.Texture) {
  switch (op.type) {
    case 'color':
      for (const m of tx.materials(mesh) as PBR[]) {
        if (!m.color) continue;
        m.color.set(op.color!);
        if (!op.keep_texture) m.map = null;
        m.vertexColors = false;
        m.needsUpdate = true;
      }
      return;
    case 'material':
      for (const m of tx.materials(mesh) as PBR[]) {
        if (op.metalness !== undefined && 'metalness' in m) m.metalness = op.metalness;
        if (op.roughness !== undefined && 'roughness' in m) m.roughness = op.roughness;
        if (op.opacity !== undefined) {
          m.opacity = op.opacity;
          m.transparent = op.opacity < 1;
          m.depthWrite = op.opacity >= 1;
        }
        if (op.emissive !== undefined && m.emissive) m.emissive.set(op.emissive);
        if (op.emissive_intensity !== undefined && 'emissiveIntensity' in m) {
          m.emissiveIntensity = op.emissive_intensity;
          if (op.emissive === undefined && m.emissive && m.emissive.getHex() === 0 && op.emissive_intensity > 0) m.emissive.set('#ffffff');
        }
        m.needsUpdate = true;
      }
      return;
    case 'texture': {
      if (!texture) throw new Error('Texture was not generated.');
      mesh.updateWorldMatrix(true, false);
      tx.setGeometry(mesh, boxProjectUVs(mesh.geometry, mesh.matrixWorld, op.tiling ?? 2));
      for (const m of tx.materials(mesh) as PBR[]) {
        m.map = texture;
        if (m.color) m.color.set('#ffffff');
        m.vertexColors = false;
        for (const key of UV_DEPENDENT_MAPS) if (key in m) (m as unknown as Record<string, unknown>)[key] = null;
        if (m.emissive) m.emissive.set('#000000');
        m.needsUpdate = true;
      }
      return;
    }
    case 'hide':
      tx.setVisible(mesh, false);
      return;
    case 'show':
      tx.setVisible(mesh, true);
      return;
  }
}
