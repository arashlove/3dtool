import * as THREE from 'three';
import { addPart, createContext, num, roundedBox, type Builder } from './common';

const CORNERS = [
  { name: 'front_left', sx: -1, sz: 1 },
  { name: 'front_right', sx: 1, sz: 1 },
  { name: 'back_left', sx: -1, sz: -1 },
  { name: 'back_right', sx: 1, sz: -1 },
] as const;

export const buildTable: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const height = num(spec, 'height');
  const topT = num(spec, 'topThickness');
  const legT = num(spec, 'legThickness');
  const inset = num(spec, 'legInset');

  addPart(ctx, roundedBox(width, topT, depth, Math.min(0.012, topT / 3), 3), 'top', 'top', [0, height - topT / 2, 0]);

  const legH = height - topT;
  const lx = width / 2 - inset - legT / 2;
  const lz = depth / 2 - inset - legT / 2;
  for (const c of CORNERS) {
    addPart(ctx, roundedBox(legT, legH, legT, legT * 0.15), 'legs', `leg_${c.name}`, [c.sx * lx, legH / 2, c.sz * lz]);
  }
  return ctx.group;
};

export const buildChair: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const seatH = num(spec, 'seatHeight');
  const backTop = num(spec, 'backHeight');
  const legT = num(spec, 'legThickness');
  const seatT = 0.05;
  const backT = 0.035;

  addPart(ctx, roundedBox(width, seatT, depth, 0.018, 3), 'seat', 'seat', [0, seatH - seatT / 2, 0]);

  const legH = seatH - seatT;
  const lx = width / 2 - 0.03 - legT / 2;
  const lz = depth / 2 - 0.03 - legT / 2;
  for (const c of CORNERS) {
    addPart(ctx, roundedBox(legT, legH, legT, legT * 0.2), 'legs', `leg_${c.name}`, [c.sx * lx, legH / 2, c.sz * lz]);
  }

  const backH = backTop - seatH;
  const tilt = -0.08;
  const back = addPart(ctx, roundedBox(width * 0.96, backH, backT, 0.015, 3), 'back', 'back', [0, 0, 0], [tilt, 0, 0]);
  // Pivot the tilted backrest around its bottom edge so it rests on the seat's rear edge.
  back.position.set(0, seatH + (backH / 2) * Math.cos(tilt), -depth / 2 + backT / 2 + (backH / 2) * Math.sin(tilt));
  return ctx.group;
};

export const buildShelf: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const height = num(spec, 'height');
  const count = Math.round(num(spec, 'shelfCount'));
  const p = num(spec, 'panelThickness');
  const hasBack = spec.params.hasBack === true;

  for (const side of [-1, 1] as const) {
    addPart(ctx, new THREE.BoxGeometry(p, height, depth), 'frame', side < 0 ? 'side_left' : 'side_right', [
      side * (width / 2 - p / 2),
      height / 2,
      0,
    ]);
  }

  const boardDepth = hasBack ? depth - p : depth;
  const boardZ = hasBack ? p / 2 : 0;
  const innerWidth = width - 2 * p;
  const step = (height - p) / (count - 1);
  for (let i = 0; i < count; i++) {
    addPart(ctx, new THREE.BoxGeometry(innerWidth, p, boardDepth), 'shelves', `board_${i + 1}`, [0, p / 2 + i * step, boardZ]);
  }

  if (hasBack) {
    addPart(ctx, new THREE.BoxGeometry(innerWidth, height, p), 'back', 'back_panel', [0, height / 2, -depth / 2 + p / 2]);
  }
  return ctx.group;
};

export const buildLamp: Builder = (spec) => {
  const ctx = createContext(spec);
  const height = num(spec, 'height');
  const baseR = num(spec, 'baseRadius');
  const shadeR = num(spec, 'shadeRadius');
  const shadeH = num(spec, 'shadeHeight');
  const baseH = Math.min(0.04, height * 0.05);

  const basePoints = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(baseR, 0),
    new THREE.Vector2(baseR, baseH * 0.6),
    new THREE.Vector2(baseR * 0.85, baseH),
    new THREE.Vector2(0, baseH),
  ];
  addPart(ctx, new THREE.LatheGeometry(basePoints, 48), 'base', 'base', [0, 0, 0]);

  const stemR = Math.max(0.006, Math.min(0.015, baseR * 0.1));
  const stemTop = height - shadeH * 0.55;
  const stemH = stemTop - baseH;
  addPart(ctx, new THREE.CylinderGeometry(stemR, stemR, stemH, 20), 'stem', 'stem', [0, baseH + stemH / 2, 0]);

  const shadePoints: THREE.Vector2[] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = shadeR - (shadeR * 0.35) * t + Math.sin(t * Math.PI) * shadeR * 0.03;
    shadePoints.push(new THREE.Vector2(r, t * shadeH));
  }
  addPart(ctx, new THREE.LatheGeometry(shadePoints, 48), 'shade', 'shade', [0, height - shadeH, 0]);
  return ctx.group;
};

export const buildSofa: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const seatH = num(spec, 'seatHeight');
  const backTop = num(spec, 'backHeight');
  const armW = num(spec, 'armWidth');
  const legH = 0.07;
  const cushionT = 0.12;
  const backT = Math.min(0.22, depth * 0.25);
  const baseTop = seatH - cushionT;
  const baseH = baseTop - legH;

  addPart(ctx, roundedBox(width, baseH, depth, 0.03, 3), 'body', 'base', [0, legH + baseH / 2, 0]);

  const innerW = width - 2 * armW;
  const backH = backTop - baseTop;
  addPart(ctx, roundedBox(innerW, backH, backT, 0.05, 4), 'body', 'back', [0, baseTop + backH / 2, -depth / 2 + backT / 2]);

  const armH = Math.min(seatH + 0.2, backTop) - legH;
  for (const side of [-1, 1] as const) {
    addPart(ctx, roundedBox(armW, armH, depth, 0.05, 4), 'body', side < 0 ? 'arm_left' : 'arm_right', [
      side * (width / 2 - armW / 2),
      legH + armH / 2,
      0,
    ]);
  }

  const cushionCount = innerW > 1.6 ? 3 : innerW > 0.9 ? 2 : 1;
  const cw = innerW / cushionCount;
  const cd = depth - backT - 0.02;
  for (let i = 0; i < cushionCount; i++) {
    addPart(ctx, roundedBox(cw - 0.012, cushionT, cd, 0.045, 4), 'cushions', `cushion_${i + 1}`, [
      -innerW / 2 + cw * (i + 0.5),
      seatH - cushionT / 2,
      -depth / 2 + backT + cd / 2 + 0.01,
    ]);
  }

  const lx = width / 2 - 0.08;
  const lz = depth / 2 - 0.08;
  for (const c of CORNERS) {
    addPart(ctx, new THREE.CylinderGeometry(0.022, 0.016, legH, 12), 'legs', `leg_${c.name}`, [c.sx * lx, legH / 2, c.sz * lz]);
  }
  return ctx.group;
};
