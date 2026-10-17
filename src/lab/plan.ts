import { DECAL_DIRECTIONS, OP_TYPES, type Axis, type EditPlan, type EditStep, type Operation, type PartInfo, type PlanSource, type Region, type Vec3 } from './types';

/**
 * Model output is never trusted as-is: targets are resolved against known parts, unknown
 * operations are dropped, and every number is clamped to a safe range.
 */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function clampNum(v: unknown, min: number, max: number): number | undefined {
  const n = num(v);
  return n === undefined ? undefined : clamp(n, min, max);
}

function vec3(v: unknown, pad: number, min: number, max: number): Vec3 | undefined {
  if (typeof v === 'number') return [clamp(v, min, max), clamp(v, min, max), clamp(v, min, max)];
  if (!Array.isArray(v) || v.length === 0) return undefined;
  const out = [0, 1, 2].map((i) => num(v[i]) ?? pad).map((n) => clamp(n, min, max));
  return out as Vec3;
}

const AXES = new Set(['x', 'y', 'z']);
function axis(v: unknown): Axis | undefined {
  const a = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return AXES.has(a) ? (a as Axis) : undefined;
}

const NAMED_COLORS: Record<string, string> = {
  black: '#111111', white: '#f5f5f5', gray: '#808080', grey: '#808080', silver: '#c0c0c0', red: '#c62828',
  pink: '#ec7fb1', orange: '#ef6c00', gold: '#d4af37', yellow: '#fdd835', green: '#2e7d32', lime: '#9ccc3d',
  olive: '#6b7a2a', teal: '#00897b', cyan: '#26c6da', blue: '#1e63d6', navy: '#1a237e', purple: '#7b1fa2',
  violet: '#8e44ad', magenta: '#d81b60', brown: '#6d4c41', tan: '#c8a27a', beige: '#e3d5b8', cream: '#f3ead2',
  copper: '#b87333', bronze: '#a97142', chrome: '#dfe3e8', charcoal: '#333638',
};

export function normaliseColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (NAMED_COLORS[s]) return NAMED_COLORS[s];
  const hex = s.startsWith('#') ? s.slice(1) : s;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  if (/^[0-9a-f]{3}$/.test(hex)) return `#${hex.split('').map((c) => c + c).join('')}`;
  return undefined;
}

export function colorFromName(word: string): string | undefined {
  return NAMED_COLORS[word.toLowerCase()];
}

const text = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);

export function normaliseOperation(raw: unknown): Operation | null {
  if (!isObj(raw)) return null;
  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : '';
  if (!(OP_TYPES as readonly string[]).includes(type)) return null;
  const op: Operation = { type: type as Operation['type'] };
  switch (op.type) {
    case 'color':
      op.color = normaliseColor(raw.color);
      if (!op.color) return null;
      op.keep_texture = raw.keep_texture === true;
      break;
    case 'material': {
      op.metalness = clampNum(raw.metalness, 0, 1);
      op.roughness = clampNum(raw.roughness, 0, 1);
      op.opacity = clampNum(raw.opacity, 0.02, 1);
      op.emissive = normaliseColor(raw.emissive);
      op.emissive_intensity = clampNum(raw.emissive_intensity, 0, 10);
      if ([op.metalness, op.roughness, op.opacity, op.emissive, op.emissive_intensity].every((v) => v === undefined)) return null;
      break;
    }
    case 'texture':
      op.texture_prompt = text(raw.texture_prompt ?? raw.prompt);
      if (!op.texture_prompt) return null;
      op.tiling = clampNum(raw.tiling, 0.25, 16) ?? 2;
      break;
    case 'decal': {
      op.decal_prompt = text(raw.decal_prompt ?? raw.prompt);
      if (!op.decal_prompt) return null;
      const dir = typeof raw.direction === 'string' ? raw.direction.trim().toLowerCase() : 'front';
      op.direction = (DECAL_DIRECTIONS as readonly string[]).includes(dir) ? (dir as Operation['direction']) : 'front';
      op.decal_size = clampNum(raw.decal_size, 0.05, 1.5) ?? 0.8;
      op.degrees = clampNum(raw.degrees, -720, 720) ?? 0;
      break;
    }
    case 'scale':
      op.factor = clampNum(raw.factor, 0.02, 50);
      if (op.factor === undefined) return null;
      op.anchor = vec3(raw.anchor, 0.5, 0, 1) ?? [0.5, 0.5, 0.5];
      break;
    case 'stretch':
      op.factors = vec3(raw.factors ?? raw.factor, 1, 0.02, 50);
      if (!op.factors) return null;
      op.anchor = vec3(raw.anchor, 0.5, 0, 1) ?? [0.5, 0.5, 0.5];
      break;
    case 'translate':
      op.offset = vec3(raw.offset, 0, -5, 5);
      if (!op.offset) return null;
      break;
    case 'rotate':
    case 'twist':
    case 'bend':
      op.axis = axis(raw.axis) ?? 'y';
      op.degrees = clampNum(raw.degrees, -720, 720);
      if (op.degrees === undefined) return null;
      break;
    case 'taper':
      op.axis = axis(raw.axis) ?? 'y';
      op.factor = clampNum(raw.factor, 0, 10);
      if (op.factor === undefined) return null;
      break;
    case 'inflate':
      op.factor = clampNum(raw.factor, -0.5, 0.5);
      if (op.factor === undefined) return null;
      break;
    case 'hide':
    case 'show':
      break;
  }
  for (const key of Object.keys(op) as (keyof Operation)[]) if (op[key] === undefined) delete op[key];
  return op;
}

function normaliseRegion(raw: unknown): Region | undefined {
  if (!isObj(raw)) return undefined;
  const a = axis(raw.axis);
  const start = clampNum(raw.start, 0, 1);
  const end = clampNum(raw.end, 0, 1);
  if (!a || start === undefined || end === undefined || end - start < 0.01) return undefined;
  return { axis: a, start, end };
}

/** Resolves a model-written target (id, marker number "#4"/"4", or label) to a part id. */
export function resolveTarget(raw: unknown, parts: PartInfo[]): string | null {
  if (typeof raw === 'number') raw = String(raw);
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t) return null;
  const byId = parts.find((p) => p.id === t);
  if (byId) return byId.id;
  const marker = /^#?(\d{1,4})$/.exec(t);
  if (marker) {
    const m = Number(marker[1]);
    const byMarker = parts.find((p) => p.marker === m);
    if (byMarker) return byMarker.id;
  }
  const lower = t.toLowerCase();
  const byLabel = parts.find((p) => p.label.toLowerCase() === lower) ?? parts.find((p) => p.label.toLowerCase().includes(lower));
  return byLabel?.id ?? null;
}

export function planFromJson(value: unknown, parts: PartInfo[], source: PlanSource, model: string | null): EditPlan {
  const warnings: string[] = [];
  const obj = isObj(value) ? value : {};
  const rawSteps = Array.isArray(obj.steps) ? obj.steps.slice(0, 24) : [];
  const steps: EditStep[] = [];
  rawSteps.forEach((rawStep, i) => {
    if (!isObj(rawStep)) return;
    const rawTargets = Array.isArray(rawStep.targets) ? rawStep.targets : rawStep.targets !== undefined ? [rawStep.targets] : [];
    const targets = [...new Set(rawTargets.map((t) => resolveTarget(t, parts)).filter((t): t is string => t !== null))];
    if (targets.length === 0) {
      warnings.push(`Step ${i + 1} was dropped: none of its targets match a part.`);
      return;
    }
    const rawOps = Array.isArray(rawStep.operations) ? rawStep.operations.slice(0, 12) : [];
    const operations: Operation[] = [];
    rawOps.forEach((rawOp, j) => {
      const op = normaliseOperation(rawOp);
      if (op) operations.push(op);
      else warnings.push(`Step ${i + 1}, operation ${j + 1} was invalid and dropped.`);
    });
    if (operations.length === 0) return;
    const step: EditStep = { targets, operations };
    const region = normaliseRegion(rawStep.region);
    if (rawStep.region !== undefined && !region) warnings.push(`Step ${i + 1}: the region was invalid and ignored.`);
    if (region) step.region = region;
    step.pivot = rawStep.pivot === 'group' ? 'group' : 'part';
    const description = text(rawStep.description, 200);
    if (description) step.description = description;
    steps.push(step);
  });
  return { summary: text(obj.summary, 400) ?? 'Edit plan', steps, source, model, warnings };
}
