/** Shared types for the Future Lab mesh editor (browser and server). */

export type Vec3 = [number, number, number];
export type Axis = 'x' | 'y' | 'z';

export const OP_TYPES = [
  'color',
  'material',
  'texture',
  'decal',
  'scale',
  'stretch',
  'translate',
  'rotate',
  'taper',
  'twist',
  'bend',
  'inflate',
  'hide',
  'show',
] as const;
export type OpType = (typeof OP_TYPES)[number];

export const DECAL_DIRECTIONS = ['front', 'back', 'left', 'right', 'top', 'bottom', 'view', 'around'] as const;
export type DecalDirection = (typeof DECAL_DIRECTIONS)[number];

export type Operation = {
  type: OpType;
  /** color */
  color?: string;
  keep_texture?: boolean;
  /** material */
  metalness?: number;
  roughness?: number;
  opacity?: number;
  emissive?: string;
  emissive_intensity?: number;
  /** texture */
  texture_prompt?: string;
  tiling?: number;
  /** decal */
  decal_prompt?: string;
  direction?: DecalDirection;
  decal_size?: number;
  /** rotate / twist / bend / decal turn */
  degrees?: number;
  /** scale / taper / inflate */
  factor?: number;
  /** stretch */
  factors?: Vec3;
  /** scale / stretch: fixed point in normalised bbox coordinates ([0.5, 1, 0.5] = top centre). */
  anchor?: Vec3;
  /** translate: fraction of the whole model size */
  offset?: Vec3;
  axis?: Axis;
};

/** A slice of one part along an axis, in normalised bbox coordinates. */
export type Region = { axis: Axis; start: number; end: number };

export type EditStep = {
  targets: string[];
  region?: Region;
  pivot?: 'part' | 'group';
  operations: Operation[];
  description?: string;
};

export type PlanSource = 'llm' | 'vlm' | 'heuristic' | 'manual';

export type EditPlan = {
  summary: string;
  steps: EditStep[];
  source: PlanSource;
  model: string | null;
  warnings: string[];
};

export type PartInfo = {
  id: string;
  label: string;
  material: string;
  color: string;
  has_texture: boolean;
  triangles: number;
  center: Vec3;
  size: Vec3;
  visible: boolean;
  /** Set-of-marks number from the last snapshot. */
  marker?: number | null;
  /** Original part id when this part is a decal/wrap overlay. */
  decal_of?: string | null;
};

export type PlanRequest = {
  prompt: string;
  parts: PartInfo[];
  selected_ids: string[];
  model_size: Vec3;
  model_center: Vec3;
  image?: string | null;
};

export type HealthInfo = {
  ai_enabled: boolean;
  provider: string;
  models: { llm: string; vlm: string; image: string; three_d: string };
};

export type TextureKind = 'seamless' | 'decal' | 'wrap';

/** Concept image for image-to-3D: one object on a plain background. */
export type ImageKind = TextureKind | 'object';

export type TextureSegment = { id: number; name: string; color: string; area_fraction: number };

export type TextureSegmentResult = {
  mode: 'texture';
  num_segments: number;
  k_requested: number | null;
  segments: TextureSegment[];
  /** Per part id: one label per triangle, in the mesh's triangle order. */
  face_labels: Record<string, Int16Array>;
  node_faces: Record<string, number>;
};
