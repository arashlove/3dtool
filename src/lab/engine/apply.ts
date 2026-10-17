import * as THREE from 'three';
import type { EditStep, Operation, TextureKind } from '../types';
import { applyAppearance } from './appearance';
import { projectDecal, wrapAspect, type ViewportHandle } from './decal';
import { buildDeform, deformMesh, GEOMETRIC_OPS, inflateMesh } from './deform';
import { boundsOf, collectParts, modelSize as measureModel, type PartMesh } from './parts';
import { splitRegion } from './split';
import { Transaction, type HistoryEntry } from './transaction';

export type EditContext = {
  loadTexture: (prompt: string, kind: TextureKind, aspect: number) => Promise<THREE.Texture>;
  viewport?: ViewportHandle;
};

export type ApplyResult = { entry: HistoryEntry | null; warnings: string[]; created: string[] };


/**
 * Applies plan steps to the live scene as one undoable transaction. Images are generated first,
 * so a failed Hugging Face request never leaves the model half-edited.
 */
export async function applySteps(root: THREE.Object3D, steps: EditStep[], ctx: EditContext, label: string): Promise<ApplyResult> {
  const warnings: string[] = [];
  const created: string[] = [];
  const parts = collectParts(root);
  const resolve = (ids: string[]) => {
    const meshes: PartMesh[] = [];
    for (const id of ids) {
      const m = parts.get(id);
      if (m) meshes.push(m);
      else warnings.push(`Part ${id} no longer exists.`);
    }
    return meshes;
  };

  // 1. Images first, in parallel (identical requests are shared).
  const requests = new Map<string, Promise<THREE.Texture>>();
  const pending: Array<[Operation, Promise<THREE.Texture>]> = [];
  for (const step of steps) {
    for (const op of step.operations) {
      if (op.type !== 'texture' && op.type !== 'decal') continue;
      const wrap = op.type === 'decal' && op.direction === 'around';
      const aspect = wrap ? wrapAspect(resolve(step.targets), op.decal_size ?? 0.8) : 1;
      const kind: TextureKind = op.type === 'texture' ? 'seamless' : wrap ? 'wrap' : 'decal';
      const prompt = (op.texture_prompt ?? op.decal_prompt)!;
      const key = `${kind}|${prompt}|${aspect.toFixed(2)}`;
      if (!requests.has(key)) requests.set(key, ctx.loadTexture(prompt, kind, aspect));
      pending.push([op, requests.get(key)!]);
    }
  }
  const loaded = new Map<Operation, THREE.Texture>();
  await Promise.all(pending.map(async ([op, p]) => loaded.set(op, await p)));

  // 2. Geometry and materials, in one transaction.
  const size = measureModel(root);
  const tx = new Transaction();
  try {
    for (const step of steps) {
      let meshes = resolve(step.targets);
      if (step.region) {
        meshes = meshes
          .map((m) => {
            const piece = splitRegion(tx, root, m, step.region!);
            if (piece && piece !== m) created.push(piece.userData.partId as string);
            return piece;
          })
          .filter((m): m is PartMesh => m !== null);
        if (meshes.length === 0) warnings.push('The region did not contain any faces.');
      }
      if (meshes.length === 0) continue;

      for (const op of step.operations) {
        if (GEOMETRIC_OPS.has(op.type)) {
          const groupBox = step.pivot === 'group' ? boundsOf(meshes) : null;
          for (const m of meshes) {
            const box = groupBox ?? new THREE.Box3().setFromObject(m, true);
            const deform = buildDeform(op, box, size);
            if (deform) deformMesh(tx, m, deform, size);
          }
        } else if (op.type === 'inflate') {
          for (const m of meshes) inflateMesh(tx, m, (op.factor ?? 0) * size);
        } else if (op.type === 'decal') {
          const texture = loaded.get(op);
          if (!texture) throw new Error('Decal image was not generated.');
          const overlays = projectDecal(tx, root, meshes, op, texture, size, ctx.viewport);
          if (overlays.length === 0) warnings.push(`No surface of ${meshes.map((m) => m.userData.label).join(', ')} faces ${op.direction}.`);
          created.push(...overlays.map((o) => o.userData.partId as string));
        } else {
          const texture = loaded.get(op);
          for (const m of meshes) applyAppearance(tx, m, op, texture);
        }
      }
    }
  } catch (e) {
    tx.rollback();
    throw e;
  }
  return { entry: tx.changed ? tx.commit(label) : null, warnings, created };
}
