import { formatZodError, safeJsonParse } from '../commands/parser';
import { LIMITS } from '../schema/constants';
import { SceneDocumentSchema, type SceneDocument } from '../schema/scene';

export type ImportResult = { ok: true; doc: SceneDocument } | { ok: false; error: string };

/** Migration seam: only schemaVersion 1 exists today. */
export function migrateSceneDocument(raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, error: 'File is not a scene document.' };
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === 1) return { ok: true, value: raw };
  return { ok: false, error: `Unsupported schemaVersion ${JSON.stringify(version)}. This app reads version 1.` };
}

export function validateSceneDocument(value: unknown): ImportResult {
  const migrated = migrateSceneDocument(value);
  if (!migrated.ok) return migrated;
  const parsed = SceneDocumentSchema.safeParse(migrated.value);
  if (!parsed.success) return { ok: false, error: `Invalid scene file: ${formatZodError(parsed.error)}` };
  return { ok: true, doc: parsed.data };
}

export function parseSceneDocumentText(text: string): ImportResult {
  if (text.length > LIMITS.maxImportBytes) return { ok: false, error: 'File is too large (max 2 MB).' };
  const json = safeJsonParse(text);
  if (!json.ok) return { ok: false, error: `Not valid JSON: ${json.error}` };
  return validateSceneDocument(json.value);
}

export function serializeSceneDocument(doc: SceneDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function projectFileName(doc: SceneDocument): string {
  const slug = doc.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `${slug || 'scene'}.3dtool.json`;
}
