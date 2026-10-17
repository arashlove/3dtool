/// <reference lib="webworker" />
import { InterruptableStoppingCriteria, TextStreamer, env, pipeline } from '@huggingface/transformers';
import { JsonCompletionTracker } from '@/core/commands/json-completion';
import type { ChatMessage } from '@/core/prompt/planner-prompt';
import type { ModelDtype } from './model-config';
import type { WorkerRequest, WorkerResponse } from './worker-types';

declare const self: DedicatedWorkerGlobalScope;

type GenerationOutput = Array<{ generated_text: string | ChatMessage[] }>;
type Generator = ((messages: ChatMessage[], options: Record<string, unknown>) => Promise<GenerationOutput>) & {
  dispose: () => Promise<void>;
  tokenizer: ConstructorParameters<typeof TextStreamer>[0];
};

env.allowLocalModels = false;
env.useBrowserCache = true;

// Multi-threaded WASM needs SharedArrayBuffer, which browsers only enable on cross-origin isolated pages.
const wasmThreads = self.crossOriginIsolated
  ? Math.max(1, Math.min(8, Math.floor((navigator.hardwareConcurrency || 2) / 2)))
  : 1;
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = wasmThreads;

let generator: Generator | null = null;
let loadedKey: string | null = null;
let hfToken: string | null = null;
let stopping: InterruptableStoppingCriteria | null = null;
let queue: Promise<void> = Promise.resolve();

const HF_HOSTS = ['huggingface.co', 'hf.co'];

function isHuggingFaceUrl(input: string | URL): boolean {
  try {
    const host = new URL(String(input)).hostname;
    return HF_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// The visitor's optional token is attached only to Hugging Face requests made from this browser.
// It is never sent to the app server.
const baseFetch = env.fetch;
env.fetch = (input: string | URL, init?: RequestInit) => {
  if (!hfToken || !isHuggingFaceUrl(input)) return baseFetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${hfToken}`);
  return baseFetch(input, { ...init, headers });
};

function post(message: WorkerResponse) {
  self.postMessage(message);
}

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : 'Unknown error';
}

async function handleLoad(requestId: string, modelId: string, dtype: ModelDtype, token: string | null) {
  const key = `${modelId}@${dtype}`;
  hfToken = token;
  if (generator && loadedKey === key) {
    post({ type: 'loaded', requestId, modelId, dtype, elapsedMs: 0, threads: wasmThreads });
    return;
  }
  if (generator) {
    await generator.dispose().catch(() => undefined);
    generator = null;
    loadedKey = null;
  }
  const started = performance.now();
  try {
    const created = await pipeline('text-generation', modelId, {
      device: 'wasm',
      dtype,
      progress_callback: (info: { status: string; file?: string; progress?: number; loaded?: number; total?: number }) => {
        post({
          type: 'progress',
          requestId,
          progress: { status: info.status, file: info.file, progress: info.progress, loaded: info.loaded, total: info.total },
        });
      },
    });
    generator = created as unknown as Generator;
    loadedKey = key;
    post({ type: 'loaded', requestId, modelId, dtype, elapsedMs: Math.round(performance.now() - started), threads: wasmThreads });
  } catch (e) {
    post({ type: 'error', requestId, phase: 'load', message: errorMessage(e) });
  }
}

function extractAssistantText(output: GenerationOutput): string {
  const first = output?.[0]?.generated_text;
  if (typeof first === 'string') return first;
  if (Array.isArray(first)) {
    const last = first[first.length - 1];
    return last?.role === 'assistant' ? String(last.content ?? '') : '';
  }
  return '';
}

async function handleGenerate(requestId: string, messages: ChatMessage[], maxNewTokens: number) {
  if (!generator) {
    post({ type: 'error', requestId, phase: 'generate', message: 'The model is not loaded.' });
    return;
  }
  const started = performance.now();
  const criteria = new InterruptableStoppingCriteria();
  stopping = criteria;
  const tracker = new JsonCompletionTracker();
  let tokens = 0;
  let lastPost = 0;
  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    // Stop as soon as the first JSON object is closed instead of generating trailing text.
    callback_function: (text: string) => {
      if (tracker.push(text)) criteria.interrupt();
    },
    token_callback_function: () => {
      tokens++;
      const now = performance.now();
      if (now - lastPost > 250) {
        lastPost = now;
        post({ type: 'token', requestId, tokens });
      }
    },
  });
  try {
    const output = await generator(messages, {
      max_new_tokens: Math.min(Math.max(32, maxNewTokens), 768),
      do_sample: false,
      stopping_criteria: criteria,
      streamer,
    });
    post({ type: 'result', requestId, text: extractAssistantText(output), elapsedMs: Math.round(performance.now() - started), tokens });
  } catch (e) {
    post({ type: 'error', requestId, phase: 'generate', message: errorMessage(e) });
  } finally {
    stopping = null;
  }
}

async function handleDispose(requestId: string) {
  if (generator) await generator.dispose().catch(() => undefined);
  generator = null;
  loadedKey = null;
  hfToken = null;
  post({ type: 'disposed', requestId });
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data;
  if (msg.type === 'interrupt') {
    stopping?.interrupt();
    return;
  }
  queue = queue.then(() => {
    switch (msg.type) {
      case 'load':
        return handleLoad(msg.requestId, msg.modelId, msg.dtype, msg.hfToken);
      case 'generate':
        return handleGenerate(msg.requestId, msg.messages, msg.maxNewTokens);
      case 'dispose':
        return handleDispose(msg.requestId);
    }
  });
});
