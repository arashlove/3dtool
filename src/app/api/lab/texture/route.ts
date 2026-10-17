import { texturePrompt, wrapSize } from '@/lab/prompts';
import { aiEnabled, labSettings, textToImage } from '@/lab/server/hf';
import { readJson, textureRequestSchema } from '@/lab/server/schemas';

/**
 * Text-to-image for seamless textures, decals and 360° wraps. Returns the raw image; the browser
 * cuts out white backgrounds and builds the procedural fallback when this returns 503.
 */
export async function POST(request: Request) {
  if (!aiEnabled()) return Response.json({ error: 'HF_TOKEN not configured.', fallback: 'procedural' }, { status: 503 });
  const body = await readJson(request, textureRequestSchema);
  if (!body.ok) return body.response;
  const { prompt, size, kind, aspect } = body.data;
  const dims = kind === 'wrap' ? wrapSize(aspect) : { width: size, height: size };
  try {
    const blob = await textToImage(texturePrompt(prompt, kind), dims.width, dims.height);
    return new Response(blob, {
      headers: {
        'Content-Type': blob.type || 'image/png',
        'X-Texture-Source': labSettings().image,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Image generation failed.' }, { status: 502 });
  }
}
