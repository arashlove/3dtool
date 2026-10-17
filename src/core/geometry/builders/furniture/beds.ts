import * as THREE from 'three';
import { BED_MATTRESS_THICKNESS } from '../../../schema/presets/furniture';
import { addPart, bool, createContext, num, roundedBox, type Builder } from '../common';
import { mergeAll, place } from '../shapes';

/** Rounded box whose thickness falls off towards the edges, like a filled pillow. */
function pillowGeometry(width: number, height: number, depth: number) {
  const g = roundedBox(width, height, depth, Math.min(0.05, height * 0.45), 3);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const edge = Math.max(Math.pow((2 * Math.abs(pos.getX(i))) / width, 4), Math.pow((2 * Math.abs(pos.getZ(i))) / depth, 4));
    pos.setY(i, pos.getY(i) * (1 - 0.5 * edge));
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Platform bed, headboard at -Z and foot at +Z. The platform runs from the headboard
 * to the foot on low block feet; bedding is optional.
 */
export const buildBedPlatform: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const length = num(spec, 'length');
  const frameH = num(spec, 'frameHeight');
  const headTop = num(spec, 'headboardHeight');
  const legH = 0.08;
  const hbT = 0.08;
  const mT = BED_MATTRESS_THICKNESS;
  const bodyL = length - hbT;
  const bodyZ = hbT / 2;

  addPart(ctx, roundedBox(width, frameH - legH, bodyL, 0.02, 2), 'frame', 'platform', [0, legH + (frameH - legH) / 2, bodyZ]);
  const feet: THREE.BufferGeometry[] = [];
  const fx = width / 2 - 0.1;
  const fz = bodyL / 2 - 0.1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) feet.push(place(new THREE.BoxGeometry(0.06, legH, 0.06), [sx * fx, legH / 2, bodyZ + sz * fz]));
  addPart(ctx, mergeAll(feet), 'frame', 'feet', [0, 0, 0]);

  addPart(ctx, roundedBox(width - 0.05, mT, bodyL - 0.05, 0.05, 3), 'mattress', 'mattress', [0, frameH + mT / 2, bodyZ]);

  // Channel-tufted headboard: vertical upholstered channels across the width.
  const channels = Math.max(3, Math.round(width / 0.22));
  const cw = width / channels;
  const hbH = headTop - legH;
  const tufts = Array.from({ length: channels }, (_, i) =>
    place(roundedBox(cw - 0.004, hbH, hbT, Math.min(cw, hbT) * 0.45, 2), [-width / 2 + cw * (i + 0.5), 0, 0]),
  );
  addPart(ctx, mergeAll(tufts), 'headboard', 'headboard', [0, legH + hbH / 2, -length / 2 + hbT / 2]);

  if (bool(spec, 'hasBedding')) {
    const top = frameH + mT;
    const pillows = width >= 1.2 ? 2 : 1;
    const pw = Math.min(0.72, (width - 0.12 - 0.04 * (pillows - 1)) / pillows);
    const pd = 0.4;
    for (let i = 0; i < pillows; i++) {
      const x = pillows === 1 ? 0 : (i === 0 ? -1 : 1) * (pw / 2 + 0.02);
      addPart(ctx, pillowGeometry(pw, 0.13, pd), 'pillows', `pillow_${i + 1}`, [x, top + 0.07, -length / 2 + hbT + 0.03 + pd / 2], [0.28, 0, 0]);
    }
    // Duvet over the lower two thirds, hanging a little over the mattress sides, with a turned-down fold.
    const duvetL = bodyL * 0.66;
    addPart(ctx, roundedBox(width - 0.01, 0.2, duvetL, 0.05, 3), 'bedding', 'duvet', [0, top - 0.07, length / 2 - duvetL / 2]);
    addPart(ctx, roundedBox(width, 0.07, 0.2, 0.03, 2), 'bedding', 'duvet_fold', [0, top + 0.035, length / 2 - duvetL + 0.1]);
  }
  return ctx.group;
};
