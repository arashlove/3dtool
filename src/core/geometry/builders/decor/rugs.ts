import * as THREE from 'three';
import { addPart, createContext, num, str, type Builder } from '../common';
import { mergeAll, place, roundedRect, roundedSlab } from '../shapes';

/** Rectangular rug with rounded corners; the pattern is a flat inlay just above the pile. */
export const buildRugRectangular: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const thickness = num(spec, 'thickness');
  const pattern = str(spec, 'pattern');

  addPart(ctx, roundedSlab(width, depth, thickness, 0.03, Math.min(thickness / 3, 0.004)), 'rug', 'rug', [0, 0, 0]);

  const y = thickness + 0.0008;
  const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
  if (pattern === 'border') {
    const m = Math.min(width, depth);
    const inset = m * 0.06;
    const band = m * 0.05;
    const ring = roundedRect(new THREE.Shape(), width - 2 * inset, depth - 2 * inset, 0.01);
    ring.holes.push(roundedRect(new THREE.Path(), width - 2 * inset - 2 * band, depth - 2 * inset - 2 * band, 0.005));
    addPart(ctx, flat(new THREE.ShapeGeometry(ring, 2)), 'pattern', 'border', [0, y, 0]);
  } else if (pattern === 'stripes') {
    const stripes = 5;
    const stripeW = width * 0.06;
    const span = width * 0.7;
    const bands = Array.from({ length: stripes }, (_, i) =>
      place(flat(new THREE.PlaneGeometry(stripeW, depth * 0.88)), [-span / 2 + (span * i) / (stripes - 1), 0, 0]),
    );
    addPart(ctx, mergeAll(bands), 'pattern', 'stripes', [0, y, 0]);
  }
  return ctx.group;
};
