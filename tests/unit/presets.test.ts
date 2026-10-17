import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyOperations } from '@/core/commands/dispatcher';
import { parsePlanText } from '@/core/commands/parser';
import { countGroupTriangles, sceneMaster } from '@/core/geometry/ThreeSceneMaster';
import { parseSceneDocumentText, serializeSceneDocument } from '@/core/scene/document-io';
import { createSampleScene } from '@/core/scene/sample-scene';
import { LIMITS } from '@/core/schema/constants';
import {
  KIND_CATEGORIES,
  KIND_DEFS,
  OBJECT_KINDS,
  defaultMaterials,
  defaultParams,
  validateParams,
  type ObjectKind,
  type Params,
} from '@/core/schema/kinds';
import { IDENTITY_TRANSFORM, SceneObjectSchema, createEmptyDocument, type SceneObject } from '@/core/schema/scene';
import { idFactory, sceneWith } from '../fixtures/helpers';

/** Phase 1 procedural presets (everything registered after the legacy "room" kind). */
const PRESETS = OBJECT_KINDS.slice(OBJECT_KINDS.indexOf('room') + 1) as ObjectKind[];

function spec(kind: ObjectKind, params: Partial<Params> = {}): SceneObject {
  return {
    id: `test-${kind}`,
    name: kind,
    kind,
    params: { ...defaultParams(kind), ...params } as Params,
    transform: structuredClone(IDENTITY_TRANSFORM),
    materials: defaultMaterials(kind),
    visible: true,
    locked: false,
  };
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const list: THREE.Mesh[] = [];
  root.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) list.push(c as THREE.Mesh);
  });
  return list;
}

function size(kind: ObjectKind, params: Partial<Params> = {}) {
  const b = sceneMaster.getBounds(spec(kind, params));
  return { x: b.max[0] - b.min[0], y: b.max[1] - b.min[1], z: b.max[2] - b.min[2], minY: b.min[1], maxY: b.max[1] };
}

/** Defaults, then each style option, flipped flag and numeric extreme on its own; invalid combinations are dropped. */
function variants(kind: ObjectKind): Params[] {
  const base = defaultParams(kind);
  const out: Params[] = [base];
  for (const p of KIND_DEFS[kind].params) {
    if (p.type === 'choice') for (const option of p.options) out.push({ ...base, [p.key]: option });
    else if (p.type === 'boolean') out.push({ ...base, [p.key]: !p.default });
    else out.push({ ...base, [p.key]: p.min }, { ...base, [p.key]: p.max });
  }
  return out.filter((v) => validateParams(kind, v).length === 0);
}

describe('preset registry', () => {
  it('has 21 phase-1 presets with unique ids and a category from the taxonomy', () => {
    expect(PRESETS).toHaveLength(21);
    expect(new Set(OBJECT_KINDS).size).toBe(OBJECT_KINDS.length);
    for (const kind of OBJECT_KINDS) {
      expect(KIND_DEFS[kind].kind).toBe(kind);
      expect(KIND_CATEGORIES).toContain(KIND_DEFS[kind].category);
    }
  });

  it.each(PRESETS)('%s: defaults are valid, part keys are non-empty and every part has a material', (kind) => {
    const def = KIND_DEFS[kind];
    expect(validateParams(kind, defaultParams(kind))).toEqual([]);
    expect(def.parts.length).toBeGreaterThan(0);
    for (const part of def.parts) {
      expect(part.key).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(def.defaultMaterials[part.key]).toBeDefined();
    }
    expect(Object.keys(def.defaultMaterials).sort()).toEqual(def.parts.map((p) => p.key).sort());
    for (const p of def.params) if (p.type === 'choice') expect(p.options).toContain(p.default);
    expect(SceneObjectSchema.safeParse(spec(kind)).success).toBe(true);
  });

  it.each(PRESETS)('%s: rejects zero, negative, non-finite and unknown style values before building', (kind) => {
    const def = KIND_DEFS[kind];
    for (const p of def.params) {
      if (p.type === 'number') {
        for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
          if (bad === 0 && p.min <= 0) continue;
          expect(validateParams(kind, { ...defaultParams(kind), [p.key]: bad }).length).toBeGreaterThan(0);
        }
      } else if (p.type === 'choice') {
        expect(validateParams(kind, { ...defaultParams(kind), [p.key]: 'alert(1)' }).length).toBeGreaterThan(0);
        expect(validateParams(kind, { ...defaultParams(kind), [p.key]: 1 }).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('preset geometry', () => {
  it.each(PRESETS)('%s: every option and extreme builds finite, tagged, grounded geometry within budget', (kind) => {
    const list = variants(kind);
    const choices = KIND_DEFS[kind].params.filter((p) => p.type === 'choice' || p.type === 'boolean').length;
    expect(list.length).toBeGreaterThan(choices);
    const parts = new Set(KIND_DEFS[kind].parts.map((p) => p.key));
    for (const params of list) {
      const s = spec(kind, params);
      const group = sceneMaster.build(s);
      const tris = countGroupTriangles(group);
      expect(tris).toBeGreaterThan(0);
      expect(tris).toBeLessThan(12_000);
      for (const mesh of meshes(group)) {
        expect(mesh.userData.objectId).toBe(s.id);
        expect(parts.has(mesh.userData.partKey)).toBe(true);
        for (const name of ['position', 'normal']) {
          const attr = mesh.geometry.getAttribute(name);
          expect(attr, `${kind} ${mesh.name} has ${name}`).toBeDefined();
          expect(Array.from(attr.array as ArrayLike<number>).every(Number.isFinite), `${kind} ${mesh.name} ${name} finite`).toBe(true);
        }
      }
      const b = sceneMaster.getBounds(s);
      expect(b.min[1]).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  it('floor-standing presets touch the floor at the default parameters', () => {
    const elevated = new Set<ObjectKind>(['room_ceiling']);
    for (const kind of PRESETS) {
      if (!elevated.has(kind)) expect(size(kind).minY, kind).toBeCloseTo(0, 3);
    }
    expect(size('room_ceiling', { height: 2.8 }).minY).toBeCloseTo(2.8, 3);
  });

  it('overall dimensions follow the size parameters', () => {
    const cases: Array<[ObjectKind, Partial<Params>, Partial<Record<'x' | 'y' | 'z', number>>]> = [
      ['room_floor', { width: 3.2, depth: 4.4, thickness: 0.06 }, { x: 3.2, y: 0.06, z: 4.4 }],
      ['room_floor', { width: 3.2, depth: 4.4, surface: 'tiles' }, { x: 3.2, z: 4.4 }],
      ['room_wall', { width: 3.5, height: 2.7, trim: 'none' }, { x: 3.5, y: 2.7, z: 0.12 }],
      ['door_single', { width: 0.9, height: 2.05 }, { x: 0.9, y: 2.05 }],
      ['window_single', { width: 1.4, height: 1.2 }, { y: 1.2 }],
      ['dining_table_rectangular', { width: 2, depth: 1, height: 0.76 }, { x: 2, y: 0.76, z: 1 }],
      ['coffee_table_rectangular', { width: 1.2, depth: 0.7, height: 0.4, style: 'sled' }, { x: 1.2, y: 0.4, z: 0.7 }],
      ['desk_basic', { width: 1.6, depth: 0.8, height: 0.74 }, { x: 1.6, y: 0.74, z: 0.8 }],
      ['dining_chair_basic', { width: 0.5, seatHeight: 0.45, backHeight: 0.9 }, { x: 0.5, y: 0.9 }],
      ['bed_platform', { width: 1.8, length: 2.1, headboardHeight: 1.1 }, { x: 1.8, y: 1.1, z: 2.1 }],
      ['nightstand_basic', { width: 0.45, height: 0.6 }, { x: 0.45, y: 0.6 }],
      ['bookshelf_open', { width: 1, height: 2, depth: 0.35 }, { x: 1, y: 2, z: 0.35 }],
      ['cabinet_basic', { width: 1.2, height: 0.85 }, { x: 1.2, y: 0.85 }],
      ['floating_shelf', { width: 1, depth: 0.25, thickness: 0.05 }, { x: 1, y: 0.05, z: 0.25 }],
      ['picture_framed', { width: 0.5, height: 0.7 }, { x: 0.5, y: 0.7 }],
      ['mirror_rectangular', { width: 0.7, height: 1.1 }, { x: 0.7, y: 1.1 }],
      ['mirror_rectangular', { width: 0.7, height: 1.1, frameThickness: 0 }, { x: 0.7, y: 1.1 }],
      ['rug_rectangular', { width: 2.4, depth: 1.7, thickness: 0.015, pattern: 'plain' }, { x: 2.4, y: 0.015, z: 1.7 }],
      ['television_flat', { width: 1.45, height: 0.83, mountStyle: 'wall' }, { x: 1.45, y: 0.83 }],
    ];
    for (const [kind, params, expected] of cases) {
      const s = size(kind, params);
      for (const axis of ['x', 'y', 'z'] as const) {
        if (expected[axis] !== undefined) expect(s[axis], `${kind} ${axis}`).toBeCloseTo(expected[axis]!, 2);
      }
    }
    expect(size('sofa_two_seater', { width: 1.8 }).x).toBeCloseTo(1.8, 2);
    expect(size('sofa_two_seater', { backHeight: 0.9 }).maxY).toBeCloseTo(0.9, 1);
    expect(size('lamp_table', { height: 0.6 }).maxY).toBeCloseTo(0.6, 1);
  });

  it('builders are deterministic: rebuilding gives identical vertex data', () => {
    for (const kind of ['plant_pot', 'room_floor', 'bed_platform'] as ObjectKind[]) {
      const a = meshes(sceneMaster.build(spec(kind)));
      const b = meshes(sceneMaster.build(spec(kind)));
      expect(a.map((m) => m.name)).toEqual(b.map((m) => m.name));
      a.forEach((m, i) => expect(Array.from(m.geometry.attributes.position.array)).toEqual(Array.from(b[i].geometry.attributes.position.array)));
    }
  });

  it('style parameters change the generated parts', () => {
    const partCount = (kind: ObjectKind, params: Partial<Params>, part: string) =>
      meshes(sceneMaster.build(spec(kind, params))).filter((m) => m.userData.partKey === part).length;
    expect(partCount('sofa_two_seater', { armStyle: 'track' }, 'arms')).toBe(2);
    expect(partCount('sofa_two_seater', { armStyle: 'rolled' }, 'arms')).toBe(4);
    expect(partCount('sofa_two_seater', { armStyle: 'none' }, 'arms')).toBe(0);
    expect(partCount('sofa_two_seater', { armStyle: 'none' }, 'cushions')).toBe(4);
    expect(partCount('cabinet_basic', { doorCount: 3, width: 1.2 }, 'doors')).toBe(3);
    expect(partCount('nightstand_basic', { drawerCount: 3, height: 0.7 }, 'drawers')).toBe(3);
    expect(partCount('bed_platform', { hasBedding: false }, 'pillows')).toBe(0);
    expect(partCount('bed_platform', { width: 1 }, 'pillows')).toBe(1);
    expect(partCount('plant_pot', { foliage: 'none' }, 'foliage')).toBe(0);
    expect(partCount('rug_rectangular', { pattern: 'plain' }, 'pattern')).toBe(0);
    expect(partCount('window_single', { hasSill: false }, 'sill')).toBe(0);
    expect(partCount('desk_basic', { hasDrawers: true }, 'handles')).toBe(1);
  });

  it('floor pieces stay bounded on very large floors', () => {
    const big = sceneMaster.build(spec('room_floor', { width: 20, depth: 20 }));
    expect(countGroupTriangles(big)).toBeLessThan(10_000);
  });
});

describe('presets through the command pipeline', () => {
  it('widening a dining table moves the legs outwards and keeps the object id', () => {
    const doc = sceneWith([{ op: 'create', ref: 'new:t', kind: 'dining_table_rectangular', name: 'Table', params: { width: 1.6 } }]);
    const id = doc.objects[0].id;
    const legX = (o: SceneObject) =>
      Math.max(...meshes(sceneMaster.build(o)).filter((m) => m.userData.partKey === 'legs').map((m) => m.position.x));
    const before = legX(doc.objects[0]);
    const r = applyOperations(doc, [{ op: 'set_params', target: id, changes: { width: 2.2 } }], { selectedId: id });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.objects[0].id).toBe(id);
    expect(legX(r.doc.objects[0]) - before).toBeCloseTo(0.3, 3);
  });

  it('recolouring only the chair legs leaves the seat material unchanged', () => {
    const doc = sceneWith([{ op: 'create', kind: 'dining_chair_basic', name: 'Chair' }]);
    const chair = doc.objects[0];
    const r = applyOperations(doc, [{ op: 'set_material', target: chair.id, part: 'legs', changes: { color: 'black' } }], {
      selectedId: null,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.objects[0].materials.legs.color).toBe('#1E1E1E');
    expect(r.doc.objects[0].materials.seat).toEqual(chair.materials.seat);
  });

  it('style names are set through set_params and validated against the option list', () => {
    const doc = sceneWith([{ op: 'create', kind: 'sofa_two_seater', name: 'Sofa' }]);
    const id = doc.objects[0].id;
    const ok = applyOperations(doc, [{ op: 'set_params', target: 'the sofa', changes: { armStyle: 'none' } }], { selectedId: null });
    expect(ok.ok && ok.doc.objects[0].params.armStyle).toBe('none');
    const bad = applyOperations(doc, [{ op: 'set_params', target: id, changes: { armStyle: 'winged' } }], { selectedId: null });
    expect(bad.ok).toBe(false);
  });

  it('LLM plans can create presets with styles; code-like or unknown values never reach geometry', () => {
    const good = parsePlanText(
      JSON.stringify({
        status: 'ok',
        message: 'Bedroom',
        operations: [
          { op: 'create', ref: 'new:b', kind: 'bed_platform', params: { width: 1.8 } },
          { op: 'create', ref: 'new:n', kind: 'nightstand_basic' },
          { op: 'place_relative', target: 'new:n', anchor: 'new:b', relation: 'left_of', gap: 0.05 },
          { op: 'create', kind: 'lamp_table', params: { shadeShape: 'bell' } },
        ],
      }),
    );
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    const r = applyOperations(createEmptyDocument(), good.plan.operations, { selectedId: null, idFactory: idFactory() });
    expect(r.ok).toBe(true);

    const evil = parsePlanText('{"operations":[{"op":"create","kind":"lamp_table","params":{"shadeShape":"new Function(1)"}}]}');
    expect(evil.ok).toBe(true);
    if (!evil.ok) return;
    expect(applyOperations(createEmptyDocument(), evil.plan.operations, { selectedId: null }).ok).toBe(false);
    expect(parsePlanText('{"operations":[{"op":"create","kind":"sofa_l_shaped"}]}').ok).toBe(false);
  });

  it('save and reload keeps preset kinds, style params, materials and transforms', () => {
    const doc = sceneWith([
      { op: 'create', kind: 'room_floor', params: { surface: 'tiles' }, transform: { position: [0, 0, 0] } },
      { op: 'create', kind: 'plant_pot', params: { foliage: 'spiky', shape: 'round' }, materials: { pot: { color: 'navy' } } },
      { op: 'create', kind: 'television_flat', params: { mountStyle: 'wall' }, transform: { position: [1, 1.2, -2], rotationDeg: [0, 90, 0] } },
    ]);
    const back = parseSceneDocumentText(serializeSceneDocument(doc));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.doc).toEqual(doc);
  });

  it('the default sample scene is a 10 m x 10 m room built only from procedural presets', () => {
    const doc = createSampleScene();
    expect(doc.objects.every((o) => PRESETS.includes(o.kind))).toBe(true);
    for (const kind of ['room_floor', 'room_wall', 'desk_basic', 'lamp_table', 'dining_chair_basic'] as ObjectKind[]) {
      expect(doc.objects.some((o) => o.kind === kind), kind).toBe(true);
    }
    const floor = doc.objects.find((o) => o.kind === 'room_floor')!;
    const b = sceneMaster.getBounds(floor);
    expect(b.max[0] - b.min[0]).toBeCloseTo(10, 3);
    expect(b.max[2] - b.min[2]).toBeCloseTo(10, 3);
    expect(doc.objects.length).toBeLessThanOrEqual(LIMITS.maxObjects - 8);
    expect(sceneMaster.countSceneTriangles(doc)).toBeLessThan(LIMITS.maxTriangles);
  });

  it('the sample room has three walls meeting corner to corner and non-overlapping furniture inside them', () => {
    const doc = createSampleScene();
    const bounds = new Map(doc.objects.map((o) => [o.name, sceneMaster.getBounds(o)]));
    const wall = (name: string) => bounds.get(name)!;
    const inner = 4.88;

    // Back wall spans the full width; side walls run from its inner face to the open front.
    expect(wall('Back Wall').min[0]).toBeCloseTo(-5, 3);
    expect(wall('Back Wall').max[0]).toBeCloseTo(5, 3);
    expect(wall('Back Wall').min[2]).toBeCloseTo(-5, 3);
    for (const [name, outerX] of [['Left Wall', -5], ['Right Wall', 5]] as const) {
      expect(Math.min(Math.abs(wall(name).min[0] - outerX), Math.abs(wall(name).max[0] - outerX)), name).toBeLessThan(1e-3);
      expect(wall(name).min[2], name).toBeCloseTo(-inner, 3);
      expect(wall(name).max[2], name).toBeCloseTo(5, 3);
    }

    const structural = new Set<ObjectKind>(['room_floor', 'room_wall']);
    const flat = new Set<ObjectKind>(['rug_rectangular']);
    const items = doc.objects.filter((o) => !structural.has(o.kind));
    for (const o of items) {
      const b = bounds.get(o.name)!;
      // The door's casing sits flush on the wall; only its far-side lever handle (2.8 cm) reaches into the slab.
      const slack = o.kind === 'door_single' ? 0.03 : 1e-3;
      expect(b.min[1], o.name).toBeGreaterThanOrEqual(0.05 - 1e-6);
      expect(b.min[0], o.name).toBeGreaterThanOrEqual(-inner - slack);
      expect(b.max[0], o.name).toBeLessThanOrEqual(inner + slack);
      expect(b.min[2], o.name).toBeGreaterThanOrEqual(-inner - 1e-3);
      expect(b.max[2], o.name).toBeLessThanOrEqual(5 + 1e-3);
    }

    // The desk chair is deliberately tucked under the desk; nothing else may intersect.
    const allowed = new Set(['Desk Chair|Oak Desk', 'Oak Desk|Desk Chair']);
    const solid = items.filter((o) => !flat.has(o.kind));
    const eps = 1e-3;
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        const [a, b] = [bounds.get(solid[i].name)!, bounds.get(solid[j].name)!];
        const overlap = [0, 1, 2].every((k) => a.min[k] < b.max[k] - eps && b.min[k] < a.max[k] - eps);
        if (!allowed.has(`${solid[i].name}|${solid[j].name}`)) expect(overlap, `${solid[i].name} vs ${solid[j].name}`).toBe(false);
      }
    }
  });

  it('a scene file with an unknown style name is rejected on import', () => {
    const doc = sceneWith([{ op: 'create', kind: 'rug_rectangular' }]);
    const tampered = structuredClone(doc);
    tampered.objects[0].params.pattern = 'paisley';
    expect(parseSceneDocumentText(JSON.stringify(tampered)).ok).toBe(false);
  });
});
