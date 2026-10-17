export const MODEL_DTYPES = ['q8', 'q4', 'q4f16', 'fp16', 'fp32'] as const;
export type ModelDtype = (typeof MODEL_DTYPES)[number];

export type ModelPreset = {
  id: 'light' | 'balanced' | 'standard' | 'strong';
  label: string;
  modelId: string;
  dtype: ModelDtype;
  /** Approximate size of the ONNX weights file, measured from the Hugging Face repo listing. */
  approxDownloadMB: number;
  strength: 1 | 2 | 3 | 4;
  description: string;
  license: string;
  modelCardUrl: string;
};

/**
 * All presets are public, ungated ONNX repos: no Hugging Face token is needed.
 * Strength comes from model size, not from the token; larger models need more RAM and time.
 */
export const MODEL_PRESETS: readonly ModelPreset[] = [
  {
    id: 'light',
    label: 'Light',
    modelId: 'onnx-community/SmolLM2-135M-Instruct-ONNX-MHA',
    dtype: 'q8',
    approxDownloadMB: 131,
    strength: 1,
    description: 'Smallest and fastest. Low memory, but often misreads multi-step requests.',
    license: 'Apache-2.0',
    modelCardUrl: 'https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-MHA',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    modelId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    dtype: 'q8',
    approxDownloadMB: 348,
    strength: 2,
    description: 'Middle ground for lower-memory laptops. Handles simple create/edit requests.',
    license: 'Apache-2.0',
    modelCardUrl: 'https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct',
  },
  {
    id: 'standard',
    label: 'Standard',
    modelId: 'onnx-community/Qwen2.5-0.5B-Instruct',
    dtype: 'q8',
    approxDownloadMB: 488,
    strength: 3,
    description: 'Recommended. Best balance of JSON reliability, download size and speed.',
    license: 'Apache-2.0',
    modelCardUrl: 'https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct',
  },
  {
    id: 'strong',
    label: 'Strong',
    modelId: 'onnx-community/Qwen2.5-1.5B-Instruct',
    dtype: 'q8',
    approxDownloadMB: 1506,
    strength: 4,
    description: 'Most capable preset. Large download and slow on CPU; needs a well-equipped desktop browser.',
    license: 'Apache-2.0',
    modelCardUrl: 'https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct',
  },
];

export const DEFAULT_PRESET_ID: ModelPreset['id'] = 'standard';

/**
 * Hosted vision-language model called through Hugging Face Inference Providers by the app server.
 * The server reads the token from the HF_TOKEN environment variable; it never reaches the browser.
 * See https://huggingface.co/models?inference_provider=all&pipeline_tag=image-text-to-text
 */
export const DEFAULT_HOSTED_MODEL_ID = 'Qwen/Qwen3-VL-30B-A3B-Instruct';

/** "owner/name" with an optional ":provider" or ":fastest"/":cheapest" routing suffix. */
export const HOSTED_MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}(:[a-z0-9-]{1,40})?$/;

/** "owner/name" Hugging Face repo id. */
export const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;

export type ModelSelection =
  | { kind: 'hosted'; modelId: string }
  | { kind: 'preset'; presetId: ModelPreset['id'] }
  | { kind: 'custom'; modelId: string; dtype: ModelDtype };

export const DEFAULT_SELECTION: ModelSelection = { kind: 'hosted', modelId: DEFAULT_HOSTED_MODEL_ID };

export type ResolvedModel =
  | {
      runtime: 'browser';
      modelId: string;
      dtype: ModelDtype;
      label: string;
      approxDownloadMB: number | null;
      isCustom: boolean;
      supportsImages: false;
    }
  | {
      runtime: 'hosted';
      modelId: string;
      dtype: 'hosted';
      label: string;
      approxDownloadMB: null;
      isCustom: boolean;
      supportsImages: true;
    };

export function resolveModel(selection: ModelSelection): ResolvedModel | { error: string } {
  if (selection.kind === 'hosted') {
    const id = selection.modelId.trim() || DEFAULT_HOSTED_MODEL_ID;
    if (!HOSTED_MODEL_ID_PATTERN.test(id)) return { error: 'Enter a Hugging Face model id like "owner/model-name".' };
    return {
      runtime: 'hosted',
      modelId: id,
      dtype: 'hosted',
      label: 'Vision (HF Inference)',
      approxDownloadMB: null,
      isCustom: id !== DEFAULT_HOSTED_MODEL_ID,
      supportsImages: true,
    };
  }
  if (selection.kind === 'preset') {
    const preset = MODEL_PRESETS.find((p) => p.id === selection.presetId) ?? MODEL_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!;
    return {
      runtime: 'browser',
      modelId: preset.modelId,
      dtype: preset.dtype,
      label: preset.label,
      approxDownloadMB: preset.approxDownloadMB,
      isCustom: false,
      supportsImages: false,
    };
  }
  const id = selection.modelId.trim();
  if (!MODEL_ID_PATTERN.test(id)) return { error: 'Enter a Hugging Face model id like "owner/model-name".' };
  if (!(MODEL_DTYPES as readonly string[]).includes(selection.dtype)) return { error: 'Unsupported quantization.' };
  return {
    runtime: 'browser',
    modelId: id,
    dtype: selection.dtype,
    label: 'Custom',
    approxDownloadMB: null,
    isCustom: true,
    supportsImages: false,
  };
}

export const modelKey = (m: { modelId: string; dtype: string }) => `${m.modelId}@${m.dtype}`;

export const GENERATION_SETTINGS = {
  maxNewTokens: 384,
} as const;

/** Reference images are downscaled in the browser before upload. */
export const IMAGE_LIMITS = {
  maxSidePx: 1024,
  /** Length of the base64 data URL accepted by the server. */
  maxDataUrlChars: 4_000_000,
} as const;
