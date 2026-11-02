import { z } from 'zod';
import { ScenePlanSchema } from '@/core/schema/plan';

type JsonNode = { [key: string]: unknown };

/**
 * Rewrites the Zod-generated schema into the subset that provider grammars handle well:
 * tuples become fixed-length number arrays, `oneOf` becomes `anyOf`, and regex/default
 * annotations are dropped. The app validator still runs on every reply, so this only guides decoding.
 */
function simplify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplify);
  if (!node || typeof node !== 'object') return node;
  const out: JsonNode = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === '$schema' || key === 'default' || key === 'propertyNames' || key === 'pattern') continue;
    out[key] = simplify(value);
  }
  if ('prefixItems' in out) {
    delete out.prefixItems;
    out.items = { type: 'number' };
    out.minItems = 3;
    out.maxItems = 3;
  }
  if ('oneOf' in out) {
    out.anyOf = out.oneOf;
    delete out.oneOf;
  }
  return out;
}

function buildPlanJsonSchema(): JsonNode {
  const schema = simplify(z.toJSONSchema(ScenePlanSchema, { io: 'input', unrepresentable: 'any' })) as JsonNode;
  // Defaults make these optional in input mode, which lets strict grammars stop at `{"version":1}`.
  schema.required = ['version', 'status', 'message', 'operations'];
  return schema;
}

/** JSON Schema for a plan, sent as `response_format` so the provider only emits well-formed plan JSON. */
export const PLAN_JSON_SCHEMA = buildPlanJsonSchema();
