import * as THREE from 'three';
import type { MaterialSpec } from '../schema/material';

export function createMaterial(spec: MaterialSpec, options: { doubleSide?: boolean } = {}): THREE.MeshStandardMaterial {
  const opacity = spec.opacity ?? 1;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(spec.color),
    metalness: spec.metalness,
    roughness: spec.roughness,
    transparent: opacity < 1,
    opacity,
    side: options.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (opacity < 1) material.depthWrite = false;
  return material;
}
