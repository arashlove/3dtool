import { sceneMaster, type ThreeSceneMaster } from '../geometry/ThreeSceneMaster';
import { LIMITS } from '../schema/constants';
import { partKeys, type ObjectKind, type Params } from '../schema/kinds';
import type { SceneDocument } from '../schema/scene';

export type CompactObject = {
  ref: string;
  kind: ObjectKind;
  name: string;
  center: [number, number, number];
  size: [number, number, number];
};

export type CompactSceneContext = {
  selected: (CompactObject & { params: Params; parts: string[] }) | null;
  objects: CompactObject[];
  totalObjects: number;
  /** Alias ("obj:1") to real object ID. Never shown to the user; used by the dispatcher. */
  aliases: Record<string, string>;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function buildCompactSceneContext(
  doc: SceneDocument,
  selectedId: string | null,
  master: ThreeSceneMaster = sceneMaster,
): CompactSceneContext {
  const aliases: Record<string, string> = {};
  const compact = doc.objects.map((o, i): CompactObject => {
    const ref = `obj:${i + 1}`;
    aliases[ref] = o.id;
    const b = master.getBounds(o);
    return {
      ref,
      kind: o.kind,
      name: o.name.slice(0, 40),
      center: [r2((b.min[0] + b.max[0]) / 2), r2(b.min[1]), r2((b.min[2] + b.max[2]) / 2)],
      size: [r2(b.max[0] - b.min[0]), r2(b.max[1] - b.min[1]), r2(b.max[2] - b.min[2])],
    };
  });

  const selectedIndex = selectedId ? doc.objects.findIndex((o) => o.id === selectedId) : -1;
  const selected =
    selectedIndex >= 0
      ? {
          ...compact[selectedIndex],
          params: doc.objects[selectedIndex].params,
          parts: partKeys(doc.objects[selectedIndex].kind),
        }
      : null;

  return {
    selected,
    objects: compact.slice(-LIMITS.maxContextObjects),
    totalObjects: compact.length,
    aliases,
  };
}

export function formatSceneContext(ctx: CompactSceneContext): string {
  const lines: string[] = [];
  if (ctx.selected) {
    const s = ctx.selected;
    const params = Object.entries(s.params)
      .map(([k, v]) => `${k}=${typeof v === 'number' ? r2(v) : v}`)
      .join(',');
    lines.push(`selected: ${s.ref} ${s.kind} "${s.name}" params(${params}) parts:${s.parts.join(',')}`);
  } else {
    lines.push('selected: none');
  }
  if (ctx.objects.length === 0) {
    lines.push('objects: none');
  } else {
    lines.push(`objects (${ctx.totalObjects}):`);
    for (const o of ctx.objects) {
      lines.push(`${o.ref} ${o.kind} "${o.name}" at[${o.center.join(',')}] size[${o.size.join(',')}]`);
    }
  }
  return lines.join('\n');
}
