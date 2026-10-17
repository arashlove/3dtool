import { resolveTarget } from '@/lab/plan';
import { LABEL_SYSTEM_PROMPT, labelUserMessage } from '@/lab/prompts';
import { aiEnabled, chatJson, HFError, labSettings } from '@/lab/server/hf';
import { labelRequestSchema, readJson } from '@/lab/server/schemas';

/** AI part naming from the marked snapshot. Needs HF_TOKEN. */
export async function POST(request: Request) {
  if (!aiEnabled()) return Response.json({ error: 'AI names need HF_TOKEN in .env.local.' }, { status: 400 });
  const body = await readJson(request, labelRequestSchema);
  if (!body.ok) return body.response;
  const { parts, image } = body.data;
  const model = labSettings().vlm;
  try {
    const json = (await chatJson({ model, system: LABEL_SYSTEM_PROMPT, user: labelUserMessage(parts), image, maxTokens: 4096 })) as {
      labels?: unknown;
    };
    const labels: Record<string, string> = {};
    if (json && typeof json.labels === 'object' && json.labels !== null) {
      for (const [key, value] of Object.entries(json.labels as Record<string, unknown>)) {
        const id = resolveTarget(key, parts);
        if (id && typeof value === 'string' && value.trim()) labels[id] = value.trim().slice(0, 60);
      }
    }
    return Response.json({ labels, model });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Naming failed.', fatal: e instanceof HFError && e.fatal }, { status: 502 });
  }
}
