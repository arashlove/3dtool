import * as THREE from 'three';
import { ROOM_FLOOR_THICKNESS, ROOM_WINDOW} from '../../schema/room';
import { addPart, createContext, num, type Builder } from './common';

/** One rectangular piece of a wall, in wall coordinates: u runs along the wall, v goes up from its base. */
type WallPiece = { name: string; u: number; v: number; length: number; height: number };

/**
 * Splits a wall of the given length and height around a rectangular opening.
 * Returns up to four pieces: left of, right of, below and above the opening.
 */
function wallPieces(
  length: number,
  height: number,
  opening?: { center: number; width: number; bottom: number; top: number },
): WallPiece[] {
  if (!opening) return [{ name: 'full', u: 0, v: height / 2, length, height }];
  const pieces: WallPiece[] = [];
  const left = opening.center - opening.width / 2;
  const right = opening.center + opening.width / 2;
  const leftLen = left + length / 2;
  const rightLen = length / 2 - right;
  if (leftLen > 1e-4) pieces.push({ name: 'left', u: -length / 2 + leftLen / 2, v: height / 2, length: leftLen, height });
  if (rightLen > 1e-4) pieces.push({ name: 'right', u: length / 2 - rightLen / 2, v: height / 2, length: rightLen, height });
  if (opening.bottom > 1e-4)
    pieces.push({ name: 'below', u: opening.center, v: opening.bottom / 2, length: opening.width, height: opening.bottom });
  if (height - opening.top > 1e-4) {
    const h = height - opening.top;
    pieces.push({ name: 'above', u: opening.center, v: opening.top + h / 2, length: opening.width, height: h });
  }
  return pieces;
}

/**
 * Room shell with a bottom-centre pivot. The floor covers width x depth; walls stand on the floor.
 * Back wall at -Z (holds the door), left wall at -X (holds the window), right wall at +X,
 * optional front wall at +Z (hidden by default so you can look inside).
 */
export const buildRoom: Builder = (spec) => {
  const ctx = createContext(spec);
  const width = num(spec, 'width');
  const depth = num(spec, 'depth');
  const height = num(spec, 'height');
  const t = num(spec, 'wallThickness');
  const f = ROOM_FLOOR_THICKNESS;
  const hasDoor = spec.params.hasDoor === true;
  const hasWindow = spec.params.hasWindow === true;
  const showFront = spec.params.showFrontWall === true;

  // Floor
  addPart(ctx, new THREE.BoxGeometry(width, f, depth), 'floor', 'floor', [0, f / 2, 0]);

  // Back wall (along X), with the door opening
  const door = hasDoor
    ? { center: num(spec, 'doorOffset'), width: num(spec, 'doorWidth'), bottom: 0, top: num(spec, 'doorHeight') }
    : undefined;
  for (const p of wallPieces(width, height, door)) {
    addPart(ctx, new THREE.BoxGeometry(p.length, p.height, t), 'walls', `wall_back_${p.name}`, [p.u, f + p.v, -depth / 2 + t / 2]);
  }
  if (door) {
    addPart(ctx, new THREE.BoxGeometry(door.width - 0.02, door.top - 0.01, 0.04), 'door', 'door_panel', [
      door.center,
      f + (door.top - 0.01) / 2,
      -depth / 2 + t / 2,
    ]);
  }

  // Side walls (along Z), placed in front of the back wall so corners do not overlap
  const sideLength = depth - t;
  const sideCenterZ = t / 2;
  const window = hasWindow
    ? { center: 0, width: num(spec, 'windowWidth'), bottom: ROOM_WINDOW, top: ROOM_WINDOW + num(spec, 'windowHeight') }
    : undefined;
  for (const p of wallPieces(sideLength, height, window)) {
    // u runs from back (-) to front (+) along Z
    addPart(ctx, new THREE.BoxGeometry(t, p.height, p.length), 'walls', `wall_left_${p.name}`, [
      -width / 2 + t / 2,
      f + p.v,
      sideCenterZ + p.u,
    ]);
  }
  if (window) {
    addPart(ctx, new THREE.BoxGeometry(0.02, window.top - window.bottom, window.width), 'window', 'window_glass', [
      -width / 2 + t / 2,
      f + (window.bottom + window.top) / 2,
      sideCenterZ + window.center,
    ]);
  }
  addPart(ctx, new THREE.BoxGeometry(t, height, sideLength), 'walls', 'wall_right', [width / 2 - t / 2, f + height / 2, sideCenterZ]);

  // Optional front wall between the side walls
  if (showFront) {
    addPart(ctx, new THREE.BoxGeometry(width - 2 * t, height, t), 'walls', 'wall_front', [0, f + height / 2, depth / 2 - t / 2]);
  }

  return ctx.group;
};