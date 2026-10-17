'use client';

import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import type * as THREE from 'three';
import { applyTransform, disposeObject, sceneMaster } from '@/core/geometry/ThreeSceneMaster';
import { IDENTITY_TRANSFORM, type SceneObject } from '@/core/schema/scene';

type Props = {
  spec: SceneObject;
  onSelect: (id: string, part: string | null) => void;
  onRegister: (id: string, group: THREE.Group | null) => void;
};

function syncGroup(group: THREE.Group, transform: SceneObject['transform'], visible: boolean, name: string) {
  applyTransform(group, transform);
  group.visible = visible;
  group.name = name;
}

/** Renders one scene object. Geometry is rebuilt only when kind, params or materials change. */
export function SceneObjectView({ spec, onSelect, onRegister }: Props) {
  const { id, kind, params, materials, transform, visible, name } = spec;

  const group = useMemo(
    () =>
      sceneMaster.buildLocal({
        id,
        kind,
        params,
        materials,
        name: '',
        transform: IDENTITY_TRANSFORM,
        visible: true,
        locked: false,
      }),
    [id, kind, params, materials],
  );

  useEffect(() => () => disposeObject(group), [group]);

  useLayoutEffect(() => {
    syncGroup(group, transform, visible, name);
  }, [group, transform, visible, name]);

  useEffect(() => {
    onRegister(id, group);
    return () => onRegister(id, null);
  }, [id, group, onRegister]);

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    event.stopPropagation();
    onSelect(id, (event.object.userData.partKey as string | undefined) ?? null);
  };

  return <primitive object={group} onClick={handleClick} />;
}
