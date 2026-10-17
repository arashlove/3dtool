import { texturePrompt, wrapSize } from '@/lab/prompts';
import { labSettings, requestToken, textToImage } from '@/lab/server/hf';
import { readJson, textureRequestSchema } from '@/lab/server/schemas';

/**
 * Text-to-image for seamless textures, decals and 360° wraps. Returns the raw image; the browser
 * cuts out white backgrounds and builds the procedural fallback when this returns 503.
 */
export async function POST(request: Request) {
  const token = requestToken(request);
  if (!token) return Response.json({ error: 'No Hugging Face token.', fallback: 'procedural' }, { status: 503 });
  const body = await readJson(request, textureRequestSchema);
  if (!body.ok) return body.response;
  const { prompt, size, kind, aspect } = body.data;
  const dims = kind === 'wrap' ? wrapSize(aspect) : { width: size, height: size };
  try {
    const blob = await textToImage(token, texturePrompt(prompt, kind), dims.width, dims.height);
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
