import { applyOperations } from '../commands/dispatcher';
import { LIMITS } from '../schema/constants';
import { createEmptyDocument, type SceneDocument, type Vec3 } from '../schema/scene';
import type { CreateOp, SceneOperation } from '../schema/plan';

/**
 * Hand-written preset scene: a furnished 10 m x 10 m room built only from the procedural
 * room presets. It is labelled as a preset in the UI, never as AI output.
 *
 * Shell: the floor is centred on the origin (top at FLOOR_TOP). The back wall spans the full
 * 10 m; the left and right walls butt into its inner face, so the three walls meet corner to
 * corner. The front stays open so the default camera can look in.
 *
 * Layout: the interior is split into four equal quadrants (study back-left, living back-right,
 * bedroom front-left, dining front-right). Each group is centred in its quadrant, and pieces
 * within a group are spaced evenly. Wall-side pieces keep SKIRTING_GAP off the wall.
 */

const ROOM = 10;
const FLOOR_TOP = 0.05;
const WALL_T = 0.12;
const WALL_H = 2.8;
/** Inner wall faces: back at z = -INNER, left at x = -INNER, right at x = +INNER. */
const INNER = ROOM / 2 - WALL_T;
/** Clearance so furniture backs stay clear of the skirting board. */
const SKIRTING_GAP = 0.015;
/** Distance from a wall face to the centre of a piece of the given depth standing against it. */
const againstWall = (depth: number) => INNER - SKIRTING_GAP - depth / 2;

// Quadrant centres: x splits the interior at 0; z splits it at 0 between the back wall and the open front.
const LEFT_X = -INNER / 2;
const RIGHT_X = INNER / 2;
const BACK_Z = -INNER / 2;
const FRONT_Z = ROOM / 4;

// Preset dimensions used in the layout (defaults unless set in the operations below).
const DESK = { width: 1.6, depth: 0.75, height: 0.75 };
const BOOKSHELF = { width: 0.9, depth: 0.32 };
const MEDIA = { width: 1.6, depth: 0.42, height: 0.5 };
const SOFA_DEPTH = 0.88;
const COFFEE_DEPTH = 0.6;
const BED = { width: 1.6, length: 2.1 };
const NIGHTSTAND = { width: 0.5, depth: 0.4, height: 0.55 };
const TABLE = { width: 1.8, depth: 0.9 };
const CHAIR_DEPTH = 0.5;
const SIDEBOARD = { width: 1.6, depth: 0.45, height: 0.85 };

/** Even gap used between the pieces of a group. */
const GAP = 0.5;
/** Even gap between TV unit, coffee table and sofa. */
const LIVING_GAP = 0.6;

function create(kind: CreateOp['kind'], name: string, position: Vec3, rest: Partial<CreateOp> = {}, rotationY = 0): CreateOp {
  return { op: 'create', kind, name, ...rest, transform: { position, rotationDeg: [0, rotationY, 0] } };
}

// Study (back-left): desk centred on the back wall, a bookshelf either side at an even gap.
const deskZ = -againstWall(DESK.depth);
const deskFront = deskZ + DESK.depth / 2;
const bookshelfOffset = DESK.width / 2 + GAP + BOOKSHELF.width / 2;

// Living (back-right): TV unit on the back wall, then coffee table and sofa at even gaps.
const mediaZ = -againstWall(MEDIA.depth);
const mediaFront = mediaZ + MEDIA.depth / 2;
const coffeeZ = mediaFront + LIVING_GAP + COFFEE_DEPTH / 2;
const sofaZ = coffeeZ + COFFEE_DEPTH / 2 + LIVING_GAP + SOFA_DEPTH / 2;
const plantOffset = MEDIA.width / 2 + GAP + 0.2;

// Bedroom (front-left): headboard on the left wall, nightstands 5 cm from the bed sides.
const bedX = -againstWall(BED.length);
const nightstandX = -againstWall(NIGHTSTAND.depth);
const nightstandOffset = BED.width / 2 + 0.05 + NIGHTSTAND.width / 2;

// Dining (front-right): table centred, chairs just clear of the long edges.
const chairOffsetZ = TABLE.depth / 2 + CHAIR_DEPTH / 2;

const SAMPLE_OPERATIONS: SceneOperation[] = [
  // The desk comes first so it is the first object in the document.
  create('desk_basic', 'Oak Desk', [LEFT_X, FLOOR_TOP, deskZ], {
    params: { width: DESK.width, depth: DESK.depth, height: DESK.height },
    materials: { top: { preset: 'wood', color: 'oak' } },
  }),
  // Tucked 10 cm under the desk top, facing the desk.
  create('dining_chair_basic', 'Desk Chair', [LEFT_X, FLOOR_TOP, deskFront + CHAIR_DEPTH / 2 - 0.1], {
    materials: { seat: { color: 'walnut' }, backrest: { color: 'walnut' }, legs: { color: 'walnut' } },
  }, 180),
  create('lamp_table', 'Desk Lamp', [LEFT_X - 0.6, FLOOR_TOP + DESK.height, deskZ - 0.15], {
    params: { height: 0.5, shadeRadius: 0.13, shadeShape: 'cone' },
  }),
  create('bookshelf_open', 'Bookshelf 1', [LEFT_X - bookshelfOffset, FLOOR_TOP, -againstWall(BOOKSHELF.depth)]),
  create('bookshelf_open', 'Bookshelf 2', [LEFT_X + bookshelfOffset, FLOOR_TOP, -againstWall(BOOKSHELF.depth)]),

  // Shell
  create('room_floor', 'Oak Floor', [0, 0, 0], { params: { width: ROOM, depth: ROOM, thickness: FLOOR_TOP } }),
  create('room_wall', 'Back Wall', [0, FLOOR_TOP, -ROOM / 2 + WALL_T / 2], {
    params: { width: ROOM, height: WALL_H, thickness: WALL_T, trim: 'skirting_crown' },
  }),
  create('room_wall', 'Left Wall', [-ROOM / 2 + WALL_T / 2, FLOOR_TOP, WALL_T / 2], {
    params: { width: ROOM - WALL_T, height: WALL_H, thickness: WALL_T, trim: 'skirting_crown' },
  }, 90),
  create('room_wall', 'Right Wall', [ROOM / 2 - WALL_T / 2, FLOOR_TOP, WALL_T / 2], {
    params: { width: ROOM - WALL_T, height: WALL_H, thickness: WALL_T, trim: 'skirting_crown' },
  }, -90),
  // Door and windows sit on the wall faces (they do not cut openings).
  create('door_single', 'Door', [INNER - 0.062, FLOOR_TOP, BACK_Z], {}, -90),
  create('window_single', 'Study Window', [-INNER + 0.04, 0.95, BACK_Z], { params: { width: 1.3, height: 1.3 } }, 90),
  create('window_single', 'Dining Window', [INNER - 0.04, 1.05, FRONT_Z], { params: { width: 1.3, height: 1.2 } }, -90),

  // Living
  create('cabinet_basic', 'Media Unit', [RIGHT_X, FLOOR_TOP, mediaZ], {
    params: { width: MEDIA.width, height: MEDIA.height, depth: MEDIA.depth, doorCount: 4 },
  }),
  create('television_flat', 'TV', [RIGHT_X, FLOOR_TOP + MEDIA.height, mediaZ]),
  create('plant_pot', 'Plant 1', [RIGHT_X - plantOffset, FLOOR_TOP, -againstWall(0.47)], {
    params: { radius: 0.2, height: 0.4, shape: 'round', foliage: 'spiky' },
    materials: { pot: { color: '#2A2A2A' } },
  }),
  create('plant_pot', 'Plant 2', [RIGHT_X + plantOffset, FLOOR_TOP, -againstWall(0.47)], {
    params: { radius: 0.2, height: 0.4, shape: 'round', foliage: 'spiky' },
    materials: { pot: { color: '#2A2A2A' } },
  }),
  create('rug_rectangular', 'Living Rug', [RIGHT_X, FLOOR_TOP, (coffeeZ + sofaZ) / 2 - 0.2], { params: { width: 2.4, depth: 2 } }),
  create('coffee_table_rectangular', 'Coffee Table', [RIGHT_X, FLOOR_TOP + 0.012, coffeeZ], { materials: { top: { color: 'walnut' } } }),
  create('sofa_two_seater', 'Sofa', [RIGHT_X, FLOOR_TOP, sofaZ], {
    materials: { frame: { color: '#CBB898' }, arms: { color: '#CBB898' }, cushions: { color: 'beige' } },
  }, 180),

  // Bedroom
  create('bed_platform', 'Bed', [bedX, FLOOR_TOP, FRONT_Z], {}, 90),
  create('nightstand_basic', 'Nightstand 1', [nightstandX, FLOOR_TOP, FRONT_Z - nightstandOffset], {}, 90),
  create('nightstand_basic', 'Nightstand 2', [nightstandX, FLOOR_TOP, FRONT_Z + nightstandOffset], {}, 90),
  create('lamp_table', 'Bedside Lamp 1', [nightstandX, FLOOR_TOP + NIGHTSTAND.height, FRONT_Z - nightstandOffset], { params: { shadeShape: 'bell' } }),
  create('lamp_table', 'Bedside Lamp 2', [nightstandX, FLOOR_TOP + NIGHTSTAND.height, FRONT_Z + nightstandOffset], { params: { shadeShape: 'bell' } }),
  create('picture_framed', 'Bedroom Print', [-INNER + 0.015, 1.55, FRONT_Z], { params: { width: 0.9, height: 0.6 } }, 90),
  create('rug_rectangular', 'Bedroom Rug', [LEFT_X, FLOOR_TOP, FRONT_Z], { params: { width: 2.4, depth: 2.6, pattern: 'stripes' } }),

  // Dining
  create('dining_table_rectangular', 'Dining Table', [RIGHT_X, FLOOR_TOP, FRONT_Z], { params: { width: TABLE.width, depth: TABLE.depth } }),
  create('dining_chair_basic', 'Dining Chair 1', [RIGHT_X - 0.45, FLOOR_TOP, FRONT_Z - chairOffsetZ]),
  create('dining_chair_basic', 'Dining Chair 2', [RIGHT_X + 0.45, FLOOR_TOP, FRONT_Z - chairOffsetZ]),
  create('dining_chair_basic', 'Dining Chair 3', [RIGHT_X - 0.45, FLOOR_TOP, FRONT_Z + chairOffsetZ], {}, 180),
  create('dining_chair_basic', 'Dining Chair 4', [RIGHT_X + 0.45, FLOOR_TOP, FRONT_Z + chairOffsetZ], {}, 180),
  create('cabinet_basic', 'Sideboard', [againstWall(SIDEBOARD.depth), FLOOR_TOP, FRONT_Z], {
    params: { width: SIDEBOARD.width, height: SIDEBOARD.height, depth: SIDEBOARD.depth },
    materials: { body: { preset: 'wood', color: 'walnut' }, doors: { preset: 'wood', color: 'walnut' } },
  }, -90),
];

export function createSampleScene(): SceneDocument {
  let doc = createEmptyDocument('Sample room (preset)');
  // Plans are capped at LIMITS.maxOpsPerPlan operations, so the scene is applied in batches.
  for (let i = 0; i < SAMPLE_OPERATIONS.length; i += LIMITS.maxOpsPerPlan) {
    const result = applyOperations(doc, SAMPLE_OPERATIONS.slice(i, i + LIMITS.maxOpsPerPlan), { selectedId: null });
    if (!result.ok) throw new Error(`Sample scene is invalid: ${result.error}`);
    doc = result.doc;
  }
  return doc;
}
