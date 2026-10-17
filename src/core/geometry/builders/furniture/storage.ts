import * as THREE from 'three';
import {
  BOOKSHELF_PANEL,
  BOOKSHELF_PLINTH,
  NIGHTSTAND_LEG_HEIGHT,
  NIGHTSTAND_TOP_THICKNESS,
} from '../../../schema/presets/furniture';
import { addPart, bool, createContext, num, roundedBox, type Builder } from '../common';
import { barHandle, knob, mergeAll, place, roundedSlab, taperedBox } from '../shapes';

/** Open bookcase: full-height sides, top, raised bottom over a recessed plinth, evenly spaced shelves. */
export const buildBookshelfOpen: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const height = num(spec, 'height');
  const depth = num(spec, 'depth');
  const levels = Math.round(num(spec, 'shelfCount'));
  const hasBack = bool(spec, 'hasBack');
  const p = BOOKSHELF_PANEL;
  const plinth = BOOKSHELF_PLINTH;
  const backT = 0.006;
  const innerW = width - 2 * p;

  const frame = [
    place(new THREE.BoxGeometry(p, height, depth), [-(width / 2 - p / 2), height / 2, 0]),
    place(new THREE.BoxGeometry(p, height, depth), [width / 2 - p / 2, height / 2, 0]),
    place(new THREE.BoxGeometry(innerW, p, depth), [0, height - p / 2, 0]),
    place(new THREE.BoxGeometry(innerW, p, depth), [0, plinth + p / 2, 0]),
    place(new THREE.BoxGeometry(innerW, plinth, p), [0, plinth / 2, depth / 2 - 0.02 - p / 2]),
  ];
  addPart(ctx, mergeAll(frame), 'frame', 'carcass', [0, 0, 0]);

  if (levels > 1) {
    const bottom = plinth + p;
    const gap = (height - p - bottom) / levels;
    const boardD = hasBack ? depth - backT - 0.01 : depth - 0.01;
    const boardZ = depth / 2 - 0.005 - boardD / 2;
    const boards = Array.from({ length: levels - 1 }, (_, i) =>
      place(new THREE.BoxGeometry(innerW - 0.002, p, boardD), [0, bottom + (i + 1) * gap, boardZ]),
    );
    addPart(ctx, mergeAll(boards), 'shelves', 'shelves', [0, 0, 0]);
  }

  if (hasBack) {
    addPart(ctx, new THREE.BoxGeometry(innerW, height - plinth, backT), 'back', 'back_panel', [
      0,
      plinth + (height - plinth) / 2,
      -depth / 2 + backT / 2,
    ]);
  }
  return ctx.group;
};

/** Cabinet: top slab, carcass on a recessed plinth, flush doors with bar handles at the meeting edges. */
export const buildCabinet: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const height = num(spec, 'height');
  const depth = num(spec, 'depth');
  const doors = Math.round(num(spec, 'doorCount'));
  const plinthH = 0.08;
  const topT = 0.022;
  const doorT = 0.018;
  const gap = 0.003;
  const carcH = height - plinthH - topT;

  addPart(
    ctx,
    mergeAll([
      place(roundedSlab(width, depth, topT, 0.004, 0.003), [0, height - topT, 0]),
      place(new THREE.BoxGeometry(width - 0.004, carcH, depth - doorT - 0.002), [0, plinthH + carcH / 2, -(doorT + 0.002) / 2]),
      place(new THREE.BoxGeometry(width - 0.06, plinthH, depth - 0.08), [0, plinthH / 2, -0.03]),
    ]),
    'body',
    'carcass',
    [0, 0, 0],
  );

  const frontW = width - 0.004;
  const dw = (frontW - gap * (doors - 1)) / doors;
  const dh = carcH - 2 * gap;
  const doorY = plinthH + carcH / 2;
  const handleL = Math.min(0.16, dh * 0.4);
  // Base units get handles near the top of the doors; tall units at a comfortable 1.05 m.
  const handleY = Math.max(doorY - dh / 2 + handleL / 2 + 0.05, Math.min(doorY + dh / 2 - 0.08 - handleL / 2, 1.05));
  const handles: THREE.BufferGeometry[] = [];
  for (let i = 0; i < doors; i++) {
    const x = -frontW / 2 + dw / 2 + i * (dw + gap);
    addPart(ctx, roundedBox(dw, dh, doorT, 0.003, 1), 'doors', `door_${i + 1}`, [x, doorY, depth / 2 - doorT / 2]);
    const latch = doors === 1 || i < doors / 2 ? 1 : -1;
    handles.push(place(barHandle(handleL, true), [x + latch * (dw / 2 - 0.04), handleY, depth / 2]));
  }
  addPart(ctx, mergeAll(handles), 'handles', 'handles', [0, 0, 0]);
  return ctx.group;
};

/** Wall shelf board, back edge at -Z. With brackets, the board sits on top of them. */
export const buildFloatingShelf: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const t = num(spec, 'thickness');
  const brackets = bool(spec, 'hasBrackets');
  const bh = brackets ? 0.14 : 0;

  addPart(ctx, roundedBox(width, t, depth, Math.min(0.004, t / 4), 2), 'board', 'board', [0, bh + t / 2, 0]);

  if (brackets) {
    const parts: THREE.BufferGeometry[] = [];
    const back = -depth / 2;
    const braceFrom: [number, number] = [back + 0.004, 0.025];
    const braceTo: [number, number] = [back + depth * 0.6, bh - 0.004];
    const dz = braceTo[0] - braceFrom[0];
    const dy = braceTo[1] - braceFrom[1];
    for (const sx of [-1, 1]) {
      const x = sx * (width / 2 - Math.min(0.15, width * 0.2));
      parts.push(place(new THREE.BoxGeometry(0.025, bh, 0.004), [x, bh / 2, back + 0.002]));
      parts.push(place(new THREE.BoxGeometry(0.025, 0.004, depth * 0.85), [x, bh - 0.002, back + depth * 0.425]));
      parts.push(
        place(
          new THREE.BoxGeometry(0.012, Math.hypot(dz, dy), 0.004),
          [x, (braceFrom[1] + braceTo[1]) / 2, (braceFrom[0] + braceTo[0]) / 2],
          [Math.atan2(dz, dy), 0, 0],
        ),
      );
    }
    addPart(ctx, mergeAll(parts), 'brackets', 'brackets', [0, 0, 0]);
  }
  return ctx.group;
};

/** Bedside table: top slab over a drawer body on four tapered legs, with round knobs. */
export const buildNightstand: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const height = num(spec, 'height');
  const drawers = Math.round(num(spec, 'drawerCount'));
  const legH = NIGHTSTAND_LEG_HEIGHT;
  const topT = NIGHTSTAND_TOP_THICKNESS;
  const carcH = height - legH - topT;

  addPart(ctx, roundedSlab(width, depth, topT, 0.012, 0.005), 'top', 'top', [0, height - topT, 0]);

  const body = [place(new THREE.BoxGeometry(width - 0.012, carcH, depth - 0.02), [0, legH + carcH / 2, -0.01])];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      body.push(place(taperedBox(0.035, 0.035, 0.022, 0.022, legH), [sx * (width / 2 - 0.04), legH / 2, sz * (depth / 2 - 0.04)]));
    }
  }
  addPart(ctx, mergeAll(body), 'body', 'body', [0, 0, 0]);

  const gap = 0.004;
  const fh = (carcH - gap * (drawers + 1)) / drawers;
  const knobs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < drawers; i++) {
    const y = legH + gap + fh / 2 + i * (fh + gap);
    addPart(ctx, roundedBox(width - 0.02, fh, 0.018, 0.003, 1), 'drawers', `drawer_${i + 1}`, [0, y, depth / 2 - 0.009]);
    knobs.push(place(knob(), [0, y, depth / 2]));
  }
  addPart(ctx, mergeAll(knobs), 'handles', 'knobs', [0, 0, 0]);
  return ctx.group;
};
