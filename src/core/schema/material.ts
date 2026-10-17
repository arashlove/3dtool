import { z } from 'zod';

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export const MaterialSpecSchema = z.strictObject({
  color: z.string().regex(HEX_COLOR, 'Colour must be #RRGGBB'),
  metalness: z.number().min(0).max(1),
  roughness: z.number().min(0).max(1),
  opacity: z.number().min(0.2).max(1).optional(),
});

export type MaterialSpec = z.infer<typeof MaterialSpecSchema>;

export const MATERIAL_PRESET_NAMES = [
  'wood',
  'matteMetal',
  'polishedMetal',
  'plastic',
  'fabric',
  'glassLike',
] as const;

export type MaterialPresetName = (typeof MATERIAL_PRESET_NAMES)[number];

/** Presets only set surface parameters; colour is kept unless the preset defines a default tint. */
export const MATERIAL_PRESETS: Record<
  MaterialPresetName,
  { label: string; metalness: number; roughness: number; opacity?: number; defaultColor: string }
> = {
  wood: { label: 'Wood (approx.)', metalness: 0, roughness: 0.65, defaultColor: '#A97B50' },
  matteMetal: { label: 'Matte metal', metalness: 0.75, roughness: 0.6, defaultColor: '#2A2A2A' },
  polishedMetal: { label: 'Polished metal', metalness: 0.9, roughness: 0.25, defaultColor: '#B8BEC6' },
  plastic: { label: 'Plastic', metalness: 0, roughness: 0.4, defaultColor: '#E0E0E0' },
  fabric: { label: 'Fabric', metalness: 0, roughness: 0.92, defaultColor: '#6B7A8F' },
  glassLike: { label: 'Glass-like', metalness: 0.1, roughness: 0.05, opacity: 0.35, defaultColor: '#DCEFF5' },
};

/** Small fixed dictionary so small language models can use plain colour words. */
export const NAMED_COLORS: Record<string, string> = {
  red: '#C0392B',
  darkred: '#7B1E1E',
  orange: '#E67E22',
  yellow: '#F1C40F',
  gold: '#C9A227',
  green: '#3E8E41',
  darkgreen: '#1E5631',
  olive: '#6B7B3A',
  teal: '#1F8A8A',
  cyan: '#22B8CF',
  blue: '#2E64C5',
  navy: '#1F2D5A',
  lightblue: '#8EC5E8',
  purple: '#7D4CB0',
  violet: '#8E5CC9',
  pink: '#E58FB1',
  magenta: '#C2378F',
  brown: '#7A5233',
  oak: '#AA7B4E',
  walnut: '#5C3D2E',
  beige: '#D9C7A7',
  cream: '#F2E8D5',
  white: '#F4F4F2',
  black: '#1E1E1E',
  gray: '#8A8D91',
  grey: '#8A8D91',
  darkgray: '#45484C',
  darkgrey: '#45484C',
  lightgray: '#C9CCD0',
  lightgrey: '#C9CCD0',
  silver: '#AEB4BB',
  chrome: '#C8CDD2',
  copper: '#B87333',
  bronze: '#8C6A3F',
  brass: '#B5A642',
};

/** Accepts #RRGGBB or a known colour word. Returns null when unknown. */
export function resolveColor(value: string): string | null {
  const trimmed = value.trim();
  if (HEX_COLOR.test(trimmed)) return trimmed.toUpperCase();
  const key = trimmed.toLowerCase().replace(/[\s_-]/g, '');
  return NAMED_COLORS[key] ?? null;
}

export const MaterialInputSchema = z.strictObject({
  preset: z.enum(MATERIAL_PRESET_NAMES).optional(),
  color: z.string().max(32).optional(),
  metalness: z.number().min(0).max(1).optional(),
  roughness: z.number().min(0).max(1).optional(),
  opacity: z.number().min(0.2).max(1).optional(),
});

export type MaterialInput = z.infer<typeof MaterialInputSchema>;

export type MaterialResolution = { ok: true; value: MaterialSpec } | { ok: false; error: string };

/** Applies preset values first, then explicit overrides, on top of the existing material. */
export function resolveMaterialInput(base: MaterialSpec, input: MaterialInput): MaterialResolution {
  const next: MaterialSpec = { ...base };
  if (input.preset) {
    const preset = MATERIAL_PRESETS[input.preset];
    next.metalness = preset.metalness;
    next.roughness = preset.roughness;
    if (preset.opacity !== undefined) next.opacity = preset.opacity;
    else delete next.opacity;
    if (input.color === undefined) next.color = preset.defaultColor;
  }
  if (input.color !== undefined) {
    const color = resolveColor(input.color);
    if (!color) return { ok: false, error: `Unknown colour "${input.color}". Use #RRGGBB or a basic colour name.` };
    next.color = color;
  }
  if (input.metalness !== undefined) next.metalness = input.metalness;
  if (input.roughness !== undefined) next.roughness = input.roughness;
  if (input.opacity !== undefined) {
    if (input.opacity >= 1) delete next.opacity;
    else next.opacity = input.opacity;
  }
  const parsed = MaterialSpecSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: 'Invalid material values.' };
  return { ok: true, value: parsed.data };
}
