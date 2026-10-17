import { heuristicPlan } from '@/lab/heuristic';
import { planFromJson } from '@/lab/plan';
import { PLAN_SYSTEM_PROMPT, planUserMessage } from '@/lab/prompts';
import { aiEnabled, chatJson, HFError, labSettings } from '@/lab/server/hf';
import { planRequestSchema, readJson } from '@/lab/server/schemas';
import type { EditPlan } from '@/lab/types';

/**
 * Prompt → edit plan. With an attached snapshot the vision model (HF_VLM_MODEL) plans; otherwise the
 * text model (HF_LLM_MODEL). Without a token, or when the AI returns nothing usable, the offline
 * keyword planner answers. The browser applies the plan; the server never touches geometry.
 */
export async function POST(request: Request) {
  const body = await readJson(request, planRequestSchema);
  if (!body.ok) return body.response;
  const req = body.data;

  if (!aiEnabled()) {
    const plan = heuristicPlan(req);
    plan.warnings.push('HF_TOKEN not configured: used the offline keyword planner.');
    return Response.json(plan);
  }

  const s = labSettings();
  const warnings: string[] = [];
  let plan: EditPlan | null = null;
  const run = async (model: string, image: string | null, source: 'llm' | 'vlm') => {
    const json = await chatJson({ model, system: PLAN_SYSTEM_PROMPT, user: planUserMessage(req, Boolean(image)), image });
    return planFromJson(json, req.parts, source, model);
  };

  try {
    if (req.image) {
      try {
        plan = await run(s.vlm, req.image, 'vlm');
      } catch (e) {
        if (e instanceof HFError && e.fatal) throw e;
        warnings.push(`Vision model failed (${e instanceof Error ? e.message : 'error'}); planned with the text model without the snapshot.`);
        plan = await run(s.llm, null, 'llm');
      }
    } else {
      plan = await run(s.llm, null, 'llm');
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Hugging Face request failed.';
    return Response.json({ error: message, fatal: e instanceof HFError && e.fatal }, { status: 502 });
  }

  plan.warnings.unshift(...warnings);
  if (plan.steps.length === 0) {
    const fallback = heuristicPlan(req);
    if (fallback.steps.length) {
      fallback.warnings.push(...plan.warnings, `${plan.model} returned no usable steps (“${plan.summary}”); used the offline keyword planner.`);
      return Response.json(fallback);
    }
  }
  return Response.json(plan);
}
