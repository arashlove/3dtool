import { z } from 'zod';
import { ID_PATTERN, LIMITS } from './constants';
import { KIND_DEFS, OBJECT_KINDS, type ObjectKind, type Params, validateParams } from './kinds';
import { MaterialSpecSchema, type MaterialSpec } from './material';

export type Vec3 = [number, number, number];

export type TransformSpec = {
  position: Vec3;
  /** Radians, XYZ Euler order. The UI and AI plans use degrees and convert at the boundary. */
  rotation: Vec3;
  scale: Vec3;
};

export type SceneObject = {
  id: string;
  name: string;
  kind: ObjectKind;
  params: Params;
  transform: TransformSpec;
  materials: Record<string, MaterialSpec>;
  visible: boolean;
  locked: boolean;
};

export type SceneSettings = {
  gridVisible: boolean;
  shadowsEnabled: boolean;
  snapEnabled: boolean;
  snapStep: number;
};

export type SceneDocument = {
  schemaVersion: 1;
  title: string;
  unit: 'm';
  objects: SceneObject[];
  settings: SceneSettings;
};

const coord = z.number().min(LIMITS.positionMin).max(LIMITS.positionMax);
const angle = z.number().min(-LIMITS.rotationMaxRad).max(LIMITS.rotationMaxRad);
const scaleComponent = z.number().min(LIMITS.scaleMin).max(LIMITS.scaleMax);

export const TransformSchema = z.strictObject({
  position: z.tuple([coord, coord, coord]),
  rotation: z.tuple([angle, angle, angle]),
  scale: z.tuple([scaleComponent, scaleComponent, scaleComponent]),
});

export const NameSchema = z.string().trim().min(1).max(LIMITS.maxNameLength);

function objectSchemaFor(kind: ObjectKind) {
  const def = KIND_DEFS[kind];
  const paramShape = Object.fromEntries(
    def.params.map((p) => [
      p.key,
      p.type === 'boolean'
        ? z.boolean()
        : (p.integer ? z.number().int() : z.number()).min(p.min).max(p.max),
    ]),
  );
  const materialShape = Object.fromEntries(def.parts.map((part) => [part.key, MaterialSpecSchema]));
  return z
    .strictObject({
      id: z.string().regex(ID_PATTERN),
      name: NameSchema,
      kind: z.literal(kind),
      params: z.strictObject(paramShape),
      transform: TransformSchema,
      materials: z.strictObject(materialShape),
      visible: z.boolean(),
      locked: z.boolean(),
    })
    .superRefine((obj, ctx) => {
      for (const message of validateParams(kind, obj.params as Params)) {
        ctx.addIssue({ code: 'custom', message, path: ['params'] });
      }
    });
}

const objectSchemas = OBJECT_KINDS.map(objectSchemaFor);

export const SceneObjectSchema = z.discriminatedUnion(
  'kind',
  objectSchemas as unknown as [ReturnType<typeof objectSchemaFor>, ...ReturnType<typeof objectSchemaFor>[]],
) as unknown as z.ZodType<SceneObject>;

export const SceneSettingsSchema = z.strictObject({
  gridVisible: z.boolean(),
  shadowsEnabled: z.boolean(),
  snapEnabled: z.boolean(),
  snapStep: z.number().min(0.01).max(1),
});

export const SceneDocumentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    title: NameSchema,
    unit: z.literal('m'),
    objects: z.array(SceneObjectSchema).max(LIMITS.maxObjects),
    settings: SceneSettingsSchema,
  })
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    doc.objects.forEach((o, i) => {
      if (seen.has(o.id)) ctx.addIssue({ code: 'custom', message: `Duplicate object id ${o.id}`, path: ['objects', i] });
      seen.add(o.id);
    });
  }) as unknown as z.ZodType<SceneDocument>;

export const DEFAULT_SETTINGS: SceneSettings = {
  gridVisible: true,
  shadowsEnabled: true,
  snapEnabled: false,
  snapStep: 0.05,
};

export function createEmptyDocument(title = 'Untitled scene'): SceneDocument {
  return { schemaVersion: 1, title, unit: 'm', objects: [], settings: { ...DEFAULT_SETTINGS } };
}

export const IDENTITY_TRANSFORM: TransformSpec = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
};
