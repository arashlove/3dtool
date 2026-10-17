import * as THREE from 'three';

/** Low-level BufferGeometry helpers shared by the edit engine and texture segmentation. */

export function triangleCount(geometry: THREE.BufferGeometry): number {
  return Math.floor((geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3);
}

/** Vertex index of corner `c` (0..2) of triangle `f`. */
export function cornerIndex(geometry: THREE.BufferGeometry, f: number, c: number): number {
  return geometry.index ? geometry.index.getX(f * 3 + c) : f * 3 + c;
}

/** Material index of every triangle (from geometry groups; 0 when there are none). */
export function faceMaterialIndices(geometry: THREE.BufferGeometry): Uint16Array {
  const out = new Uint16Array(triangleCount(geometry));
  for (const g of geometry.groups) {
    const start = Math.floor(g.start / 3);
    const end = Math.min(out.length, Math.floor((g.start + g.count) / 3));
    for (let f = start; f < end; f++) out[f] = g.materialIndex ?? 0;
  }
  return out;
}

/**
 * Builds a compact geometry from a subset of triangles, in the given order. All attributes are kept
 * (UVs, normals, vertex colours), so the result renders exactly like the source faces.
 */
export function subGeometry(geometry: THREE.BufferGeometry, faces: ArrayLike<number>): THREE.BufferGeometry {
  const remap = new Map<number, number>();
  const order: number[] = [];
  const index: number[] = [];
  for (let i = 0; i < faces.length; i++) {
    const f = faces[i];
    for (let c = 0; c < 3; c++) {
      const v = cornerIndex(geometry, f, c);
      let n = remap.get(v);
      if (n === undefined) {
        n = order.length;
        remap.set(v, n);
        order.push(v);
      }
      index.push(n);
    }
  }
  const out = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const src = attr as THREE.BufferAttribute;
    const size = src.itemSize;
    const ArrayType = (src.array as Float32Array).constructor as Float32ArrayConstructor;
    const array = new ArrayType(order.length * size);
    for (let i = 0; i < order.length; i++) {
      for (let k = 0; k < size; k++) array[i * size + k] = src.getComponent(order[i], k);
    }
    out.setAttribute(name, new THREE.BufferAttribute(array, size, src.normalized));
  }
  out.setIndex(order.length > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));

  if (geometry.groups.length) {
    const mats = faceMaterialIndices(geometry);
    let runStart = 0;
    for (let i = 1; i <= faces.length; i++) {
      if (i === faces.length || mats[faces[i]] !== mats[faces[runStart]]) {
        out.addGroup(runStart * 3, (i - runStart) * 3, mats[faces[runStart]]);
        runStart = i;
      }
    }
  }
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

/** Maps every vertex to a welded id: vertices at the same position (within tolerance) share an id. */
export function weldByPosition(geometry: THREE.BufferGeometry): Int32Array {
  const pos = geometry.attributes.position;
  geometry.computeBoundingBox();
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const tol = Math.max(size.x, size.y, size.z, 1e-6) * 1e-5;
  const keys = new Map<string, number>();
  const out = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) / tol)},${Math.round(pos.getY(i) / tol)},${Math.round(pos.getZ(i) / tol)}`;
    let id = keys.get(key);
    if (id === undefined) {
      id = keys.size;
      keys.set(key, id);
    }
    out[i] = id;
  }
  return out;
}

/** Face adjacency through shared welded edges, as CSR arrays. */
export function faceAdjacency(geometry: THREE.BufferGeometry, weld = weldByPosition(geometry)) {
  const faces = triangleCount(geometry);
  const edgeFaces = new Map<string, number[]>();
  for (let f = 0; f < faces; f++) {
    const a = weld[cornerIndex(geometry, f, 0)];
    const b = weld[cornerIndex(geometry, f, 1)];
    const c = weld[cornerIndex(geometry, f, 2)];
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ]) {
      if (u === v) continue;
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      const list = edgeFaces.get(key);
      if (list) list.push(f);
      else edgeFaces.set(key, [f]);
    }
  }
  const neighbours: number[][] = Array.from({ length: faces }, () => []);
  for (const list of edgeFaces.values()) {
    for (let i = 0; i < list.length; i++) for (let j = 0; j < list.length; j++) if (i !== j) neighbours[list[i]].push(list[j]);
  }
  return neighbours;
}

/** Groups triangles into connected components (sharing welded vertices). */
export function connectedComponents(geometry: THREE.BufferGeometry): number[][] {
  const weld = weldByPosition(geometry);
  const faces = triangleCount(geometry);
  let maxId = 0;
  for (let i = 0; i < weld.length; i++) if (weld[i] > maxId) maxId = weld[i];
  const parent = new Int32Array(maxId + 1).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let f = 0; f < faces; f++) {
    const a = find(weld[cornerIndex(geometry, f, 0)]);
    const b = find(weld[cornerIndex(geometry, f, 1)]);
    const c = find(weld[cornerIndex(geometry, f, 2)]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const groups = new Map<number, number[]>();
  for (let f = 0; f < faces; f++) {
    const root = find(weld[cornerIndex(geometry, f, 0)]);
    const list = groups.get(root);
    if (list) list.push(f);
    else groups.set(root, [f]);
  }
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

/** World-space area of every triangle. */
export function faceAreas(geometry: THREE.BufferGeometry, matrixWorld: THREE.Matrix4): Float32Array {
  const pos = geometry.attributes.position;
  const faces = triangleCount(geometry);
  const out = new Float32Array(faces);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < faces; f++) {
    a.fromBufferAttribute(pos, cornerIndex(geometry, f, 0)).applyMatrix4(matrixWorld);
    b.fromBufferAttribute(pos, cornerIndex(geometry, f, 1)).applyMatrix4(matrixWorld);
    c.fromBufferAttribute(pos, cornerIndex(geometry, f, 2)).applyMatrix4(matrixWorld);
    out[f] = b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return out;
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
