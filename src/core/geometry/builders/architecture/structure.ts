import * as THREE from 'three';
import { addPart, createContext, num, str, type Builder } from '../common';
import { hash01, mergeAll, place, profileAlongX, quadPoints, type P2 } from '../shapes';

/** Upper bound on planks/tiles per floor; large floors get proportionally larger pieces. */
const MAX_FLOOR_PIECES = 600;

type Piece = { x: number; z: number; w: number; d: number };

/** Clips [a0, a1] to [lo, hi] and opens a joint gap on edges that are not the floor boundary. */
function clipSpan(a0: number, a1: number, lo: number, hi: number, gap: number): [number, number] | null {
  let a = Math.max(a0, lo);
  let b = Math.min(a1, hi);
  if (a > lo + 1e-9) a += gap / 2;
  if (b < hi - 1e-9) b -= gap / 2;
  return b - a > 0.002 ? [a, b] : null;
}

/** Staggered planks running along X, with a deterministic offset per row. */
function plankLayout(width: number, depth: number): Piece[] {
  let plankW = 0.19;
  let plankL = 1.2;
  const estimate = (width / plankL + 1) * (depth / plankW);
  if (estimate > MAX_FLOOR_PIECES) {
    const s = Math.sqrt(estimate / MAX_FLOOR_PIECES);
    plankW *= s;
    plankL *= s;
  }
  const gap = 0.003;
  const pieces: Piece[] = [];
  const rows = Math.ceil(depth / plankW - 1e-6);
  for (let r = 0; r < rows; r++) {
    const zs = clipSpan(-depth / 2 + r * plankW, -depth / 2 + (r + 1) * plankW, -depth / 2, depth / 2, gap);
    if (!zs) continue;
    for (let x0 = -width / 2 - hash01(r) * plankL; x0 < width / 2 - 1e-6; x0 += plankL) {
      const xs = clipSpan(x0, x0 + plankL, -width / 2, width / 2, gap);
      if (xs) pieces.push({ x: (xs[0] + xs[1]) / 2, z: (zs[0] + zs[1]) / 2, w: xs[1] - xs[0], d: zs[1] - zs[0] });
    }
  }
  return pieces;
}

/** Square tile grid centred on the floor. */
function tileLayout(width: number, depth: number): Piece[] {
  let size = 0.6;
  const estimate = Math.ceil(width / size) * Math.ceil(depth / size);
  if (estimate > MAX_FLOOR_PIECES) size *= Math.sqrt(estimate / MAX_FLOOR_PIECES);
  const gap = 0.004;
  const nx = Math.ceil(width / size - 1e-6) + 1;
  const nz = Math.ceil(depth / size - 1e-6) + 1;
  const pieces: Piece[] = [];
  for (let i = 0; i < nx; i++) {
    const xs = clipSpan((i - nx / 2) * size, (i + 1 - nx / 2) * size, -width / 2, width / 2, gap);
    if (!xs) continue;
    for (let j = 0; j < nz; j++) {
      const zs = clipSpan((j - nz / 2) * size, (j + 1 - nz / 2) * size, -depth / 2, depth / 2, gap);
      if (zs) pieces.push({ x: (xs[0] + xs[1]) / 2, z: (zs[0] + zs[1]) / 2, w: xs[1] - xs[0], d: zs[1] - zs[0] });
    }
  }
  return pieces;
}

/** Floor slab. Planks and tiles are one merged mesh over a darker base that shows through the joints. */
export const buildRoomFloor: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const thickness = num(spec, 'thickness');
  const surface = str(spec, 'surface');

  if (surface === 'plain') {
    addPart(ctx, new THREE.BoxGeometry(width, thickness, depth), 'surface', 'floor', [0, thickness / 2, 0]);
    return ctx.group;
  }

  const top = Math.min(0.012, thickness * 0.4);
  const baseT = thickness - top;
  addPart(ctx, new THREE.BoxGeometry(width, baseT, depth), 'base', 'subfloor', [0, baseT / 2, 0]);
  const pieces = surface === 'tiles' ? tileLayout(width, depth) : plankLayout(width, depth);
  const geometry = mergeAll(pieces.map((p) => place(new THREE.BoxGeometry(p.w, top, p.d), [p.x, 0, p.z])));
  addPart(ctx, geometry, 'surface', surface, [0, baseT + top / 2, 0]);
  return ctx.group;
};

const SKIRTING_H = 0.09;
const SKIRTING_D = 0.014;
const SKIRTING_PROFILE: P2[] = [
  [0, 0],
  [SKIRTING_D, 0],
  [SKIRTING_D, SKIRTING_H - 0.02],
  ...quadPoints([SKIRTING_D, SKIRTING_H - 0.02], [SKIRTING_D, SKIRTING_H], [SKIRTING_D * 0.3, SKIRTING_H]),
  [0, SKIRTING_H],
];

const CROWN_H = 0.08;
const CROWN_D = 0.06;
/** Cove moulding: concave face between a small fillet at the wall and one at the ceiling. */
const CROWN_PROFILE: P2[] = [
  [0, 0],
  [0.006, 0],
  ...quadPoints([0.006, 0], [0.006 + (CROWN_D - 0.006) * 0.15, (CROWN_H - 0.008) * 0.85], [CROWN_D, CROWN_H - 0.008], 6),
  [CROWN_D, CROWN_H],
  [0, CROWN_H],
];

/** Wall slab centred on its length; trim runs along the +Z face. */
export const buildRoomWall: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const height = num(spec, 'height');
  const thickness = num(spec, 'thickness');
  const trim = str(spec, 'trim');

  addPart(ctx, new THREE.BoxGeometry(width, height, thickness), 'wall', 'wall', [0, height / 2, 0]);
  if (trim !== 'none') {
    const pieces = [place(profileAlongX(SKIRTING_PROFILE, width), [0, 0, thickness / 2])];
    if (trim === 'skirting_crown') pieces.push(place(profileAlongX(CROWN_PROFILE, width), [0, height - CROWN_H, thickness / 2]));
    addPart(ctx, mergeAll(pieces), 'trim', trim === 'skirting' ? 'skirting' : 'skirting_and_crown', [0, 0, 0]);
  }
  return ctx.group;
};

/** Ceiling slab whose underside sits at `height`, so it lines up with walls placed at the same origin. */
export const buildRoomCeiling: Builder = (spec) => {
  const ctx = createContext(spec);
  const thickness = num(spec, 'thickness');
  addPart(ctx, new THREE.BoxGeometry(num(spec, 'width'), thickness, num(spec, 'depth')), 'ceiling', 'ceiling', [
    0,
    num(spec, 'height') + thickness / 2,
    0,
  ]);
  return ctx.group;
};
