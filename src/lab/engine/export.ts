import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { collectParts } from './parts';

/**
 * Binary glTF of the visible parts. `names: "label"` writes human labels as node names;
 * `names: "id"` writes part ids. Node names are restored afterwards.
 */
export async function exportGlb(root: THREE.Object3D, names: 'label' | 'id' = 'label'): Promise<ArrayBuffer> {
  const parts = [...collectParts(root).values()];
  const previous = parts.map((m) => m.name);
  parts.forEach((m) => {
    m.name = names === 'id' ? (m.userData.partId as string) : ((m.userData.label as string) ?? m.name);
  });
  try {
    const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
    if (!(result instanceof ArrayBuffer)) throw new Error('GLB exporter did not return binary data.');
    return result;
  } finally {
    parts.forEach((m, i) => {
      m.name = previous[i];
    });
  }
}
