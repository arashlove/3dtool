import * as THREE from 'three';
import { addPart, bool, createContext, num, roundedBox, str, type Builder } from '../common';
import { CORNERS, barHandle, legGeometry, mergeAll, place, roundedSlab, tube } from '../shapes';

/** Dining table: bevelled top, legs inset 6 cm from the edges, optional apron rails under the top. */
export const buildDiningTable: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const height = num(spec, 'height');
  const thickness = num(spec, 'thickness');
  const legStyle = str(spec, 'legStyle');

  addPart(ctx, roundedSlab(width, depth, thickness, 0.025, Math.min(0.006, thickness / 4)), 'top', 'top', [0, height - thickness, 0]);

  const legT = legStyle === 'round' ? 0.07 : 0.065;
  const legH = height - thickness;
  const lx = width / 2 - 0.06 - legT / 2;
  const lz = depth / 2 - 0.06 - legT / 2;
  for (const c of CORNERS) {
    addPart(ctx, legGeometry(legStyle, legT, legH), 'legs', `leg_${c.name}`, [c.sx * lx, legH / 2, c.sz * lz]);
  }

  if (bool(spec, 'hasApron')) {
    const apronH = Math.min(0.1, legH * 0.15);
    const railT = 0.022;
    // Rails sit just inside the outer leg faces and run into the legs.
    const off = legT / 2 - railT / 2 - 0.008;
    const y = legH - apronH / 2;
    const rails = [
      place(new THREE.BoxGeometry(2 * lx, apronH, railT), [0, y, lz + off]),
      place(new THREE.BoxGeometry(2 * lx, apronH, railT), [0, y, -lz - off]),
      place(new THREE.BoxGeometry(railT, apronH, 2 * lz), [lx + off, y, 0]),
      place(new THREE.BoxGeometry(railT, apronH, 2 * lz), [-lx - off, y, 0]),
    ];
    addPart(ctx, mergeAll(rails), 'apron', 'apron', [0, 0, 0]);
  }
  return ctx.group;
};

/** Coffee table with tapered round legs, a bent-tube sled frame, or square legs with a lower shelf. */
export const buildCoffeeTable: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const height = num(spec, 'height');
  const style = str(spec, 'style');
  const t = 0.035;
  const legH = height - t;

  addPart(ctx, roundedSlab(width, depth, t, 0.04, 0.008), 'top', 'top', [0, legH, 0]);

  if (style === 'sled') {
    const r = 0.012;
    const fx = width / 2 - 0.08;
    const hz = depth / 2 - 0.05;
    const frame: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      const x = side * fx;
      frame.push(tube([[x, legH, -hz], [x, r, -hz], [x, r, hz], [x, legH, hz]], r, 0.06));
    }
    for (const sz of [-1, 1]) frame.push(tube([[-fx, legH - r, sz * hz], [fx, legH - r, sz * hz]], r * 0.8));
    addPart(ctx, mergeAll(frame), 'frame', 'sled_frame', [0, 0, 0]);
    return ctx.group;
  }

  const shelf = style === 'shelf';
  const legT = 0.045;
  const lx = width / 2 - 0.07;
  const lz = depth / 2 - 0.07;
  for (const c of CORNERS) {
    addPart(ctx, legGeometry(shelf ? 'square' : 'round', legT, legH), 'frame', `leg_${c.name}`, [c.sx * lx, legH / 2, c.sz * lz]);
  }
  if (shelf) {
    const shelfY = Math.min(0.12, legH * 0.3);
    addPart(ctx, roundedSlab(2 * lx + legT * 0.6, 2 * lz + legT * 0.6, 0.022, 0.01, 0.004), 'shelf', 'lower_shelf', [0, shelfY, 0]);
  }
  return ctx.group;
};

/** Desk: thin top on two rectangular steel leg frames with a back beam; optional hanging drawer unit. */
export const buildDesk: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const height = num(spec, 'height');
  const t = 0.028;
  const legH = height - t;

  addPart(ctx, roundedSlab(width, depth, t, 0.012, 0.004), 'top', 'top', [0, legH, 0]);

  const frame: THREE.BufferGeometry[] = [];
  const railD = depth - 0.08;
  const postZ = railD / 2 - 0.015;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.07);
    frame.push(place(new THREE.BoxGeometry(0.05, 0.03, railD), [x, 0.015, 0]));
    frame.push(place(new THREE.BoxGeometry(0.05, 0.03, railD), [x, legH - 0.015, 0]));
    for (const sz of [-1, 1]) frame.push(place(new THREE.BoxGeometry(0.05, legH - 0.06, 0.03), [x, legH / 2, sz * postZ]));
  }
  frame.push(place(new THREE.BoxGeometry(width - 0.19, 0.06, 0.02), [0, legH - 0.05, -postZ]));
  addPart(ctx, mergeAll(frame), 'frame', 'frame', [0, 0, 0]);

  if (bool(spec, 'hasDrawers')) {
    const uw = 0.42;
    const uh = Math.min(0.32, legH - 0.25);
    const ud = depth - 0.12;
    const ux = width / 2 - 0.07 - 0.035 - uw / 2;
    const uz = -0.02;
    const front = uz + ud / 2;
    const unit = [place(new THREE.BoxGeometry(uw, uh, ud), [ux, legH - uh / 2, uz])];
    const handles: THREE.BufferGeometry[] = [];
    for (const k of [0, 1]) {
      const y = legH - uh / 4 - (k * uh) / 2;
      unit.push(place(roundedBox(uw - 0.006, uh / 2 - 0.006, 0.018, 0.003, 1), [ux, y, front + 0.009]));
      handles.push(place(barHandle(0.12, false), [ux, y, front + 0.018]));
    }
    addPart(ctx, mergeAll(unit), 'drawers', 'drawer_unit', [0, 0, 0]);
    addPart(ctx, mergeAll(handles), 'handles', 'drawer_handles', [0, 0, 0]);
  }
  return ctx.group;
};
