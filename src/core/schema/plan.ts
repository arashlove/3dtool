import { z } from 'zod';
import { FORBIDDEN_KEYS, LIMITS } from './constants';
import { OBJECT_KINDS } from './kinds';
import { MaterialInputSchema } from './material';

const REF_PATTERN = /^new:[A-Za-z0-9_-]{1,32}$/;
const PARAM_KEY = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9]{0,31}$/)
  .refine((k) => !FORBIDDEN_KEYS.has(k), 'Forbidden key');
const PART_KEY = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]{0,31}$/)
  .refine((k) => !FORBIDDEN_KEYS.has(k), 'Forbidden key');

export const TargetSchema = z.string().trim().min(1).max(120);

const coord = z.number().min(LIMITS.positionMin).max(LIMITS.positionMax);
const deg = z.number().min(-LIMITS.rotationMaxDeg).max(LIMITS.rotationMaxDeg);
const scl = z.number().min(LIMITS.scaleMin).max(LIMITS.scaleMax);

export const Vec3PositionSchema = z.tuple([coord, coord, coord]);
export const Vec3DegSchema = z.tuple([deg, deg, deg]);
export const Vec3ScaleSchema = z.tuple([scl, scl, scl]);

/** Strings are only style names; validateParams checks them against each kind's option list. */
const ParamChanges = z
  .record(PARAM_KEY, z.union([z.number(), z.boolean(), z.string().trim().max(32)]))
  .refine((r) => Object.keys(r).length <= 12, 'Too many parameter changes');

export const TransformInputSchema = z.strictObject({
  position: Vec3PositionSchema.optional(),
  /** Degrees, XYZ order. */
  rotationDeg: Vec3DegSchema.optional(),
  scale: Vec3ScaleSchema.optional(),
});

export const CreateOpSchema = z.strictObject({
  op: z.literal('create'),
  ref: z.string().regex(REF_PATTERN).optional(),
  kind: z.enum(OBJECT_KINDS),
  name: z.string().trim().min(1).max(LIMITS.maxNameLength).optional(),
  params: ParamChanges.optional(),
  materials: z
    .record(PART_KEY, MaterialInputSchema)
    .refine((r) => Object.keys(r).length <= 8, 'Too many material slots')
    .optional(),
  transform: TransformInputSchema.optional(),
});

export const SetParamsOpSchema = z.strictObject({
  op: z.literal('set_params'),
  target: TargetSchema,
  changes: ParamChanges.refine((r) => Object.keys(r).length >= 1, 'No changes given'),
});

export const SetMaterialOpSchema = z.strictObject({
  op: z.literal('set_material'),
  target: TargetSchema,
  part: PART_KEY,
  changes: MaterialInputSchema,
});

export const SetTransformOpSchema = z
  .strictObject({
    op: z.literal('set_transform'),
    target: TargetSchema,
    position: Vec3PositionSchema.optional(),
    rotationDeg: Vec3DegSchema.optional(),
    scale: Vec3ScaleSchema.optional(),
  })
  .refine((o) => o.position || o.rotationDeg || o.scale, 'set_transform needs position, rotationDeg or scale');

export const RELATIONS = ['left_of', 'right_of', 'in_front_of', 'behind', 'above', 'on_top_of'] as const;
export type Relation = (typeof RELATIONS)[number];

export const PlaceRelativeOpSchema = z.strictObject({
  op: z.literal('place_relative'),
  target: TargetSchema,
  anchor: TargetSchema,
  relation: z.enum(RELATIONS),
  gap: z.number().min(0).max(LIMITS.maxGap).optional(),
});

export const DuplicateOpSchema = z.strictObject({
  op: z.literal('duplicate'),
  target: TargetSchema,
  ref: z.string().regex(REF_PATTERN).optional(),
});

export const DeleteOpSchema = z.strictObject({
  op: z.literal('delete'),
  target: TargetSchema,
});

export const SceneOperationSchema = z.discriminatedUnion('op', [
  CreateOpSchema,
  SetParamsOpSchema,
  SetMaterialOpSchema,
  SetTransformOpSchema,
  PlaceRelativeOpSchema,
  DuplicateOpSchema,
  DeleteOpSchema,
]);

export type SceneOperation = z.infer<typeof SceneOperationSchema>;
export type CreateOp = z.infer<typeof CreateOpSchema>;
export type SetParamsOp = z.infer<typeof SetParamsOpSchema>;
export type SetMaterialOp = z.infer<typeof SetMaterialOpSchema>;
export type SetTransformOp = z.infer<typeof SetTransformOpSchema>;
export type PlaceRelativeOp = z.infer<typeof PlaceRelativeOpSchema>;
export type DuplicateOp = z.infer<typeof DuplicateOpSchema>;
export type DeleteOp = z.infer<typeof DeleteOpSchema>;

export const ScenePlanSchema = z
  .strictObject({
    version: z.literal(1).default(1),
    status: z.enum(['ok', 'clarify', 'unsupported']).default('ok'),
    message: z.string().max(LIMITS.maxMessageLength).default(''),
    operations: z.array(SceneOperationSchema).max(LIMITS.maxOpsPerPlan).default([]),
  })
  .superRefine((plan, ctx) => {
    if (plan.status !== 'ok' && plan.operations.length > 0) {
      ctx.addIssue({ code: 'custom', message: `A "${plan.status}" plan must not contain operations.`, path: ['operations'] });
    }
    if (plan.status === 'ok' && plan.operations.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'An "ok" plan needs at least one operation.', path: ['operations'] });
    }
  });

export type ScenePlan = z.infer<typeof ScenePlanSchema>;
