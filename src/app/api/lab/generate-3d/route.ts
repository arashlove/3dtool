import { z } from 'zod';
import { HFError, requestToken } from '@/lab/server/hf';
import { readJson, snapshotImage } from '@/lab/server/schemas';
import { imageToGlb, QUALITY, space3d, type Progress } from '@/lab/server/trellis';

const requestSchema = z.object({
  image: snapshotImage,
  quality: z.enum(Object.keys(QUALITY) as [keyof typeof QUALITY, ...(keyof typeof QUALITY)[]]).default('standard'),
  seed: z.number().int().min(0).max(2_147_483_647).default(0),
});

function dataUrlToBlob(url: string): Blob {
  const [head, data] = url.split(',', 2);
  const type = /^data:([^;]+)/.exec(head)?.[1] ?? 'image/png';
  return new Blob([Buffer.from(data, 'base64')], { type });
}

/**
 * Image → textured GLB via the TRELLIS.2 Space. Streams NDJSON: `progress` lines while the Space
 * works (it can queue and takes a minute or more), then one `done` line with the GLB as base64,
 * or an `error` line.
 */
export async function POST(request: Request) {
  const token = requestToken(request);
  if (!token) return Response.json({ error: 'Text to 3D needs your Hugging Face token (top bar).' }, { status: 400 });
  const body = await readJson(request, requestSchema);
  if (!body.ok) return body.response;
  const { image, quality, seed } = body.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (line: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        } catch {
          closed = true;
        }
      };
      try {
        const glb = await imageToGlb(token, dataUrlToBlob(image), quality, seed, (p: Progress) => send({ type: 'progress', ...p }), request.signal);
        send({ type: 'done', model: space3d(), bytes: glb.byteLength, glb: Buffer.from(glb).toString('base64') });
      } catch (e) {
        send({ type: 'error', error: e instanceof Error ? e.message : '3D generation failed.', fatal: e instanceof HFError && e.fatal });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
}
