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

const KIND_SYNONYMS: Record<string, ObjectKind> = {
  desk: 'table',
  bookshelf: 'shelf',
  bookcase: 'shelf',
  shelving: 'shelf',
  couch: 'sofa',
  cube: 'box',
  ball: 'sphere',
  ring: 'torus',
  donut: 'torus',
  stool: 'chair',
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

  const kind = (OBJECT_KINDS as readonly string[]).includes(name) ? (name as ObjectKind) : KIND_SYNONYMS[name];
  if (kind) {
    const byKind = doc.objects.filter((o) => o.kind === kind);
    if (byKind.length === 1) return { ok: true, id: byKind[0].id };
    if (byKind.length > 1) return { ok: false, error: `There are several ${kind} objects. Select the one you mean.` };
  }
  return { ok: false, error: `Could not find an object matching "${target}".` };
}
