import { afterEach, describe, expect, it, vi } from 'vitest';
import { CancelledError, HuggingFaceInferencePlanner, InferenceError } from '@/ai/hf-inference-planner';
import { INFERENCE_ENDPOINT } from '@/ai/model-config';
import { buildCompactSceneContext } from '@/core/prompt/scene-context';
import { createEmptyDocument } from '@/core/schema/scene';

const context = buildCompactSceneContext(createEmptyDocument(), null);
const model = { modelId: 'openai/gpt-oss-120b', label: 'Balanced', isCustom: false };

function sse(events: unknown[], { hang = false } = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`));
      if (!hang) controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const delta = (content: string) => ({ choices: [{ delta: { content } }] });

function planner(token: string | null = 'hf_test') {
  const p = new HuggingFaceInferencePlanner();
  p.configure(model, token);
  return p;
}

afterEach(() => vi.unstubAllGlobals());

describe('HuggingFaceInferencePlanner', () => {
  it('sends the token only to the router and assembles streamed content', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sse([{ choices: [{ delta: { reasoning: 'thinking' } }] }, delta('{"version":1,'), delta('"status":"ok"}'), '[DONE]']),
    );
    vi.stubGlobal('fetch', fetchMock);
    const progress: string[] = [];
    const text = await planner().generatePlan({ userText: 'a table', sceneContext: context, onProgress: (p) => progress.push(p.phase) });

    expect(text).toBe('{"version":1,"status":"ok"}');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(INFERENCE_ENDPOINT);
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer hf_test');
    expect(init.credentials).toBe('omit');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: 'openai/gpt-oss-120b', stream: true, temperature: 0 });
    expect(body.messages.at(-1).content).toContain('a table');
    expect(progress).toEqual(['waiting', 'thinking', 'writing', 'writing']);
  });

  it('stops reading once the first JSON object is complete', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse([delta('{"a":{"b":1}}'), delta(' and more')], { hang: true })));
    await expect(planner().generatePlan({ userText: 'x', sceneContext: context })).resolves.toBe('{"a":{"b":1}}');
  });

  it('refuses to call the network without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(planner(null).generatePlan({ userText: 'x', sceneContext: context })).rejects.toBeInstanceOf(InferenceError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, /rejected the token/],
    [402, /credits are used up/],
    [429, /rate limit/],
    [404, /not available/],
  ])('maps HTTP %i to a helpful message', async (status, pattern) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), { status })));
    await expect(planner().generatePlan({ userText: 'x', sceneContext: context })).rejects.toThrow(pattern);
  });

  it('surfaces provider errors sent inside the stream', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sse([{ error: { message: 'model overloaded' } }])));
    await expect(planner().generatePlan({ userText: 'x', sceneContext: context })).rejects.toThrow(/model overloaded/);
  });

  it('cancel aborts the request with CancelledError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      ),
    );
    const p = planner();
    const pending = p.generatePlan({ userText: 'x', sceneContext: context });
    p.cancel();
    await expect(pending).rejects.toBeInstanceOf(CancelledError);
  });
});
