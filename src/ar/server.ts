import { networkInterfaces } from 'node:os';
import QRCode from 'qrcode';
import { isGlb } from './glb';
import { AR_LIMITS, SHARE_ID_PATTERN } from './limits';
import { FixedWindowLimiter } from './rate-limit';
import type { ShareStore } from './share-store';

export type ShareResponse = {
  id: string;
  url: string;
  expiresAt: number;
  bytes: number;
  /** SVG markup of a QR code for `url`. */
  qrSvg: string;
  /** False for http links: the phone opens the 3D view, but Android AR (WebXR) needs HTTPS. */
  secure: boolean;
};

type Env = Record<string, string | undefined>;

const VIRTUAL_ADAPTER = /vethernet|wsl|virtualbox|vmware|docker|hyper-v|tailscale|zerotier|loopback/i;
const isLoopback = (host: string) => host === 'localhost' || host === '[::1]' || host.startsWith('127.');

/** A LAN address a phone on the same network can reach, preferring physical adapters. */
export function lanAddress(interfaces = networkInterfaces()): string | null {
  const candidates: string[] = [];
  for (const [name, addresses] of Object.entries(interfaces)) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const a of addresses ?? []) if (a.family === 'IPv4' && !a.internal) candidates.push(a.address);
  }
  return candidates.find((ip) => /^(192\.168|10)\./.test(ip)) ?? candidates[0] ?? null;
}

/**
 * Origin for share links: PUBLIC_BASE_URL (Zenith maps its public URL here), then the proxy's
 * forwarded host, then the request. A localhost origin is swapped for the LAN address, because a
 * phone cannot open the laptop's localhost.
 */
export function shareOrigin(request: Request, env: Env = process.env, lan: () => string | null = lanAddress): string {
  const configured = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const url = new URL(request.url);
  const host = request.headers.get('x-forwarded-host')?.split(',')[0].trim() || request.headers.get('host') || url.host;
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim() || url.protocol.replace(':', '');
  const [hostname, port] = host.startsWith('[') ? [host.slice(0, host.indexOf(']') + 1), host.split(']:')[1]] : host.split(':');
  if (isLoopback(hostname)) {
    const address = lan();
    if (address) return `${proto}://${address}${port ? `:${port}` : ''}`;
  }
  return `${proto}://${host}`;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (forwarded || request.headers.get('x-real-ip')?.trim() || 'anonymous').slice(0, 64);
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** Reads the body, stopping as soon as it passes `max` bytes. Returns null when it is too large. */
async function readCapped(request: Request, max: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get('content-length') ?? 0) > max) return null;
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function cleanTitle(raw: string | null): string {
  return (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, AR_LIMITS.maxTitleLength) || '3D scene';
}

type Deps = { store: ShareStore; env?: Env; now?: () => number; lan?: () => string | null };

/** POST /api/ar (upload a scene GLB) and GET/HEAD /api/ar/[id] (serve it to the phone). */
export function createArHandlers({ store, env = process.env, now = Date.now, lan = lanAddress }: Deps) {
  const perClient = new FixedWindowLimiter(AR_LIMITS.uploadsPerClient, AR_LIMITS.uploadWindowMs, now);
  const daily = new FixedWindowLimiter(AR_LIMITS.dailyUploads, 24 * 60 * 60 * 1000, now);
  const maxMb = Math.round(AR_LIMITS.maxModelBytes / 1024 / 1024);

  async function upload(request: Request): Promise<Response> {
    const site = request.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin') return json({ error: 'Cross-site requests are not allowed.' }, 403);

    const limited = perClient.take(clientKey(request));
    if (!limited.ok) {
      return json({ error: `Too many AR links. Try again in ${limited.retryAfterSec} s.` }, 429, { 'Retry-After': String(limited.retryAfterSec) });
    }
    const budget = daily.take('all');
    if (!budget.ok) {
      return json({ error: 'AR sharing has reached its daily limit. Try again tomorrow.' }, 429, { 'Retry-After': String(budget.retryAfterSec) });
    }

    const bytes = await readCapped(request, AR_LIMITS.maxModelBytes);
    if (!bytes) return json({ error: `The scene is larger than ${maxMb} MB. Hide or remove some objects and try again.` }, 413);
    if (!isGlb(bytes)) return json({ error: 'The upload is not a valid GLB file.' }, 400);

    const model = store.put(bytes, cleanTitle(new URL(request.url).searchParams.get('title')));
    const url = `${shareOrigin(request, env, lan)}/ar/${model.id}`;
    const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return json({ id: model.id, url, expiresAt: model.expiresAt, bytes: bytes.byteLength, qrSvg, secure: url.startsWith('https://') } satisfies ShareResponse);
  }

  function download(id: string, method: 'GET' | 'HEAD'): Response {
    const model = SHARE_ID_PATTERN.test(id) ? store.get(id) : null;
    if (!model) return json({ error: 'This AR link has expired or does not exist.' }, 404);
    const headers = {
      'Content-Type': 'model/gltf-binary',
      'Content-Length': String(model.bytes.byteLength),
      'Cache-Control': 'private, max-age=300',
      'X-Model-Title': encodeURIComponent(model.title),
      'X-Expires-At': String(model.expiresAt),
    };
    return new Response(method === 'HEAD' ? null : (model.bytes as Uint8Array<ArrayBuffer>), { headers });
  }

  return { upload, download };
}
