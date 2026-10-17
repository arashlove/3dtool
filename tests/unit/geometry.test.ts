import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { countGroupTriangles, sceneMaster } from '@/core/geometry/ThreeSceneMaster';
import { OBJECT_KINDS, defaultMaterials, defaultParams, partKeys } from '@/core/schema/kinds';
import { IDENTITY_TRANSFORM, type SceneObject } from '@/core/schema/scene';

function spec(kind: SceneObject['kind'], params: Partial<SceneObject['params']> = {}): SceneObject {
  return {
    id: `test-${kind}`,
    name: kind,
    kind,
    params: { ...defaultParams(kind), ...params } as SceneObject['params'],
    transform: structuredClone(IDENTITY_TRANSFORM),
    materials: defaultMaterials(kind),
    visible: true,
    locked: false,
  };
}

function meshes(group: THREE.Object3D) {
  const list: THREE.Mesh[] = [];
  group.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) list.push(c as THREE.Mesh);
  });
  return list;
}

describe('ThreeSceneMaster builders', () => {
  it.each(OBJECT_KINDS)('%s builds non-empty geometry resting on the floor', (kind) => {
    const s = spec(kind);
    const group = sceneMaster.build(s);
    expect(countGroupTriangles(group)).toBeGreaterThan(0);
    const b = sceneMaster.getBounds(s);
    expect(b.min.every(Number.isFinite) && b.max.every(Number.isFinite)).toBe(true);
    expect(b.min[1]).toBeGreaterThanOrEqual(-1e-6);
    expect(b.max[1]).toBeGreaterThan(0);
  });

  it.each(OBJECT_KINDS)('%s tags every mesh with object id and a known part key', (kind) => {
    const s = spec(kind);
    const parts = new Set(partKeys(kind));
    for (const mesh of meshes(sceneMaster.build(s))) {
      expect(mesh.userData.objectId).toBe(s.id);
      expect(parts.has(mesh.userData.partKey)).toBe(true);
    }
  });

  it('table has one top and four legs, and widening changes the geometry', () => {
    const narrow = sceneMaster.build(spec('table', { width: 1.2 }));
    const parts = meshes(narrow);
    expect(parts.filter((m) => m.userData.partKey === 'top')).toHaveLength(1);
    expect(parts.filter((m) => m.userData.partKey === 'legs')).toHaveLength(4);
    expect(parts.map((m) => m.name)).toEqual(
      expect.arrayContaining(['top', 'leg_front_left', 'leg_front_right', 'leg_back_left', 'leg_back_right']),
    );

    const a = sceneMaster.getBounds(spec('table', { width: 1.2 }));
    const b = sceneMaster.getBounds(spec('table', { width: 1.8 }));
    expect(a.max[0] - a.min[0]).toBeCloseTo(1.2, 3);
    expect(b.max[0] - b.min[0]).toBeCloseTo(1.8, 3);
    expect(b.max[1]).toBeCloseTo(0.75, 3);
  });

  it('material slots map to distinct materials (legs vs top)', () => {
    const s = spec('table');
    s.materials.legs = { color: '#AEB4BB', metalness: 0.9, roughness: 0.2 };
    const parts = meshes(sceneMaster.build(s));
    const top = parts.find((m) => m.userData.partKey === 'top')!.material as THREE.MeshStandardMaterial;
    const leg = parts.find((m) => m.userData.partKey === 'legs')!.material as THREE.MeshStandardMaterial;
    expect(top.color.getHexString()).toBe('aa7b4e');
    expect(leg.color.getHexString()).toBe('aeb4bb');
    expect(leg.metalness).toBeCloseTo(0.9);
  });

  it('shelf board count follows parameters', () => {
    const parts = meshes(sceneMaster.build(spec('shelf', { shelfCount: 7, height: 2 })));
    expect(parts.filter((m) => m.userData.partKey === 'shelves')).toHaveLength(7);
  });

  it('export scene contains only object geometry', () => {
    const scene = sceneMaster.buildExportScene({
      schemaVersion: 1,
      title: 'x',
      unit: 'm',
      objects: [spec('chair'), { ...spec('box'), id: 'hidden-1', visible: false }],
      settings: { gridVisible: true, shadowsEnabled: true, snapEnabled: false, snapStep: 0.05 },
    });
    expect(scene.children).toHaveLength(1);
    scene.traverse((o) => {
      expect(o.type).not.toMatch(/Helper|Light|Camera|Grid/);
    });
  });
});
