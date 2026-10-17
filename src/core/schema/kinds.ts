import type { MaterialSpec } from './material';

export const OBJECT_KINDS = [
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'table',
  'chair',
  'shelf',
  'lamp',
  'sofa',
] as const;

export type ObjectKind = (typeof OBJECT_KINDS)[number];

export type ParamValue = number | boolean;
export type Params = Record<string, ParamValue>;

export type NumberParamDef = {
  key: string;
  label: string;
  type: 'number';
  min: number;
  max: number;
  default: number;
  step: number;
  integer?: boolean;
  unit: 'm' | 'count';
};

export type BooleanParamDef = {
  key: string;
  label: string;
  type: 'boolean';
  default: boolean;
};

export type ParamDef = NumberParamDef | BooleanParamDef;

export type PartDef = { key: string; label: string };

export type KindDef = {
  kind: ObjectKind;
  label: string;
  category: 'primitive' | 'furniture';
  description: string;
  params: ParamDef[];
  parts: PartDef[];
  defaultMaterials: Record<string, MaterialSpec>;
  /** Cross-parameter checks. Returns human-readable problems; empty means valid. */
  validate?: (p: Params) => string[];
};

const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  def: number,
  step = 0.01,
  unit: 'm' | 'count' = 'm',
  integer = false,
): NumberParamDef => ({ key, label, type: 'number', min, max, default: def, step, unit, integer });

const n = (p: Params, key: string) => p[key] as number;

const MAIN_PART: PartDef[] = [{ key: 'main', label: 'Main' }];
const mat = (color: string, metalness: number, roughness: number): MaterialSpec => ({ color, metalness, roughness });

export const KIND_DEFS: Record<ObjectKind, KindDef> = {
  box: {
    kind: 'box',
    label: 'Box',
    category: 'primitive',
    description: 'Box or cube, optional rounded edges',
    params: [
      num('width', 'Width', 0.01, 10, 1),
      num('height', 'Height', 0.01, 10, 1),
      num('depth', 'Depth', 0.01, 10, 1),
      num('bevelRadius', 'Edge rounding', 0, 0.5, 0),
    ],
    parts: MAIN_PART,
    defaultMaterials: { main: mat('#9AA5B1', 0, 0.5) },
    validate: (p) =>
      n(p, 'bevelRadius') * 2 >= Math.min(n(p, 'width'), n(p, 'height'), n(p, 'depth'))
        ? ['Edge rounding must be less than half the smallest dimension.']
        : [],
  },
  sphere: {
    kind: 'sphere',
    label: 'Sphere',
    category: 'primitive',
    description: 'Smooth sphere resting on the floor',
    params: [num('radius', 'Radius', 0.025, 5, 0.5), num('segments', 'Segments', 8, 64, 32, 1, 'count', true)],
    parts: MAIN_PART,
    defaultMaterials: { main: mat('#9AA5B1', 0, 0.45) },
  },
  cylinder: {
    kind: 'cylinder',
    label: 'Cylinder',
    category: 'primitive',
    description: 'Cylinder, optionally tapered',
    params: [
      num('radiusTop', 'Top radius', 0.01, 5, 0.4),
      num('radiusBottom', 'Bottom radius', 0.01, 5, 0.4),
      num('height', 'Height', 0.05, 10, 1),
      num('segments', 'Segments', 8, 64, 32, 1, 'count', true),
    ],
    parts: MAIN_PART,
    defaultMaterials: { main: mat('#9AA5B1', 0, 0.45) },
  },
  cone: {
    kind: 'cone',
    label: 'Cone',
    category: 'primitive',
    description: 'Cone resting on its base',
    params: [
      num('radius', 'Radius', 0.025, 5, 0.5),
      num('height', 'Height', 0.05, 10, 1),
      num('segments', 'Segments', 8, 64, 32, 1, 'count', true),
    ],
    parts: MAIN_PART,
    defaultMaterials: { main: mat('#9AA5B1', 0, 0.45) },
  },
  torus: {
    kind: 'torus',
    label: 'Torus',
    category: 'primitive',
    description: 'Ring lying flat on the floor',
    params: [num('radius', 'Ring radius', 0.05, 5, 0.5), num('tubeRadius', 'Tube radius', 0.01, 2, 0.15)],
    parts: MAIN_PART,
    defaultMaterials: { main: mat('#9AA5B1', 0, 0.45) },
    validate: (p) => (n(p, 'tubeRadius') >= n(p, 'radius') ? ['Tube radius must be smaller than ring radius.'] : []),
  },
  table: {
    kind: 'table',
    label: 'Table',
    category: 'furniture',
    description: 'Table or desk: top and four legs',
    params: [
      num('width', 'Width', 0.3, 4, 1.4),
      num('depth', 'Depth', 0.3, 2.5, 0.8),
      num('height', 'Height', 0.3, 1.2, 0.75),
      num('topThickness', 'Top thickness', 0.015, 0.15, 0.04, 0.005),
      num('legThickness', 'Leg thickness', 0.02, 0.2, 0.05, 0.005),
      num('legInset', 'Leg inset', 0, 0.5, 0.06),
    ],
    parts: [
      { key: 'top', label: 'Top' },
      { key: 'legs', label: 'Legs' },
    ],
    defaultMaterials: { top: mat('#AA7B4E', 0, 0.62), legs: mat('#2A2A2A', 0.7, 0.55) },
    validate: (p) => {
      const errors: string[] = [];
      const span = 2 * (n(p, 'legInset') + n(p, 'legThickness'));
      if (span >= n(p, 'width')) errors.push('Legs do not fit: reduce leg inset/thickness or increase width.');
      if (span >= n(p, 'depth')) errors.push('Legs do not fit: reduce leg inset/thickness or increase depth.');
      if (n(p, 'topThickness') >= n(p, 'height') * 0.5) errors.push('Top thickness must be under half the height.');
      return errors;
    },
  },
  chair: {
    kind: 'chair',
    label: 'Chair',
    category: 'furniture',
    description: 'Chair: seat, backrest and four legs',
    params: [
      num('width', 'Width', 0.3, 1, 0.48),
      num('depth', 'Depth', 0.3, 1, 0.5),
      num('seatHeight', 'Seat height', 0.25, 0.8, 0.46),
      num('backHeight', 'Back top height', 0.5, 1.5, 0.9),
      num('legThickness', 'Leg thickness', 0.02, 0.1, 0.04, 0.005),
    ],
    parts: [
      { key: 'seat', label: 'Seat' },
      { key: 'back', label: 'Back' },
      { key: 'legs', label: 'Legs' },
    ],
    defaultMaterials: {
      seat: mat('#B08D6A', 0, 0.7),
      back: mat('#B08D6A', 0, 0.7),
      legs: mat('#2A2A2A', 0.7, 0.55),
    },
    validate: (p) => {
      const errors: string[] = [];
      if (n(p, 'backHeight') < n(p, 'seatHeight') + 0.15) errors.push('Back top must be at least 15 cm above the seat.');
      if (2 * n(p, 'legThickness') + 0.06 >= Math.min(n(p, 'width'), n(p, 'depth')))
        errors.push('Legs are too thick for this seat size.');
      return errors;
    },
  },
  shelf: {
    kind: 'shelf',
    label: 'Shelf',
    category: 'furniture',
    description: 'Bookshelf: side panels, boards and optional back',
    params: [
      num('width', 'Width', 0.3, 4, 1),
      num('depth', 'Depth', 0.15, 1, 0.35),
      num('height', 'Height', 0.3, 3, 1.8),
      num('shelfCount', 'Boards', 2, 12, 5, 1, 'count', true),
      num('panelThickness', 'Panel thickness', 0.01, 0.06, 0.02, 0.005),
      { key: 'hasBack', label: 'Back panel', type: 'boolean', default: true },
    ],
    parts: [
      { key: 'frame', label: 'Frame' },
      { key: 'shelves', label: 'Boards' },
      { key: 'back', label: 'Back' },
    ],
    defaultMaterials: {
      frame: mat('#D8C3A5', 0, 0.6),
      shelves: mat('#D8C3A5', 0, 0.6),
      back: mat('#C9B394', 0, 0.7),
    },
    validate: (p) => {
      const errors: string[] = [];
      if (n(p, 'width') <= 4 * n(p, 'panelThickness')) errors.push('Shelf is too narrow for its panel thickness.');
      const gap = (n(p, 'height') - n(p, 'panelThickness')) / Math.max(1, n(p, 'shelfCount') - 1);
      if (gap < 0.08) errors.push('Too many boards for this height (need at least 8 cm between boards).');
      return errors;
    },
  },
  lamp: {
    kind: 'lamp',
    label: 'Lamp',
    category: 'furniture',
    description: 'Floor or table lamp: base, stem and shade',
    params: [
      num('height', 'Height', 0.2, 2.5, 1.5),
      num('baseRadius', 'Base radius', 0.05, 0.5, 0.16),
      num('shadeRadius', 'Shade radius', 0.05, 0.6, 0.22),
      num('shadeHeight', 'Shade height', 0.05, 0.8, 0.28),
    ],
    parts: [
      { key: 'base', label: 'Base' },
      { key: 'stem', label: 'Stem' },
      { key: 'shade', label: 'Shade' },
    ],
    defaultMaterials: {
      base: mat('#2A2A2A', 0.7, 0.45),
      stem: mat('#AEB4BB', 0.85, 0.3),
      shade: mat('#EFE6D2', 0, 0.85),
    },
    validate: (p) => (n(p, 'shadeHeight') > n(p, 'height') - 0.1 ? ['Shade must be at least 10 cm shorter than the lamp.'] : []),
  },
  sofa: {
    kind: 'sofa',
    label: 'Sofa',
    category: 'furniture',
    description: 'Sofa: base, seat cushions, back and two armrests',
    params: [
      num('width', 'Width', 1, 4, 2),
      num('depth', 'Depth', 0.6, 1.4, 0.9),
      num('seatHeight', 'Seat height', 0.3, 0.6, 0.42),
      num('backHeight', 'Back top height', 0.6, 1.2, 0.85),
      num('armWidth', 'Arm width', 0.08, 0.4, 0.18),
    ],
    parts: [
      { key: 'body', label: 'Body' },
      { key: 'cushions', label: 'Cushions' },
      { key: 'legs', label: 'Legs' },
    ],
    defaultMaterials: {
      body: mat('#5F6B7A', 0, 0.9),
      cushions: mat('#6F7C8C', 0, 0.92),
      legs: mat('#3B2A1E', 0, 0.6),
    },
    validate: (p) => {
      const errors: string[] = [];
      if (n(p, 'width') - 2 * n(p, 'armWidth') < 0.6) errors.push('Arms are too wide: seat area must be at least 60 cm.');
      if (n(p, 'backHeight') < n(p, 'seatHeight') + 0.2) errors.push('Back top must be at least 20 cm above the seat.');
      return errors;
    },
  },
};

export function isObjectKind(value: unknown): value is ObjectKind {
  return typeof value === 'string' && (OBJECT_KINDS as readonly string[]).includes(value);
}

export function defaultParams(kind: ObjectKind): Params {
  return Object.fromEntries(KIND_DEFS[kind].params.map((p) => [p.key, p.default]));
}

export function defaultMaterials(kind: ObjectKind): Record<string, MaterialSpec> {
  return structuredClone(KIND_DEFS[kind].defaultMaterials);
}

export function partKeys(kind: ObjectKind): string[] {
  return KIND_DEFS[kind].parts.map((p) => p.key);
}

/** Validates a complete parameter set for a kind: known keys, types, ranges, and cross-checks. */
export function validateParams(kind: ObjectKind, params: Params): string[] {
  const def = KIND_DEFS[kind];
  const errors: string[] = [];
  const known = new Set(def.params.map((p) => p.key));
  for (const key of Object.keys(params)) {
    if (!known.has(key)) errors.push(`Unknown parameter "${key}" for ${def.label.toLowerCase()}.`);
  }
  for (const p of def.params) {
    const v = params[p.key];
    if (p.type === 'boolean') {
      if (typeof v !== 'boolean') errors.push(`${p.label} must be true or false.`);
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      errors.push(`${p.label} must be a finite number.`);
      continue;
    }
    if (p.integer && !Number.isInteger(v)) errors.push(`${p.label} must be a whole number.`);
    if (v < p.min || v > p.max) {
      const fmt = (x: number) => (p.unit === 'm' ? `${x} m` : `${x}`);
      errors.push(`${p.label} must be between ${fmt(p.min)} and ${fmt(p.max)} (got ${v}).`);
    }
  }
  if (errors.length === 0 && def.validate) errors.push(...def.validate(params));
  return errors;
}
