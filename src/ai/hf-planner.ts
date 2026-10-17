import { createCorrectionMessages, createPlannerPrompt, type ChatMessage } from '@/core/prompt/planner-prompt';
import { GENERATION_SETTINGS, type ResolvedModel } from './model-config';
import type { TextPlanner } from './planner.interface';
import type { ModelProgress, WorkerRequest, WorkerResponse } from './worker-types';

type BrowserModel = Extract<ResolvedModel, { runtime: 'browser' }>;

type Pending = {
  resolve: (value: WorkerResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (p: ModelProgress) => void;
  onToken?: (tokens: number) => void;
};

/**
 * Main-thread bridge to the Transformers.js worker. One worker and one pipeline per tab.
 * Requests carry IDs so stale results from cancelled requests are ignored.
 */
export class HuggingFaceWorkerPlanner implements TextPlanner {
  readonly isMock = false;
  private worker: Worker | null = null;
  private pending = new Map<string, Pending>();
  private model: BrowserModel | null = null;
  private token: string | null = null;
  private activeGeneration: string | null = null;
  /** WASM threads used by the last loaded model (1 when the page is not cross-origin isolated). */
  threads: number | null = null;

  get label() {
    return this.model ? `${this.model.modelId} (${this.model.dtype}, CPU/WASM)` : 'Hugging Face model (not configured)';
  }

  configure(model: BrowserModel, token: string | null) {
    this.model = model;
    this.token = token && token.trim() ? token.trim() : null;
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./hf-worker.ts', import.meta.url), { type: 'module', name: '3dtool-planner' });
    worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data));
    worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'The AI worker crashed.');
      for (const p of this.pending.values()) p.reject(error);
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    });
    this.worker = worker;
    return worker;
  }

  private handleMessage(msg: WorkerResponse) {
    const pending = this.pending.get(msg.requestId);
    if (!pending) return;
    if (msg.type === 'progress') {
      pending.onProgress?.(msg.progress);
      return;
    }
    if (msg.type === 'token') {
      pending.onToken?.(msg.tokens);
      return;
    }
    this.pending.delete(msg.requestId);
    if (msg.type === 'error') pending.reject(new Error(msg.message));
    else pending.resolve(msg);
  }

  private request(
    message: WorkerRequest & { requestId: string },
    callbacks: Pick<Pending, 'onProgress' | 'onToken'> = {},
  ) {
    const worker = this.ensureWorker();
    return new Promise<WorkerResponse>((resolve, reject) => {
      this.pending.set(message.requestId, { resolve, reject, ...callbacks });
      worker.postMessage(message);
    });
  }

  async load(onProgress?: (event: ModelProgress) => void): Promise<void> {
    if (!this.model) throw new Error('No model selected.');
    const response = await this.request(
      { type: 'load', requestId: crypto.randomUUID(), modelId: this.model.modelId, dtype: this.model.dtype, hfToken: this.token },
      { onProgress },
    );
    if (response.type === 'loaded') this.threads = response.threads;
  }

  async generatePlan(input: Parameters<TextPlanner['generatePlan']>[0]): Promise<string> {
    let messages: ChatMessage[] = createPlannerPrompt(input.userText, input.sceneContext);
    if (input.correction) messages = createCorrectionMessages(messages, input.correction.previousOutput, input.correction.error);
    const requestId = crypto.randomUUID();
    this.activeGeneration = requestId;
    try {
      const response = await this.request(
        { type: 'generate', requestId, messages, maxNewTokens: GENERATION_SETTINGS.maxNewTokens },
        { onToken: input.onToken },
      );
      if (this.activeGeneration !== requestId) throw new CancelledError();
      if (response.type !== 'result') throw new Error('Unexpected worker response.');
      return response.text;
    } finally {
      if (this.activeGeneration === requestId) this.activeGeneration = null;
    }
  }

  cancel() {
    if (!this.activeGeneration) return;
    const id = this.activeGeneration;
    this.activeGeneration = null;
    this.worker?.postMessage({ type: 'interrupt' } satisfies WorkerRequest);
    const pending = this.pending.get(id);
    if (pending) {
      this.pending.delete(id);
      pending.reject(new CancelledError());
    }
  }

  async dispose() {
    if (!this.worker) return;
    await this.request({ type: 'dispose', requestId: crypto.randomUUID() }).catch(() => undefined);
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

let singleton: HuggingFaceWorkerPlanner | null = null;

export function getHuggingFacePlanner(): HuggingFaceWorkerPlanner {
  if (!singleton) singleton = new HuggingFaceWorkerPlanner();
  return singleton;
}
