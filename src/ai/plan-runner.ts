import { parsePlanText } from '@/core/commands/parser';
import type { CompactSceneContext } from '@/core/prompt/scene-context';
import type { ScenePlan } from '@/core/schema/plan';
import type { TextPlanner } from './planner.interface';

export type PlanRunResult =
  | { ok: true; plan: ScenePlan; rawOutputs: string[] }
  | { ok: false; error: string; rawOutputs: string[] };

/** Returns an error message when the plan cannot be applied (dry run), or null when it can. */
export type PlanDryRun = (plan: ScenePlan) => string | null;

/**
 * Asks the planner for a plan, parses it, and dry-runs it. On malformed or inapplicable output,
 * makes exactly one correction attempt, then reports a visible error. Never substitutes a canned plan.
 */
export async function requestValidatedPlan(
  planner: TextPlanner,
  userText: string,
  sceneContext: CompactSceneContext,
  dryRun: PlanDryRun,
  onProgress?: (info: { attempt: 1 | 2; tokens: number }) => void,
): Promise<PlanRunResult> {
  const rawOutputs: string[] = [];

  const evaluate = (raw: string): { ok: true; plan: ScenePlan } | { ok: false; error: string } => {
    const parsed = parsePlanText(raw);
    if (!parsed.ok) return parsed;
    if (parsed.plan.status !== 'ok') return { ok: true, plan: parsed.plan };
    const problem = dryRun(parsed.plan);
    return problem ? { ok: false, error: problem } : { ok: true, plan: parsed.plan };
  };

  onProgress?.({ attempt: 1, tokens: 0 });
  const first = await planner.generatePlan({ userText, sceneContext, onToken: (tokens) => onProgress?.({ attempt: 1, tokens }) });
  rawOutputs.push(first);
  const firstResult = evaluate(first);
  if (firstResult.ok) return { ok: true, plan: firstResult.plan, rawOutputs };

  onProgress?.({ attempt: 2, tokens: 0 });
  const second = await planner.generatePlan({
    userText,
    sceneContext,
    correction: { previousOutput: first, error: firstResult.error },
    onToken: (tokens) => onProgress?.({ attempt: 2, tokens }),
  });
  rawOutputs.push(second);
  const secondResult = evaluate(second);
  if (secondResult.ok) return { ok: true, plan: secondResult.plan, rawOutputs };
  return {
    ok: false,
    error: `The model did not produce a usable plan after one retry: ${secondResult.error}. The scene was not changed.`,
    rawOutputs,
  };
}
