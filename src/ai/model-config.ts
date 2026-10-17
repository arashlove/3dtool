export type ModelPreset = {
  id: 'fast' | 'balanced' | 'strong';
  label: string;
  /** Hugging Face Inference Providers model id; the router picks an available provider. */
  modelId: string;
  strength: 1 | 2 | 3;
  description: string;
  license: string;
  modelCardUrl: string;
};

/**
 * Models run on Hugging Face Inference Providers (remote GPUs), billed to the visitor's own token.
 * Presets are public, ungated models listed by https://router.huggingface.co/v1/models.
 */
export const MODEL_PRESETS: readonly ModelPreset[] = [
  {
    id: 'fast',
    label: 'Fast',
    modelId: 'openai/gpt-oss-20b',
    strength: 1,
    description: 'Quick and inexpensive. Good for single-step create and edit requests.',
    license: 'Apache-2.0',
    modelCardUrl: 'https://huggingface.co/openai/gpt-oss-20b',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    modelId: 'openai/gpt-oss-120b',
    strength: 2,
    description: 'Recommended. Reliable JSON plans and multi-step edits at moderate cost.',
    license: 'Apache-2.0',
    modelCardUrl: 'https://huggingface.co/openai/gpt-oss-120b',
  },
  {
    id: 'strong',
    label: 'Strong',
    modelId: 'Qwen/Qwen2.5-72B-Instruct',
    strength: 3,
    description: 'Large instruction model for long or ambiguous requests. Slower and costs more per prompt.',
    license: 'Qwen license',
    modelCardUrl: 'https://huggingface.co/Qwen/Qwen2.5-72B-Instruct',
  },
];

export const DEFAULT_PRESET_ID: ModelPreset['id'] = 'balanced';

/** "owner/name", optionally with a ":provider" or ":fastest"/":cheapest" routing suffix. */
export const MODEL_ID_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}(:[a-z0-9-]{1,40})?$/;

export type ModelSelection = { kind: 'preset'; presetId: ModelPreset['id'] } | { kind: 'custom'; modelId: string };

export type ResolvedModel = { modelId: string; label: string; isCustom: boolean };

export function resolveModel(selection: ModelSelection): ResolvedModel | { error: string } {
  if (selection.kind === 'preset') {
    const preset =
      MODEL_PRESETS.find((p) => p.id === selection.presetId) ?? MODEL_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;
    return { modelId: preset.modelId, label: preset.label, isCustom: false };
  }
  const id = selection.modelId.trim();
  if (!MODEL_ID_PATTERN.test(id)) return { error: 'Enter a model id like "owner/model-name" (optionally ":provider").' };
  return { modelId: id, label: 'Custom', isCustom: true };
}

export const INFERENCE_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

export const GENERATION_SETTINGS = {
  /** Reasoning models spend tokens before the JSON answer, so leave headroom. */
  maxTokens: 2048,
  timeoutMs: 90_000,
} as const;
