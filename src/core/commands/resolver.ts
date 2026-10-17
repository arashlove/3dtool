import { OBJECT_KINDS, type ObjectKind } from '../schema/kinds';
import type { SceneDocument } from '../schema/scene';

export type ResolveContext = {
  selectedId: string | null;
  /** Short aliases shown to the model (e.g. "obj:1") mapped to real object IDs. */
  aliases: Record<string, string>;
  /** Transient "new:..." references created earlier in the same plan. */
  refs: Map<string, string>;
};

export type ResolveResult = { ok: true; id: string } | { ok: false; error: string };

const TABLES: ObjectKind[] = ['table', 'dining_table_rectangular', 'coffee_table_rectangular', 'desk_basic'];
const CHAIRS: ObjectKind[] = ['chair', 'dining_chair_basic'];
const SHELVES: ObjectKind[] = ['shelf', 'bookshelf_open', 'floating_shelf'];
const SOFAS: ObjectKind[] = ['sofa', 'sofa_two_seater'];
const LAMPS: ObjectKind[] = ['lamp', 'lamp_table'];

/** Everyday names mapped to every kind they may refer to; a match must still be unique in the scene. */
const KIND_SYNONYMS: Record<string, ObjectKind[]> = {
  table: TABLES,
  'dining table': ['dining_table_rectangular', 'table'],
  'coffee table': ['coffee_table_rectangular'],
  desk: ['desk_basic', 'table'],
  chair: CHAIRS,
  'dining chair': CHAIRS,
  stool: ['chair'],
  shelf: SHELVES,
  bookshelf: ['bookshelf_open', 'shelf'],
  bookcase: ['bookshelf_open', 'shelf'],
  shelving: SHELVES,
  'floating shelf': ['floating_shelf'],
  'wall shelf': ['floating_shelf'],
  sofa: SOFAS,
  couch: SOFAS,
  lamp: LAMPS,
  'table lamp': ['lamp_table'],
  bed: ['bed_platform'],
  nightstand: ['nightstand_basic'],
  'bedside table': ['nightstand_basic'],
  cabinet: ['cabinet_basic'],
  cupboard: ['cabinet_basic'],
  tv: ['television_flat'],
  television: ['television_flat'],
  picture: ['picture_framed'],
  painting: ['picture_framed'],
  artwork: ['picture_framed'],
  mirror: ['mirror_rectangular'],
  rug: ['rug_rectangular'],
  carpet: ['rug_rectangular'],
  plant: ['plant_pot'],
  pot: ['plant_pot'],
  door: ['door_single'],
  window: ['window_single'],
  wall: ['room_wall'],
  floor: ['room_floor'],
  ceiling: ['room_ceiling'],
  cube: ['box'],
  ball: ['sphere'],
  ring: ['torus'],
  donut: ['torus'],
};

export function resolveTarget(doc: SceneDocument, rawTarget: string, ctx: ResolveContext): ResolveResult {
  const target = rawTarget.trim();
  const exists = (id: string) => doc.objects.some((o) => o.id === id);

  if (target === 'selected') {
    if (!ctx.selectedId) return { ok: false, error: 'No object is selected.' };
    if (!exists(ctx.selectedId)) return { ok: false, error: 'The selected object no longer exists.' };
    return { ok: true, id: ctx.selectedId };
  }

  if (target.startsWith('new:')) {
    const id = ctx.refs.get(target);
    if (!id) return { ok: false, error: `Reference "${target}" was not created earlier in this plan.` };
    if (!exists(id)) return { ok: false, error: `Object "${target}" was deleted earlier in this plan.` };
    return { ok: true, id };
  }

  if (target.startsWith('obj:')) {
    const aliased = ctx.aliases[target];
    const id = aliased ?? target.slice(4);
    if (!exists(id)) return { ok: false, error: `Object "${target}" does not exist.` };
    return { ok: true, id };
  }

  if (exists(target)) return { ok: true, id: target };

  const name = target.toLowerCase().replace(/^the\s+/, '');
  const byName = doc.objects.filter((o) => o.name.toLowerCase() === name);
  if (byName.length === 1) return { ok: true, id: byName[0].id };
  if (byName.length > 1) return { ok: false, error: `More than one object is named "${target}". Select one first.` };

  const kinds = new Set<string>(KIND_SYNONYMS[name] ?? []);
  if ((OBJECT_KINDS as readonly string[]).includes(name)) kinds.add(name);
  if (kinds.size > 0) {
    const byKind = doc.objects.filter((o) => kinds.has(o.kind));
    if (byKind.length === 1) return { ok: true, id: byKind[0].id };
    if (byKind.length > 1) return { ok: false, error: `There are several ${name} objects. Select the one you mean.` };
  }
  return { ok: false, error: `Could not find an object matching "${target}".` };
}
