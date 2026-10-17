import * as THREE from 'three';
import { addPart, createContext, num, roundedBox, str, type Builder } from '../common';
import { CORNERS, bendTowardsFront, place, roundedSlab, taperedBox } from '../shapes';

/** Dining chair: tapered front legs, rear legs continuing into raked back posts, two curved back rails. */
export const buildDiningChair: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const seatH = num(spec, 'seatHeight');
  const backTop = num(spec, 'backHeight');
  const legT = 0.035;
  const seatT = 0.04;
  const rake = 0.12;

  const lx = width / 2 - legT / 2 - 0.012;
  const lz = depth / 2 - legT / 2 - 0.012;

  addPart(ctx, roundedSlab(width, depth, seatT, 0.03, 0.008), 'seat', 'seat', [0, seatH - seatT, 0]);

  const frontH = seatH - seatT;
  for (const sx of [-1, 1]) {
    const side = sx < 0 ? 'left' : 'right';
    addPart(ctx, taperedBox(legT, legT, legT * 0.7, legT * 0.7, frontH), 'legs', `leg_front_${side}`, [sx * lx, frontH / 2, lz]);
    addPart(ctx, taperedBox(legT, legT, legT * 0.75, legT * 0.75, seatH), 'legs', `leg_back_${side}`, [sx * lx, seatH / 2, -lz]);
  }

  // Back posts lean back by `rake` from the seat; rails follow the same lean.
  const postL = (backTop - seatH) / Math.cos(rake);
  const along = (s: number): [number, number, number] => [0, seatH + s * Math.cos(rake), -lz - s * Math.sin(rake)];
  for (const sx of [-1, 1]) {
    const [, y, z] = along(postL / 2);
    addPart(ctx, new THREE.BoxGeometry(legT * 0.9, postL, legT * 0.9), 'legs', `post_${sx < 0 ? 'left' : 'right'}`, [sx * lx, y, z], [
      -rake,
      0,
      0,
    ]);
  }

  const bendRadius = 0.6;
  const sag = (lx * lx) / (2 * bendRadius);
  const rails = [
    { name: 'top_rail', h: Math.min(0.12, postL * 0.3), s: 0 },
    { name: 'mid_rail', h: 0.05, s: postL * 0.45 },
  ];
  rails[0].s = postL - 0.02 - rails[0].h / 2;
  for (const rail of rails) {
    // Ends meet the posts; the centre curves back away from the sitter.
    const g = bendTowardsFront(place(new THREE.BoxGeometry(2 * lx, rail.h, 0.018, 12, 1, 1), [0, 0, -sag]), bendRadius);
    addPart(ctx, g, 'backrest', rail.name, along(rail.s), [-rake, 0, 0]);
  }

  for (const sx of [-1, 1]) {
    addPart(ctx, new THREE.BoxGeometry(0.018, 0.022, 2 * lz), 'legs', `stretcher_${sx < 0 ? 'left' : 'right'}`, [sx * lx, 0.15, 0]);
  }
  return ctx.group;
};

const ARM_WIDTH: Record<string, number> = { track: 0.16, rolled: 0.18, slim: 0.07, none: 0 };

/** Two-seat sofa: base and back frame, seat and back cushions, arms by style, tapered feet. */
export const buildSofaTwoSeater: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const seatH = num(spec, 'seatHeight');
  const backTop = num(spec, 'backHeight');
  const armStyle = str(spec, 'armStyle');
  const armW = ARM_WIDTH[armStyle] ?? 0;

  const legH = 0.1;
  const cushionT = 0.13;
  const baseTop = seatH - cushionT;
  const baseH = baseTop - legH;
  const backT = 0.16;
  const innerW = width - 2 * armW;

  addPart(ctx, roundedBox(width - 0.01, baseH, depth, 0.03, 2), 'frame', 'base', [0, legH + baseH / 2, 0]);
  const backFrameTop = backTop - 0.06;
  addPart(ctx, roundedBox(Math.min(width - 0.01, innerW + 0.02), backFrameTop - baseTop, backT, 0.04, 2), 'frame', 'back_frame', [
    0,
    (baseTop + backFrameTop) / 2,
    -depth / 2 + backT / 2,
  ]);

  const armTop = Math.min(seatH + 0.2, backTop - 0.04);
  for (const sx of [-1, 1]) {
    if (armW === 0) break;
    const name = sx < 0 ? 'left_armrest' : 'right_armrest';
    const x = sx * (width / 2 - armW / 2);
    if (armStyle === 'rolled') {
      const rr = armW * 0.55;
      const bodyTop = armTop - rr;
      addPart(ctx, roundedBox(armW * 0.9, bodyTop - legH, depth - 0.02, 0.03, 2), 'arms', `${name}_body`, [x, (legH + bodyTop) / 2, 0]);
      const roll = new THREE.CapsuleGeometry(rr, depth - 2 * rr, 6, 20);
      addPart(ctx, roll, 'arms', `${name}_roll`, [sx * (width / 2 - rr), bodyTop, 0], [Math.PI / 2, 0, 0]);
    } else {
      const radius = armStyle === 'slim' ? 0.025 : 0.04;
      addPart(ctx, roundedBox(armW, armTop - legH, depth, radius, armStyle === 'slim' ? 2 : 3), 'arms', name, [x, (legH + armTop) / 2, 0]);
    }
  }

  const count = innerW >= 1 ? 2 : 1;
  const cw = innerW / count;
  const seatD = depth - backT;
  const backCushionH = backTop - seatH - 0.01;
  const backCushionT = 0.16;
  const tilt = 0.2;
  const backZ = -depth / 2 + backT + backCushionT / 2 - 0.02;
  for (let i = 0; i < count; i++) {
    const x = -innerW / 2 + cw * (i + 0.5);
    addPart(ctx, roundedBox(cw - 0.012, cushionT, seatD, 0.05, 3), 'cushions', `seat_cushion_${i + 1}`, [
      x,
      seatH - cushionT / 2,
      -depth / 2 + backT + seatD / 2,
    ]);
    addPart(ctx, roundedBox(cw - 0.015, backCushionH, backCushionT, 0.06, 3), 'cushions', `back_cushion_${i + 1}`, [
      x,
      seatH + (backCushionH / 2) * Math.cos(tilt),
      backZ - (backCushionH / 2) * Math.sin(tilt),
    ], [-tilt, 0, 0]);
  }

  const lx = width / 2 - 0.07;
  const lz = depth / 2 - 0.07;
  for (const c of CORNERS) {
    addPart(ctx, new THREE.CylinderGeometry(0.02, 0.014, legH, 12), 'legs', `leg_${c.name}`, [c.sx * lx, legH / 2, c.sz * lz]);
  }
  return ctx.group;
};
