import { createCorrectionMessages, createPlannerPrompt } from '@/core/prompt/planner-prompt';
import { CancelledError } from './hf-planner';
import type { ResolvedModel } from './model-config';
import type { TextPlanner } from './planner.interface';

type ContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
type ApiMessage = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] };

const PLAN_ENDPOINT = '/api/plan';

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed with status ${response.status}`;
}

/**
 * Calls a hosted Hugging Face vision-language model through this app's /api/plan route.
 * The Hugging Face token lives on the server (HF_TOKEN); the browser never sees it.
 */
export class HostedVisionPlanner implements TextPlanner {
  readonly isMock = false;
  /** Runs remotely, so no local CPU threads are used. */
  readonly threads = null;
  private model: ResolvedModel | null = null;
  private controller: AbortController | null = null;

  get label() {
    return this.model ? `${this.model.modelId} (Hugging Face Inference)` : 'Hosted model (not configured)';
  }

  configure(model: ResolvedModel) {
    this.model = model;
  }

  /** Nothing to download: checks that the server has a token configured. */
  async load(): Promise<void> {
    const response = await fetch(PLAN_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) throw new Error(await readError(response));
    const status = (await response.json()) as { configured: boolean };
    if (!status.configured) {
      throw new Error('HF_TOKEN is not set on the server. Add it to .env.local (or the deployment environment) and restart');
    }
  }

  async generatePlan(input: Parameters<TextPlanner['generatePlan']>[0]): Promise<string> {
    if (!this.model) throw new Error('No model selected.');
    const prompt = createPlannerPrompt(input.userText, input.sceneContext, { hasImage: Boolean(input.image) });
    const requestIndex = prompt.length - 1;
    const chat = input.correction ? createCorrectionMessages(prompt, input.correction.previousOutput, input.correction.error) : prompt;
    const messages: ApiMessage[] = chat.map((m, i) =>
      i === requestIndex && input.image
        ? { role: m.role, content: [{ type: 'image_url', image_url: { url: input.image } }, { type: 'text', text: m.content }] }
        : m,
    );

    const controller = new AbortController();
    this.controller = controller;
    try {
      const response = await fetch(PLAN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model.modelId, messages }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { text: string; tokens: number };
      input.onToken?.(result.tokens);
      return result.text;
    } catch (e) {
      if (controller.signal.aborted) throw new CancelledError();
      throw e;
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  cancel() {
    this.controller?.abort();
  }
}

let singleton: HostedVisionPlanner | null = null;

export function getHostedPlanner(): HostedVisionPlanner {
  if (!singleton) singleton = new HostedVisionPlanner();
  return singleton;
}
