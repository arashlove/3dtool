import { describe, expect, it } from 'vitest';
import { isGlb } from '@/ar/glb';
import { AR_LIMITS, SHARE_ID_PATTERN } from '@/ar/limits';
import { createArHandlers, lanAddress, shareOrigin, type ShareResponse } from '@/ar/server';
import { ShareStore } from '@/ar/share-store';

/** A minimal binary glTF: 12-byte header plus a padded JSON chunk. */
function fakeGlb(extraBytes = 0): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode('{"asset":{"version":"2.0"}}'.padEnd(28 + extraBytes, ' '));
  const total = 12 + 8 + json.byteLength;
  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, json.byteLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(json, 20);
  return bytes;
}

const store = (overrides: Partial<ConstructorParameters<typeof ShareStore>[0]> = {}) =>
  new ShareStore({ ttlMs: 1000, maxModelBytes: 1000, maxTotalBytes: 10_000, maxModels: 10, ...overrides });

const upload = (body: BodyInit, headers: Record<string, string> = {}, title = 'Living room') =>
  new Request(`http://localhost:3000/api/ar?title=${encodeURIComponent(title)}`, { method: 'POST', body, headers });

describe('GLB check', () => {
  it('accepts a glTF 2.0 binary whose length matches, and rejects anything else', () => {
    const glb = fakeGlb();
    expect(isGlb(glb)).toBe(true);
    expect(isGlb(glb.slice(0, glb.byteLength - 4))).toBe(false);
    expect(isGlb(new TextEncoder().encode('<html>not a model</html>'))).toBe(false);
    const v1 = fakeGlb();
    new DataView(v1.buffer).setUint32(4, 1, true);
    expect(isGlb(v1)).toBe(false);
  });
});

describe('share store', () => {
  it('returns models until they expire', () => {
    let t = 0;
    const s = store({ now: () => t });
    const model = s.put(fakeGlb(), 'Scene');
    expect(model.id).toMatch(SHARE_ID_PATTERN);
    expect(s.get(model.id)?.title).toBe('Scene');
    t = 1000;
    expect(s.get(model.id)).toBeNull();
    expect(s.stats).toEqual({ models: 0, totalBytes: 0 });
  });

  it('drops the oldest models to stay under the count and memory caps', () => {
    const byCount = store({ maxModels: 2 });
    const a = byCount.put(fakeGlb(), 'a');
    const b = byCount.put(fakeGlb(), 'b');
    const c = byCount.put(fakeGlb(), 'c');
    expect([byCount.get(a.id), byCount.get(b.id)?.title, byCount.get(c.id)?.title]).toEqual([null, 'b', 'c']);

    const size = fakeGlb().byteLength;
    const byBytes = store({ maxTotalBytes: size * 2 });
    const x = byBytes.put(fakeGlb(), 'x');
    byBytes.put(fakeGlb(), 'y');
    byBytes.put(fakeGlb(), 'z');
    expect(byBytes.get(x.id)).toBeNull();
    expect(byBytes.stats.totalBytes).toBe(size * 2);
  });

  it('refuses a model over the per-model cap', () => {
    expect(() => store({ maxModelBytes: 10 }).put(fakeGlb(), 'big')).toThrow(/too large/);
  });
});

describe('share link origin', () => {
  const req = (url: string, headers: Record<string, string> = {}) => new Request(url, { headers });

  it('prefers PUBLIC_BASE_URL, then the forwarded host', () => {
    expect(shareOrigin(req('http://0.0.0.0:3000/api/ar'), { PUBLIC_BASE_URL: 'https://3dtool.example.app/' })).toBe('https://3dtool.example.app');
    expect(
      shareOrigin(req('http://0.0.0.0:3000/api/ar', { 'x-forwarded-host': 'app.zenith.host', 'x-forwarded-proto': 'https' }), {}),
    ).toBe('https://app.zenith.host');
  });

  it('swaps localhost for the LAN address a phone can reach', () => {
    expect(shareOrigin(req('http://localhost:3000/api/ar'), {}, () => '192.168.1.20')).toBe('http://192.168.1.20:3000');
    expect(shareOrigin(req('http://localhost:3000/api/ar'), {}, () => null)).toBe('http://localhost:3000');
    expect(shareOrigin(req('http://192.168.1.5:3000/api/ar'), {}, () => '10.0.0.9')).toBe('http://192.168.1.5:3000');
  });

  it('skips virtual adapters and prefers private home and office ranges', () => {
    const iface = (address: string) => [{ address, family: 'IPv4', internal: false }] as never;
    expect(lanAddress({ 'vEthernet (WSL)': iface('172.20.0.1'), 'Wi-Fi': iface('192.168.0.12') })).toBe('192.168.0.12');
    expect(lanAddress({ WiFi: iface('172.30.27.12') })).toBe('172.30.27.12');
    expect(lanAddress({ 'vEthernet (WSL)': iface('172.20.0.1') })).toBeNull();
  });
});

describe('AR routes', () => {
  const handlers = () => createArHandlers({ store: store({ maxModelBytes: AR_LIMITS.maxModelBytes, maxTotalBytes: AR_LIMITS.maxTotalBytes }), env: {}, lan: () => '192.168.1.20' });

  it('shares a GLB and serves it back with a QR code for the phone link', async () => {
    const h = handlers();
    const res = await h.upload(upload(fakeGlb(), { 'sec-fetch-site': 'same-origin' }));
    expect(res.status).toBe(200);
    const share = (await res.json()) as ShareResponse;
    expect(share.url).toBe(`http://192.168.1.20:3000/ar/${share.id}`);
    expect(share.secure).toBe(false);
    expect(share.qrSvg).toMatch(/^<svg/);

    const get = h.download(share.id, 'GET');
    expect(get.headers.get('Content-Type')).toBe('model/gltf-binary');
    expect(decodeURIComponent(get.headers.get('X-Model-Title') ?? '')).toBe('Living room');
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(fakeGlb());
    expect(await h.download(share.id, 'HEAD').text()).toBe('');
    expect(h.download('not-a-real-id', 'GET').status).toBe(404);
  });

  it('refuses cross-site, oversized and non-GLB uploads', async () => {
    const h = handlers();
    expect((await h.upload(upload(fakeGlb(), { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
    expect((await h.upload(upload(fakeGlb(), { 'content-length': String(AR_LIMITS.maxModelBytes + 1) }))).status).toBe(413);
    expect((await h.upload(upload('<html></html>'))).status).toBe(400);
  });

  it('rate-limits uploads per client', async () => {
    const h = handlers();
    const from = () => upload(fakeGlb(), { 'x-forwarded-for': '1.2.3.4' });
    for (let i = 0; i < AR_LIMITS.uploadsPerClient; i++) expect((await h.upload(from())).status).toBe(200);
    const limited = await h.upload(from());
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
    expect((await h.upload(upload(fakeGlb(), { 'x-forwarded-for': '5.6.7.8' }))).status).toBe(200);
  });
});
