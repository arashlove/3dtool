import type { z } from 'zod';
import { FORBIDDEN_KEYS, LIMITS } from '../schema/constants';
import { ScenePlanSchema, type ScenePlan } from '../schema/plan';

export type JsonResult = { ok: true; value: unknown } | { ok: false; error: string };

/** JSON.parse that rejects prototype-polluting keys. Parsing never evaluates code. */
export function safeJsonParse(text: string): JsonResult {
  try {
    const value = JSON.parse(text, (key, v) => {
      if (FORBIDDEN_KEYS.has(key)) throw new Error(`Forbidden key "${key}"`);
      return v;
    });
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON' };
  }
}

/**
 * Extracts exactly one bounded JSON object from raw model text.
 * Tolerates code fences, reasoning tags and prose around the object, but only the
 * first balanced object is considered; nothing else is used.
 */
export function extractJsonObject(raw: string): JsonResult {
  if (raw.length > LIMITS.maxModelOutputChars) return { ok: false, error: 'Model output is too long.' };
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  if (start < 0) return { ok: false, error: 'No JSON object found in the model output.' };

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return safeJsonParse(text.slice(start, i + 1));
    }
  }
  return { ok: false, error: 'The JSON object in the model output is incomplete (possibly truncated).' };
}

export function formatZodError(error: z.ZodError, max = 3): string {
  const lines = error.issues.slice(0, max).map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'plan';
    return `${path}: ${issue.message}`;
  });
  if (error.issues.length > max) lines.push(`…and ${error.issues.length - max} more problem(s).`);
  return lines.join('; ');
}

export type PlanParseResult =
  | { ok: true; plan: ScenePlan }
  | { ok: false; stage: 'json' | 'schema'; error: string };

export function parsePlanText(raw: string): PlanParseResult {
  const json = extractJsonObject(raw);
  if (!json.ok) return { ok: false, stage: 'json', error: json.error };
  return parsePlanValue(json.value);
}

export function parsePlanValue(value: unknown): PlanParseResult {
  const parsed = ScenePlanSchema.safeParse(value);
  if (!parsed.success) return { ok: false, stage: 'schema', error: formatZodError(parsed.error) };
  return { ok: true, plan: parsed.data };
}
