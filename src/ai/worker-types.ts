import type { ChatMessage } from '@/core/prompt/planner-prompt';
import type { ModelDtype } from './model-config';

export type ModelProgress = {
  status: string;
  file?: string;
  /** 0..100 */
  progress?: number;
  loaded?: number;
  total?: number;
};

export type WorkerRequest =
  | { type: 'load'; requestId: string; modelId: string; dtype: ModelDtype; hfToken: string | null }
  | { type: 'generate'; requestId: string; messages: ChatMessage[]; maxNewTokens: number }
  | { type: 'interrupt' }
  | { type: 'dispose'; requestId: string };

export type WorkerResponse =
  | { type: 'progress'; requestId: string; progress: ModelProgress }
  | { type: 'loaded'; requestId: string; modelId: string; dtype: ModelDtype; elapsedMs: number; threads: number }
  | { type: 'token'; requestId: string; tokens: number }
  | { type: 'result'; requestId: string; text: string; elapsedMs: number; tokens: number }
  | { type: 'disposed'; requestId: string }
  | { type: 'error'; requestId: string; phase: 'load' | 'generate' | 'dispose'; message: string };
