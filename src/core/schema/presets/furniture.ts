import type { KindDef } from '../kinds';
import { choice, count, flag, mat, metres, n } from '../param-helpers';

/** Shared construction constants, also read by the builders so validation matches geometry. */
export const BED_MATTRESS_THICKNESS = 0.22;
export const NIGHTSTAND_LEG_HEIGHT = 0.12;
export const NIGHTSTAND_TOP_THICKNESS = 0.025;
export const BOOKSHELF_PANEL = 0.018;
export const BOOKSHELF_PLINTH = 0.07;

const LEG_STYLES = ['square', 'tapered', 'round'] as const;

export const DINING_TABLE_RECT_DEF: KindDef = {
  kind: 'dining_table_rectangular',
  label: 'Dining table',
  category: 'furniture',
  description: 'Rectangular dining table: bevelled top, apron and four legs',
  params: [
    metres('width', 'Width', 0.8, 3.5, 1.8),
    metres('depth', 'Depth', 0.6, 1.4, 0.9),
    metres('height', 'Height', 0.6, 0.9, 0.75),
    metres('thickness', 'Top thickness', 0.02, 0.08, 0.04, 0.005),
    choice('legStyle', 'Leg style', LEG_STYLES, 'tapered'),
    flag('hasApron', 'Apron rails', true),
  ],
  parts: [
    { key: 'top', label: 'Top' },
    { key: 'legs', label: 'Legs' },
    { key: 'apron', label: 'Apron' },
  ],
  defaultMaterials: { top: mat('#AA7B4E', 0, 0.55), legs: mat('#8E6440', 0, 0.6), apron: mat('#8E6440', 0, 0.6) },
};

export const COFFEE_TABLE_RECT_DEF: KindDef = {
  kind: 'coffee_table_rectangular',
  label: 'Coffee table',
  category: 'furniture',
  description: 'Low rectangular coffee table with legs, a metal sled frame, or a lower shelf',
  params: [
    metres('width', 'Width', 0.6, 1.8, 1.1),
    metres('depth', 'Depth', 0.4, 1, 0.6),
    metres('height', 'Height', 0.3, 0.55, 0.42),
    choice('style', 'Style', ['legs', 'sled', 'shelf'], 'legs'),
  ],
  parts: [
    { key: 'top', label: 'Top' },
    { key: 'frame', label: 'Legs / frame' },
    { key: 'shelf', label: 'Lower shelf' },
  ],
  defaultMaterials: { top: mat('#5C3D2E', 0, 0.5), frame: mat('#2A2A2A', 0.7, 0.5), shelf: mat('#5C3D2E', 0, 0.55) },
};

export const DESK_BASIC_DEF: KindDef = {
  kind: 'desk_basic',
  label: 'Desk',
  category: 'furniture',
  description: 'Work desk: thin top on a steel frame, optional drawer unit',
  params: [
    metres('width', 'Width', 0.8, 2.2, 1.4),
    metres('depth', 'Depth', 0.5, 0.9, 0.7),
    metres('height', 'Height', 0.6, 1.25, 0.75),
    flag('hasDrawers', 'Drawer unit', false),
  ],
  parts: [
    { key: 'top', label: 'Top' },
    { key: 'frame', label: 'Frame' },
    { key: 'drawers', label: 'Drawers' },
    { key: 'handles', label: 'Handles' },
  ],
  defaultMaterials: {
    top: mat('#E9E4DA', 0, 0.5),
    frame: mat('#2A2A2A', 0.7, 0.5),
    drawers: mat('#E9E4DA', 0, 0.5),
    handles: mat('#B8BEC6', 0.9, 0.3),
  },
  validate: (p) => (p.hasDrawers === true && n(p, 'width') < 1 ? ['The drawer unit needs a desk at least 1 m wide.'] : []),
};

export const DINING_CHAIR_BASIC_DEF: KindDef = {
  kind: 'dining_chair_basic',
  label: 'Dining chair',
  category: 'furniture',
  description: 'Wooden dining chair: seat, curved backrest rails, raked back posts and four legs',
  params: [
    metres('width', 'Width', 0.38, 0.6, 0.46),
    metres('depth', 'Depth', 0.4, 0.6, 0.5),
    metres('seatHeight', 'Seat height', 0.38, 0.52, 0.46),
    metres('backHeight', 'Back top height', 0.7, 1.1, 0.88),
  ],
  parts: [
    { key: 'seat', label: 'Seat' },
    { key: 'backrest', label: 'Backrest' },
    { key: 'legs', label: 'Legs' },
  ],
  defaultMaterials: { seat: mat('#A97B50', 0, 0.6), backrest: mat('#A97B50', 0, 0.6), legs: mat('#8E6440', 0, 0.6) },
  validate: (p) => (n(p, 'backHeight') < n(p, 'seatHeight') + 0.25 ? ['Back top must be at least 25 cm above the seat.'] : []),
};

export const SOFA_TWO_SEATER_DEF: KindDef = {
  kind: 'sofa_two_seater',
  label: 'Two-seater sofa',
  category: 'furniture',
  description: 'Two-seat sofa: base, seat and back cushions, arms (track, rolled, slim or none) and feet',
  params: [
    metres('width', 'Width', 1.3, 2, 1.6),
    metres('depth', 'Depth', 0.75, 1, 0.88),
    metres('seatHeight', 'Seat height', 0.38, 0.5, 0.44),
    metres('backHeight', 'Back top height', 0.65, 1, 0.82),
    choice('armStyle', 'Arm style', ['track', 'rolled', 'slim', 'none'], 'track'),
  ],
  parts: [
    { key: 'frame', label: 'Frame' },
    { key: 'arms', label: 'Armrests' },
    { key: 'cushions', label: 'Cushions' },
    { key: 'legs', label: 'Legs' },
  ],
  defaultMaterials: {
    frame: mat('#8A8D91', 0, 0.92),
    arms: mat('#8A8D91', 0, 0.92),
    cushions: mat('#979A9E', 0, 0.94),
    legs: mat('#3B2A1E', 0, 0.55),
  },
  validate: (p) => (n(p, 'backHeight') < n(p, 'seatHeight') + 0.25 ? ['Back top must be at least 25 cm above the seat.'] : []),
};

export const BED_PLATFORM_DEF: KindDef = {
  kind: 'bed_platform',
  label: 'Platform bed',
  category: 'furniture',
  description: 'Platform bed: frame, mattress, channel-tufted headboard (at -Z), pillows and duvet',
  params: [
    metres('width', 'Width', 0.9, 2.2, 1.6),
    metres('length', 'Length', 1.9, 2.4, 2.1),
    metres('frameHeight', 'Frame height', 0.15, 0.5, 0.3),
    metres('headboardHeight', 'Headboard top height', 0.6, 1.6, 1.05),
    flag('hasBedding', 'Pillows & duvet', true),
  ],
  parts: [
    { key: 'frame', label: 'Frame' },
    { key: 'mattress', label: 'Mattress' },
    { key: 'headboard', label: 'Headboard' },
    { key: 'bedding', label: 'Duvet' },
    { key: 'pillows', label: 'Pillows' },
  ],
  defaultMaterials: {
    frame: mat('#7A5A3F', 0, 0.6),
    mattress: mat('#F4F1EA', 0, 0.9),
    headboard: mat('#9AA0A6', 0, 0.93),
    bedding: mat('#E9E2D6', 0, 0.95),
    pillows: mat('#F7F5F0', 0, 0.95),
  },
  validate: (p) =>
    n(p, 'headboardHeight') < n(p, 'frameHeight') + BED_MATTRESS_THICKNESS + 0.15
      ? ['Headboard must rise at least 15 cm above the mattress.']
      : [],
};

export const NIGHTSTAND_BASIC_DEF: KindDef = {
  kind: 'nightstand_basic',
  label: 'Nightstand',
  category: 'furniture',
  description: 'Bedside table: top, drawer body on tapered legs, drawer fronts and knobs',
  params: [
    metres('width', 'Width', 0.35, 0.7, 0.5),
    metres('depth', 'Depth', 0.3, 0.55, 0.4),
    metres('height', 'Height', 0.4, 0.75, 0.55),
    count('drawerCount', 'Drawers', 1, 3, 2),
  ],
  parts: [
    { key: 'body', label: 'Body & legs' },
    { key: 'top', label: 'Top' },
    { key: 'drawers', label: 'Drawer fronts' },
    { key: 'handles', label: 'Knobs' },
  ],
  defaultMaterials: {
    body: mat('#C9A27A', 0, 0.6),
    top: mat('#B88E63', 0, 0.55),
    drawers: mat('#C9A27A', 0, 0.6),
    handles: mat('#B5A642', 0.85, 0.35),
  },
  validate: (p) => {
    const body = n(p, 'height') - NIGHTSTAND_LEG_HEIGHT - NIGHTSTAND_TOP_THICKNESS;
    return body / n(p, 'drawerCount') < 0.09 ? ['Too many drawers for this height (each needs about 9 cm).'] : [];
  },
};

export const BOOKSHELF_OPEN_DEF: KindDef = {
  kind: 'bookshelf_open',
  label: 'Bookshelf',
  category: 'storage',
  description: 'Open bookcase: sides, top, plinth, shelf levels and optional back panel',
  params: [
    metres('width', 'Width', 0.4, 2.4, 0.9),
    metres('height', 'Height', 0.6, 2.6, 1.9),
    metres('depth', 'Depth', 0.2, 0.5, 0.32),
    count('shelfCount', 'Shelf levels', 1, 10, 5),
    flag('hasBack', 'Back panel', true),
  ],
  parts: [
    { key: 'frame', label: 'Frame' },
    { key: 'shelves', label: 'Shelves' },
    { key: 'back', label: 'Back panel' },
  ],
  defaultMaterials: { frame: mat('#D8C3A5', 0, 0.6), shelves: mat('#D8C3A5', 0, 0.6), back: mat('#C9B394', 0, 0.7) },
  validate: (p) => {
    const inner = n(p, 'height') - BOOKSHELF_PLINTH - 2 * BOOKSHELF_PANEL;
    return inner / n(p, 'shelfCount') < 0.15 ? ['Too many shelf levels for this height (each needs at least 15 cm).'] : [];
  },
};

export const CABINET_BASIC_DEF: KindDef = {
  kind: 'cabinet_basic',
  label: 'Cabinet',
  category: 'storage',
  description: 'Closed cabinet: body on a recessed plinth, front doors and bar handles',
  params: [
    metres('width', 'Width', 0.4, 2.4, 0.9),
    metres('height', 'Height', 0.4, 2.2, 0.9),
    metres('depth', 'Depth', 0.3, 0.7, 0.45),
    count('doorCount', 'Doors', 1, 4, 2),
  ],
  parts: [
    { key: 'body', label: 'Body' },
    { key: 'doors', label: 'Doors' },
    { key: 'handles', label: 'Handles' },
  ],
  defaultMaterials: { body: mat('#ECE8E1', 0, 0.55), doors: mat('#ECE8E1', 0, 0.5), handles: mat('#2A2A2A', 0.75, 0.45) },
  validate: (p) => (n(p, 'width') / n(p, 'doorCount') < 0.2 ? ['Too many doors for this width (each needs at least 20 cm).'] : []),
};

export const FLOATING_SHELF_DEF: KindDef = {
  kind: 'floating_shelf',
  label: 'Floating shelf',
  category: 'storage',
  description: 'Wall shelf board (back edge at -Z), optional metal brackets. Set position y to hang it',
  params: [
    metres('width', 'Width', 0.3, 2.4, 0.8),
    metres('depth', 'Depth', 0.12, 0.4, 0.22),
    metres('thickness', 'Thickness', 0.02, 0.08, 0.04, 0.005),
    flag('hasBrackets', 'Brackets', false),
  ],
  parts: [
    { key: 'board', label: 'Board' },
    { key: 'brackets', label: 'Brackets' },
  ],
  defaultMaterials: { board: mat('#AA7B4E', 0, 0.55), brackets: mat('#2A2A2A', 0.75, 0.45) },
};
