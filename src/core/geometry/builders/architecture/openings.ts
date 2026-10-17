import * as THREE from 'three';
import { addPart, bool, createContext, num, roundedBox, str, type Builder } from '../common';
import { frameRing, mergeAll, place } from '../shapes';

/*
 * Freestanding door and window units. They are not wall cutouts: placing one against a
 * room_wall does not open the wall (only the "room" kind builds real openings).
 */

const CASING = 0.07;
const CASING_T = 0.012;
const LINING = 0.02;

/** Door leaf in a lined frame with casings on both faces; the leaf is centred on z = 0. */
export const buildDoorSingle: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const height = num(spec, 'height');
  const t = num(spec, 'thickness');
  const hingeLeft = str(spec, 'swingHint') === 'left';
  const panelled = str(spec, 'style') === 'panelled';

  const frameDepth = t + 0.06;
  const openW = width - 2 * CASING;
  const openH = height - CASING;

  const frame: THREE.BufferGeometry[] = [];
  for (const face of [-1, 1]) {
    const z = face * (frameDepth / 2 + CASING_T / 2);
    for (const side of [-1, 1]) frame.push(place(new THREE.BoxGeometry(CASING, height, CASING_T), [side * (width / 2 - CASING / 2), height / 2, z]));
    frame.push(place(new THREE.BoxGeometry(openW, CASING, CASING_T), [0, height - CASING / 2, z]));
  }
  for (const side of [-1, 1]) frame.push(place(new THREE.BoxGeometry(LINING, openH, frameDepth), [side * (openW / 2 + LINING / 2), openH / 2, 0]));
  frame.push(place(new THREE.BoxGeometry(openW + 2 * LINING, LINING, frameDepth), [0, openH + LINING / 2, 0]));
  addPart(ctx, mergeAll(frame), 'frame', 'frame', [0, 0, 0]);

  const leafW = openW - 0.006;
  const leafH = openH - 0.012;
  const leafBottom = 0.01;
  addPart(ctx, roundedBox(leafW, leafH, t, 0.003, 1), 'panel', 'door_leaf', [0, leafBottom + leafH / 2, 0]);

  if (panelled) {
    const stile = Math.min(0.12, leafW * 0.16);
    const rail = 0.12;
    const fieldW = leafW - 2 * stile;
    const free = leafH - 3 * rail;
    const lowerH = free * 0.42;
    const upperH = free - lowerH;
    const fields: THREE.BufferGeometry[] = [];
    for (const face of [-1, 1]) {
      const z = face * (t / 2 + 0.002);
      fields.push(place(roundedBox(fieldW, lowerH, 0.008, 0.003, 1), [0, leafBottom + rail + lowerH / 2, z]));
      fields.push(place(roundedBox(fieldW, upperH, 0.008, 0.003, 1), [0, leafBottom + 2 * rail + lowerH + upperH / 2, z]));
    }
    addPart(ctx, mergeAll(fields), 'panel', 'raised_panels', [0, 0, 0]);
  }

  // Lever handles on both faces at the latch edge, pointing towards the hinges; three hinges.
  const latchSide = hingeLeft ? 1 : -1;
  const hx = latchSide * (leafW / 2 - 0.065);
  const hy = Math.min(1.0, leafBottom + leafH * 0.5);
  const hardware: THREE.BufferGeometry[] = [];
  for (const face of [-1, 1]) {
    const surface = face * (t / 2);
    hardware.push(place(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 24), [hx, hy, surface + face * 0.005], [Math.PI / 2, 0, 0]));
    hardware.push(place(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 12), [hx, hy, surface + face * 0.035], [Math.PI / 2, 0, 0]));
    hardware.push(place(roundedBox(0.13, 0.018, 0.02, 0.008, 2), [hx - latchSide * 0.055, hy, surface + face * 0.06]));
  }
  const hingeX = -latchSide * (leafW / 2 + 0.002);
  for (const y of [0.22, leafH / 2, leafH - 0.22]) {
    hardware.push(place(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 12), [hingeX, leafBottom + y, t / 2]));
  }
  addPart(ctx, mergeAll(hardware), 'handle', 'hardware', [0, 0, 0]);
  return ctx.group;
};

const WIN_FRAME = 0.06;
const WIN_DEPTH = 0.08;
const MULLION = 0.04;

/** Window frame divided into vertical panes, with an optional sill protruding towards +Z. */
export const buildWindowSingle: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const height = num(spec, 'height');
  const panes = Math.round(num(spec, 'paneCount'));
  const sillT = bool(spec, 'hasSill') ? 0.035 : 0;

  const frameH = height - sillT;
  const centreY = sillT + frameH / 2;
  addPart(ctx, frameRing(width, frameH, width - 2 * WIN_FRAME, frameH - 2 * WIN_FRAME, WIN_DEPTH, 0.004), 'frame', 'frame', [0, centreY, 0]);

  const innerW = width - 2 * WIN_FRAME;
  const innerH = frameH - 2 * WIN_FRAME;
  const cellW = (innerW - (panes - 1) * MULLION) / panes;
  const cellX = (i: number) => -innerW / 2 + cellW / 2 + i * (cellW + MULLION);

  if (panes > 1) {
    const mullions: THREE.BufferGeometry[] = [];
    for (let i = 1; i < panes; i++) {
      mullions.push(place(new THREE.BoxGeometry(MULLION, innerH, WIN_DEPTH * 0.75), [cellX(i) - cellW / 2 - MULLION / 2, 0, 0]));
    }
    addPart(ctx, mergeAll(mullions), 'frame', 'mullions', [0, centreY, 0]);
  }

  const glass = Array.from({ length: panes }, (_, i) => place(new THREE.BoxGeometry(cellW + 0.01, innerH + 0.01, 0.006), [cellX(i), 0, 0]));
  addPart(ctx, mergeAll(glass), 'glass', 'glass', [0, centreY, 0]);

  if (sillT > 0) {
    addPart(ctx, roundedBox(width + 0.08, sillT, WIN_DEPTH + 0.07, 0.006, 2), 'sill', 'sill', [0, sillT / 2, 0.035]);
  }
  return ctx.group;
};
