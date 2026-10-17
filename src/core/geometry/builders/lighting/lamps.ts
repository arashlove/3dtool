import * as THREE from 'three';
import { lampShadeHeight } from '../../../schema/presets/accessories';
import { addPart, createContext, num, str, type Builder } from '../common';
import { lathe, mergeAll, place, tube, type P2 } from '../shapes';

/** [radius, y] profile of an open shade of the given shape, from the bottom rim to the top rim. */
function shadeProfile(shape: string, radius: number, height: number): P2[] {
  const steps = 8;
  const top = shape === 'cone' ? radius * 0.55 : radius * 0.96;
  return Array.from({ length: steps + 1 }, (_, k): P2 => {
    const t = k / steps;
    const r = shape === 'bell' ? radius * (0.48 + 0.52 * Math.pow(1 - t, 1.7)) : THREE.MathUtils.lerp(radius, top, t);
    return [r, t * height];
  });
}

/**
 * Table lamp: lathed gourd-shaped base, brass rod and socket, bulb, open fabric shade
 * held by a finial and three spokes. Mesh only; no light source is attached.
 */
export const buildLampTable: Builder = (spec) => {
  const ctx = createContext(spec);
  const height = num(spec, 'height');
  const R = num(spec, 'shadeRadius');
  const shape = str(spec, 'shadeShape');

  const shadeH = lampShadeHeight(R, shape);
  const shadeBottom = height - shadeH;
  const bulbY = shadeBottom + shadeH * 0.3;
  const socketTop = bulbY - 0.02;
  const socketBottom = socketTop - 0.045;
  const baseH = Math.max(0.05, Math.min(shadeBottom * 0.72, socketBottom - 0.03));
  const rb = THREE.MathUtils.clamp(R * 0.6, 0.05, 0.16);

  // Foot, a belly that peaks around 45% of the height, and a narrow neck with a flat cap.
  const body: P2[] = [
    [0, 0],
    [rb * 0.5, 0],
    [rb * 0.5, baseH * 0.04],
  ];
  for (let k = 1; k <= 14; k++) {
    const t = 0.06 + (0.94 * k) / 14;
    body.push([rb * (0.3 + 0.7 * Math.pow(Math.sin(Math.PI * t), 0.8)), baseH * t]);
  }
  body.push([rb * 0.18, baseH], [rb * 0.18, baseH + 0.01], [0, baseH + 0.01]);
  addPart(ctx, lathe(body, 36), 'base', 'base', [0, 0, 0]);

  const topR = shape === 'cone' ? R * 0.55 : shape === 'bell' ? R * 0.48 : R * 0.96;
  const stemBottom = baseH + 0.01;
  const stem: THREE.BufferGeometry[] = [
    place(new THREE.CylinderGeometry(0.017, 0.017, 0.045, 16), [0, (socketTop + socketBottom) / 2, 0]),
    // Rod continues through the bulb to a finial at the shade top, where three spokes hold the shade.
    place(new THREE.CylinderGeometry(0.004, 0.004, height - socketTop, 8), [0, (socketTop + height) / 2, 0]),
    place(new THREE.SphereGeometry(0.011, 12, 8), [0, height + 0.006, 0]),
  ];
  if (socketBottom - stemBottom > 0.002) {
    stem.push(place(new THREE.CylinderGeometry(0.007, 0.007, socketBottom - stemBottom, 12), [0, (socketBottom + stemBottom) / 2, 0]));
  }
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3;
    stem.push(tube([[0, height - 0.003, 0], [Math.cos(a) * topR * 0.97, height - 0.003, Math.sin(a) * topR * 0.97]], 0.0025, 0, 6));
  }
  addPart(ctx, mergeAll(stem), 'stem', 'stem', [0, 0, 0]);

  const bulb = new THREE.SphereGeometry(0.032, 20, 14);
  bulb.scale(1, 1.2, 1);
  addPart(ctx, bulb, 'bulb', 'bulb', [0, bulbY + 0.012, 0]);

  const shade = [
    lathe(shadeProfile(shape, R, shadeH), 48),
    place(new THREE.TorusGeometry(R, 0.003, 6, 48), [0, 0, 0], [Math.PI / 2, 0, 0]),
    place(new THREE.TorusGeometry(topR, 0.003, 6, 48), [0, shadeH, 0], [Math.PI / 2, 0, 0]),
  ];
  addPart(ctx, mergeAll(shade), 'shade', 'shade', [0, shadeBottom, 0]);
  return ctx.group;
};
