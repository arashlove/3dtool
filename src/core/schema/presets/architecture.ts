import type { KindDef } from '../kinds';
import { choice, count, flag, mat, metres, n } from '../param-helpers';

/**
 * Freestanding structural pieces. Doors and windows are standalone panels: they do not cut
 * openings into room_wall slabs (the "room" kind is the only shell with real openings).
 */

export const ROOM_FLOOR_DEF: KindDef = {
  kind: 'room_floor',
  label: 'Floor',
  category: 'architecture',
  description: 'Floor slab with plank, tile or plain surface',
  params: [
    metres('width', 'Width', 0.5, 20, 4),
    metres('depth', 'Depth', 0.5, 20, 5),
    metres('thickness', 'Thickness', 0.02, 0.3, 0.05, 0.005),
    choice('surface', 'Surface', ['planks', 'tiles', 'plain'], 'planks'),
  ],
  parts: [
    { key: 'surface', label: 'Surface' },
    { key: 'base', label: 'Joints / grout' },
  ],
  defaultMaterials: { surface: mat('#B48A5F', 0, 0.62), base: mat('#5E4632', 0, 0.85) },
};

export const ROOM_WALL_DEF: KindDef = {
  kind: 'room_wall',
  label: 'Wall',
  category: 'architecture',
  description: 'Straight wall slab; trim is on its +Z (room) face. Rotate 90° for side walls',
  params: [
    metres('width', 'Width', 0.3, 20, 4),
    metres('height', 'Height', 1, 5, 2.6),
    metres('thickness', 'Thickness', 0.05, 0.5, 0.12),
    choice('trim', 'Trim', ['skirting', 'skirting_crown', 'none'], 'skirting'),
  ],
  parts: [
    { key: 'wall', label: 'Wall' },
    { key: 'trim', label: 'Trim' },
  ],
  defaultMaterials: { wall: mat('#EDEAE4', 0, 0.9), trim: mat('#F7F6F2', 0, 0.55) },
  validate: (p) => (p.trim === 'skirting_crown' && n(p, 'height') < 1.5 ? ['Crown moulding needs a wall at least 1.5 m high.'] : []),
};

export const ROOM_CEILING_DEF: KindDef = {
  kind: 'room_ceiling',
  label: 'Ceiling',
  category: 'architecture',
  description: 'Ceiling slab; its pivot stays on the floor and the slab sits at the given height',
  params: [
    metres('width', 'Width', 0.5, 20, 4),
    metres('depth', 'Depth', 0.5, 20, 5),
    metres('height', 'Ceiling height', 2, 5, 2.6),
    metres('thickness', 'Thickness', 0.02, 0.3, 0.08, 0.005),
  ],
  parts: [{ key: 'ceiling', label: 'Ceiling' }],
  defaultMaterials: { ceiling: mat('#F4F3EF', 0, 0.95) },
};

export const DOOR_SINGLE_DEF: KindDef = {
  kind: 'door_single',
  label: 'Door',
  category: 'architecture',
  description: 'Freestanding door with frame, casing and lever handles (does not cut a wall)',
  params: [
    metres('width', 'Width (with frame)', 0.7, 1.4, 0.95),
    metres('height', 'Height (with frame)', 1.9, 2.8, 2.1),
    metres('thickness', 'Panel thickness', 0.03, 0.07, 0.04, 0.005),
    choice('swingHint', 'Hinge side', ['left', 'right'], 'left'),
    choice('style', 'Panel style', ['panelled', 'flat'], 'panelled'),
  ],
  parts: [
    { key: 'frame', label: 'Frame' },
    { key: 'panel', label: 'Door panel' },
    { key: 'handle', label: 'Handle & hinges' },
  ],
  defaultMaterials: {
    frame: mat('#F2F0EB', 0, 0.55),
    panel: mat('#C49A6C', 0, 0.55),
    handle: mat('#B8BEC6', 0.9, 0.28),
  },
};

export const WINDOW_SINGLE_DEF: KindDef = {
  kind: 'window_single',
  label: 'Window',
  category: 'architecture',
  description: 'Freestanding window with frame, mullions, glass and sill (does not cut a wall). Set position y for the sill height',
  params: [
    metres('width', 'Width', 0.4, 3, 1.2),
    metres('height', 'Height', 0.4, 2.5, 1.3),
    count('paneCount', 'Panes', 1, 6, 2),
    flag('hasSill', 'Sill', true),
  ],
  parts: [
    { key: 'frame', label: 'Frame & mullions' },
    { key: 'glass', label: 'Glass' },
    { key: 'sill', label: 'Sill' },
  ],
  defaultMaterials: {
    frame: mat('#F4F4F2', 0, 0.5),
    glass: mat('#DCEFF5', 0.1, 0.05, 0.3),
    sill: mat('#E4E1DA', 0, 0.45),
  },
  validate: (p) =>
    n(p, 'width') / n(p, 'paneCount') < 0.18 ? ['Too many panes for this width (each pane needs at least 18 cm).'] : [],
};
