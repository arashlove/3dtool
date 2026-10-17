import { z } from 'zod';
import { IMAGE_LIMITS } from '@/ai/model-config';

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

export const partInfoSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().max(120),
  material: z.string().max(120),
  color: z.string().max(16),
  has_texture: z.boolean(),
  triangles: z.number().int().min(0),
  center: vec3,
  size: vec3,
  visible: z.boolean(),
  marker: z.number().int().min(1).max(10_000).nullable().optional(),
  decal_of: z.string().max(80).nullable().optional(),
});

export const snapshotImage = z
  .string()
  .max(IMAGE_LIMITS.maxDataUrlChars)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'Images must be PNG, JPEG or WebP data URLs.');

export const planRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  parts: z.array(partInfoSchema).max(2000),
  selected_ids: z.array(z.string().max(80)).max(2000),
  model_size: vec3,
  model_center: vec3,
  image: snapshotImage.nullable().optional(),
});

export const labelRequestSchema = z.object({
  parts: z.array(partInfoSchema).min(1).max(2000),
  image: snapshotImage,
});

export const textureRequestSchema = z.object({
  prompt: z.string().min(1).max(300),
  size: z.number().int().min(256).max(1024).default(1024),
  kind: z.enum(['seamless', 'decal', 'wrap', 'object']).default('seamless'),
  aspect: z.number().min(0.25).max(8).default(1),
});

export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  try {
    const parsed = schema.safeParse(await request.json());
    if (parsed.success) return { ok: true, data: parsed.data };
    const issue = parsed.error.issues[0];
    return { ok: false, response: Response.json({ error: `Invalid request: ${issue.path.join('.') || 'body'} ${issue.message}` }, { status: 400 }) };
  } catch {
    return { ok: false, response: Response.json({ error: 'Invalid JSON body.' }, { status: 400 }) };
  }
}
