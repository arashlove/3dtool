import { describe, expect, it } from 'vitest';
import { applyOperations, applyPlan, requiresConfirmation } from '@/core/commands/dispatcher';
import { parsePlanText } from '@/core/commands/parser';
import { sceneMaster } from '@/core/geometry/ThreeSceneMaster';
import { LIMITS } from '@/core/schema/constants';
import type { SceneOperation } from '@/core/schema/plan';
import { createEmptyDocument } from '@/core/schema/scene';
import { TABLE_PLAN_JSON, WIDEN_PLAN_JSON, idFactory, sceneWith } from '../fixtures/helpers';

const createTable: SceneOperation = { op: 'create', ref: 'new:t', kind: 'table', name: 'Desk', params: { width: 1.6 } };
const createChair: SceneOperation = { op: 'create', ref: 'new:c', kind: 'chair', name: 'Chair' };

describe('dispatcher', () => {
  it('applies the table fixture plan and the widen follow-up without clearing the scene', () => {
    const parsed = parsePlanText(TABLE_PLAN_JSON);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const first = applyPlan(createEmptyDocument(), parsed.plan, { selectedId: null, idFactory: idFactory() });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const table = first.doc.objects[0];
    expect(table.kind).toBe('table');
    expect(table.params.width).toBe(1.6);

    const withChair = applyOperations(first.doc, [createChair], { selectedId: null, idFactory: idFactory('c') });
    expect(withChair.ok).toBe(true);
    if (!withChair.ok) return;

    const widen = parsePlanText(WIDEN_PLAN_JSON);
    if (!widen.ok) throw new Error(widen.error);
    const second = applyPlan(withChair.doc, widen.plan, { selectedId: table.id });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.doc.objects).toHaveLength(2);
    const widened = second.doc.objects.find((o) => o.id === table.id)!;
    expect(widened.params.width).toBeCloseTo(1.8);
    expect(widened.materials.legs.color).toBe('#AEB4BB');
    expect(widened.materials.top).toEqual(table.materials.top);
  });

  it('keeps id, name, transform and other materials through a parameter rebuild', () => {
    const doc = sceneWith([createTable]);
    const t = doc.objects[0];
    const moved = applyOperations(doc, [{ op: 'set_transform', target: `obj:${t.id}`, position: [2, 0, 1], rotationDeg: [0, 90, 0] }], {
      selectedId: null,
    });
    if (!moved.ok) throw new Error(moved.error);
    const resized = applyOperations(moved.doc, [{ op: 'set_params', target: t.id, changes: { depth: 1 } }], { selectedId: null });
    if (!resized.ok) throw new Error(resized.error);
    const after = resized.doc.objects[0];
    expect(after.id).toBe(t.id);
    expect(after.name).toBe(t.name);
    expect(after.transform.position).toEqual([2, 0, 1]);
    expect(after.transform.rotation[1]).toBeCloseTo(Math.PI / 2);
    expect(after.materials).toEqual(t.materials);
  });

  it('rejects invalid dimensions', () => {
    const doc = sceneWith([createTable]);
    const id = doc.objects[0].id;
    for (const width of [-1, 0, 1000]) {
      const r = applyOperations(doc, [{ op: 'set_params', target: id, changes: { width } }], { selectedId: null });
      expect(r.ok).toBe(false);
    }
    expect(parsePlanText('{"operations":[{"op":"set_params","target":"x","changes":{"width":NaN}}]}').ok).toBe(false);
    expect(parsePlanText('{"operations":[{"op":"set_params","target":"x","changes":{"width":1e999}}]}').ok).toBe(false);
  });

  it('material edits only change the named slot and reject unknown parts', () => {
    const doc = sceneWith([createTable]);
    const t = doc.objects[0];
    const ok = applyOperations(doc, [{ op: 'set_material', target: t.id, part: 'legs', changes: { color: 'silver' } }], {
      selectedId: null,
    });
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.doc.objects[0].materials.legs.color).toBe('#AEB4BB');
    expect(ok.doc.objects[0].materials.top).toEqual(t.materials.top);

    const bad = applyOperations(doc, [{ op: 'set_material', target: t.id, part: 'wheels', changes: { color: 'red' } }], {
      selectedId: null,
    });
    expect(bad.ok).toBe(false);
  });

  it('a failure halfway through a plan leaves the scene unchanged', () => {
    const doc = sceneWith([createTable]);
    const before = structuredClone(doc);
    const r = applyOperations(
      doc,
      [
        { op: 'create', ref: 'new:x', kind: 'box' },
        { op: 'set_params', target: 'new:x', changes: { width: -5 } },
      ],
      { selectedId: null },
    );
    expect(r.ok).toBe(false);
    expect(doc).toEqual(before);
  });

  it('resolves new: references within a plan and never reuses model ids', () => {
    const doc = sceneWith([createTable]);
    const existingId = doc.objects[0].id;
    const r = applyOperations(
      doc,
      [
        { op: 'create', ref: 'new:c1', kind: 'chair' },
        { op: 'set_material', target: 'new:c1', part: 'seat', changes: { color: 'red' } },
      ],
      { selectedId: null, idFactory: () => existingId },
    );
    expect(r.ok).toBe(false);

    const unknownRef = applyOperations(doc, [{ op: 'delete', target: 'new:ghost' }], { selectedId: null });
    expect(unknownRef.ok).toBe(false);

    const good = applyOperations(
      doc,
      [
        { op: 'create', ref: 'new:c1', kind: 'chair' },
        { op: 'set_material', target: 'new:c1', part: 'seat', changes: { color: 'red' } },
      ],
      { selectedId: null, idFactory: idFactory('fresh') },
    );
    if (!good.ok) throw new Error(good.error);
    const chair = good.doc.objects.find((o) => o.kind === 'chair')!;
    expect(chair.id).toBe('fresh-0001');
    expect(chair.materials.seat.color).toBe('#C0392B');
  });

  it('relative placement uses world bounds and the gap', () => {
    const doc = sceneWith([createTable]);
    const tableId = doc.objects[0].id;
    const r = applyOperations(
      doc,
      [createChair, { op: 'place_relative', target: 'new:c', anchor: `obj:${tableId}`, relation: 'right_of', gap: 0.15 }],
      { selectedId: null },
    );
    if (!r.ok) throw new Error(r.error);
    const table = sceneMaster.getBounds(r.doc.objects[0]);
    const chair = sceneMaster.getBounds(r.doc.objects[1]);
    expect(chair.min[0] - table.max[0]).toBeCloseTo(0.15, 3);
    expect(chair.min[1]).toBeCloseTo(0, 3);

    const onTop = applyOperations(
      r.doc,
      [
        { op: 'create', ref: 'new:l', kind: 'lamp', params: { height: 0.5, shadeHeight: 0.15 } },
        { op: 'place_relative', target: 'new:l', anchor: tableId, relation: 'on_top_of' },
      ],
      { selectedId: null },
    );
    if (!onTop.ok) throw new Error(onTop.error);
    const lamp = sceneMaster.getBounds(onTop.doc.objects[2]);
    expect(lamp.min[1]).toBeCloseTo(table.max[1], 3);
  });

  it('locked objects cannot be edited or deleted', () => {
    const doc = sceneWith([createTable]);
    doc.objects[0].locked = true;
    const id = doc.objects[0].id;
    const ops: SceneOperation[] = [
      { op: 'set_params', target: id, changes: { width: 2 } },
      { op: 'set_material', target: id, part: 'top', changes: { color: 'red' } },
      { op: 'set_transform', target: id, position: [1, 0, 0] },
      { op: 'delete', target: id },
    ];
    for (const op of ops) expect(applyOperations(doc, [op], { selectedId: null }).ok).toBe(false);
  });

  it('enforces object count and operation budget', () => {
    let doc = createEmptyDocument();
    for (let i = 0; i < LIMITS.maxObjects; i++) {
      const r = applyOperations(doc, [{ op: 'create', kind: 'box', transform: { position: [0, 0, 0] } }], { selectedId: null });
      if (!r.ok) throw new Error(r.error);
      doc = r.doc;
    }
    expect(applyOperations(doc, [{ op: 'create', kind: 'box' }], { selectedId: null }).ok).toBe(false);
    const tooMany = Array.from({ length: LIMITS.maxOpsPerPlan + 1 }, () => ({ op: 'create', kind: 'box' }));
    expect(parsePlanText(JSON.stringify({ operations: tooMany })).ok).toBe(false);
  });

  it('duplicate makes a fresh id; delete flags confirmation', () => {
    const doc = sceneWith([createChair]);
    const r = applyOperations(doc, [{ op: 'duplicate', target: 'chair' }], { selectedId: null, idFactory: idFactory('dup') });
    if (!r.ok) throw new Error(r.error);
    expect(r.doc.objects).toHaveLength(2);
    expect(r.doc.objects[1].id).toBe('dup-0001');
    expect(r.doc.objects[1].name).toBe('Chair copy');
    const plan = parsePlanText(JSON.stringify({ operations: [{ op: 'delete', target: 'selected' }] }));
    if (!plan.ok) throw new Error(plan.error);
    expect(requiresConfirmation(plan.plan)).toBe(true);
  });

  it('ambiguous kind references are rejected', () => {
    const doc = sceneWith([
      { op: 'create', kind: 'chair', name: 'Left seat' },
      { op: 'create', kind: 'chair', name: 'Right seat' },
    ]);
    expect(applyOperations(doc, [{ op: 'delete', target: 'chair' }], { selectedId: null }).ok).toBe(false);
    expect(applyOperations(doc, [{ op: 'set_params', target: 'selected', changes: { width: 0.5 } }], { selectedId: null }).ok).toBe(false);
  });
});
