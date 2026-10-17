import { get, set } from 'idb-keyval';
import { validateSceneDocument } from '@/core/scene/document-io';
import type { SceneDocument } from '@/core/schema/scene';

const KEY = '3dtool:autosave:v1';

export type LoadAutosaveResult =
  | { status: 'found'; doc: SceneDocument }
  | { status: 'empty' }
  | { status: 'invalid'; error: string }
  | { status: 'unavailable'; error: string };

/** Autosaved data is treated as untrusted and goes through the same validators as imports. */
export async function loadAutosave(): Promise<LoadAutosaveResult> {
  try {
    const raw = await get(KEY);
    if (raw === undefined) return { status: 'empty' };
    const result = validateSceneDocument(raw);
    return result.ok ? { status: 'found', doc: result.doc } : { status: 'invalid', error: result.error };
  } catch (e) {
    return { status: 'unavailable', error: e instanceof Error ? e.message : 'IndexedDB unavailable' };
  }
}

export async function saveAutosave(doc: SceneDocument): Promise<boolean> {
  try {
    await set(KEY, doc);
    return true;
  } catch {
    return false;
  }
}
