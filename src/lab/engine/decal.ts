import * as THREE from 'three';
import type { DecalDirection, Operation } from '../types';
import { cornerIndex, triangleCount } from './geometry';
import { collectParts, materialsOf, uniquePartId, type PartMesh } from './parts';
import type { Transaction } from './transaction';

/**
 * A picture would be shredded by box-projected UVs, so a decal gets its own projection and becomes
 * a separate transparent overlay part lifted slightly above the original surface.
 */

export type ViewportHandle = { renderer: THREE.WebGLRenderer; camera: THREE.Camera };

type Basis = { dir: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 };

const BASES: Record<Exclude<DecalDirection, 'view' | 'around'>, [number[], number[], number[]]> = {
  front: [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  back: [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  right: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  left: [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  top: [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
  bottom: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
};

function projectorBasis(direction: DecalDirection, degrees: number, camera?: THREE.Camera): Basis {
  let basis: Basis;
  if (direction === 'view' && camera) {
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    basis = {
      u: new THREE.Vector3(e[0], e[1], e[2]).normalize(),
      v: new THREE.Vector3(e[4], e[5], e[6]).normalize(),
      dir: new THREE.Vector3(e[8], e[9], e[10]).normalize(),
    };
  } else {
    const [d, u, v] = BASES[direction === 'view' || direction === 'around' ? 'front' : direction];
    basis = { dir: new THREE.Vector3(...d), u: new THREE.Vector3(...u), v: new THREE.Vector3(...v) };
  }
  if (degrees) {
    const q = new THREE.Quaternion().setFromAxisAngle(basis.dir, THREE.MathUtils.degToRad(degrees));
    basis.u.applyQuaternion(q);
    basis.v.applyQuaternion(q);
  }
  return basis;
}

type WorldTri = { mesh: PartMesh; face: number; p: THREE.Vector3[]; n: THREE.Vector3[]; normal: THREE.Vector3 };

function worldTriangles(mesh: PartMesh): WorldTri[] {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry;
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const out: WorldTri[] = [];
  for (let f = 0; f < triangleCount(g); f++) {
    const idx = [0, 1, 2].map((k) => cornerIndex(g, f, k));
    const p = idx.map((i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
    const normal = new THREE.Vector3().subVectors(p[1], p[0]).cross(new THREE.Vector3().subVectors(p[2], p[0]));
    if (normal.lengthSq() < 1e-30) continue;
    normal.normalize();
    const n = idx.map((i) => (nor ? new THREE.Vector3().fromBufferAttribute(nor, i).applyMatrix3(nm).normalize() : normal.clone()));
    out.push({ mesh, face: f, p, n, normal });
  }
  return out;
}

const DEPTH_VERTEX = `
uniform float uNear;
uniform float uFar;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = (-mv.z - uNear) / (uFar - uNear);
  gl_Position = projectionMatrix * mv;
}`;
const DEPTH_FRAGMENT = `
precision highp float;
varying float vDepth;
void main() {
  float d = floor(clamp(vDepth, 0.0, 1.0) * 16777215.0);
  float r = floor(d / 65536.0);
  float g = floor((d - r * 65536.0) / 256.0);
  float b = d - r * 65536.0 - g * 256.0;
  gl_FragColor = vec4(r, g, b, 255.0) / 255.0;
}`;

type DepthMap = { sample: (world: THREE.Vector3) => { depth: number; mapDepth: number } | null };

/** Renders all visible parts orthographically from the projector, with depth packed into RGB (24-bit). */
function renderDepthMap(viewport: ViewportHandle, root: THREE.Object3D, box: THREE.Box3, basis: Basis): DepthMap {
  const SIZE = 1024;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sphere.radius, 1e-3) * 1.05;
  const camera = new THREE.OrthographicCamera(-r, r, r, -r, 0.001, r * 4);
  camera.position.copy(sphere.center).addScaledVector(basis.dir, r * 2);
  camera.up.copy(basis.v);
  camera.lookAt(sphere.center);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const material = new THREE.ShaderMaterial({
    vertexShader: DEPTH_VERTEX,
    fragmentShader: DEPTH_FRAGMENT,
    uniforms: { uNear: { value: camera.near }, uFar: { value: camera.far } },
    side: THREE.DoubleSide,
  });
  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.UnsignedByteType });
  const { renderer } = viewport;
  const saved: Array<[PartMesh, THREE.Material | THREE.Material[]]> = [];
  const hidden: THREE.Object3D[] = [];
  root.traverse((o) => {
    const m = o as PartMesh;
    if (m.isMesh && m.userData.partId && !m.userData.decalOf) {
      saved.push([m, m.material]);
      m.material = material;
    } else if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine) {
      if (o.visible) hidden.push(o);
      o.visible = false;
    }
  });
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(root, camera);
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
  } finally {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    for (const [m, mat] of saved) m.material = mat;
    for (const o of hidden) o.visible = true;
    target.dispose();
    material.dispose();
  }

  const view = new THREE.Vector3();
  return {
    sample: (world) => {
      view.copy(world).applyMatrix4(camera.matrixWorldInverse);
      const depth = (-view.z - camera.near) / (camera.far - camera.near);
      view.copy(world).project(camera);
      const x = Math.floor((view.x * 0.5 + 0.5) * SIZE);
      const y = Math.floor((view.y * 0.5 + 0.5) * SIZE);
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return null;
      const i = (y * SIZE + x) * 4;
      const mapDepth = (pixels[i] * 65536 + pixels[i + 1] * 256 + pixels[i + 2]) / 16777215;
      return { depth, mapDepth };
    },
  };
}

function overlayMaterial(base: THREE.Material, texture: THREE.Texture): THREE.MeshStandardMaterial {
  const b = base as THREE.MeshStandardMaterial;
  return new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.05,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
    roughness: b.roughness ?? 0.6,
    metalness: b.metalness ?? 0,
    side: b.side ?? THREE.FrontSide,
  });
}

/** Builds and adds an overlay part from world-space triangles with per-corner UVs. */
function addOverlay(
  tx: Transaction,
  root: THREE.Object3D,
  target: PartMesh,
  tris: Array<{ p: THREE.Vector3[]; n: THREE.Vector3[]; uv: [number, number][] }>,
  lift: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Vector3,
  texture: THREE.Texture,
  kind: string,
): PartMesh | null {
  if (tris.length === 0) return null;
  target.updateWorldMatrix(true, false);
  const inverse = target.matrixWorld.clone().invert();
  const normalLocal = new THREE.Matrix3().getNormalMatrix(inverse);
  const positions = new Float32Array(tris.length * 9);
  const normals = new Float32Array(tris.length * 9);
  const uvs = new Float32Array(tris.length * 6);
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const p = lift(t.p[k].clone(), t.n[k]).applyMatrix4(inverse);
      const n = t.n[k].clone().applyMatrix3(normalLocal).normalize();
      positions.set([p.x, p.y, p.z], i * 9 + k * 3);
      normals.set([n.x, n.y, n.z], i * 9 + k * 3);
      uvs.set(t.uv[k], i * 6 + k * 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, overlayMaterial(materialsOf(target)[0], texture)) as PartMesh;
  const label = `${kind} · ${target.userData.label as string}`;
  mesh.name = label;
  mesh.position.copy(target.position);
  mesh.quaternion.copy(target.quaternion);
  mesh.scale.copy(target.scale);
  mesh.renderOrder = 2;
  mesh.userData = { partId: uniquePartId(root, target.userData.partId as string, 'decal'), label, decalOf: target.userData.partId };
  tx.add(mesh, target.parent ?? root);
  return mesh;
}

/** Projects one picture onto the targets from a direction (or the live camera). */
export function projectDecal(
  tx: Transaction,
  root: THREE.Object3D,
  targets: PartMesh[],
  op: Operation,
  texture: THREE.Texture,
  modelSize: number,
  viewport?: ViewportHandle,
): PartMesh[] {
  if (op.direction === 'around') return projectWrap(tx, root, targets, op, texture, modelSize);
  const basis = projectorBasis(op.direction ?? 'front', op.degrees ?? 0, viewport?.camera);
  const all = targets.flatMap(worldTriangles);
  const facing = all.filter((t) => t.normal.dot(basis.dir) >= 0.2);
  if (facing.length === 0) return [];

  let umin = Infinity;
  let umax = -Infinity;
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const t of facing) {
    for (const p of t.p) {
      const u = p.dot(basis.u);
      const v = p.dot(basis.v);
      umin = Math.min(umin, u);
      umax = Math.max(umax, u);
      vmin = Math.min(vmin, v);
      vmax = Math.max(vmax, v);
    }
  }
  const side = Math.max(umax - umin, vmax - vmin, 1e-6) * (op.decal_size ?? 0.8);
  const cu = (umin + umax) / 2;
  const cv = (vmin + vmax) / 2;
  const uvOf = (p: THREE.Vector3): [number, number] => [(p.dot(basis.u) - cu) / side + 0.5, (p.dot(basis.v) - cv) / side + 0.5];

  let visible = facing;
  if (viewport) {
    const box = new THREE.Box3();
    for (const m of collectParts(root).values()) if (m.visible && !m.userData.decalOf) box.union(new THREE.Box3().setFromObject(m, true));
    const depth = renderDepthMap(viewport, root, box, basis);
    const tolerance = 0.004;
    const probe = new THREE.Vector3();
    visible = facing.filter((t) => {
      const centroid = probe.copy(t.p[0]).add(t.p[1]).add(t.p[2]).divideScalar(3);
      const s = depth.sample(centroid);
      if (!s || s.depth <= s.mapDepth + tolerance) return true;
      // A point near a corner may still be visible when the centroid is hidden.
      return t.p.some((corner) => {
        const near = probe.copy(corner).lerp(centroid, 0.2);
        const c = depth.sample(near);
        return !c || c.depth <= c.mapDepth + tolerance;
      });
    });
  }

  const lift = modelSize * 0.0015;
  const out: PartMesh[] = [];
  for (const target of targets) {
    const tris = visible
      .filter((t) => t.mesh === target)
      .map((t) => ({ p: t.p, n: t.n, uv: t.p.map(uvOf) }))
      .filter((t) => !t.uv.every(([u]) => u < 0) && !t.uv.every(([u]) => u > 1) && !t.uv.every(([, v]) => v < 0) && !t.uv.every(([, v]) => v > 1));
    const mesh = addOverlay(tx, root, target, tris, (p) => p.addScaledVector(basis.dir, lift), texture, 'Decal');
    if (mesh) out.push(mesh);
  }
  return out;
}

const AXES = ['x', 'y', 'z'] as const;

/** Picks the world axis around which the targets are roundest (preferring Y). */
function revolution(box: THREE.Box3): { i: 0 | 1 | 2; j: 0 | 1 | 2; k: 0 | 1 | 2 } {
  const s = box.getSize(new THREE.Vector3()).toArray();
  let best = { i: 1 as 0 | 1 | 2, score: -Infinity };
  for (let i = 0 as 0 | 1 | 2; i < 3; i = (i + 1) as 0 | 1 | 2) {
    const [a, b] = [0, 1, 2].filter((x) => x !== i).map((x) => s[x]);
    const roundness = Math.min(a, b) / Math.max(a, b, 1e-9) + (AXES[i] === 'y' ? 0.1 : 0);
    if (roundness > best.score) best = { i, score: roundness };
  }
  const [j, k] = [0, 1, 2].filter((x) => x !== best.i) as (0 | 1 | 2)[];
  return { i: best.i, j, k };
}

function targetsBox(targets: PartMesh[]): THREE.Box3 {
  const box = new THREE.Box3();
  for (const t of targets) box.union(new THREE.Box3().setFromObject(t, true));
  return box;
}

/** Panorama aspect for a wrap: circumference ÷ height ÷ coverage. */
export function wrapAspect(targets: PartMesh[], decalSize = 0.8): number {
  const box = targetsBox(targets);
  if (box.isEmpty()) return 2;
  const { i, j, k } = revolution(box);
  const s = box.getSize(new THREE.Vector3());
  const diameter = (s.getComponent(j) + s.getComponent(k)) / 2;
  const height = Math.max(s.getComponent(i), 1e-6);
  return THREE.MathUtils.clamp((Math.PI * diameter) / (height * decalSize), 1, 4);
}

/** Wraps a panorama 360° around the targets with cylindrical UVs. */
export function projectWrap(
  tx: Transaction,
  root: THREE.Object3D,
  targets: PartMesh[],
  op: Operation,
  texture: THREE.Texture,
  modelSize: number,
): PartMesh[] {
  const box = targetsBox(targets);
  if (box.isEmpty()) return [];
  const { i, j, k } = revolution(box);
  const center = box.getCenter(new THREE.Vector3());
  const lo = box.min.getComponent(i);
  const span = Math.max(box.max.getComponent(i) - lo, 1e-6);
  const coverage = op.decal_size ?? 0.8;
  const turn = (op.degrees ?? 0) / 360;
  const lift = modelSize * 0.0015;
  const radial = (p: THREE.Vector3) => {
    const r = new THREE.Vector3();
    r.setComponent(j, p.getComponent(j) - center.getComponent(j));
    r.setComponent(k, p.getComponent(k) - center.getComponent(k));
    return r;
  };
  const uvOf = (p: THREE.Vector3): [number, number] => {
    const angle = Math.atan2(p.getComponent(k) - center.getComponent(k), p.getComponent(j) - center.getComponent(j));
    const u = angle / (2 * Math.PI) + 0.5 + turn;
    const v = (p.getComponent(i) - lo - span / 2) / (span * coverage) + 0.5;
    return [u - Math.floor(u), v];
  };

  const out: PartMesh[] = [];
  for (const target of targets) {
    const tris = worldTriangles(target)
      .filter((t) => {
        const c = t.p[0].clone().add(t.p[1]).add(t.p[2]).divideScalar(3);
        const r = radial(c);
        return r.lengthSq() > 1e-12 && t.normal.dot(r.normalize()) > 0.1;
      })
      .map((t) => {
        const uv = t.p.map(uvOf);
        // Triangles straddling the back seam: shift their low corners by one turn.
        const us = uv.map(([u]) => u);
        if (Math.max(...us) - Math.min(...us) > 0.5) for (const c of uv) if (c[0] < 0.5) c[0] += 1;
        return { p: t.p, n: t.n, uv };
      })
      .filter((t) => !t.uv.every(([, v]) => v < 0) && !t.uv.every(([, v]) => v > 1));
    const mesh = addOverlay(tx, root, target, tris, (p) => p.add(radial(p).normalize().multiplyScalar(lift)), texture, 'Wrap');
    if (mesh) out.push(mesh);
  }
  return out;
}
