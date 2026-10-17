import * as THREE from 'three';
import { cornerIndex, faceAdjacency, faceAreas, faceMaterialIndices, rng, triangleCount } from './engine/geometry';
import { collectParts, materialsOf, type PartMesh } from './engine/parts';
import type { TextureSegment, TextureSegmentResult } from './types';

/**
 * Texture segmentation: splits parts into regions of similar surface colour. Runs on the CPU in the
 * browser; it uses no AI model and no Hugging Face token.
 *
 * every face → 4 colour samples → CIELAB → area-weighted sample → K (given or auto) → k-means++
 * → per-face majority vote → small-island smoothing → segments sorted by area and named.
 */

/** Barycentric sample points: the centroid and three interior points, away from edges. */
const BARY: Array<[number, number, number]> = [
  [1 / 3, 1 / 3, 1 / 3],
  [0.6, 0.2, 0.2],
  [0.2, 0.6, 0.2],
  [0.2, 0.2, 0.6],
];
const SAMPLES = BARY.length;
const MAX_FIT = 60_000;
const MIN_ISLAND = 12;

// ---------- colour science ----------

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** sRGB (0..1) → CIELAB (D65). */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  const y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  const z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

const NAMED: Array<[string, string]> = [
  ['Black', '#111111'], ['Charcoal', '#36454f'], ['Gray', '#808080'], ['Silver', '#c0c0c0'], ['White', '#f8f8f8'],
  ['Cream', '#f3ead2'], ['Beige', '#e3d5b8'], ['Tan', '#c8a27a'], ['Brown', '#6d4c41'], ['Dark brown', '#3e2723'],
  ['Red', '#c62828'], ['Dark red', '#7f1d1d'], ['Pink', '#ec7fb1'], ['Orange', '#ef6c00'], ['Gold', '#d4af37'],
  ['Yellow', '#fdd835'], ['Olive', '#6b7a2a'], ['Lime', '#9ccc3d'], ['Green', '#2e7d32'], ['Dark green', '#1b4332'],
  ['Teal', '#00897b'], ['Cyan', '#26c6da'], ['Light blue', '#90caf9'], ['Blue', '#1e63d6'], ['Navy', '#1a237e'],
  ['Purple', '#7b1fa2'], ['Magenta', '#d81b60'],
];
const hexToSrgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
const NAMED_LAB = NAMED.map(([name, hex]) => ({ name, lab: srgbToLab(...hexToSrgb(hex)) }));
function nearestName(lab: [number, number, number]): string {
  let best = NAMED_LAB[0];
  let bestD = Infinity;
  for (const n of NAMED_LAB) {
    const d = (n.lab[0] - lab[0]) ** 2 + (n.lab[1] - lab[1]) ** 2 + (n.lab[2] - lab[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best.name;
}

// ---------- face colours ----------

type Pixels = { data: Uint8ClampedArray; width: number; height: number };
const pixelCache = new WeakMap<object, Pixels | null>();

/** The base-colour texture downsized to ≤512 px and blurred: fine detail is noise when looking for regions. */
function texturePixels(texture: THREE.Texture): Pixels | null {
  const image = texture.image as (CanvasImageSource & { width: number; height: number }) | undefined;
  if (!image || !image.width || !image.height) return null;
  if (pixelCache.has(image)) return pixelCache.get(image) ?? null;
  try {
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.filter = 'blur(1.2px)';
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const px = { data: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height };
    pixelCache.set(image, px);
    return px;
  } catch {
    pixelCache.set(image, null);
    return null;
  }
}

/** sRGB colour samples for every face: Float32Array of faces × 4 samples × rgb. */
function faceColors(mesh: PartMesh): Float32Array {
  const g = mesh.geometry;
  const faces = triangleCount(g);
  const out = new Float32Array(faces * SAMPLES * 3);
  const mats = materialsOf(mesh) as THREE.MeshStandardMaterial[];
  const matIndex = faceMaterialIndices(g);
  const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
  const col = g.attributes.color as THREE.BufferAttribute | undefined;
  const srgb = new THREE.Color();

  for (let f = 0; f < faces; f++) {
    const m = mats[matIndex[f]] ?? mats[0];
    const factor = m?.color ? m.color.getRGB(srgb, THREE.SRGBColorSpace) : srgb.setRGB(0.8, 0.8, 0.8);
    const fr = factor.r;
    const fg = factor.g;
    const fb = factor.b;
    const idx = [0, 1, 2].map((k) => cornerIndex(g, f, k));
    const px = m?.map && uv ? texturePixels(m.map) : null;

    let us: number[] = [];
    let vs: number[] = [];
    if (px && uv) {
      m.map!.updateMatrix();
      const tm = m.map!.matrix;
      const p = idx.map((i) => new THREE.Vector2(uv.getX(i), uv.getY(i)).applyMatrix3(tm));
      us = p.map((q) => q.x);
      vs = p.map((q) => q.y);
      // Faces straddling the 0/1 UV wrap: shift the low coordinates by one so they don't sample the far side.
      if (Math.max(...us) - Math.min(...us) > 0.5) us = us.map((u) => (u < Math.max(...us) - 0.5 ? u + 1 : u));
      if (Math.max(...vs) - Math.min(...vs) > 0.5) vs = vs.map((v) => (v < Math.max(...vs) - 0.5 ? v + 1 : v));
    }

    for (let s = 0; s < SAMPLES; s++) {
      const [a, b, c] = BARY[s];
      let r: number;
      let gg: number;
      let bb: number;
      if (px) {
        let u = a * us[0] + b * us[1] + c * us[2];
        let v = a * vs[0] + b * vs[1] + c * vs[2];
        u -= Math.floor(u);
        v -= Math.floor(v);
        if (m.map!.flipY) v = 1 - v;
        const x = Math.min(px.width - 1, Math.floor(u * px.width));
        const y = Math.min(px.height - 1, Math.floor(v * px.height));
        const o = (y * px.width + x) * 4;
        r = (px.data[o] / 255) * fr;
        gg = (px.data[o + 1] / 255) * fg;
        bb = (px.data[o + 2] / 255) * fb;
      } else if (col && m?.vertexColors) {
        // Vertex colours are linear in three.js.
        const lin = [0, 1, 2].map((ch) => a * col.getComponent(idx[0], ch) + b * col.getComponent(idx[1], ch) + c * col.getComponent(idx[2], ch));
        r = linearToSrgb(lin[0]) * fr;
        gg = linearToSrgb(lin[1]) * fg;
        bb = linearToSrgb(lin[2]) * fb;
      } else {
        r = fr;
        gg = fg;
        bb = fb;
      }
      const o = (f * SAMPLES + s) * 3;
      out[o] = r;
      out[o + 1] = gg;
      out[o + 2] = bb;
    }
  }
  return out;
}

// ---------- k-means ----------

type Fit = { centers: Float64Array; error: number; k: number };

function nearest(centers: Float64Array, k: number, l: number, a: number, b: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let c = 0; c < k; c++) {
    const d = (centers[c * 3] - l) ** 2 + (centers[c * 3 + 1] - a) ** 2 + (centers[c * 3 + 2] - b) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function kmeansOnce(points: Float32Array, n: number, k: number, iterations: number, seed: number): Fit {
  const random = rng(seed);
  const centers = new Float64Array(k * 3);
  // k-means++ initialisation.
  const first = Math.floor(random() * n);
  centers.set([points[first * 3], points[first * 3 + 1], points[first * 3 + 2]], 0);
  const dist = new Float64Array(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const p = c - 1;
      const d = (points[i * 3] - centers[p * 3]) ** 2 + (points[i * 3 + 1] - centers[p * 3 + 1]) ** 2 + (points[i * 3 + 2] - centers[p * 3 + 2]) ** 2;
      if (d < dist[i]) dist[i] = d;
      total += dist[i];
    }
    let target = random() * total;
    let pick = n - 1;
    for (let i = 0; i < n; i++) {
      target -= dist[i];
      if (target <= 0) {
        pick = i;
        break;
      }
    }
    centers.set([points[pick * 3], points[pick * 3 + 1], points[pick * 3 + 2]], c * 3);
  }
  const labels = new Int32Array(n);
  const sums = new Float64Array(k * 3);
  const counts = new Int32Array(k);
  for (let it = 0; it < iterations; it++) {
    sums.fill(0);
    counts.fill(0);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const c = nearest(centers, k, points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
      if (c !== labels[i]) moved++;
      labels[i] = c;
      sums[c * 3] += points[i * 3];
      sums[c * 3 + 1] += points[i * 3 + 1];
      sums[c * 3 + 2] += points[i * 3 + 2];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      centers[c * 3] = sums[c * 3] / counts[c];
      centers[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
      centers[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
    }
    if (it > 0 && moved === 0) break;
  }
  let error = 0;
  for (let i = 0; i < n; i++) {
    const c = nearest(centers, k, points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
    error += (points[i * 3] - centers[c * 3]) ** 2 + (points[i * 3 + 1] - centers[c * 3 + 1]) ** 2 + (points[i * 3 + 2] - centers[c * 3 + 2]) ** 2;
  }
  return { centers, error, k };
}

function distinctColors(points: Float32Array, n: number, limit: number): number {
  const seen = new Set<string>();
  for (let i = 0; i < n && seen.size <= limit; i++) {
    seen.add(`${Math.round(points[i * 3] * 10)},${Math.round(points[i * 3 + 1] * 10)},${Math.round(points[i * 3 + 2] * 10)}`);
  }
  return seen.size;
}

/** k-means++ with seeded restarts, keeping the lowest-error result. K is capped at the number of distinct colours. */
export function kmeans(points: Float32Array, n: number, k: number, restarts = 3, iterations = 30): Fit {
  const kk = Math.max(1, Math.min(k, distinctColors(points, n, k), n));
  let best: Fit | null = null;
  for (let r = 0; r < restarts; r++) {
    const fit = kmeansOnce(points, n, kk, iterations, r);
    if (!best || fit.error < best.error) best = fit;
  }
  return best!;
}

function totalVariance(points: Float32Array, n: number): number {
  const mean = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mean[c] += points[i * 3 + c] / n;
  let v = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) v += (points[i * 3 + c] - mean[c]) ** 2;
  return v;
}

/**
 * Smallest K in 2..10 that explains >92% of the variance, or after which the error ratio stops
 * improving by at least 0.04 (then K−1).
 */
export function chooseK(points: Float32Array, n: number): number {
  const total = totalVariance(points, n);
  if (total < 1e-9) return 1;
  let previous = 1;
  for (let k = 2; k <= 10; k++) {
    const fit = kmeans(points, n, k, 1, 15);
    if (fit.k < k) return fit.k;
    const ratio = fit.error / total;
    if (ratio < 0.08) return k;
    if (previous - ratio < 0.04) return k - 1;
    previous = ratio;
  }
  return 10;
}

// ---------- smoothing ----------

/** Same-label islands smaller than `minFaces` take the most common label on their border (up to 4 passes). */
function smooth(labels: Int16Array, neighbours: number[][], minFaces = MIN_ISLAND) {
  for (let pass = 0; pass < 4; pass++) {
    const seen = new Uint8Array(labels.length);
    let changed = false;
    for (let start = 0; start < labels.length; start++) {
      if (seen[start]) continue;
      const label = labels[start];
      const island: number[] = [start];
      seen[start] = 1;
      const border = new Map<number, number>();
      for (let q = 0; q < island.length; q++) {
        for (const nb of neighbours[island[q]]) {
          if (labels[nb] === label) {
            if (!seen[nb]) {
              seen[nb] = 1;
              island.push(nb);
            }
          } else {
            border.set(labels[nb], (border.get(labels[nb]) ?? 0) + 1);
          }
        }
      }
      if (island.length >= minFaces || border.size === 0) continue;
      const winner = [...border.entries()].sort((a, b) => b[1] - a[1])[0][0];
      for (const f of island) labels[f] = winner;
      changed = true;
    }
    if (!changed) break;
  }
}

// ---------- main ----------

export function segmentByTexture(root: THREE.Object3D, partIds: string[], k: number | null): TextureSegmentResult {
  const all = collectParts(root);
  const meshes = partIds.map((id) => all.get(id)).filter((m): m is PartMesh => Boolean(m && !m.userData.decalOf));
  if (meshes.length === 0) throw new Error('Nothing to segment: select parts or show some first.');

  const perMesh = meshes.map((mesh) => {
    mesh.updateWorldMatrix(true, false);
    const rgb = faceColors(mesh);
    const faces = triangleCount(mesh.geometry);
    const lab = new Float32Array(faces * SAMPLES * 3);
    const mean = new Float32Array(faces * 3);
    for (let f = 0; f < faces; f++) {
      for (let s = 0; s < SAMPLES; s++) {
        const o = (f * SAMPLES + s) * 3;
        const l = srgbToLab(rgb[o], rgb[o + 1], rgb[o + 2]);
        lab.set(l, o);
        mean[f * 3] += l[0] / SAMPLES;
        mean[f * 3 + 1] += l[1] / SAMPLES;
        mean[f * 3 + 2] += l[2] / SAMPLES;
      }
    }
    return { mesh, faces, rgb, lab, mean, areas: faceAreas(mesh.geometry, mesh.matrixWorld) };
  });

  // Fitting set: up to 60k faces drawn with probability proportional to world-space area.
  const totalFaces = perMesh.reduce((s, m) => s + m.faces, 0);
  const cumulative = new Float64Array(totalFaces);
  const owner: Array<[number, number]> = [];
  let acc = 0;
  perMesh.forEach((m, mi) => {
    for (let f = 0; f < m.faces; f++) {
      acc += m.areas[f];
      cumulative[owner.length] = acc;
      owner.push([mi, f]);
    }
  });
  if (acc <= 0) throw new Error('The selected parts have no surface area.');
  const n = Math.min(MAX_FIT, Math.max(totalFaces, 1) * 4, MAX_FIT);
  const fitPoints = new Float32Array(n * 3);
  const random = rng(0);
  for (let i = 0; i < n; i++) {
    const t = random() * acc;
    let lo = 0;
    let hi = totalFaces - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    const [mi, f] = owner[lo];
    fitPoints.set(perMesh[mi].mean.subarray(f * 3, f * 3 + 3), i * 3);
  }

  const kRequested = k;
  const K = k ?? chooseK(fitPoints, n);
  const fit = kmeans(fitPoints, n, Math.max(1, Math.min(32, K)));

  // Assign: each face's 4 samples vote for their nearest centre.
  const rawLabels = perMesh.map((m) => {
    const labels = new Int16Array(m.faces);
    const votes = new Int32Array(fit.k);
    for (let f = 0; f < m.faces; f++) {
      votes.fill(0);
      for (let s = 0; s < SAMPLES; s++) {
        const o = (f * SAMPLES + s) * 3;
        votes[nearest(fit.centers, fit.k, m.lab[o], m.lab[o + 1], m.lab[o + 2])]++;
      }
      let best = 0;
      for (let c = 1; c < fit.k; c++) if (votes[c] > votes[best]) best = c;
      labels[f] = best;
    }
    smooth(labels, faceAdjacency(m.mesh.geometry));
    return labels;
  });

  // Order clusters by covered area, drop empty ones, compute display colour and name.
  const area = new Float64Array(fit.k);
  const rgbSum = new Float64Array(fit.k * 3);
  perMesh.forEach((m, mi) => {
    const labels = rawLabels[mi];
    for (let f = 0; f < m.faces; f++) {
      const c = labels[f];
      const w = m.areas[f];
      area[c] += w;
      for (let s = 0; s < SAMPLES; s++) {
        const o = (f * SAMPLES + s) * 3;
        for (let ch = 0; ch < 3; ch++) rgbSum[c * 3 + ch] += (m.rgb[o + ch] * w) / SAMPLES;
      }
    }
  });
  const order = [...Array(fit.k).keys()].filter((c) => area[c] > 0).sort((a, b) => area[b] - area[a]);
  const remap = new Int16Array(fit.k).fill(-1);
  order.forEach((c, i) => {
    remap[c] = i;
  });
  const totalArea = order.reduce((s, c) => s + area[c], 0);
  const usedNames = new Map<string, number>();
  const segments: TextureSegment[] = order.map((c, i) => {
    const rgb = [0, 1, 2].map((ch) => Math.min(1, Math.max(0, rgbSum[c * 3 + ch] / area[c])));
    let name = nearestName(srgbToLab(rgb[0], rgb[1], rgb[2]));
    const count = (usedNames.get(name) ?? 0) + 1;
    usedNames.set(name, count);
    if (count > 1) name = `${name} ${count}`;
    return {
      id: i,
      name,
      color: `#${new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace)}`,
      area_fraction: Math.round((area[c] / totalArea) * 10000) / 10000,
    };
  });

  const face_labels: Record<string, Int16Array> = {};
  const node_faces: Record<string, number> = {};
  perMesh.forEach((m, mi) => {
    const id = m.mesh.userData.partId as string;
    face_labels[id] = rawLabels[mi].map((l) => remap[l]);
    node_faces[id] = m.faces;
  });
  return { mode: 'texture', num_segments: segments.length, k_requested: kRequested, segments, face_labels, node_faces };
}
