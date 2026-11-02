import { JsonCompletionTracker } from '@/core/commands/json-completion';
import { createCorrectionMessages, createPlannerPrompt, type ChatMessage } from '@/core/prompt/planner-prompt';
import { GENERATION_SETTINGS, INFERENCE_ENDPOINT, type ResolvedModel } from './model-config';
import type { GenerationProgress, TextPlanner } from './planner.interface';
import { PLAN_JSON_SCHEMA } from './plan-json-schema';

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

/** An HTTP or provider error from Hugging Face, with a message suitable for the UI. */
export class InferenceError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'InferenceError';
  }
}

type StreamDelta = { content?: string | null; reasoning?: string | null; reasoning_content?: string | null };
type StreamChunk = { choices?: Array<{ delta?: StreamDelta }>; error?: { message?: string } | string };

function describeHttpError(status: number, body: string): string {
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: string | { message?: string }; message?: string };
    const err = parsed.error;
    detail = (typeof err === 'string' ? err : err?.message) ?? parsed.message ?? detail;
  } catch {
    /* plain-text body */
  }
  switch (status) {
    case 401:
      return 'Hugging Face rejected the token. Check it in Model & strength (it needs the "Make calls to Inference Providers" permission).';
    case 402:
      return 'Your Hugging Face inference credits are used up. Add credits or upgrade at huggingface.co/settings/billing.';
    case 403:
      return `This token is not allowed to use that model: ${detail}`;
    case 404:
      return `The model is not available on Hugging Face Inference Providers: ${detail}`;
    case 429:
      return 'Hugging Face rate limit reached. Wait a moment and try again.';
    default:
      return `Hugging Face inference failed (${status}): ${detail}`;
  }
}

/**
 * Calls the Hugging Face Inference Providers router (OpenAI-compatible chat completions) directly from the browser.
 * The visitor's token is sent only to router.huggingface.co; the 3DTool server never sees it.
 */
export class HuggingFaceInferencePlanner implements TextPlanner {
  readonly isMock = false;
  private model: ResolvedModel | null = null;
  private token: string | null = null;
  private controller: AbortController | null = null;
  private cancelled = false;

  get label() {
    return this.model ? `${this.model.modelId} (Hugging Face GPU)` : 'Hugging Face model (not configured)';
  }

  configure(model: ResolvedModel, token: string | null) {
    this.model = model;
    this.token = token && token.trim() ? token.trim() : null;
  }

  async generatePlan(input: Parameters<TextPlanner['generatePlan']>[0]): Promise<string> {
    if (!this.model) throw new InferenceError('No model selected.', null);
    if (!this.token) throw new InferenceError('Add your Hugging Face token in Model & strength to use cloud inference.', 401);

    let messages: ChatMessage[] = createPlannerPrompt(input.userText, input.sceneContext);
    if (input.correction) messages = createCorrectionMessages(messages, input.correction.previousOutput, input.correction.error);

    const controller = new AbortController();
    this.controller = controller;
    this.cancelled = false;
    const timeout = setTimeout(() => controller.abort(), GENERATION_SETTINGS.timeoutMs);
    const report = (p: GenerationProgress) => input.onProgress?.(p);
    report({ phase: 'waiting', tokens: 0 });

    try {
      const response = await fetch(INFERENCE_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model.modelId,
          messages,
          max_tokens: GENERATION_SETTINGS.maxTokens,
          temperature: 0,
          stream: true,
          // At the default effort, gpt-oss can spend the whole token budget reasoning about a busy scene
          // and never write the JSON. Low effort answers in about 500 tokens.
          ...(this.model.modelId.startsWith('openai/gpt-oss') ? { reasoning_effort: 'low' } : {}),
          // Presets are served by providers with structured output, which rules out broken brackets and
          // arithmetic in numbers. Custom models may not support it, so they get free text as before.
          ...(this.model.isCustom
            ? {}
            : { response_format: { type: 'json_schema', json_schema: { name: 'ScenePlan', schema: PLAN_JSON_SCHEMA, strict: false } } }),
        }),
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new InferenceError(describeHttpError(response.status, await response.text()), response.status);
      if (!response.body) throw new InferenceError('Hugging Face returned an empty response.', response.status);
      return await this.readStream(response.body, controller, report);
    } catch (e) {
      if (this.cancelled) throw new CancelledError();
      if (e instanceof DOMException && e.name === 'AbortError') {
        throw new InferenceError(`No complete answer within ${GENERATION_SETTINGS.timeoutMs / 1000} s. Try again or pick a faster model.`, null);
      }
      if (e instanceof InferenceError) throw e;
      throw new InferenceError(
        `Could not reach Hugging Face (${e instanceof Error ? e.message : String(e)}). Check your internet connection.`,
        null,
      );
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = null;
    }
  }

  /** Parses the server-sent event stream; stops reading (and generation) once the first JSON object is complete. */
  private async readStream(
    body: ReadableStream<Uint8Array>,
    controller: AbortController,
    report: (p: GenerationProgress) => void,
  ): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const tracker = new JsonCompletionTracker();
    let buffer = '';
    let content = '';
    let contentTokens = 0;
    let reasoningTokens = 0;

    const handleEvent = (data: string): boolean => {
      if (data === '[DONE]') return true;
      let chunk: StreamChunk;
      try {
        chunk = JSON.parse(data) as StreamChunk;
      } catch {
        return false;
      }
      if (chunk.error) {
        const msg = typeof chunk.error === 'string' ? chunk.error : (chunk.error.message ?? 'unknown error');
        throw new InferenceError(`The inference provider reported an error: ${msg}`, null);
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) return false;
      if (delta.reasoning || delta.reasoning_content) {
        reasoningTokens++;
        report({ phase: 'thinking', tokens: reasoningTokens });
      }
      if (delta.content) {
        content += delta.content;
        contentTokens++;
        report({ phase: 'writing', tokens: contentTokens });
        if (content.length > 20_000) return true;
        if (tracker.push(delta.content)) return true;
      }
      return false;
    };

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith('data:')) continue;
          if (handleEvent(line.slice(5).trim())) {
            controller.abort();
            return content;
          }
        }
      }
      return content;
    } finally {
      reader.releaseLock();
    }
  }

  cancel() {
    if (!this.controller) return;
    this.cancelled = true;
    this.controller.abort();
  }
}

let singleton: HuggingFaceInferencePlanner | null = null;

export function getInferencePlanner(): HuggingFaceInferencePlanner {
  if (!singleton) singleton = new HuggingFaceInferencePlanner();
  return singleton;
}
