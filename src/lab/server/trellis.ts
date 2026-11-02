import { Client, handle_file } from '@gradio/client';
import { HFError } from './hf';

/**
 * Image-to-3D through the public microsoft/TRELLIS.2 Space (ZeroGPU). No Hugging Face Inference
 * Provider serves a 3D model, so the Space's own Gradio API is called with the visitor's token;
 * GPU time counts against their account's ZeroGPU quota.
 *
 * The Space keeps the generated latent in per-session state: one client (one session) runs
 * start_session → preprocess_image → image_to_3d → extract_glb.
 */

export const QUALITY = {
  fast: { resolution: '512', decimation: 100_000, textureSize: 1024 },
  standard: { resolution: '1024', decimation: 200_000, textureSize: 2048 },
  high: { resolution: '1536', decimation: 300_000, textureSize: 2048 },
} as const;
export type Quality = keyof typeof QUALITY;

export type Progress = { stage: string; detail?: string; position?: number; eta?: number; progress?: number };

type FileData = { url?: string; path?: string };

export function space3d(): string {
  return process.env.HF_3D_SPACE?.trim() || 'microsoft/TRELLIS.2';
}

function explainSpaceError(e: unknown): HFError {
  const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/quota|exceeded.*gpu|gpu.*limit|zerogpu/i.test(message)) {
    return new HFError(`ZeroGPU quota for this Hugging Face account is used up (${message.slice(0, 160)}). It refills over time; a PRO account gets more.`, true);
  }
  if (/401|403|unauthori[sz]ed|invalid token/i.test(message)) return new HFError('Your Hugging Face token was rejected by the Space.', true);
  if (/sleep|paused|building|not running|runtime_error/i.test(message)) return new HFError(`The ${space3d()} Space is not running right now. Try again later.`);
  return new HFError(`${space3d()} failed: ${message.slice(0, 300)}`);
}

async function run<T>(
  client: Client,
  endpoint: string,
  data: Record<string, unknown> | unknown[],
  label: string,
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<T> {
  const job = client.submit(endpoint, data);
  const abort = () => void job.cancel();
  signal.addEventListener('abort', abort, { once: true });
  try {
    for await (const event of job) {
      if (event.type === 'status') {
        if (event.stage === 'error') throw explainSpaceError(event.message ?? event.title ?? 'error');
        const p = event.progress_data?.find((d) => d.progress !== null || (d.index !== null && d.length));
        onProgress({
          stage: label,
          detail: event.stage === 'pending' ? 'In the Space queue' : p?.desc ?? undefined,
          position: event.position,
          eta: event.eta,
          progress: p?.progress ?? (p?.index != null && p.length ? p.index / p.length : undefined),
        });
      } else if (event.type === 'data') {
        return event.data as T;
      }
    }
    throw new HFError(`${space3d()} closed the connection during ${label.toLowerCase()}.`);
  } catch (e) {
    throw e instanceof HFError ? e : explainSpaceError(e);
  } finally {
    signal.removeEventListener('abort', abort);
  }
}

/** Turns one image (a data URL or PNG/JPEG/WebP blob) into a textured GLB. */
export async function imageToGlb(
  token: string,
  image: Blob,
  quality: Quality,
  seed: number,
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<ArrayBuffer> {
  if (!token) throw new HFError('Text to 3D needs your Hugging Face token.', true);
  const q = QUALITY[quality];
  onProgress({ stage: 'Connecting', detail: space3d() });
  let client: Client;
  try {
    client = await Client.connect(space3d(), { token: token as `hf_${string}`, events: ['data', 'status'] });
  } catch (e) {
    throw explainSpaceError(e);
  }
  try {
    await run(client, '/start_session', [], 'Starting session', onProgress, signal);
    const [prepared] = await run<[FileData]>(client, '/preprocess_image', { input: handle_file(image) }, 'Removing background', onProgress, signal);
    await run(
      client,
      '/image_to_3d',
      {
        image: prepared,
        seed,
        resolution: q.resolution,
        ss_guidance_strength: 7.5,
        ss_guidance_rescale: 0.7,
        ss_sampling_steps: 12,
        ss_rescale_t: 5,
        shape_slat_guidance_strength: 7.5,
        shape_slat_guidance_rescale: 0.5,
        shape_slat_sampling_steps: 12,
        shape_slat_rescale_t: 3,
        tex_slat_guidance_strength: 1,
        tex_slat_guidance_rescale: 0,
        tex_slat_sampling_steps: 12,
        tex_slat_rescale_t: 3,
      },
      'Generating 3D',
      onProgress,
      signal,
    );
    const [glb] = await run<[FileData | string]>(
      client,
      '/extract_glb',
      { decimation_target: q.decimation, texture_size: q.textureSize },
      'Extracting GLB',
      onProgress,
      signal,
    );
    const url = typeof glb === 'string' ? glb : glb?.url;
    if (!url) throw new HFError(`${space3d()} did not return a GLB file.`);
    onProgress({ stage: 'Downloading GLB' });
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!response.ok) throw new HFError(`Could not download the GLB from ${space3d()} (${response.status}).`);
    return await response.arrayBuffer();
  } finally {
    client.close();
  }
}
