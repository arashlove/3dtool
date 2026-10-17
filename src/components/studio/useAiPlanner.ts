'use client';

import { useCallback } from 'react';
import { CancelledError, getInferencePlanner } from '@/ai/hf-inference-planner';
import { resolveModel, type ResolvedModel } from '@/ai/model-config';
import { requestValidatedPlan, type PlanRunResult } from '@/ai/plan-runner';
import { applyPlan } from '@/core/commands/dispatcher';
import { buildCompactSceneContext } from '@/core/prompt/scene-context';
import { useAiStore } from '@/state/ai-store';
import { useSceneStore } from '@/state/scene-store';

export type GenerateResult =
  | (PlanRunResult & { aliases: Record<string, string>; elapsedMs: number })
  | { ok: false; cancelled: true; error: string; rawOutputs: string[]; aliases: Record<string, string>; elapsedMs: number };

export function useResolvedModel(): ResolvedModel | { error: string } {
  const selection = useAiStore((s) => s.selection);
  return resolveModel(selection);
}

export function useAiPlanner() {
  const resolved = useResolvedModel();
  const hasToken = useAiStore((s) => Boolean(s.token));

  const generate = useCallback(async (prompt: string): Promise<GenerateResult> => {
    const ai = useAiStore.getState();
    const { doc, selectedId } = useSceneStore.getState();
    const context = buildCompactSceneContext(doc, selectedId);
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);

    const model = resolveModel(ai.selection);
    if ('error' in model) return { ok: false, error: model.error, rawOutputs: [], aliases: context.aliases, elapsedMs: 0 };

    const planner = getInferencePlanner();
    planner.configure(model, ai.token);
    ai.setStatus('generating');
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
        (progress) => useAiStore.getState().setGeneration({ ...progress, startedAt }),
      );
      return { ...result, aliases: context.aliases, elapsedMs: elapsed() };
    } catch (e) {
      if (e instanceof CancelledError) {
        return { ok: false, cancelled: true, error: 'Cancelled.', rawOutputs: [], aliases: context.aliases, elapsedMs: elapsed() };
      }
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: message, rawOutputs: [], aliases: context.aliases, elapsedMs: elapsed() };
    } finally {
      useAiStore.getState().setStatus('idle');
      useAiStore.getState().setGeneration(null);
    }
  }, []);

  const cancel = useCallback(() => getInferencePlanner().cancel(), []);

  return { resolved, hasToken, generate, cancel };
}
