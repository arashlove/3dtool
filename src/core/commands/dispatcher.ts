import { sceneMaster, type Bounds, type ThreeSceneMaster } from '../geometry/ThreeSceneMaster';
import { LIMITS } from '../schema/constants';
import {
  KIND_DEFS,
  defaultMaterials,
  defaultParams,
  partKeys,
  validateParams,
  type Params,
} from '../schema/kinds';
import { resolveMaterialInput, type MaterialInput } from '../schema/material';
import type {
  CreateOp,
  DeleteOp,
  DuplicateOp,
  PlaceRelativeOp,
  SceneOperation,
  ScenePlan,
  SetMaterialOp,
  SetParamsOp,
  SetTransformOp,
} from '../schema/plan';
import { SceneDocumentSchema, type SceneDocument, type SceneObject, type Vec3 } from '../schema/scene';
import { formatZodError } from './parser';
import { resolveTarget, type ResolveContext } from './resolver';

export type DispatchContext = {
  selectedId: string | null;
  aliases?: Record<string, string>;
  idFactory?: () => string;
  master?: ThreeSceneMaster;
};

export type DispatchSuccess = {
  ok: true;
  doc: SceneDocument;
  summary: string;
  createdIds: string[];
  changedIds: string[];
  deletedIds: string[];
  /** Suggested selection after applying: last created/changed object, or null if the selection was deleted. */
  selectId: string | null | undefined;
};

export type DispatchFailure = { ok: false; error: string; opIndex?: number };
export type DispatchResult = DispatchSuccess | DispatchFailure;

class OpError extends Error {}

const DEG = Math.PI / 180;
const toRad = (v: Vec3): Vec3 => [v[0] * DEG, v[1] * DEG, v[2] * DEG];
const round = (v: number) => Math.round(v * 10000) / 10000;

type State = {
  doc: SceneDocument;
  ctx: ResolveContext;
  master: ThreeSceneMaster;
  newId: () => string;
  created: string[];
  changed: Set<string>;
  deleted: string[];
  notes: string[];
  selectId: string | null | undefined;
};

/** Plans that remove objects need explicit user confirmation before applying. */
export function requiresConfirmation(plan: ScenePlan): boolean {
  return plan.operations.some((op) => op.op === 'delete');
}

/**
 * Applies a validated plan to a copy of the document. Either every operation succeeds and a new
 * document is returned, or nothing changes. The caller commits the result as one undo step.
 */
export function applyPlan(doc: SceneDocument, plan: ScenePlan, context: DispatchContext): DispatchResult {
  if (plan.status !== 'ok') return { ok: false, error: plan.message || 'The plan contains no changes.' };
  return applyOperations(doc, plan.operations, context);
}

export function applyOperations(doc: SceneDocument, operations: SceneOperation[], context: DispatchContext): DispatchResult {
  if (operations.length === 0) return { ok: false, error: 'No operations to apply.' };
  if (operations.length > LIMITS.maxOpsPerPlan) {
    return { ok: false, error: `Too many operations (${operations.length}); the limit is ${LIMITS.maxOpsPerPlan}.` };
  }

  const state: State = {
    doc: structuredClone(doc),
    ctx: { selectedId: context.selectedId, aliases: context.aliases ?? {}, refs: new Map() },
    master: context.master ?? sceneMaster,
    newId: context.idFactory ?? (() => crypto.randomUUID()),
    created: [],
    changed: new Set(),
    deleted: [],
    notes: [],
    selectId: undefined,
  };

  for (let i = 0; i < operations.length; i++) {
    try {
      runOperation(state, operations[i]);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: operations.length > 1 ? `Step ${i + 1} (${operations[i].op}): ${message}` : message, opIndex: i };
    }
  }

  const triangles = state.master.countSceneTriangles(state.doc);
  if (triangles > LIMITS.maxTriangles) {
    return { ok: false, error: `Scene would exceed the geometry budget (${triangles.toLocaleString()} triangles).` };
  }

  const final = SceneDocumentSchema.safeParse(state.doc);
  if (!final.success) return { ok: false, error: `Result failed validation: ${formatZodError(final.error)}` };

  return {
    ok: true,
    doc: final.data,
    summary: state.notes.join('; '),
    createdIds: state.created,
    changedIds: [...state.changed],
    deletedIds: state.deleted,
    selectId: state.selectId,
  };
}

function runOperation(s: State, op: SceneOperation) {
  switch (op.op) {
    case 'create':
      return opCreate(s, op);
    case 'set_params':
      return opSetParams(s, op);
    case 'set_material':
      return opSetMaterial(s, op);
    case 'set_transform':
      return opSetTransform(s, op);
    case 'place_relative':
      return opPlaceRelative(s, op);
    case 'duplicate':
      return opDuplicate(s, op);
    case 'delete':
      return opDelete(s, op);
  }
}

function find(s: State, target: string): SceneObject {
  const r = resolveTarget(s.doc, target, s.ctx);
  if (!r.ok) throw new OpError(r.error);
  return s.doc.objects.find((o) => o.id === r.id)!;
}

function findEditable(s: State, target: string): SceneObject {
  const obj = find(s, target);
  if (obj.locked) throw new OpError(`"${obj.name}" is locked. Unlock it to edit.`);
  return obj;
}

function uniqueName(doc: SceneDocument, base: string): string {
  const trimmed = base.trim().slice(0, LIMITS.maxNameLength) || 'Object';
  const names = new Set(doc.objects.map((o) => o.name.toLowerCase()));
  if (!names.has(trimmed.toLowerCase())) return trimmed;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${trimmed.slice(0, LIMITS.maxNameLength - 4)} ${i}`;
    if (!names.has(candidate.toLowerCase())) return candidate;
  }
  return trimmed;
}

function assertParams(obj: { kind: SceneObject['kind'] }, params: Params) {
  const errors = validateParams(obj.kind, params);
  if (errors.length) throw new OpError(errors.slice(0, 3).join(' '));
}

function applyMaterials(obj: SceneObject, input: Record<string, MaterialInput>) {
  const parts = partKeys(obj.kind);
  for (const [part, changes] of Object.entries(input)) {
    const targets = resolvePartTargets(obj, part, parts);
    for (const key of targets) {
      const r = resolveMaterialInput(obj.materials[key], changes);
      if (!r.ok) throw new OpError(r.error);
      obj.materials[key] = r.value;
    }
  }
}

/** "main"/"all" on a multi-part object addresses every part. Unknown parts are rejected. */
function resolvePartTargets(obj: SceneObject, part: string, parts: string[]): string[] {
  if (parts.includes(part)) return [part];
  if (part === 'main' || part === 'all') return parts;
  throw new OpError(`"${KIND_DEFS[obj.kind].label}" has no part "${part}". Parts: ${parts.join(', ')}.`);
}

function inRange(v: number) {
  return v >= LIMITS.positionMin && v <= LIMITS.positionMax;
}

function assertPosition(p: Vec3) {
  if (!p.every((v) => Number.isFinite(v) && inRange(v))) {
    throw new OpError(`Position must stay within ${LIMITS.positionMin}..${LIMITS.positionMax} m on each axis.`);
  }
}

function opCreate(s: State, op: CreateOp) {
  if (s.doc.objects.length >= LIMITS.maxObjects) throw new OpError(`The scene already has the maximum of ${LIMITS.maxObjects} objects.`);
  if (op.ref && s.ctx.refs.has(op.ref)) throw new OpError(`Reference "${op.ref}" is used twice.`);

  const def = KIND_DEFS[op.kind];
  const params: Params = { ...defaultParams(op.kind) };
  for (const [key, value] of Object.entries(op.params ?? {})) {
    if (!(key in params)) throw new OpError(`Unknown parameter "${key}" for ${def.label.toLowerCase()}.`);
    params[key] = value;
  }
  assertParams({ kind: op.kind }, params);

  const id = s.newId();
  if (s.doc.objects.some((o) => o.id === id)) throw new OpError('Generated ID collision.');

  const obj: SceneObject = {
    id,
    name: uniqueName(s.doc, op.name ?? def.label),
    kind: op.kind,
    params,
    transform: {
      position: [0, 0, 0],
      rotation: op.transform?.rotationDeg ? toRad(op.transform.rotationDeg) : [0, 0, 0],
      scale: op.transform?.scale ?? [1, 1, 1],
    },
    materials: defaultMaterials(op.kind),
    visible: true,
    locked: false,
  };
  if (op.materials) applyMaterials(obj, op.materials);

  if (op.transform?.position) {
    obj.transform.position = op.transform.position;
  } else {
    obj.transform.position = findFreeSpot(s, obj);
  }
  assertPosition(obj.transform.position);

  s.doc.objects.push(obj);
  if (op.ref) s.ctx.refs.set(op.ref, id);
  s.created.push(id);
  s.selectId = id;
  s.notes.push(`Added ${obj.name}`);
}

/** Places a new object to the right of existing content so it does not overlap. */
function findFreeSpot(s: State, obj: SceneObject): Vec3 {
  if (s.doc.objects.length === 0) return [0, 0, 0];
  const local = s.master.getBounds({ ...obj, transform: { ...obj.transform, position: [0, 0, 0] } });
  let maxX = -Infinity;
  for (const other of s.doc.objects) maxX = Math.max(maxX, s.master.getBounds(other).max[0]);
  const x = round(maxX + 0.3 - local.min[0]);
  return inRange(x) ? [x, 0, 0] : [0, 0, 0];
}

function opSetParams(s: State, op: SetParamsOp) {
  const obj = findEditable(s, op.target);
  const def = KIND_DEFS[obj.kind];
  const merged: Params = { ...obj.params };
  for (const [key, value] of Object.entries(op.changes)) {
    if (!(key in merged)) {
      const keys = def.params.map((p) => p.key).join(', ');
      throw new OpError(`Unknown parameter "${key}" for ${def.label.toLowerCase()}. Allowed: ${keys}.`);
    }
    merged[key] = value;
  }
  assertParams(obj, merged);
  obj.params = merged;
  s.changed.add(obj.id);
  s.selectId = obj.id;
  s.notes.push(`Updated ${obj.name} dimensions`);
}

function opSetMaterial(s: State, op: SetMaterialOp) {
  const obj = findEditable(s, op.target);
  applyMaterials(obj, { [op.part]: op.changes });
  s.changed.add(obj.id);
  s.selectId = obj.id;
  const partLabel = op.part === 'main' || op.part === 'all' ? '' : ` ${op.part}`;
  s.notes.push(`Changed ${obj.name}${partLabel} material`);
}

function opSetTransform(s: State, op: SetTransformOp) {
  const obj = findEditable(s, op.target);
  if (op.position) {
    assertPosition(op.position);
    obj.transform.position = op.position;
  }
  if (op.rotationDeg) obj.transform.rotation = toRad(op.rotationDeg);
  if (op.scale) obj.transform.scale = op.scale;
  s.changed.add(obj.id);
  s.selectId = obj.id;
  s.notes.push(`Moved/transformed ${obj.name}`);
}

function center(b: Bounds): Vec3 {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

/** Computes placement from evaluated world bounds; coordinates are never taken from the model. */
export function computeRelativePosition(
  target: SceneObject,
  targetBounds: Bounds,
  anchorBounds: Bounds,
  relation: PlaceRelativeOp['relation'],
  gapInput?: number,
): Vec3 {
  const a = anchorBounds;
  const t = targetBounds;
  const ac = center(a);
  const tc = center(t);
  const gap = gapInput ?? (relation === 'on_top_of' ? 0 : 0.1);
  let dx = 0;
  let dy = a.min[1] - t.min[1];
  let dz = 0;
  switch (relation) {
    case 'right_of':
      dx = a.max[0] + gap - t.min[0];
      dz = ac[2] - tc[2];
      break;
    case 'left_of':
      dx = a.min[0] - gap - t.max[0];
      dz = ac[2] - tc[2];
      break;
    case 'in_front_of':
      dz = a.max[2] + gap - t.min[2];
      dx = ac[0] - tc[0];
      break;
    case 'behind':
      dz = a.min[2] - gap - t.max[2];
      dx = ac[0] - tc[0];
      break;
    case 'above':
      dy = a.max[1] + gap - t.min[1];
      dx = ac[0] - tc[0];
      dz = ac[2] - tc[2];
      break;
    case 'on_top_of':
      dy = a.max[1] + gap - t.min[1];
      dx = ac[0] - tc[0];
      dz = ac[2] - tc[2];
      break;
  }
  const p = target.transform.position;
  return [round(p[0] + dx), round(p[1] + dy), round(p[2] + dz)];
}

function opPlaceRelative(s: State, op: PlaceRelativeOp) {
  const target = findEditable(s, op.target);
  const anchor = find(s, op.anchor);
  if (anchor.id === target.id) throw new OpError('An object cannot be placed relative to itself.');
  const position = computeRelativePosition(
    target,
    s.master.getBounds(target),
    s.master.getBounds(anchor),
    op.relation,
    op.gap,
  );
  assertPosition(position);
  target.transform.position = position;
  s.changed.add(target.id);
  s.selectId = target.id;
  s.notes.push(`Placed ${target.name} ${op.relation.replace(/_/g, ' ')} ${anchor.name}`);
}

function opDuplicate(s: State, op: DuplicateOp) {
  if (s.doc.objects.length >= LIMITS.maxObjects) throw new OpError(`The scene already has the maximum of ${LIMITS.maxObjects} objects.`);
  if (op.ref && s.ctx.refs.has(op.ref)) throw new OpError(`Reference "${op.ref}" is used twice.`);
  const source = find(s, op.target);
  const bounds = s.master.getBounds(source);
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[2] - bounds.min[2];
  const p = source.transform.position;
  let position: Vec3 = [round(p[0] + width + 0.15), p[1], p[2]];
  if (!inRange(position[0])) position = [p[0], p[1], round(p[2] + depth + 0.15)];
  if (!position.every(inRange)) position = [p[0], p[1], p[2]];

  const copy: SceneObject = {
    ...structuredClone(source),
    id: s.newId(),
    name: uniqueName(s.doc, `${source.name} copy`),
    locked: false,
    transform: { ...structuredClone(source.transform), position },
  };
  if (s.doc.objects.some((o) => o.id === copy.id)) throw new OpError('Generated ID collision.');
  s.doc.objects.push(copy);
  if (op.ref) s.ctx.refs.set(op.ref, copy.id);
  s.created.push(copy.id);
  s.selectId = copy.id;
  s.notes.push(`Duplicated ${source.name}`);
}

function opDelete(s: State, op: DeleteOp) {
  const obj = findEditable(s, op.target);
  s.doc.objects = s.doc.objects.filter((o) => o.id !== obj.id);
  s.changed.delete(obj.id);
  s.created = s.created.filter((id) => id !== obj.id);
  s.deleted.push(obj.id);
  if (s.ctx.selectedId === obj.id) s.ctx.selectedId = null;
  s.selectId = s.selectId === obj.id || s.selectId === undefined ? null : s.selectId;
  s.notes.push(`Deleted ${obj.name}`);
}
