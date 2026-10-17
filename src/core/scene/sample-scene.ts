import { applyOperations } from '../commands/dispatcher';
import { createEmptyDocument, type SceneDocument } from '../schema/scene';
import type { SceneOperation } from '../schema/plan';

/** A hand-written preset scene. It is labelled as a preset in the UI, never as AI output. */
const SAMPLE_OPERATIONS: SceneOperation[] = [
  {
    op: 'create',
    ref: 'new:desk',
    kind: 'table',
    name: 'Oak Desk',
    params: { width: 1.6, depth: 0.75 },
    materials: { top: { preset: 'wood', color: 'oak' }, legs: { preset: 'matteMetal', color: 'black' } },
    transform: { position: [0, 0, 0] },
  },
  {
    op: 'create',
    ref: 'new:chair',
    kind: 'chair',
    name: 'Blue Chair',
    materials: { seat: { preset: 'fabric', color: '#2E64C5' }, back: { preset: 'fabric', color: '#2E64C5' } },
    transform: { position: [0.1, 0, 0.75], rotationDeg: [0, 180, 0] },
  },
  {
    op: 'create',
    ref: 'new:lamp',
    kind: 'lamp',
    name: 'Desk Lamp',
    params: { height: 0.5, baseRadius: 0.08, shadeRadius: 0.12, shadeHeight: 0.14 },
    materials: { shade: { color: 'cream' } },
  },
  { op: 'place_relative', target: 'new:lamp', anchor: 'new:desk', relation: 'on_top_of' },
  {
    op: 'create',
    ref: 'new:shelf',
    kind: 'shelf',
    name: 'Bookshelf',
    transform: { position: [-1.6, 0, -0.2] },
  },
];

export function createSampleScene(): SceneDocument {
  const doc = createEmptyDocument('Sample scene (preset)');
  const result = applyOperations(doc, SAMPLE_OPERATIONS, { selectedId: null });
  if (!result.ok) throw new Error(`Sample scene is invalid: ${result.error}`);
  const lamp = result.doc.objects.find((o) => o.kind === 'lamp');
  if (lamp) lamp.transform.position = [0.55, lamp.transform.position[1], -0.15];
  return result.doc;
}
