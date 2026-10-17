import * as THREE from 'three';
import type { Axis, Operation } from '../types';
import { weldByPosition } from './geometry';
import type { PartMesh } from './parts';
import type { Transaction } from './transaction';

/** World-space point deformation `p → p'` (writes into `out`). */
export type Deform = (p: THREE.Vector3, out: THREE.Vector3) => void;

const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };
const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};
/** The axis a part bends toward when it is bent along `axis`. */
const BEND_TOWARD: Record<Axis, Axis> = { x: 'y', y: 'x', z: 'y' };

export const GEOMETRIC_OPS = new Set(['scale', 'stretch', 'translate', 'rotate', 'taper', 'twist', 'bend']);

/** Builds the deformation for one operation relative to a bounding box (a part's or the group's). */
export function buildDeform(op: Operation, box: THREE.Box3, modelSize: number): Deform | null {
  const min = box.min;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const anchorPoint = (a: [number, number, number] = [0.5, 0.5, 0.5]) =>
    new THREE.Vector3(min.x + a[0] * size.x, min.y + a[1] * size.y, min.z + a[2] * size.z);

  switch (op.type) {
    case 'scale': {
      const a = anchorPoint(op.anchor);
      const f = op.factor ?? 1;
      return (p, out) => out.copy(p).sub(a).multiplyScalar(f).add(a);
    }
    case 'stretch': {
      const a = anchorPoint(op.anchor);
      const f = new THREE.Vector3(...(op.factors ?? [1, 1, 1]));
      return (p, out) => out.copy(p).sub(a).multiply(f).add(a);
    }
    case 'translate': {
      const d = new THREE.Vector3(...(op.offset ?? [0, 0, 0])).multiplyScalar(modelSize);
      return (p, out) => out.copy(p).add(d);
    }
    case 'rotate': {
      const q = new THREE.Quaternion().setFromAxisAngle(AXIS_VEC[op.axis ?? 'y'], THREE.MathUtils.degToRad(op.degrees ?? 0));
      return (p, out) => out.copy(p).sub(center).applyQuaternion(q).add(center);
    }
    case 'taper': {
      const i = AXIS_INDEX[op.axis ?? 'y'];
      const len = Math.max(size.getComponent(i), 1e-9);
      const lo = min.getComponent(i);
      const k = op.factor ?? 0;
      return (p, out) => {
        const t = THREE.MathUtils.clamp((p.getComponent(i) - lo) / len, 0, 1);
        const s = Math.max(0.02, 1 - k * t);
        out.copy(p).sub(center).multiplyScalar(s).add(center);
        out.setComponent(i, p.getComponent(i));
      };
    }
    case 'twist': {
      const axis = op.axis ?? 'y';
      const i = AXIS_INDEX[axis];
      const len = Math.max(size.getComponent(i), 1e-9);
      const lo = min.getComponent(i);
      const total = THREE.MathUtils.degToRad(op.degrees ?? 0);
      const q = new THREE.Quaternion();
      return (p, out) => {
        const t = (p.getComponent(i) - lo) / len;
        q.setFromAxisAngle(AXIS_VEC[axis], total * t);
        out.copy(p).sub(center).applyQuaternion(q).add(center);
      };
    }
    case 'bend': {
      const axis = op.axis ?? 'y';
      const i = AXIS_INDEX[axis];
      const j = AXIS_INDEX[BEND_TOWARD[axis]];
      const len = Math.max(size.getComponent(i), 1e-9);
      const lo = min.getComponent(i);
      const theta = THREE.MathUtils.degToRad(op.degrees ?? 0);
      if (Math.abs(theta) < 1e-6) return (p, out) => out.copy(p);
      const r = len / theta;
      const c = center.getComponent(j);
      // Circular-arc bend: the centre line along `axis` becomes an arc of length `len`.
      return (p, out) => {
        const s = p.getComponent(i) - lo;
        const d = p.getComponent(j) - c;
        const phi = (theta * s) / len;
        out.copy(p);
        out.setComponent(j, c + r - (r - d) * Math.cos(phi));
        out.setComponent(i, lo + (r - d) * Math.sin(phi));
      };
    }
    default:
      return null;
  }
}

/**
 * Applies a world-space deformation to every vertex. Normals are transformed with the
 * inverse-transpose of a finite-difference Jacobian, which keeps hard edges and UV seams intact.
 */
export function deformMesh(tx: Transaction, mesh: PartMesh, deform: Deform, modelSize: number) {
  const geometry = tx.geometry(mesh);
  mesh.updateWorldMatrix(true, false);
  const world = mesh.matrixWorld;
  const inverse = world.clone().invert();
  const normalWorld = new THREE.Matrix3().getNormalMatrix(world);
  const normalLocal = normalWorld.clone().invert();
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const nor = geometry.attributes.normal as THREE.BufferAttribute | undefined;
  const eps = modelSize * 1e-4;

  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const jac = new THREE.Matrix3();
  const cols = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const n = new THREE.Vector3();

  for (let v = 0; v < pos.count; v++) {
    p.fromBufferAttribute(pos, v).applyMatrix4(world);
    deform(p, q);
    if (nor) {
      for (let k = 0; k < 3; k++) {
        tmp.copy(p).setComponent(k, p.getComponent(k) + eps);
        deform(tmp, a);
        tmp.copy(p).setComponent(k, p.getComponent(k) - eps);
        deform(tmp, b);
        cols[k].copy(a).sub(b).divideScalar(2 * eps);
      }
      jac.set(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z);
      if (Math.abs(jac.determinant()) > 1e-12) {
        jac.invert().transpose();
        n.fromBufferAttribute(nor, v).applyMatrix3(normalWorld).applyMatrix3(jac).applyMatrix3(normalLocal).normalize();
        nor.setXYZ(v, n.x, n.y, n.z);
      }
    }
    q.applyMatrix4(inverse);
    pos.setXYZ(v, q.x, q.y, q.z);
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  geometry.deleteAttribute('tangent');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** Pushes the surface along area-weighted welded normals (negative = thinner) without cracking seams. */
export function inflateMesh(tx: Transaction, mesh: PartMesh, distance: number) {
  const geometry = tx.geometry(mesh);
  mesh.updateWorldMatrix(true, false);
  const world = mesh.matrixWorld;
  const inverse = world.clone().invert();
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const weld = weldByPosition(geometry);
  let welded = 0;
  for (let i = 0; i < weld.length; i++) welded = Math.max(welded, weld[i] + 1);
  const acc = new Float32Array(welded * 3);
  const index = geometry.index;
  const faces = index ? index.count / 3 : pos.count / 3;
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const C = new THREE.Vector3();
  for (let f = 0; f < faces; f++) {
    const ia = index ? index.getX(f * 3) : f * 3;
    const ib = index ? index.getX(f * 3 + 1) : f * 3 + 1;
    const ic = index ? index.getX(f * 3 + 2) : f * 3 + 2;
    A.fromBufferAttribute(pos, ia).applyMatrix4(world);
    B.fromBufferAttribute(pos, ib).applyMatrix4(world);
    C.fromBufferAttribute(pos, ic).applyMatrix4(world);
    const n = B.sub(A).cross(C.sub(A)); // length = 2 × area: area-weighted
    for (const v of [ia, ib, ic]) {
      const w = weld[v] * 3;
      acc[w] += n.x;
      acc[w + 1] += n.y;
      acc[w + 2] += n.z;
    }
  }
  const p = new THREE.Vector3();
  const d = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    const w = weld[v] * 3;
    d.set(acc[w], acc[w + 1], acc[w + 2]);
    if (d.lengthSq() < 1e-20) continue;
    d.normalize().multiplyScalar(distance);
    p.fromBufferAttribute(pos, v).applyMatrix4(world).add(d).applyMatrix4(inverse);
    pos.setXYZ(v, p.x, p.y, p.z);
  }
  pos.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}
