import {
  InferenceClient,
  InferenceClientHubApiError,
  InferenceClientProviderApiError,
  type InferenceProviderOrPolicy,
} from '@huggingface/inference';
import { extractJsonObject } from '@/core/commands/parser';
import type { HealthInfo } from '../types';

/**
 * Server-only Hugging Face access for the Future Lab. HF_TOKEN never leaves the server.
 * Any *_MODEL value may also be a dedicated Inference Endpoint URL.
 */
export function labSettings() {
  const env = (key: string, fallback: string) => process.env[key]?.trim() || fallback;
  return {
    token: process.env.HF_TOKEN?.trim() ?? '',
    provider: env('HF_PROVIDER', 'auto'),
    llm: env('HF_LLM_MODEL', 'openai/gpt-oss-120b'),
    vlm: env('HF_VLM_MODEL', 'Qwen/Qwen3.8-27B'),
    image: env('HF_IMAGE_MODEL', 'black-forest-labs/FLUX.1-schnell'),
    timeoutMs: Number(env('HF_TIMEOUT', '120')) * 1000 || 120_000,
  };
}

export const aiEnabled = () => labSettings().token.length > 0;

export function health(): HealthInfo {
  const s = labSettings();
  return {
    ai_enabled: aiEnabled(),
    provider: s.provider,
    models: { llm: s.llm, vlm: s.vlm, image: s.image, three_d: process.env.HF_3D_SPACE?.trim() || 'microsoft/TRELLIS.2' },
  };
}

export class HFError extends Error {
  constructor(
    message: string,
    /** Token or billing problems: trying another model would not help. */
    readonly fatal = false,
  ) {
    super(message);
    this.name = 'HFError';
  }
}

let cached: { token: string; client: InferenceClient } | null = null;
function client(): InferenceClient {
  const s = labSettings();
  if (!s.token) throw new HFError('HF_TOKEN is not set in .env.local', true);
  if (!cached || cached.token !== s.token) cached = { token: s.token, client: new InferenceClient(s.token) };
  return cached.client;
}

const isUrl = (model: string) => /^https?:\/\//.test(model);
function target(model: string) {
  const s = labSettings();
  return isUrl(model) ? { endpointUrl: model } : { model, provider: s.provider as InferenceProviderOrPolicy };
}

/** Turns provider errors into readable messages. */
export function explain(e: unknown, model: string): HFError {
  if (e instanceof HFError) return e;
  const status =
    e instanceof InferenceClientProviderApiError || e instanceof InferenceClientHubApiError ? e.httpResponse.status : undefined;
  const message = e instanceof Error ? e.message : String(e);
  const provider = labSettings().provider;
  if (status === 401 || status === 403 || /unauthori[sz]ed|invalid (username|token)|forbidden/i.test(message)) {
    return new HFError('HF_TOKEN was rejected. Create a fine-grained token with "Make calls to Inference Providers".', true);
  }
  if (status === 402 || /credit|payment required|quota/i.test(message)) {
    return new HFError('Your Hugging Face Inference Providers credits are used up.', true);
  }
  if (status === 404 || /not supported|no provider|not found|not available/i.test(message)) {
    return new HFError(`${model} is not served by provider "${provider}". Pick another model or provider.`);
  }
  if (status === 429 || /rate limit|too many requests/i.test(message)) return new HFError('Hugging Face rate limit reached; try again shortly.');
  if (/abort|timeout/i.test(message)) return new HFError(`${model} did not answer in time.`);
  return new HFError(`${model} failed: ${message.slice(0, 300)}`);
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
};

const MAX_JSON_CHARS = 60_000;

/**
 * Chat completion that must return one JSON object. Asks for JSON mode on the first text-only
 * attempt (and drops it if the provider rejects it), then makes one corrective retry on bad JSON.
 */
export async function chatJson(opts: {
  model: string;
  system: string;
  user: string;
  image?: string | null;
  maxTokens?: number;
}): Promise<unknown> {
  const s = labSettings();
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.system },
    {
      role: 'user',
      content: opts.image
        ? [
            { type: 'image_url', image_url: { url: opts.image } },
            { type: 'text', text: opts.user },
          ]
        : opts.user,
    },
  ];
  let jsonMode = !opts.image;

  const call = async () => {
    try {
      const out = await client().chatCompletion(
        {
          ...target(opts.model),
          messages,
          temperature: 0.1,
          max_tokens: opts.maxTokens ?? 2048,
          ...(jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
        },
        { signal: AbortSignal.timeout(s.timeoutMs) },
      );
      const content = out.choices?.[0]?.message?.content;
      return typeof content === 'string' ? content : '';
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (jsonMode && /response_format|json_object|json mode|not supported/i.test(message)) {
        jsonMode = false;
        return call();
      }
      throw explain(e, opts.model);
    }
  };

  const first = await call();
  const parsed = extractJsonObject(first, MAX_JSON_CHARS);
  if (parsed.ok) return parsed.value;
  messages.push({ role: 'assistant', content: first.slice(0, 4000) });
  messages.push({ role: 'user', content: 'That was not valid JSON. Reply with ONLY the JSON object.' });
  const second = await call();
  const retried = extractJsonObject(second, MAX_JSON_CHARS);
  if (retried.ok) return retried.value;
  throw new HFError(`${opts.model} did not return valid JSON.`);
}

/** Text-to-image. Asks for explicit dimensions and retries without them if the provider refuses. */
export async function textToImage(prompt: string, width: number, height: number): Promise<Blob> {
  const s = labSettings();
  const run = async (withSize: boolean) =>
    client().textToImage(
      {
        ...target(s.image),
        inputs: prompt,
        parameters: withSize ? { width, height } : {},
      },
      { outputType: 'blob', signal: AbortSignal.timeout(s.timeoutMs) },
    );
  try {
    return await run(true);
  } catch (e) {
    const err = explain(e, s.image);
    if (err.fatal) throw err;
    try {
      return await run(false);
    } catch (e2) {
      throw explain(e2, s.image);
    }
  }
}
