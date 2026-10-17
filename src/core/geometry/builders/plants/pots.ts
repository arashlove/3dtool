import * as THREE from 'three';
import { addPart, createContext, num, str, type Builder } from '../common';
import { BLADE_ENVELOPE, LEAFY_ENVELOPE, hash01, lathe, leafGeometry, mergeAll, place, type P2 } from '../shapes';

const GOLDEN_ANGLE = 2.39996;

/** Outer pot radius at relative height t (0 = bottom, 1 = rim) for each pot shape. */
function outerRadius(shape: string, R: number, t: number): number {
  switch (shape) {
    case 'cylinder':
      return R * 0.97;
    case 'bowl':
      return R * (0.5 + 0.5 * Math.sin((t * Math.PI) / 2));
    case 'round':
      return R * (0.75 + 0.42 * Math.sin(Math.PI * (0.15 + 0.7 * t)));
    default:
      return R * (0.72 + 0.28 * t);
  }
}

/** Closed lathe profile: outer wall, rolled rim, inner wall and floor, so the pot is hollow. */
function potProfile(shape: string, R: number, h: number): P2[] {
  const wall = Math.max(0.006, R * 0.06);
  const bottomT = Math.max(0.01, h * 0.06);
  const lip = Math.max(0.004, R * 0.04);
  const rimH = Math.min(0.03, h * 0.1);
  const steps = 10;
  const pts: P2[] = [
    [0, 0],
    [outerRadius(shape, R, 0) * 0.94, 0],
  ];
  for (let k = 0; k <= steps; k++) {
    const y = 0.006 + ((h - rimH - 0.006) * k) / steps;
    pts.push([outerRadius(shape, R, y / h), y]);
  }
  const rimR = outerRadius(shape, R, 1);
  pts.push([rimR + lip, h - rimH], [rimR + lip, h], [rimR - wall, h]);
  for (let k = steps; k >= 0; k--) {
    const y = bottomT + ((h - bottomT) * k) / steps;
    pts.push([Math.max(0.002, outerRadius(shape, R, y / h) - wall), y]);
  }
  pts.push([0, bottomT]);
  return pts;
}

/** Leaves fanned out with the golden angle; outer leaves lean further out. Seeded, so rebuilds match. */
function leafyPlant(R: number, h: number, baseY: number) {
  const count = 11;
  const length = THREE.MathUtils.clamp(R * 1.6 + h * 0.9, 0.15, 0.7);
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const len = length * (0.7 + 0.3 * hash01(i));
    const leaf = leafGeometry(len, len * 0.42, LEAFY_ENVELOPE, 0.25 + 0.2 * hash01(i + 7), 0.25);
    leaves.push(place(leaf, [0, baseY, 0], [0.25 + 0.75 * Math.pow(u, 0.9), i * GOLDEN_ANGLE, 0], 'YXZ'));
  }
  return mergeAll(leaves);
}

/** Upright sword-shaped blades (snake-plant style) rising from slightly different spots. */
function spikyPlant(R: number, h: number, baseY: number) {
  const count = 8;
  const length = THREE.MathUtils.clamp(R * 2 + h * 1.4, 0.2, 0.9);
  const bladeW = Math.max(0.03, R * 0.35);
  const blades: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = i * GOLDEN_ANGLE;
    const off = R * 0.35 * hash01(i + 11);
    const blade = leafGeometry(length * (0.6 + 0.4 * hash01(i + 3)), bladeW, BLADE_ENVELOPE, 0.04, 0.5, 8);
    blades.push(place(blade, [Math.cos(a) * off, baseY, Math.sin(a) * off], [0.06 + 0.22 * hash01(i), a, 0], 'YXZ'));
  }
  return mergeAll(blades);
}

/** Hollow lathed pot, a soil disc, and an optional stylised plant. */
export const buildPlantPot: Builder = (spec) => {
  const ctx = createContext(spec);
  const R = num(spec, 'radius');
  const h = num(spec, 'height');
  const shape = str(spec, 'shape');
  const foliage = str(spec, 'foliage');

  addPart(ctx, lathe(potProfile(shape, R, h), 40), 'pot', 'pot', [0, 0, 0]);

  const soilY = h * 0.86;
  const soilR = Math.max(0.004, outerRadius(shape, R, soilY / h) - Math.max(0.006, R * 0.06));
  addPart(ctx, new THREE.CircleGeometry(soilR, 32).rotateX(-Math.PI / 2), 'soil', 'soil', [0, soilY, 0]);

  if (foliage === 'leafy') addPart(ctx, leafyPlant(R, h, soilY - 0.01), 'foliage', 'leaves', [0, 0, 0]);
  else if (foliage === 'spiky') addPart(ctx, spikyPlant(R, h, soilY - 0.01), 'foliage', 'blades', [0, 0, 0]);
  return ctx.group;
};
