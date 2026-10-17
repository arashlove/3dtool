'use client';

import { useCallback } from 'react';
import { CancelledError, getHuggingFacePlanner } from '@/ai/hf-planner';
import { modelKey, resolveModel, type ResolvedModel } from '@/ai/model-config';
import { requestValidatedPlan, type PlanRunResult } from '@/ai/plan-runner';
import type { ModelProgress } from '@/ai/worker-types';
import { applyPlan } from '@/core/commands/dispatcher';
import { buildCompactSceneContext } from '@/core/prompt/scene-context';
import { useAiStore } from '@/state/ai-store';
import { useSceneStore } from '@/state/scene-store';

export type GenerateResult =
  | (PlanRunResult & { aliases: Record<string, string>; elapsedMs: number })
  | { ok: false; cancelled: true; error: string; rawOutputs: string[]; aliases: Record<string, string>; elapsedMs: number };

export function browserSupportProblem(): string | null {
  if (typeof window === 'undefined') return 'Not running in a browser.';
  if (typeof WebAssembly === 'undefined') return 'This browser does not support WebAssembly, which the local model needs.';
  if (typeof Worker === 'undefined') return 'This browser does not support Web Workers, which the local model needs.';
  return null;
}

function createProgressTracker(onUpdate: (p: { percent: number | null; loaded: number; total: number; file: string | null }) => void) {
  const files = new Map<string, { loaded: number; total: number }>();
  return (event: ModelProgress) => {
    if (event.status === 'progress_total' && event.total) {
      onUpdate({ percent: event.progress ?? null, loaded: event.loaded ?? 0, total: event.total, file: null });
      return;
    }
    if (event.status === 'progress' && event.file && event.total) {
      files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      onUpdate({ percent: total ? (loaded / total) * 100 : null, loaded, total, file: event.file });
    }
  };
}

export function useResolvedModel(): ResolvedModel | { error: string } {
  const selection = useAiStore((s) => s.selection);
  return resolveModel(selection);
}

export function useAiPlanner() {
  const resolved = useResolvedModel();
  const loadedModelKey = useAiStore((s) => s.loadedModelKey);
  const isLoaded = !('error' in resolved) && loadedModelKey === modelKey(resolved);

  const loadModel = useCallback(async (): Promise<boolean> => {
    const ai = useAiStore.getState();
    const model = resolveModel(ai.selection);
    if ('error' in model) {
      ai.setStatus('error', model.error);
      return false;
    }
    const support = browserSupportProblem();
    if (support) {
      ai.setStatus('error', support);
      return false;
    }
    const planner = getHuggingFacePlanner();
    planner.configure(model, ai.token);
    ai.setStatus('loading');
    ai.setProgress({ percent: null, loadedBytes: 0, totalBytes: 0, file: null });
    const started = performance.now();
    try {
      await planner.load(
        createProgressTracker((p) =>
          useAiStore.getState().setProgress({ percent: p.percent, loadedBytes: p.loaded, totalBytes: p.total, file: p.file }),
        ),
      );
      useAiStore.getState().setLoaded(modelKey(model), Math.round(performance.now() - started), planner.threads);
      return true;
    } catch (e) {
      const message = (e instanceof Error ? e.message : String(e)).replace(/\.+$/, '');
      const hint = /401|403|gated|unauthori[sz]ed/i.test(message)
        ? ' This model may be gated or private: add a Hugging Face token with access in Model settings.'
        : /fetch|network|Failed to load/i.test(message)
          ? ' Check your internet connection; model files are downloaded from huggingface.co.'
          : '';
      useAiStore.getState().setProgress(null);
      useAiStore.getState().setStatus('error', `Could not load the model: ${message}.${hint}`);
      return false;
    }
  }, []);

  const generate = useCallback(async (prompt: string): Promise<GenerateResult> => {
    const { doc, selectedId } = useSceneStore.getState();
    const context = buildCompactSceneContext(doc, selectedId);
    const planner = getHuggingFacePlanner();
    useAiStore.getState().setStatus('generating');
    const started = performance.now();
    const startedAt = Date.now();
    try {
      const result = await requestValidatedPlan(
        planner,
        prompt,
        context,
        (plan) => {
          const current = useSceneStore.getState();
          const r = applyPlan(current.doc, plan, { selectedId: current.selectedId, aliases: context.aliases });
          return r.ok ? null : r.error;
        },
        ({ attempt, tokens }) => useAiStore.getState().setGeneration({ attempt, tokens, startedAt }),
      );
      useAiStore.getState().setStatus('ready');
      return { ...result, aliases: context.aliases, elapsedMs: Math.round(performance.now() - started) };
    } catch (e) {
      const elapsedMs = Math.round(performance.now() - started);
      if (e instanceof CancelledError) {
        useAiStore.getState().setStatus('ready');
        return { ok: false, cancelled: true, error: 'Cancelled.', rawOutputs: [], aliases: context.aliases, elapsedMs };
      }
      const message = e instanceof Error ? e.message : String(e);
      useAiStore.getState().setStatus('ready');
      return { ok: false, error: `Model inference failed: ${message}`, rawOutputs: [], aliases: context.aliases, elapsedMs };
    } finally {
      useAiStore.getState().setGeneration(null);
    }
  }, []);

  const cancel = useCallback(() => getHuggingFacePlanner().cancel(), []);

  return { resolved, isLoaded, loadModel, generate, cancel };
}
