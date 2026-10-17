import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roundedBox } from './common';

/**
 * Procedural shape toolkit shared by the preset builders. Every function returns a fresh
 * geometry in metres, deterministic for the same inputs (no Math.random).
 */

export type V3 = [number, number, number];
/** A 2D profile point: [outward or radius, up]. */
export type P2 = [number, number];

export const CORNERS = [
  { name: 'front_left', sx: -1, sz: 1 },
  { name: 'front_right', sx: 1, sz: 1 },
  { name: 'back_left', sx: -1, sz: -1 },
  { name: 'back_right', sx: 1, sz: -1 },
] as const;

/** Deterministic pseudo-random value in [0, 1) for an integer seed. */
export function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const EULER = new THREE.Euler();
const MATRIX = new THREE.Matrix4();

/** Bakes a rotation (Euler, XYZ order by default as on Object3D) and then a translation into the geometry. */
export function place<T extends THREE.BufferGeometry>(geometry: T, position: V3, rotation?: V3, order: THREE.EulerOrder = 'XYZ'): T {
  if (rotation) geometry.applyMatrix4(MATRIX.makeRotationFromEuler(EULER.set(rotation[0], rotation[1], rotation[2], order)));
  geometry.translate(position[0], position[1], position[2]);
  return geometry;
}

const KEEP_ATTRIBUTES = new Set(['position', 'normal', 'uv']);

/** Merges several geometries into one draw call. The inputs are consumed (disposed). */
export function mergeAll(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (geometries.length === 0) throw new Error('Nothing to merge');
  if (geometries.length === 1) return geometries[0];
  const mixed = geometries.some((g) => !g.index);
  const prepared = geometries.map((g) => {
    const out = mixed && g.index ? g.toNonIndexed() : g;
    if (out !== g) g.dispose();
    for (const name of Object.keys(out.attributes)) if (!KEEP_ATTRIBUTES.has(name)) out.deleteAttribute(name);
    out.clearGroups();
    return out;
  });
  if (!prepared.every((g) => g.attributes.uv)) {
    for (const g of prepared) if (g.attributes.uv) g.deleteAttribute('uv');
  }
  const merged = mergeGeometries(prepared, false);
  for (const g of prepared) g.dispose();
  if (!merged) throw new Error('Could not merge part geometries');
  return merged;
}

/** Traces a centred rounded rectangle into a Shape (outline) or Path (hole). */
export function roundedRect<T extends THREE.Path>(path: T, width: number, height: number, radius: number): T {
  const r = Math.max(0, Math.min(radius, width / 2 - 1e-4, height / 2 - 1e-4));
  const x = -width / 2;
  const y = -height / 2;
  if (r < 1e-4) {
    path.moveTo(x, y);
    path.lineTo(x + width, y);
    path.lineTo(x + width, y + height);
    path.lineTo(x, y + height);
    path.lineTo(x, y);
    return path;
  }
  path.moveTo(x + r, y);
  path.lineTo(x + width - r, y);
  path.absarc(x + width - r, y + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x + width, y + height - r);
  path.absarc(x + width - r, y + height - r, r, 0, Math.PI / 2, false);
  path.lineTo(x + r, y + height);
  path.absarc(x + r, y + height - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(x, y + r);
  path.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return path;
}

/**
 * Horizontal slab with rounded corners in plan and a small bevel on its edges: table tops,
 * seats, rugs. Spans y in [0, thickness], centred in X/Z.
 */
export function roundedSlab(width: number, depth: number, thickness: number, cornerRadius: number, bevel = 0.004, curveSegments = 4) {
  const b = Math.max(0, Math.min(bevel, thickness / 2 - 1e-4, width / 4, depth / 4));
  const bevelled = b > 1e-4;
  const shape = roundedRect(new THREE.Shape(), width, depth, Math.max(cornerRadius, b * 1.5));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, thickness - (bevelled ? 2 * b : 0)),
    bevelEnabled: bevelled,
    bevelThickness: b,
    bevelSize: b,
    // A negative offset keeps the side walls on the outline, so the slab stays exactly width x depth.
    bevelOffset: -b,
    bevelSegments: 2,
    curveSegments,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevelled ? b : 0, 0);
  return g;
}

/**
 * Rectangular ring (picture/mirror/window frame) facing +Z, with bevelled edges.
 * Centred on the origin; spans z in [-depth/2, depth/2].
 */
export function frameRing(outerW: number, outerH: number, innerW: number, innerH: number, depth: number, bevel = 0.003) {
  const b = Math.max(0, Math.min(bevel, depth / 2 - 1e-4, (outerW - innerW) / 6, (outerH - innerH) / 6));
  const bevelled = b > 1e-4;
  const shape = roundedRect(new THREE.Shape(), outerW, outerH, b * 1.5);
  shape.holes.push(roundedRect(new THREE.Path(), innerW, innerH, 0));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - (bevelled ? 2 * b : 0)),
    bevelEnabled: bevelled,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments: 1,
    curveSegments: 2,
  });
  g.translate(0, 0, -depth / 2 + (bevelled ? b : 0));
  return g;
}

/**
 * Extrudes a closed 2D profile along X, centred on the origin. Profile points are
 * [outward (+Z), up (+Y)]; used for skirting boards and mouldings.
 */
export function profileAlongX(points: P2[], length: number) {
  const shape = new THREE.Shape(points.map(([out, up]) => new THREE.Vector2(-out, up)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 6 });
  // Rotating about Y maps the extrusion axis (+Z) to +X and the profile's -X to +Z.
  g.rotateY(Math.PI / 2);
  g.translate(-length / 2, 0, 0);
  return g;
}

/** Samples a quadratic Bezier from a (exclusive) via control c to b (inclusive). */
export function quadPoints(a: P2, c: P2, b: P2, steps = 4): P2[] {
  const out: P2[] = [];
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** Surface of revolution around Y from [radius, y] profile points. */
export function lathe(points: P2[], segments = 32) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)),
    segments,
  );
}

/** Box whose top and bottom faces have different sizes (tapered furniture legs). Centred on the origin. */
export function taperedBox(topW: number, topD: number, bottomW: number, bottomD: number, height: number) {
  const g = new THREE.BoxGeometry(1, height, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / height + 0.5;
    pos.setX(i, pos.getX(i) * THREE.MathUtils.lerp(bottomW, topW, t));
    pos.setZ(i, pos.getZ(i) * THREE.MathUtils.lerp(bottomD, topD, t));
  }
  g.computeVertexNormals();
  return g;
}

export type LegStyle = 'square' | 'tapered' | 'round';

/** Furniture leg centred on the origin, `height` tall. */
export function legGeometry(style: string, thickness: number, height: number): THREE.BufferGeometry {
  if (style === 'round') return new THREE.CylinderGeometry(thickness / 2, thickness * 0.33, height, 16);
  if (style === 'tapered') return taperedBox(thickness, thickness, thickness * 0.6, thickness * 0.6, height);
  return roundedBox(thickness, height, thickness, thickness * 0.12, 1);
}

/**
 * Bends a geometry around Y so its ends move towards +Z (concave towards the viewer),
 * like a chair backrest. Uses a parabola, accurate for gentle curves.
 */
export function bendTowardsFront<T extends THREE.BufferGeometry>(geometry: T, radius: number): T {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, pos.getZ(i) + (x * x) / (2 * radius));
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Curve through precomputed samples, parameterised by sample index so a tube gets one ring per sample. */
class SampledCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly samples: THREE.Vector3[]) {
    super();
  }

  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const f = THREE.MathUtils.clamp(t, 0, 1) * (this.samples.length - 1);
    const i = Math.min(Math.floor(f), this.samples.length - 2);
    return target.lerpVectors(this.samples[i], this.samples[i + 1], f - i);
  }

  override getUtoTmapping(u: number): number {
    return u;
  }
}

/** Polyline with each interior corner replaced by a sampled quadratic arc. */
function roundedPolyline(points: V3[], cornerRadius: number, cornerSteps = 6): THREE.Vector3[] {
  const pts = points.map((p) => new THREE.Vector3(...p));
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const toPrev = pts[i - 1].clone().sub(p);
    const toNext = pts[i + 1].clone().sub(p);
    // 0.45 keeps a short straight piece between neighbouring corners, so no samples coincide.
    const r = Math.min(cornerRadius, toPrev.length() * 0.45, toNext.length() * 0.45);
    const curve = new THREE.QuadraticBezierCurve3(
      p.clone().addScaledVector(toPrev.normalize(), r),
      p.clone(),
      p.clone().addScaledVector(toNext.normalize(), r),
    );
    for (let k = 0; k <= cornerSteps; k++) out.push(curve.getPoint(k / cornerSteps));
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

/** Round tube along a polyline with rounded corners: metal frames, lamp spokes, rails. */
export function tube(points: V3[], radius: number, cornerRadius = 0, radialSegments = 10) {
  const samples = roundedPolyline(points, cornerRadius);
  return new THREE.TubeGeometry(new SampledCurve(samples), samples.length - 1, radius, radialSegments, false);
}

/** Bar handle centred on the origin, standing off the door face towards +Z. */
export function barHandle(length: number, vertical: boolean, radius = 0.006): THREE.BufferGeometry {
  const standoff = 0.028;
  const bar = place(new THREE.CylinderGeometry(radius, radius, length, 12), [0, 0, standoff]);
  const posts = [-1, 1].map((s) =>
    place(new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, standoff, 8), [0, s * (length / 2 - 0.012), standoff / 2], [Math.PI / 2, 0, 0]),
  );
  const g = mergeAll([bar, ...posts]);
  if (!vertical) g.rotateZ(Math.PI / 2);
  return g;
}

/** Round knob centred on the origin, standing off the face towards +Z. */
export function knob(radius = 0.014): THREE.BufferGeometry {
  const head = place(new THREE.SphereGeometry(radius, 16, 10), [0, 0, radius * 1.4]);
  head.scale(1, 1, 0.75);
  const stem = place(new THREE.CylinderGeometry(radius * 0.4, radius * 0.45, radius * 1.4, 10), [0, 0, radius * 0.7], [Math.PI / 2, 0, 0]);
  return mergeAll([head, stem]);
}

/** Width profile of a leaf along its length (t = 0 at the stem, 1 at the tip), from 0 to 1. */
export type LeafEnvelope = (t: number) => number;

export const LEAFY_ENVELOPE: LeafEnvelope = (t) => Math.max(0.06, Math.sin(Math.PI * Math.pow(t, 0.75)));
export const BLADE_ENVELOPE: LeafEnvelope = (t) => Math.max(0.02, Math.min(1, (1 - t) * 3.5)) * (0.75 + 0.25 * Math.min(1, t * 4));

/**
 * Single leaf growing from the origin along +Y with its face towards +Z. `curl` bends the tip
 * towards +Z (tilt the leaf so that is outward-down), `fold` creases it along the midrib.
 */
export function leafGeometry(length: number, width: number, envelope: LeafEnvelope, curl: number, fold: number, segments = 10) {
  const g = new THREE.PlaneGeometry(width, length, 2, segments);
  g.translate(0, length / 2, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Clamp: float error can put the base row at t = -1e-17, and envelopes use fractional powers.
    const t = THREE.MathUtils.clamp(pos.getY(i) / length, 0, 1);
    const x = pos.getX(i) * envelope(t);
    pos.setXYZ(i, x, pos.getY(i), Math.abs(x) * fold + curl * t * t * length);
  }
  g.computeVertexNormals();
  return g;
}
