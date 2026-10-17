import { create } from 'zustand';
import {
  DEFAULT_SELECTION,
  MODEL_DTYPES,
  MODEL_PRESETS,
  type ModelDtype,
  type ModelPreset,
  type ModelSelection,
} from '@/ai/model-config';

export type AiStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

export type LoadProgress = { percent: number | null; loadedBytes: number; totalBytes: number; file: string | null };

export type GenerationProgress = { attempt: 1 | 2; tokens: number; startedAt: number };

export type PromptHistoryEntry = {
  id: string;
  prompt: string;
  outcome: 'applied' | 'unsupported' | 'clarify' | 'error' | 'cancelled' | 'declined';
  message: string;
  model: string;
  elapsedMs: number | null;
  at: number;
};

type AiState = {
  selection: ModelSelection;
  token: string | null;
  rememberToken: boolean;
  status: AiStatus;
  loadedModelKey: string | null;
  progress: LoadProgress | null;
  error: string | null;
  lastLoadMs: number | null;
  threads: number | null;
  generation: GenerationProgress | null;
  history: PromptHistoryEntry[];
  reviewBeforeApply: boolean;

  setSelection: (selection: ModelSelection) => void;
  setToken: (token: string | null, remember: boolean) => void;
  setStatus: (status: AiStatus, error?: string | null) => void;
  setProgress: (progress: LoadProgress | null) => void;
  setLoaded: (key: string, ms: number, threads: number | null) => void;
  setGeneration: (generation: GenerationProgress | null) => void;
  setReviewBeforeApply: (value: boolean) => void;
  addHistory: (entry: Omit<PromptHistoryEntry, 'id' | 'at'>) => void;
  hydrateFromStorage: () => void;
};

const SELECTION_KEY = '3dtool:model-selection';
const REVIEW_KEY = '3dtool:review-before-apply';
const TOKEN_KEY = '3dtool:hf-token';

function readSelection(raw: string | null): ModelSelection | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<{ kind: string; presetId: string; modelId: string; dtype: string }>;
    if (value.kind === 'hosted' && typeof value.modelId === 'string') {
      return { kind: 'hosted', modelId: value.modelId.slice(0, 200) };
    }
    if (value.kind === 'preset' && MODEL_PRESETS.some((p) => p.id === value.presetId)) {
      return { kind: 'preset', presetId: value.presetId as ModelPreset['id'] };
    }
    if (value.kind === 'custom' && typeof value.modelId === 'string' && (MODEL_DTYPES as readonly string[]).includes(value.dtype ?? '')) {
      return { kind: 'custom', modelId: value.modelId.slice(0, 200), dtype: value.dtype as ModelDtype };
    }
  } catch {
    /* ignore malformed storage */
  }
  return null;
}

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export const useAiStore = create<AiState>((set, get) => ({
  selection: DEFAULT_SELECTION,
  token: null,
  rememberToken: false,
  status: 'idle',
  loadedModelKey: null,
  progress: null,
  error: null,
  lastLoadMs: null,
  threads: null,
  generation: null,
  history: [],
  reviewBeforeApply: false,

  setSelection: (selection) => {
    storage('local')?.setItem(SELECTION_KEY, JSON.stringify(selection));
    set({ selection });
  },
  setToken: (token, remember) => {
    const value = token && token.trim() ? token.trim() : null;
    const local = storage('local');
    const session = storage('session');
    local?.removeItem(TOKEN_KEY);
    session?.removeItem(TOKEN_KEY);
    if (value) (remember ? local : session)?.setItem(TOKEN_KEY, value);
    set({ token: value, rememberToken: remember });
  },
  setStatus: (status, error = null) => set({ status, error }),
  setProgress: (progress) => set({ progress }),
  setLoaded: (key, ms, threads) =>
    set({ loadedModelKey: key, lastLoadMs: ms, threads, status: 'ready', error: null, progress: null }),
  setGeneration: (generation) => set({ generation }),
  setReviewBeforeApply: (value) => {
    storage('local')?.setItem(REVIEW_KEY, value ? '1' : '0');
    set({ reviewBeforeApply: value });
  },
  addHistory: (entry) =>
    set({ history: [{ ...entry, id: crypto.randomUUID(), at: Date.now() }, ...get().history].slice(0, 30) }),
  hydrateFromStorage: () => {
    const local = storage('local');
    const session = storage('session');
    const selection = readSelection(local?.getItem(SELECTION_KEY) ?? null);
    const remembered = local?.getItem(TOKEN_KEY) ?? null;
    const sessionToken = session?.getItem(TOKEN_KEY) ?? null;
    set({
      selection: selection ?? get().selection,
      token: remembered ?? sessionToken,
      rememberToken: remembered !== null,
      reviewBeforeApply: local?.getItem(REVIEW_KEY) === '1',
    });
  },
}));
