import { connection } from 'next/server';
import { z } from 'zod';
import { DEFAULT_HOSTED_MODEL_ID, GENERATION_SETTINGS, HOSTED_MODEL_ID_PATTERN, IMAGE_LIMITS } from '@/ai/model-config';
import { LIMITS } from '@/core/schema/constants';

/**
 * Server-side proxy to Hugging Face Inference Providers (OpenAI-compatible chat completions).
 * The token comes from the HF_TOKEN environment variable and is never sent to the browser.
 */
const HF_CHAT_URL = 'https://router.huggingface.co/v1/chat/completions';
const UPSTREAM_TIMEOUT_MS = 90_000;

function serverToken(): string | null {
  const token = process.env.HF_TOKEN?.trim();
  return token ? token : null;
}

function defaultModel(): string {
  const configured = process.env.HF_VISION_MODEL?.trim();
  return configured && HOSTED_MODEL_ID_PATTERN.test(configured) ? configured : DEFAULT_HOSTED_MODEL_ID;
}

const textPart = z.object({ type: z.literal('text'), text: z.string().max(20_000) });
const imagePart = z.object({
  type: z.literal('image_url'),
  image_url: z.object({
    url: z
      .string()
      .max(IMAGE_LIMITS.maxDataUrlChars)
      .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Images must be PNG, JPEG or WebP data URLs.'),
  }),
});

const requestSchema = z.object({
  model: z.string().regex(HOSTED_MODEL_ID_PATTERN).optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.union([z.string().max(20_000), z.array(z.union([textPart, imagePart])).min(1).max(4)]),
      }),
    )
    .min(1)
    .max(24),
});

export async function GET() {
  await connection();
  return Response.json({ configured: serverToken() !== null, defaultModel: defaultModel() });
}

export async function POST(request: Request) {
  const token = serverToken();
  if (!token) {
    return Response.json(
      { error: 'HF_TOKEN is not set on the server. Add it to .env.local (or the deployment environment) and restart.' },
      { status: 503 },
    );
  }

  let body: z.infer<typeof requestSchema>;
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
    body = parsed.data;
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }
  const imageCount = body.messages.reduce(
    (n, m) => n + (Array.isArray(m.content) ? m.content.filter((p) => p.type === 'image_url').length : 0),
    0,
  );
  if (imageCount > 1) return Response.json({ error: 'Only one reference image is supported.' }, { status: 400 });

  const model = body.model ?? defaultModel();
  let upstream: Response;
  try {
    upstream = await fetch(HF_CHAT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: body.messages,
        max_tokens: GENERATION_SETTINGS.maxNewTokens,
        temperature: 0,
        stream: false,
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError');
    return Response.json(
      { error: aborted ? 'The Hugging Face request was cancelled or timed out.' : 'Could not reach Hugging Face.' },
      { status: 502 },
    );
  }

  const payload = (await upstream.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    usage?: { completion_tokens?: number };
    error?: unknown;
  } | null;

  if (!upstream.ok) {
    const detail = typeof payload?.error === 'string' ? payload.error : JSON.stringify(payload?.error ?? '').slice(0, 300);
    return Response.json(
      { error: `Hugging Face returned ${upstream.status} for ${model}${detail ? `: ${detail}` : ''}` },
      { status: upstream.status === 401 || upstream.status === 403 ? upstream.status : 502 },
    );
  }

  const content = payload?.choices?.[0]?.message?.content;
  const text = typeof content === 'string' ? content : '';
  return Response.json({
    text: text.slice(0, LIMITS.maxModelOutputChars),
    model,
    tokens: payload?.usage?.completion_tokens ?? 0,
  });
}
