import * as THREE from 'three';
import { labHeaders, NO_TOKEN_MESSAGE } from './ai-token';
import { rng } from './engine/geometry';
import { colorFromName } from './plan';
import { wrapSize } from './prompts';
import type { TextureKind } from './types';

/**
 * Images for textures, decals and wraps. Asks the server (Hugging Face text-to-image); without a
 * token it builds a procedural image instead. Background cut-out and cropping run here.
 */

export type TextureResult = { texture: THREE.Texture; source: string };

function canvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/**
 * Near-white pixels (all channels ≥ 236) connected to the image border become transparent, so
 * white details inside the subject survive. The alpha edge is softened slightly.
 */
export function cutoutWhiteBackground(image: ImageData): ImageData {
  const { width: w, height: h, data } = image;
  const near = (i: number) => data[i * 4] >= 236 && data[i * 4 + 1] >= 236 && data[i * 4 + 2] >= 236;
  const bg = new Uint8Array(w * h);
  const queue: number[] = [];
  const push = (i: number) => {
    if (!bg[i] && near(i)) {
      bg[i] = 1;
      queue.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  // Soft edge: 3×3 box blur of the mask, twice.
  let alpha = new Float32Array(w * h).map((_, i) => (bg[i] ? 0 : 1));
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            s += alpha[yy * w + xx];
            n++;
          }
        }
        next[y * w + x] = s / n;
      }
    }
    alpha = next;
  }
  const out = new ImageData(new Uint8ClampedArray(data), w, h);
  for (let i = 0; i < w * h; i++) out.data[i * 4 + 3] = Math.round(alpha[i] * data[i * 4 + 3]);
  return out;
}

/** Crops to the opaque subject and pads it to a square. */
function cropToSquare(image: ImageData): HTMLCanvasElement {
  const { width: w, height: h, data } = image;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 16) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  const src = canvas(w, h);
  src.getContext('2d')!.putImageData(image, 0, 0);
  if (x1 < 0) return src;
  const side = Math.max(x1 - x0, y1 - y0) + 8;
  const out = canvas(side, side);
  out.getContext('2d')!.drawImage(src, x0, y0, x1 - x0 + 1, y1 - y0 + 1, (side - (x1 - x0)) / 2, (side - (y1 - y0)) / 2, x1 - x0 + 1, y1 - y0 + 1);
  return out;
}

function toTexture(source: HTMLCanvasElement, kind: TextureKind): THREE.Texture {
  const t = new THREE.CanvasTexture(source);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = kind === 'decal' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.wrapT = kind === 'seamless' ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

async function postProcess(blob: Blob, kind: TextureKind, aspect: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    if (kind === 'wrap') {
      // The provider may ignore the requested size: resize to the requested aspect.
      const target = wrapSize(aspect);
      width = target.width;
      height = target.height;
    }
    const c = canvas(width, height);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (kind === 'seamless') return c;
    const cut = cutoutWhiteBackground(ctx.getImageData(0, 0, width, height));
    if (kind === 'decal') return cropToSquare(cut);
    ctx.putImageData(cut, 0, 0);
    return c;
  } finally {
    bitmap.close();
  }
}

export async function loadTexture(prompt: string, kind: TextureKind, aspect: number): Promise<TextureResult> {
  const response = await fetch('/api/lab/texture', {
    method: 'POST',
    headers: labHeaders(),
    body: JSON.stringify({ prompt, size: 1024, kind, aspect: Math.min(8, Math.max(0.25, aspect)) }),
  });
  if (response.status === 503) return { texture: toTexture(procedural(prompt, kind, aspect), kind), source: 'procedural' };
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Image generation failed (${response.status}).`);
  }
  const source = response.headers.get('X-Texture-Source') ?? 'hugging face';
  return { texture: toTexture(await postProcess(await response.blob(), kind, aspect), kind), source };
}

// ---------- procedural fallbacks ----------

function tint(prompt: string, fallback: string): THREE.Color {
  const word = prompt.toLowerCase().match(/[a-z]+/g)?.find((w) => colorFromName(w));
  return new THREE.Color(word ? colorFromName(word)! : fallback);
}

/** Tileable value noise on a periodic lattice. */
function noise(period: number, seed: number) {
  const random = rng(seed);
  const grid = Array.from({ length: period * period }, () => random());
  const at = (x: number, y: number) => grid[(((y % period) + period) % period) * period + (((x % period) + period) % period)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (u: number, v: number) => {
    const x = u * period;
    const y = v * period;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
}

function fbm(u: number, v: number, layers: Array<(u: number, v: number) => number>) {
  let s = 0;
  let w = 0;
  layers.forEach((n, i) => {
    const amp = 1 / 2 ** i;
    s += n(u, v) * amp;
    w += amp;
  });
  return s / w;
}

function proceduralSeamless(prompt: string, size = 512): HTMLCanvasElement {
  const p = prompt.toLowerCase();
  const c = canvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const layers = [4, 8, 16, 32].map((period, i) => noise(period, i + 1));
  const kind = /brick/.test(p) ? 'brick' : /marble|granite|stone/.test(p) ? 'marble' : /check/.test(p) ? 'check' : /weave|woven|fabric|denim/.test(p) ? 'weave' : /wood|oak|walnut|plank/.test(p) ? 'wood' : 'noise';
  const base = tint(p, kind === 'wood' ? '#9c6b3f' : kind === 'brick' ? '#a1452e' : kind === 'marble' ? '#e8e6e1' : '#8a8f99');
  const srgb = base.getRGB(new THREE.Color(), THREE.SRGBColorSpace);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = fbm(u, v, layers);
      let shade: number;
      switch (kind) {
        case 'wood':
          shade = 0.75 + 0.25 * Math.sin((v * 12 + n * 3) * Math.PI * 2) ** 2 - 0.15 * n;
          break;
        case 'marble':
          shade = 0.88 + 0.12 * Math.abs(Math.sin((u * 4 + n * 4) * Math.PI));
          shade = Math.abs(Math.sin((u * 2 + v * 2 + n * 3) * Math.PI)) < 0.06 ? 0.45 : shade;
          break;
        case 'brick': {
          const row = Math.floor(v * 8);
          const bu = (u * 4 + (row % 2) * 0.5) % 1;
          const mortar = (v * 8) % 1 < 0.08 || bu < 0.04;
          shade = mortar ? 1.6 : 0.85 + 0.25 * n;
          break;
        }
        case 'check':
          shade = (Math.floor(u * 8) + Math.floor(v * 8)) % 2 ? 1 : 0.35;
          break;
        case 'weave': {
          const a = Math.sin(u * Math.PI * 64) * Math.sin(v * Math.PI * 64);
          shade = 0.8 + 0.2 * a + 0.1 * (n - 0.5);
          break;
        }
        default:
          shade = 0.7 + 0.5 * (n - 0.5);
      }
      const o = (y * size + x) * 4;
      img.data[o] = Math.min(255, srgb.r * 255 * shade);
      img.data[o + 1] = Math.min(255, srgb.g * 255 * shade);
      img.data[o + 2] = Math.min(255, srgb.b * 255 * shade);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function proceduralDecal(prompt: string): HTMLCanvasElement {
  const c = canvas(512, 512);
  const ctx = c.getContext('2d')!;
  const color = `#${tint(prompt, '#d4af37').getHexString()}`;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 100 : 230;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(256 + r * Math.cos(a), 256 + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();
  return c;
}

function proceduralWrap(prompt: string, aspect: number): HTMLCanvasElement {
  const { width, height } = wrapSize(aspect);
  const c = canvas(width, height);
  const ctx = c.getContext('2d')!;
  const color = `#${tint(prompt, '#2e7d32').getHexString()}`;
  // A diagonal serpent strip that tiles horizontally.
  for (const shift of [-width, 0, width]) {
    ctx.beginPath();
    for (let x = 0; x <= width; x += 4) {
      const y = height * (0.85 - (0.7 * x) / width) + Math.sin((x / width) * Math.PI * 6) * height * 0.06;
      if (x === 0) ctx.moveTo(x + shift, y);
      else ctx.lineTo(x + shift, y);
    }
    ctx.lineWidth = height * 0.16;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  return c;
}

function procedural(prompt: string, kind: TextureKind, aspect: number): HTMLCanvasElement {
  if (kind === 'decal') return proceduralDecal(prompt);
  if (kind === 'wrap') return proceduralWrap(prompt, aspect);
  return proceduralSeamless(prompt);
}

/** Concept image for text-to-3D: one object on a white background, as a JPEG data URL (≤1024 px). */
export async function generateConceptImage(prompt: string): Promise<string> {
  const response = await fetch('/api/lab/texture', {
    method: 'POST',
    headers: labHeaders(),
    body: JSON.stringify({ prompt, size: 1024, kind: 'object', aspect: 1 }),
  });
  if (response.status === 503) throw new Error(NO_TOKEN_MESSAGE);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Image generation failed (${response.status}).`);
  }
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const c = canvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.92);
  } finally {
    bitmap.close();
  }
}
