import * as THREE from 'three';
import { addPart, bool, createContext, num, roundedBox, str, type Builder } from '../common';
import { frameRing, mergeAll, place } from '../shapes';

const PICTURE_DEPTH = 0.03;

/** Flat placeholder artwork shapes (one colour, the "accent" slot), centred in an aw x ah area. */
function artShapes(style: string, aw: number, ah: number): THREE.BufferGeometry {
  const m = Math.min(aw, ah);
  if (style === 'landscape') {
    const hills = new THREE.Shape();
    hills.moveTo(-aw / 2, -ah / 2);
    const steps = 24;
    for (let k = 0; k <= steps; k++) {
      const x = -aw / 2 + (aw * k) / steps;
      const u = k / steps;
      hills.lineTo(x, -ah * 0.12 + ah * 0.08 * Math.sin(u * Math.PI * 2.4 + 0.6) + ah * 0.04 * Math.sin(u * Math.PI * 5.3));
    }
    hills.lineTo(aw / 2, -ah / 2);
    hills.lineTo(-aw / 2, -ah / 2);
    return mergeAll([new THREE.ShapeGeometry(hills, 4), place(new THREE.CircleGeometry(m * 0.1, 32), [aw * 0.22, ah * 0.24, 0])]);
  }
  if (style === 'minimal') {
    return mergeAll([
      place(new THREE.PlaneGeometry(aw * 0.22, ah * 0.6), [-aw * 0.12, 0, 0]),
      place(new THREE.PlaneGeometry(aw * 0.02, ah * 0.6), [aw * 0.12, 0, 0]),
    ]);
  }
  return mergeAll([
    place(new THREE.CircleGeometry(m * 0.26, 48), [aw * 0.14, ah * 0.12, 0]),
    place(new THREE.CircleGeometry(m * 0.09, 32), [-aw * 0.24, -ah * 0.02, 0]),
    place(new THREE.PlaneGeometry(aw * 0.82, ah * 0.07), [0, -ah * 0.24, 0]),
  ]);
}

/**
 * Framed picture facing +Z: bevelled moulding, hardboard back, optional mat, and generated
 * placeholder art (background colour plus accent shapes). No images are loaded.
 */
export const buildPictureFramed: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const height = num(spec, 'height');
  const fw = num(spec, 'frameThickness');
  const innerW = width - 2 * fw;
  const innerH = height - 2 * fw;
  const cy = height / 2;

  addPart(
    ctx,
    mergeAll([
      frameRing(width, height, innerW, innerH, PICTURE_DEPTH, Math.min(0.004, fw / 4)),
      place(new THREE.BoxGeometry(innerW + 0.004, innerH + 0.004, 0.004), [0, 0, -PICTURE_DEPTH / 2 + 0.004]),
    ]),
    'frame',
    'frame',
    [0, cy, 0],
  );

  let aw = innerW;
  let ah = innerH;
  if (bool(spec, 'hasMat')) {
    const mw = Math.min(innerW, innerH) * 0.12;
    addPart(ctx, new THREE.BoxGeometry(innerW + 0.002, innerH + 0.002, 0.004), 'mat', 'mat', [0, cy, 0.004]);
    aw = innerW - 2 * mw;
    ah = innerH - 2 * mw;
  }
  addPart(ctx, new THREE.PlaneGeometry(aw, ah), 'art', 'art', [0, cy, 0.0065]);
  addPart(ctx, artShapes(str(spec, 'artStyle'), aw, ah), 'accent', 'art_shapes', [0, cy, 0.007]);
  return ctx.group;
};

/**
 * Rectangular mirror facing +Z. The glass is a glossy metallic material; the editor has no
 * reflection probe, so it reads as a mirror-like sheen rather than a true reflection.
 */
export const buildMirrorRectangular: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const height = num(spec, 'height');
  const fw = num(spec, 'frameThickness');
  const depth = 0.025;
  const cy = height / 2;

  if (fw >= 0.005) {
    addPart(ctx, frameRing(width, height, width - 2 * fw, height - 2 * fw, depth, Math.min(0.004, fw / 4)), 'frame', 'frame', [0, cy, 0]);
    addPart(ctx, new THREE.BoxGeometry(width - 2 * fw + 0.004, height - 2 * fw + 0.004, 0.006), 'glass', 'glass', [0, cy, 0.002]);
  } else {
    // Frameless: bevelled glass on a hidden mounting plate (the "frame" slot).
    addPart(ctx, roundedBox(width, height, 0.008, 0.003, 2), 'glass', 'glass', [0, cy, 0.004]);
    addPart(ctx, new THREE.BoxGeometry(width - 0.04, height - 0.04, 0.012), 'frame', 'mounting_plate', [0, cy, -0.006]);
  }
  return ctx.group;
};
