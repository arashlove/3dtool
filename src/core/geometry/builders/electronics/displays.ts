import * as THREE from 'three';
import { addPart, createContext, num, roundedBox, str, type Builder } from '../common';
import { mergeAll, place, roundedSlab } from '../shapes';

/**
 * Flat-screen TV facing +Z: thin front shell with a slim bezel, a smaller rear housing,
 * and a pedestal, two V-shaped feet, or a wall bracket behind it.
 */
export const buildTelevisionFlat: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const height = num(spec, 'height');
  const depth = num(spec, 'depth');
  const mount = str(spec, 'mountStyle');

  const standH = mount === 'stand' ? 0.09 : mount === 'feet' ? 0.07 : 0;
  const shell = Math.min(0.014, depth);
  const cy = standH + height / 2;

  const body = [place(roundedBox(width, height, shell, 0.003, 2), [0, cy, depth / 2 - shell / 2])];
  const rearD = depth - shell;
  if (rearD > 0.004) {
    body.push(place(roundedBox(width * 0.84, height * 0.72, rearD, Math.min(0.02, rearD / 2.2), 2), [0, standH + height * 0.46, -depth / 2 + rearD / 2]));
  }
  addPart(ctx, mergeAll(body), 'bezel', 'body', [0, 0, 0]);

  const bezel = Math.min(0.01, width * 0.01);
  addPart(ctx, new THREE.PlaneGeometry(width - 2 * bezel, height - 2 * bezel), 'screen', 'screen', [0, cy, depth / 2 + 0.0006]);

  if (mount === 'stand') {
    const neckH = standH + height * 0.3;
    addPart(
      ctx,
      mergeAll([
        roundedSlab(Math.min(0.42, width * 0.38), Math.min(0.26, depth + 0.2), 0.016, 0.03, 0.004),
        place(roundedBox(0.07, neckH, 0.025, 0.006, 1), [0, neckH / 2, depth / 2 - shell - 0.0125]),
      ]),
      'stand',
      'pedestal',
      [0, 0, 0],
    );
  } else if (mount === 'feet') {
    const feet: THREE.BufferGeometry[] = [];
    const apexY = standH + 0.03;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const dz = -sz * 0.11;
        const dy = apexY - 0.006;
        feet.push(
          place(new THREE.BoxGeometry(0.022, Math.hypot(dz, dy), 0.012), [sx * width * 0.38, (apexY + 0.006) / 2, sz * 0.055], [Math.atan2(dz, dy), 0, 0]),
        );
      }
    }
    addPart(ctx, mergeAll(feet), 'stand', 'feet', [0, 0, 0]);
  } else {
    addPart(ctx, new THREE.BoxGeometry(Math.min(0.4, width * 0.3), Math.min(0.3, height * 0.4), 0.012), 'stand', 'wall_bracket', [
      0,
      cy,
      -depth / 2 - 0.006,
    ]);
  }
  return ctx.group;
};
