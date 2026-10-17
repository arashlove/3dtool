import { applyOperations } from '@/core/commands/dispatcher';
import type { SceneOperation } from '@/core/schema/plan';
import { createEmptyDocument, type SceneDocument } from '@/core/schema/scene';

export function idFactory(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(4, '0')}`;
}

export function sceneWith(ops: SceneOperation[]): SceneDocument {
  const result = applyOperations(createEmptyDocument('Test'), ops, { selectedId: null, idFactory: idFactory('seed') });
  if (!result.ok) throw new Error(result.error);
  return result.doc;
}

export const TABLE_PLAN_JSON = JSON.stringify({
  version: 1,
  status: 'ok',
  message: 'Create a 1.6 m table with an oak-coloured top and four black legs.',
  operations: [
    {
      op: 'create',
      ref: 'new:table1',
      kind: 'table',
      name: 'Oak Dining Table',
      params: { width: 1.6, depth: 0.85, height: 0.75, topThickness: 0.05, legThickness: 0.055, legInset: 0.12 },
      materials: {
        top: { color: '#AA7B4E', metalness: 0, roughness: 0.66 },
        legs: { color: '#242424', metalness: 0.7, roughness: 0.75 },
      },
    },
  ],
});

export const WIDEN_PLAN_JSON = JSON.stringify({
  version: 1,
  status: 'ok',
  message: 'Widen the selected table to 1.8 m and set its legs to silver.',
  operations: [
    { op: 'set_params', target: 'selected', changes: { width: 1.8 } },
    { op: 'set_material', target: 'selected', part: 'legs', changes: { color: '#AEB4BB', metalness: 0.85, roughness: 0.3 } },
  ],
});
