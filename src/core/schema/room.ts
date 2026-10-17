import type { KindDef, NumberParamDef, Params } from './kinds';
import type { MaterialSpec } from './material';

/**
 * "room": a room shell made of a floor, walls, an optional door (back wall)
 * and an optional window (left wall). Kept in its own file so room features
 * can grow without crowding kinds.ts.
 */

/** Fixed floor thickness in metres (not a parameter, to keep the AI prompt short). */
export const ROOM_FLOOR_THICKNESS = 0.05;
/** Height of the window sill above the floor, in metres. */
export const ROOM_WINDOW = 0.9;

const num = (key: string, label: string, min: number, max: number, def: number, step = 0.01): NumberParamDef => ({
  key,
  label,
  type: 'number',
  min,
  max,
  default: def,
  step,
  unit: 'm',
});

const n = (p: Params, key: string) => p[key] as number;
const mat = (color: string, metalness: number, roughness: number, opacity?: number): MaterialSpec =>
  opacity === undefined ? { color, metalness, roughness } : { color, metalness, roughness, opacity };

export const ROOM_DEF: KindDef = {
  kind: 'room',
  label: 'Room',
  category: 'architecture',
  description: 'Room shell: floor, walls, optional door and window',
  params: [
    num('width', 'Width', 1.5, 10, 5),
    num('depth', 'Depth', 1.5, 10, 4),
    num('height', 'Wall height', 2, 4, 2.6),
    num('wallThickness', 'Wall thickness', 0.05, 0.4, 0.12, 0.01),
    { key: 'showFrontWall', label: 'Front wall', type: 'boolean', default: false },
    { key: 'hasDoor', label: 'Door', type: 'boolean', default: true },
    num('doorWidth', 'Door width', 0.6, 2, 0.9),
    num('doorHeight', 'Door height', 1.8, 3, 2.1),
    num('doorOffset', 'Door offset', -4.5, 4.5, 1.2),
    { key: 'hasWindow', label: 'Window', type: 'boolean', default: true },
    num('windowWidth', 'Window width', 0.4, 4, 1.4),
    num('windowHeight', 'Window height', 0.3, 2.5, 1.2),
  ],
  parts: [
    { key: 'floor', label: 'Floor' },
    { key: 'walls', label: 'Walls' },
    { key: 'door', label: 'Door' },
    { key: 'window', label: 'Window' },
  ],
  defaultMaterials: {
    floor: mat('#B98A5E', 0, 0.7),
    walls: mat('#EDEAE4', 0, 0.9),
    door: mat('#8B5E3C', 0, 0.6),
    window: mat('#DCEFF5', 0.1, 0.05, 0.35),
  },
  validate: (p) => {
    const errors: string[] = [];
    const t = n(p, 'wallThickness');
    if (p.hasDoor === true) {
      const halfFree = n(p, 'width') / 2 - t - 0.05;
      if (Math.abs(n(p, 'doorOffset')) + n(p, 'doorWidth') / 2 > halfFree)
        errors.push('Door does not fit in the back wall: reduce door width/offset or widen the room.');
      if (n(p, 'doorHeight') > n(p, 'height') - 0.1) errors.push('Door must be at least 10 cm lower than the walls.');
    }
    if (p.hasWindow === true) {
      if (n(p, 'windowWidth') > n(p, 'depth') - 2 * t - 0.2)
        errors.push('Window does not fit in the side wall: reduce window width or deepen the room.');
      if (ROOM_WINDOW + n(p, 'windowHeight') > n(p, 'height') - 0.1)
        errors.push(`Window is too tall: the sill is at ${ROOM_WINDOW} m and it must end 10 cm below the top.`);
    }
    return errors;
  },
};