import type { SceneDocument, SceneObject } from '@/core/schema/scene';

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Reuses unchanged object/params/materials/transform references from the previous document so the
 * canvas only rebuilds geometry for objects whose parameters or materials actually changed.
 */
export function shareUnchanged(prev: SceneDocument, next: SceneDocument): SceneDocument {
  const previous = new Map(prev.objects.map((o) => [o.id, o]));
  const objects = next.objects.map((o): SceneObject => {
    const old = previous.get(o.id);
    if (!old) return o;
    if (same(old, o)) return old;
    return {
      ...o,
      params: same(old.params, o.params) ? old.params : o.params,
      materials: same(old.materials, o.materials) ? old.materials : o.materials,
      transform: same(old.transform, o.transform) ? old.transform : o.transform,
    };
  });
  return { ...next, objects, settings: same(prev.settings, next.settings) ? prev.settings : next.settings };
}
