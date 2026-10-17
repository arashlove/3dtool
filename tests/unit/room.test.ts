import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { sceneMaster } from '@/core/geometry/ThreeSceneMaster';
import { defaultMaterials, defaultParams, validateParams } from '@/core/schema/kinds';
import { IDENTITY_TRANSFORM, type SceneObject } from '@/core/schema/scene';

function room(params: Partial<SceneObject['params']> = {}): SceneObject {
  return {
    id: 'test-room',
    name: 'Room',
    kind: 'room',
    params: { ...defaultParams('room'), ...params } as SceneObject['params'],
    transform: structuredClone(IDENTITY_TRANSFORM),
    materials: defaultMaterials('room'),
    visible: true,
    locked: false,
  };
}

function partCount(obj: THREE.Object3D, part: string) {
  let count = 0;
  obj.traverse((c) => {
    if ((c as THREE.Mesh).isMesh && c.userData.partKey === part) count++;
  });
  return count;
}

describe('room', () => {
  it('default room is valid and has a floor, a door and a window', () => {
    expect(validateParams('room', defaultParams('room'))).toEqual([]);
    const g = sceneMaster.build(room());
    expect(partCount(g, 'floor')).toBe(1);
    expect(partCount(g, 'door')).toBe(1);
    expect(partCount(g, 'window')).toBe(1);
  });

  it('footprint matches width and depth', () => {
    const b = sceneMaster.getBounds(room({ width: 6, depth: 3.5 }));
    expect(b.max[0] - b.min[0]).toBeCloseTo(6, 3);
    expect(b.max[2] - b.min[2]).toBeCloseTo(3.5, 3);
    expect(b.min[1]).toBeCloseTo(0, 5);
  });

  it('door and window can be switched off; the front wall can be switched on', () => {
    const plain = sceneMaster.build(room({ hasDoor: false, hasWindow: false }));
    expect(partCount(plain, 'door')).toBe(0);
    expect(partCount(plain, 'window')).toBe(0);
    const closed = sceneMaster.build(room({ showFrontWall: true }));
    expect(partCount(closed, 'walls')).toBeGreaterThan(partCount(sceneMaster.build(room()), 'walls'));
  });

  it('rejects a door that does not fit', () => {
    expect(validateParams('room', { ...defaultParams('room'), width: 2, doorOffset: 1 }).length).toBeGreaterThan(0);
    expect(validateParams('room', { ...defaultParams('room'), doorHeight: 2.8 }).length).toBeGreaterThan(0);
  });
});