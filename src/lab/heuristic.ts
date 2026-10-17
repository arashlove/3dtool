import { colorFromName } from './plan';
import type { Axis, EditPlan, EditStep, Operation, PartInfo, PlanRequest, Vec3 } from './types';

/**
 * Offline keyword planner. Used when no Hugging Face token is configured, and as a safety net
 * when the AI returns an empty plan. It is deliberately simple and predictable.
 */

const stem = (w: string) => w.toLowerCase().replace(/(ies)$/, 'y').replace(/(es|s|ing|ed)$/, '');
const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

const ALL_WORDS = new Set(['everything', 'whole', 'all', 'entire', 'model', 'object']);
const METAL_COLORS = new Set(['gold', 'silver', 'chrome', 'copper', 'bronze']);
const STOP = new Set(['the', 'a', 'an', 'make', 'and', 'of', 'to', 'with', 'in', 'on', 'more', 'bit', 'little', 'please', 'turn', 'into', 'be', 'part', 'parts']);

const TEXTURES = ['wood', 'wooden', 'oak', 'walnut', 'marble', 'brick', 'stone', 'concrete', 'fabric', 'leather', 'checker', 'checkered', 'weave', 'woven', 'denim', 'granite', 'camouflage', 'rust', 'rusty'];
const DECAL_WORDS = ['logo', 'picture', 'print', 'sticker', 'decal', 'image', 'emblem', 'drawing', 'painting', 'graphic'];
const WRAP_WORDS = ['around', 'spiral', 'wrap', 'wrapped', 'wrapping', 'circling'];

/** Parses "30%", "2x", "twice", "half", "by 1.5" into a multiplicative factor. */
export function parseAmount(prompt: string, grow: boolean): number | null {
  const p = prompt.toLowerCase();
  const pct = /(\d+(?:\.\d+)?)\s*%/.exec(p);
  if (pct) {
    const f = Number(pct[1]) / 100;
    return grow ? 1 + f : Math.max(0.05, 1 - f);
  }
  const times = /(\d+(?:\.\d+)?)\s*(?:x|times)\b/.exec(p);
  if (times) {
    const f = Number(times[1]);
    return grow ? f : f > 1 ? 1 / f : f;
  }
  if (/\b(twice|double)\b/.test(p)) return grow ? 2 : 0.5;
  if (/\b(triple|three times)\b/.test(p)) return grow ? 3 : 1 / 3;
  if (/\bhalf\b/.test(p)) return grow ? 1.5 : 0.5;
  return null;
}

function parseDegrees(prompt: string): number | null {
  const m = /(-?\d+(?:\.\d+)?)\s*(?:°|deg|degree|degrees)\b/.exec(prompt.toLowerCase());
  return m ? Number(m[1]) : null;
}

function selectTargets(req: PlanRequest, tokens: string[]): string[] {
  const visible = req.parts.filter((p) => p.visible && !p.decal_of);
  if (tokens.some((t) => ALL_WORDS.has(t))) return visible.map((p) => p.id);
  const stems = tokens.filter((t) => !STOP.has(t) && t.length > 2).map(stem);
  const matched = visible.filter((p) => {
    const labelStems = words(p.label).map(stem);
    return stems.some((s) => labelStems.includes(s));
  });
  if (matched.length) return matched.map((p) => p.id);
  // Unmatched prompts ("make it red", "bigger") apply to the selection, or else to everything.
  if (req.selected_ids.length) return req.selected_ids;
  return visible.map((p) => p.id);
}

function dominantAxis(parts: PartInfo[]): Axis {
  const size = parts.reduce<Vec3>((acc, p) => [Math.max(acc[0], p.size[0]), Math.max(acc[1], p.size[1]), Math.max(acc[2], p.size[2])], [0, 0, 0]);
  const i = size.indexOf(Math.max(...size));
  return (['x', 'y', 'z'] as const)[i];
}

const AXIS_INDEX: Record<Axis, number> = { x: 0, y: 1, z: 2 };
function axisFactors(axis: Axis, f: number): Vec3 {
  const v: Vec3 = [1, 1, 1];
  v[AXIS_INDEX[axis]] = f;
  return v;
}

/** Text after "of"/"with" for a decal or texture subject, e.g. "a picture of a red dragon". */
function subjectAfter(prompt: string, keyword: string): string {
  const lower = prompt.toLowerCase();
  const i = lower.indexOf(keyword);
  const rest = i >= 0 ? prompt.slice(i + keyword.length) : prompt;
  const m = /\b(?:of|with|showing)\s+(.+)/i.exec(rest);
  const subject = (m ? m[1] : rest).replace(/\b(around|on|onto|to)\b.*$/i, '').trim();
  return subject || prompt.trim();
}

export function heuristicPlan(req: PlanRequest): EditPlan {
  const prompt = req.prompt.trim();
  const tokens = words(prompt);
  const set = new Set(tokens);
  const has = (...w: string[]) => w.some((x) => set.has(x));
  const targets = selectTargets(req, tokens);
  const targetParts = req.parts.filter((p) => targets.includes(p.id));
  const ops: Operation[] = [];

  // Pictures before colours: "a red dragon logo" is a decal, not a recolour.
  const decalWord = DECAL_WORDS.find((w) => set.has(w) || set.has(`${w}s`));
  if (decalWord) {
    ops.push({
      type: 'decal',
      decal_prompt: subjectAfter(prompt, decalWord),
      direction: has(...WRAP_WORDS) ? 'around' : has('back') ? 'back' : has('top') ? 'top' : has('left') ? 'left' : has('right') ? 'right' : 'front',
      decal_size: 0.8,
      degrees: 0,
    });
  } else {
    const texture = TEXTURES.find((w) => set.has(w));
    if (texture) {
      ops.push({ type: 'texture', texture_prompt: tokens.filter((t) => !STOP.has(t)).join(' ') || texture, tiling: 2 });
    } else {
      const colorWord = tokens.find((t) => colorFromName(t) && !METAL_COLORS.has(t));
      if (colorWord) ops.push({ type: 'color', color: colorFromName(colorWord)!, keep_texture: has('tint', 'tinted') });
    }
  }

  if (has('gold', 'golden', 'silver', 'chrome', 'copper', 'bronze', 'steel', 'metal', 'metallic', 'brushed')) {
    const metalColor = tokens.map((t) => (t === 'golden' ? 'gold' : t === 'steel' ? 'silver' : t)).map(colorFromName).find(Boolean);
    if (metalColor && !ops.some((o) => o.type === 'color')) ops.push({ type: 'color', color: metalColor });
    ops.push({ type: 'material', metalness: 1, roughness: has('brushed') ? 0.45 : has('chrome', 'polished') ? 0.08 : 0.25 });
  }
  if (has('glass', 'transparent', 'translucent', 'clear')) ops.push({ type: 'material', opacity: 0.3, roughness: 0.05, metalness: 0 });
  if (has('glossy', 'shiny', 'polished') && !has('metal', 'metallic', 'chrome')) ops.push({ type: 'material', roughness: 0.15 });
  if (has('matte', 'rough')) ops.push({ type: 'material', roughness: 0.9, metalness: 0 });
  if (has('glow', 'glowing', 'neon', 'emissive', 'light')) {
    const glow = tokens.map(colorFromName).find(Boolean) ?? '#ffffff';
    ops.push({ type: 'material', emissive: glow, emissive_intensity: 2 });
  }

  const grow = parseAmount(prompt, true);
  const shrink = parseAmount(prompt, false);
  if (has('bigger', 'larger', 'enlarge', 'grow')) ops.push({ type: 'scale', factor: grow ?? 1.25, anchor: [0.5, 0, 0.5] });
  if (has('smaller', 'shrink', 'tiny')) ops.push({ type: 'scale', factor: shrink ?? 0.8, anchor: [0.5, 0, 0.5] });
  if (has('longer', 'lengthen', 'extend')) {
    const a = dominantAxis(targetParts);
    ops.push({ type: 'stretch', factors: axisFactors(a, grow ?? 1.3), anchor: a === 'y' ? [0.5, 1, 0.5] : [0.5, 0.5, 0.5] });
  }
  if (has('shorter')) {
    const a = dominantAxis(targetParts);
    ops.push({ type: 'stretch', factors: axisFactors(a, shrink ?? 0.75), anchor: a === 'y' ? [0.5, 1, 0.5] : [0.5, 0.5, 0.5] });
  }
  if (has('taller', 'higher')) ops.push({ type: 'stretch', factors: [1, grow ?? 1.3, 1], anchor: [0.5, 0, 0.5] });
  if (has('wider', 'broader')) ops.push({ type: 'stretch', factors: [grow ?? 1.3, 1, 1], anchor: [0.5, 0.5, 0.5] });
  if (has('deeper')) ops.push({ type: 'stretch', factors: [1, 1, grow ?? 1.3], anchor: [0.5, 0.5, 0.5] });
  if (has('narrower')) ops.push({ type: 'stretch', factors: [shrink ?? 0.75, 1, 1], anchor: [0.5, 0.5, 0.5] });
  if (has('thinner', 'slimmer')) ops.push({ type: 'stretch', factors: [shrink ?? 0.75, 1, shrink ?? 0.75], anchor: [0.5, 0.5, 0.5] });
  if (has('thicker', 'chunkier')) ops.push({ type: 'stretch', factors: [grow ?? 1.3, 1, grow ?? 1.3], anchor: [0.5, 0.5, 0.5] });

  const deg = parseDegrees(prompt);
  if (has('twist', 'twisted')) ops.push({ type: 'twist', axis: 'y', degrees: deg ?? 45 });
  if (has('bend', 'bent', 'curve', 'curved')) ops.push({ type: 'bend', axis: 'y', degrees: deg ?? 30 });
  if (has('taper', 'tapered', 'pointy')) ops.push({ type: 'taper', axis: 'y', factor: 0.5 });
  if (has('inflate', 'puffy', 'swell', 'fatter')) ops.push({ type: 'inflate', factor: 0.03 });
  if (has('deflate')) ops.push({ type: 'inflate', factor: -0.02 });
  if (has('rotate', 'turn', 'spin') && !has('into')) {
    const a: Axis = has('tilt', 'forward', 'backward') ? 'x' : 'y';
    ops.push({ type: 'rotate', axis: a, degrees: deg ?? 45 });
  }
  if (has('move', 'shift', 'raise', 'lower', 'lift')) {
    const step = 0.1;
    const offset: Vec3 = [0, 0, 0];
    if (has('up', 'raise', 'lift')) offset[1] += step;
    if (has('down', 'lower')) offset[1] -= step;
    if (has('left')) offset[0] -= step;
    if (has('right')) offset[0] += step;
    if (has('forward', 'front')) offset[2] += step;
    if (has('back', 'backward', 'backwards')) offset[2] -= step;
    if (offset.some((v) => v !== 0)) ops.push({ type: 'translate', offset });
  }
  if (has('remove', 'hide', 'delete', 'without')) ops.push({ type: 'hide' });
  if (has('show', 'unhide', 'restore')) ops.push({ type: 'show' });

  const steps: EditStep[] = ops.length && targets.length ? [{ targets, operations: ops, pivot: 'part' }] : [];
  const names = targetParts.slice(0, 4).map((p) => p.label).join(', ');
  return {
    summary: steps.length
      ? `${ops.map((o) => o.type).join(', ')} on ${names}${targetParts.length > 4 ? ` and ${targetParts.length - 4} more` : ''}`
      : 'The offline planner did not recognise an edit in that prompt.',
    steps,
    source: 'heuristic',
    model: null,
    warnings: [],
  };
}
