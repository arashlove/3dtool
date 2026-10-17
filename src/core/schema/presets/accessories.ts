import type { KindDef } from '../kinds';
import { choice, flag, mat, metres, n } from '../param-helpers';

export const LAMP_SHADE_SHAPES = ['drum', 'cone', 'bell'] as const;
export type LampShadeShape = (typeof LAMP_SHADE_SHAPES)[number];

/** Shade height follows its radius and shape; shared by validation and the builder. */
export function lampShadeHeight(radius: number, shape: string): number {
  const factor = shape === 'drum' ? 1.15 : shape === 'cone' ? 1.1 : 1;
  return radius * factor;
}

export const LAMP_TABLE_DEF: KindDef = {
  kind: 'lamp_table',
  label: 'Table lamp',
  category: 'lighting',
  description: 'Table lamp: lathed ceramic base, brass stem, bulb and fabric shade (mesh only, emits no light)',
  params: [
    metres('height', 'Height', 0.3, 0.9, 0.55),
    metres('shadeRadius', 'Shade radius', 0.08, 0.3, 0.17),
    choice('shadeShape', 'Shade shape', LAMP_SHADE_SHAPES, 'drum'),
  ],
  parts: [
    { key: 'base', label: 'Base' },
    { key: 'stem', label: 'Stem' },
    { key: 'shade', label: 'Shade' },
    { key: 'bulb', label: 'Bulb' },
  ],
  defaultMaterials: {
    base: mat('#D9D2C5', 0.05, 0.3),
    stem: mat('#B5A642', 0.85, 0.35),
    shade: mat('#F2E8D5', 0, 0.85),
    bulb: mat('#FFF6DD', 0, 0.2),
  },
  validate: (p) =>
    n(p, 'height') < lampShadeHeight(n(p, 'shadeRadius'), String(p.shadeShape)) + 0.15
      ? ['The shade is too big for this lamp height: lower the shade radius or raise the lamp.']
      : [],
};

export const PICTURE_FRAMED_DEF: KindDef = {
  kind: 'picture_framed',
  label: 'Framed picture',
  category: 'decor',
  description: 'Framed print with mat and generated placeholder art. Set position y to hang it',
  params: [
    metres('width', 'Width', 0.15, 2, 0.6),
    metres('height', 'Height', 0.15, 2, 0.8),
    metres('frameThickness', 'Frame width', 0.01, 0.12, 0.035, 0.005),
    choice('artStyle', 'Art', ['abstract', 'landscape', 'minimal'], 'abstract'),
    flag('hasMat', 'Mat border', true),
  ],
  parts: [
    { key: 'frame', label: 'Frame' },
    { key: 'mat', label: 'Mat' },
    { key: 'art', label: 'Art background' },
    { key: 'accent', label: 'Art shapes' },
  ],
  defaultMaterials: {
    frame: mat('#2A2420', 0, 0.5),
    mat: mat('#F5F2EA', 0, 0.9),
    art: mat('#D9C7A7', 0, 0.85),
    accent: mat('#B5633C', 0, 0.8),
  },
  validate: (p) =>
    2 * n(p, 'frameThickness') > Math.min(n(p, 'width'), n(p, 'height')) * 0.6
      ? ['The frame is too wide for this picture size.']
      : [],
};

export const MIRROR_RECT_DEF: KindDef = {
  kind: 'mirror_rectangular',
  label: 'Mirror',
  category: 'decor',
  description: 'Rectangular mirror with optional frame (glossy look, no real reflection). Set position y to hang it',
  params: [
    metres('width', 'Width', 0.3, 2, 0.6),
    metres('height', 'Height', 0.4, 2.2, 0.9),
    metres('frameThickness', 'Frame width (0 = frameless)', 0, 0.1, 0.03, 0.005),
  ],
  parts: [
    { key: 'frame', label: 'Frame' },
    { key: 'glass', label: 'Mirror glass' },
  ],
  // Low metalness on purpose: the editor has no environment map, so a fully metallic surface renders near-black.
  defaultMaterials: { frame: mat('#2A2A2A', 0.6, 0.4), glass: mat('#E8EEF2', 0.3, 0.05) },
  validate: (p) =>
    2 * n(p, 'frameThickness') > Math.min(n(p, 'width'), n(p, 'height')) * 0.5 ? ['The frame is too wide for this mirror.'] : [],
};

export const RUG_RECT_DEF: KindDef = {
  kind: 'rug_rectangular',
  label: 'Rug',
  category: 'decor',
  description: 'Rectangular rug with rounded corners and optional border or stripes',
  params: [
    metres('width', 'Width', 0.6, 4, 2),
    metres('depth', 'Depth', 0.4, 5, 1.4),
    metres('thickness', 'Pile thickness', 0.005, 0.04, 0.012, 0.001),
    choice('pattern', 'Pattern', ['border', 'stripes', 'plain'], 'border'),
  ],
  parts: [
    { key: 'rug', label: 'Rug' },
    { key: 'pattern', label: 'Pattern' },
  ],
  defaultMaterials: { rug: mat('#C9B79C', 0, 0.98), pattern: mat('#6B5A48', 0, 0.98) },
};

export const PLANT_POT_DEF: KindDef = {
  kind: 'plant_pot',
  label: 'Potted plant',
  category: 'plants',
  description: 'Lathed plant pot with soil and an optional stylised plant (leafy or spiky)',
  params: [
    metres('radius', 'Pot radius', 0.06, 0.4, 0.15),
    metres('height', 'Pot height', 0.1, 0.8, 0.3),
    choice('shape', 'Pot shape', ['tapered', 'cylinder', 'bowl', 'round'], 'tapered'),
    choice('foliage', 'Plant', ['leafy', 'spiky', 'none'], 'leafy'),
  ],
  parts: [
    { key: 'pot', label: 'Pot' },
    { key: 'soil', label: 'Soil' },
    { key: 'foliage', label: 'Foliage' },
  ],
  defaultMaterials: { pot: mat('#E8E4DC', 0.02, 0.35), soil: mat('#3E2C20', 0, 1), foliage: mat('#3E7A3A', 0, 0.6) },
};

export const TELEVISION_FLAT_DEF: KindDef = {
  kind: 'television_flat',
  label: 'Flat TV',
  category: 'electronics',
  description: 'Flat-screen TV on a pedestal, feet, or wall bracket (set position y when wall-mounted)',
  params: [
    metres('width', 'Width', 0.5, 2.4, 1.23),
    metres('height', 'Height', 0.3, 1.4, 0.71),
    metres('depth', 'Depth', 0.02, 0.12, 0.05, 0.005),
    choice('mountStyle', 'Mount', ['stand', 'feet', 'wall'], 'stand'),
  ],
  parts: [
    { key: 'bezel', label: 'Body & bezel' },
    { key: 'screen', label: 'Screen' },
    { key: 'stand', label: 'Stand / bracket' },
  ],
  defaultMaterials: { bezel: mat('#1E1E1E', 0.3, 0.45), screen: mat('#0E1116', 0.3, 0.12), stand: mat('#2A2A2A', 0.7, 0.4) },
  validate: (p) => (n(p, 'height') > n(p, 'width') ? ['A TV must be wider than it is tall.'] : []),
};
