import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applySteps } from '@/lab/engine/apply';
import { buildDeform } from '@/lab/engine/deform';
import { connectedComponents, subGeometry, triangleCount } from '@/lab/engine/geometry';
import { cleanLabel, collectParts, describeAll, type PartMesh } from '@/lab/engine/parts';
import { applyFaceLabels } from '@/lab/engine/split';
import { Transaction } from '@/lab/engine/transaction';
import { heuristicPlan, parseAmount } from '@/lab/heuristic';
import { placeBeside } from '@/lab/loader';
import { normaliseOperation, planFromJson, resolveTarget } from '@/lab/plan';
import { partTable } from '@/lab/prompts';
import { chooseK, kmeans, segmentByTexture, srgbToLab } from '@/lab/texseg';
import type { PartInfo, PlanRequest } from '@/lab/types';

function part(id: string, label: string, geometry: THREE.BufferGeometry, color = '#808080', position: [number, number, number] = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color })) as PartMesh;
  mesh.position.set(...position);
  mesh.userData = { partId: id, label };
  return mesh;
}

/** A table: a top and four separate legs. */
function table() {
  const root = new THREE.Group();
  root.add(part('part_000', 'Desk top', new THREE.BoxGeometry(1.6, 0.04, 0.8), '#8a5a33', [0, 0.73, 0]));
  [
    [-0.7, -0.35],
    [0.7, -0.35],
    [-0.7, 0.35],
    [0.7, 0.35],
  ].forEach(([x, z], i) => root.add(part(`part_00${i + 1}`, `Desk leg ${i + 1}`, new THREE.BoxGeometry(0.05, 0.71, 0.05), '#222222', [x, 0.355, z])));
  root.updateMatrixWorld(true);
  return root;
}

const noTextures = { loadTexture: async () => new THREE.Texture() };

function request(prompt: string, parts: PartInfo[], selected: string[] = []): PlanRequest {
  return { prompt, parts, selected_ids: selected, model_size: [1.6, 0.75, 0.8], model_center: [0, 0.375, 0] };
}

describe('plan validation', () => {
  it('clamps values, fixes hex colours and drops unknown operations', () => {
    expect(normaliseOperation({ type: 'material', metalness: 3, roughness: -1, opacity: 0 })).toEqual({ type: 'material', metalness: 1, roughness: 0, opacity: 0.02 });
    expect(normaliseOperation({ type: 'color', color: 'ff0000' })).toMatchObject({ color: '#ff0000' });
    expect(normaliseOperation({ type: 'scale', factor: 999 })).toMatchObject({ factor: 50, anchor: [0.5, 0.5, 0.5] });
    expect(normaliseOperation({ type: 'stretch', factors: [2] })).toMatchObject({ factors: [2, 1, 1] });
    expect(normaliseOperation({ type: 'explode' })).toBeNull();
    expect(normaliseOperation({ type: 'color', color: 'not a colour' })).toBeNull();
  });

  it('resolves targets by id, marker number and label, and drops unknown steps', () => {
    const parts = describeAll(table()).map((p, i) => ({ ...p, marker: i + 1 }));
    expect(resolveTarget('#2', parts)).toBe('part_001');
    expect(resolveTarget('3', parts)).toBe('part_002');
    expect(resolveTarget('desk top', parts)).toBe('part_000');
    const plan = planFromJson(
      { summary: 'x', steps: [{ targets: ['nope'], operations: [{ type: 'hide' }] }, { targets: ['#1'], operations: [{ type: 'hide' }, { type: 'bogus' }] }] },
      parts,
      'llm',
      'm',
    );
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].targets).toEqual(['part_000']);
    expect(plan.warnings).toHaveLength(2);
  });

  it('writes one part-table line per visible part', () => {
    const parts = describeAll(table());
    const lines = partTable(parts).split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/^part_000 \| - \| label="Desk top" \| .*tris=12$/);
  });
});

describe('offline keyword planner', () => {
  const parts = describeAll(table());

  it('parses amounts', () => {
    expect(parseAmount('make it 30% longer', true)).toBeCloseTo(1.3);
    expect(parseAmount('twice as big', true)).toBe(2);
    expect(parseAmount('half the size', false)).toBe(0.5);
  });

  it('targets matching labels and maps keywords to operations', () => {
    const plan = heuristicPlan(request('make the legs 30% longer and brushed gold', parts));
    expect(plan.steps[0].targets).toEqual(['part_001', 'part_002', 'part_003', 'part_004']);
    const types = plan.steps[0].operations.map((o) => o.type);
    expect(types).toEqual(['color', 'material', 'stretch']);
    const stretch = plan.steps[0].operations.find((o) => o.type === 'stretch')!;
    expect(stretch.factors?.[1]).toBeCloseTo(1.3);
    expect(stretch.anchor).toEqual([0.5, 1, 0.5]);
  });

  it('uses the selection for "it", and treats pictures as decals', () => {
    const plan = heuristicPlan(request('put a logo of a red dragon on it', parts, ['part_000']));
    expect(plan.steps[0].targets).toEqual(['part_000']);
    expect(plan.steps[0].operations[0]).toMatchObject({ type: 'decal', decal_prompt: 'a red dragon', direction: 'front' });
    const wrap = heuristicPlan(request('wrap a picture of a snake around the legs', parts));
    expect(wrap.steps[0].operations[0]).toMatchObject({ type: 'decal', direction: 'around' });
  });
});

describe('edit engine', () => {
  it('stretches a leg from its top anchor and keeps unit normals', async () => {
    const root = table();
    const leg = collectParts(root).get('part_001')!;
    const before = new THREE.Box3().setFromObject(leg);
    const r = await applySteps(root, [{ targets: ['part_001'], operations: [{ type: 'stretch', factors: [1, 2, 1], anchor: [0.5, 1, 0.5] }] }], noTextures, 'Stretch');
    const after = new THREE.Box3().setFromObject(leg);
    expect(after.max.y).toBeCloseTo(before.max.y, 5);
    expect(after.max.y - after.min.y).toBeCloseTo((before.max.y - before.min.y) * 2, 5);
    const n = new THREE.Vector3().fromBufferAttribute(leg.geometry.attributes.normal, 0);
    expect(n.length()).toBeCloseTo(1, 5);

    r.entry!.undo();
    expect(new THREE.Box3().setFromObject(leg).max.y - new THREE.Box3().setFromObject(leg).min.y).toBeCloseTo(before.max.y - before.min.y, 5);
    r.entry!.redo();
    expect(new THREE.Box3().setFromObject(leg).min.y).toBeCloseTo(after.min.y, 5);
  });

  it('never mutates the original geometry or material', async () => {
    const root = table();
    const top = collectParts(root).get('part_000')!;
    const geometry = top.geometry;
    const material = top.material as THREE.MeshStandardMaterial;
    await applySteps(root, [{ targets: ['part_000'], operations: [{ type: 'color', color: '#ff0000' }, { type: 'scale', factor: 2 }] }], noTextures, 'Edit');
    expect(top.geometry).not.toBe(geometry);
    expect(material.color.getHexString()).toBe('8a5a33');
    expect((top.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('ff0000');
  });

  it('rolls back everything when an edit fails halfway', async () => {
    const root = table();
    const top = collectParts(root).get('part_000')!;
    const geometry = top.geometry;
    const failing = { loadTexture: async () => Promise.reject(new Error('HF down')) };
    await expect(
      applySteps(root, [{ targets: ['part_000'], operations: [{ type: 'scale', factor: 2 }, { type: 'texture', texture_prompt: 'oak' }] }], failing, 'Edit'),
    ).rejects.toThrow('HF down');
    expect(top.geometry).toBe(geometry);
  });

  it('splits a region of one part into a new sibling part', async () => {
    const root = new THREE.Group();
    root.add(part('part_000', 'Vase', new THREE.CylinderGeometry(0.2, 0.2, 1, 16, 8), '#ffffff', [0, 0.5, 0]));
    const before = triangleCount(collectParts(root).get('part_000')!.geometry);
    const r = await applySteps(root, [{ targets: ['part_000'], region: { axis: 'y', start: 0.5, end: 1 }, operations: [{ type: 'color', color: '#0000ff' }] }], noTextures, 'Region');
    const parts = collectParts(root);
    expect(parts.size).toBe(2);
    const top = parts.get(r.created[0])!;
    expect(top.userData.label).toBe('Vase (top)');
    expect(triangleCount(top.geometry) + triangleCount(parts.get('part_000')!.geometry)).toBe(before);
    r.entry!.undo();
    expect(collectParts(root).size).toBe(1);
  });

  it('bends without moving the anchored end', () => {
    const box = new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 1, 0.1));
    const deform = buildDeform({ type: 'bend', axis: 'y', degrees: 90 }, box, 1)!;
    const out = new THREE.Vector3();
    deform(new THREE.Vector3(0, 0, 0), out);
    expect(out.length()).toBeCloseTo(0, 6);
    deform(new THREE.Vector3(0, 1, 0), out);
    // A quarter-circle arc of length 1 ends at radius 2/π from its start in both directions.
    expect(out.x).toBeCloseTo(2 / Math.PI, 4);
    expect(out.y).toBeCloseTo(2 / Math.PI, 4);
  });

  it('finds connected components and builds compact sub-geometries', () => {
    const a = new THREE.BoxGeometry(1, 1, 1);
    const b = new THREE.BoxGeometry(1, 1, 1).translate(3, 0, 0);
    const merged = new THREE.BufferGeometry();
    const pos = new Float32Array([...a.toNonIndexed().attributes.position.array, ...b.toNonIndexed().attributes.position.array]);
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const comps = connectedComponents(merged);
    expect(comps.map((c) => c.length)).toEqual([12, 12]);
    const sub = subGeometry(merged, comps[1]);
    expect(triangleCount(sub)).toBe(12);
    expect(sub.attributes.position.count).toBe(36);
  });

  it('cleans mesh names into labels', () => {
    expect(cleanLabel('node_damagedHelmet_-6514')).toBe('damaged Helmet');
    expect(cleanLabel('leg_fl')).toBe('leg fl');
  });
});

describe('texture segmentation (no AI)', () => {
  it('converts sRGB to CIELAB', () => {
    const [l, a, b] = srgbToLab(1, 1, 1);
    expect(l).toBeCloseTo(100, 1);
    expect(Math.abs(a)).toBeLessThan(0.1);
    expect(Math.abs(b)).toBeLessThan(0.1);
  });

  it('caps K at the number of distinct colours and auto-detects two clusters', () => {
    const points = new Float32Array(600);
    for (let i = 0; i < 200; i++) points.set(i < 100 ? [50, 60, 40] : [30, -10, -40], i * 3);
    expect(kmeans(points, 200, 8).k).toBe(2);
    expect(chooseK(points, 200)).toBe(2);
  });

  it('splits a two-coloured mesh into two named parts as one undo step', () => {
    const geometry = new THREE.PlaneGeometry(2, 1, 20, 10).toNonIndexed();
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const left = geometry.attributes.position.getX(i) < 0;
      // Linear-space versions of the named Red and Blue.
      colors.set(left ? [0.6, 0.02, 0.02] : [0.013, 0.125, 0.67], i * 3);
    }
    // Make each triangle a single colour (by its first vertex) so the boundary is clean.
    for (let f = 0; f < count / 3; f++) for (let k = 1; k < 3; k++) colors.set(colors.subarray(f * 9, f * 9 + 3), f * 9 + k * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffffff' })) as PartMesh;
    mesh.userData = { partId: 'part_000', label: 'Flag' };
    const root = new THREE.Group().add(mesh);
    root.updateMatrixWorld(true);

    const result = segmentByTexture(root, ['part_000'], null);
    expect(result.num_segments).toBe(2);
    expect(result.segments.map((s) => s.name).sort()).toEqual(['Blue', 'Red']);
    expect(result.face_labels.part_000).toHaveLength(triangleCount(geometry));

    const names = result.segments.map((s) => s.name);
    const applied = applyFaceLabels(root, result.face_labels, (l, o, split) => (split ? `${names[l]} · ${o.userData.label}` : o.userData.label), 'Segment');
    expect(applied.created).toBe(1);
    const labels = [...collectParts(root).values()].map((m) => m.userData.label).sort();
    expect(labels).toEqual(['Blue · Flag', 'Red · Flag']);
    applied.entry!.undo();
    expect([...collectParts(root).values()].map((m) => m.userData.label)).toEqual(['Flag']);
    expect(triangleCount(mesh.geometry)).toBe(triangleCount(geometry));
  });
});

describe('adding a generated model', () => {
  it('scales it to the requested height, stands it beside the scene and renumbers its parts', () => {
    const scene = table();
    const occupied = new THREE.Box3().setFromObject(scene);
    const generated = new THREE.Group();
    generated.add(part('part_000', 'body', new THREE.BoxGeometry(1, 1, 1), '#ffffff', [0, 0, 0]));
    generated.add(part('part_001', 'handle', new THREE.BoxGeometry(0.2, 0.2, 0.2), '#ffffff', [0.6, 0.2, 0]));
    const loaded = { root: generated, name: 'Mug', stats: { meshes: 2, parts: 2, triangles: 24 } };

    const parts = placeBeside(loaded, collectParts(scene).values(), occupied, 0.5);
    expect(parts.map((p) => p.userData.partId)).toEqual(['part_005', 'part_006']);
    expect(parts[0].userData.label).toBe('Mug body');
    const group = new THREE.Group();
    parts.forEach((p) => group.add(p));
    const box = new THREE.Box3().setFromObject(group);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(box.max.y - box.min.y).toBeCloseTo(0.5, 6);
    expect(box.min.x).toBeGreaterThan(occupied.max.x);
    expect(new Set(parts.map((p) => p.userData.groupId))).toEqual(new Set(['glb_1']));
  });

  it('keeps an imported file at its own size, and only rescales implausible sizes', () => {
    const occupied = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
    const make = (size: number) => ({
      root: new THREE.Group().add(part('part_000', 'body', new THREE.BoxGeometry(size, size, size))),
      name: 'Box',
      stats: { meshes: 1, parts: 1, triangles: 12 },
    });
    const heightOf = (meshes: THREE.Object3D[]) => new THREE.Box3().setFromObject(new THREE.Group().add(...meshes)).getSize(new THREE.Vector3()).y;
    expect(heightOf(placeBeside(make(0.3), [], occupied, null))).toBeCloseTo(0.3, 6);
    expect(heightOf(placeBeside(make(150), [], occupied, null))).toBeCloseTo(1, 6);
  });
});

describe('moving parts with the gizmo', () => {
  it('records transforms so a move is one undoable step', () => {
    const root = table();
    const top = collectParts(root).get('part_000')!;
    const before = top.position.clone();
    const tx = new Transaction();
    tx.track(top);
    expect(tx.moved).toBe(false);
    top.position.x += 2;
    top.rotation.y = 1;
    expect(tx.moved).toBe(true);
    const entry = tx.commit('Move');
    entry.undo();
    expect(top.position.equals(before)).toBe(true);
    expect(top.rotation.y).toBeCloseTo(0, 6);
    entry.redo();
    expect(top.position.x).toBeCloseTo(before.x + 2, 6);
  });
});
