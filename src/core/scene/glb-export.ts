import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { disposeObject, sceneMaster } from '../geometry/ThreeSceneMaster';
import type { SceneDocument } from '../schema/scene';

/**
 * Exports the document's visible objects as a binary glTF. The export scene is rebuilt from the
 * document, so grids, gizmos, selection helpers and lights are never included.
 */
export async function exportSceneToGlb(doc: SceneDocument): Promise<ArrayBuffer> {
  const scene = sceneMaster.buildExportScene(doc);
  try {
    const exporter = new GLTFExporter();
    const result = await exporter.parseAsync(scene, { binary: true, onlyVisible: true });
    if (!(result instanceof ArrayBuffer)) throw new Error('GLB exporter did not return binary data.');
    return result;
  } finally {
    disposeObject(scene);
  }
}
