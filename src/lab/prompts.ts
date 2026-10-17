import type { ImageKind, PartInfo, PlanRequest } from './types';

const f2 = (v: number) => Number(v.toFixed(2));
const v3 = (v: [number, number, number]) => `(${v.map(f2).join(',')})`;

export const MAX_TABLE_PARTS = 300;

/** One line per part, largest first, e.g. `part_003 | #4 | label="Legs 2" | … | tris=96`. */
export function partTable(parts: PartInfo[]): string {
  const sorted = [...parts]
    .filter((p) => p.visible)
    .sort((a, b) => b.size[0] * b.size[1] * b.size[2] - a.size[0] * a.size[1] * a.size[2])
    .slice(0, MAX_TABLE_PARTS);
  return sorted
    .map((p) =>
      [
        p.id,
        p.marker ? `#${p.marker}` : '-',
        `label=${JSON.stringify(p.label.slice(0, 60))}`,
        `material=${JSON.stringify(p.material.slice(0, 40))}`,
        `color=${p.color}`,
        `tex=${p.has_texture ? 'yes' : 'no'}`,
        `center=${v3(p.center)}`,
        `size=${v3(p.size)}`,
        `tris=${p.triangles}`,
        p.decal_of ? `overlay_of=${p.decal_of}` : '',
      ]
        .filter(Boolean)
        .join(' | '),
    )
    .join('\n');
}

export const PLAN_SYSTEM_PROMPT = `You edit a 3D model made of named parts. Reply with ONE JSON object only, no prose, no code fences.

Coordinates follow glTF: +Y is up, +Z is the front, +X is the right. Sizes are in model units.

Reply schema:
{"summary":"one short sentence","steps":[{"targets":["part_000","#4"],"region":{"axis":"y","start":0.5,"end":1},"pivot":"part","description":"short","operations":[OPERATION,...]}]}
- targets: part ids, or marker numbers like "#4" when a snapshot is attached.
- region (optional): only for a portion of ONE part, as a slice of its bounding box along an axis, 0..1.
- pivot: "part" (each target about its own box) or "group" (all targets together about their combined box).

Operations:
{"type":"color","color":"#RRGGBB","keep_texture":false}  keep_texture=true tints the existing texture
{"type":"material","metalness":0-1,"roughness":0-1,"opacity":0.02-1,"emissive":"#RRGGBB","emissive_intensity":0-10}
{"type":"texture","texture_prompt":"weathered oak planks","tiling":0.25-16}  repeating surface material
{"type":"decal","decal_prompt":"a red dragon","direction":"front|back|left|right|top|bottom|view|around","decal_size":0.05-1.5,"degrees":0}  one picture, printed once; "around" wraps it 360°
{"type":"scale","factor":1.2,"anchor":[0.5,0,0.5]}  anchor is the fixed point in the normalised box (0..1 per axis)
{"type":"stretch","factors":[1,1.3,1],"anchor":[0.5,1,0.5]}
{"type":"translate","offset":[0,0.1,0]}  fraction of the whole model size
{"type":"rotate","axis":"y","degrees":45}
{"type":"taper","axis":"y","factor":0.5}  0 = no taper, 1 = comes to a point at the top
{"type":"twist","axis":"y","degrees":45}
{"type":"bend","axis":"y","degrees":30}
{"type":"inflate","factor":0.03}  push along normals as a fraction of the model size; negative = thinner
{"type":"hide"} {"type":"show"}

Choosing parts:
- Use labels and material names first, then geometry: "top" is the larger y, "front" is the larger z, "left" is the smaller x.
- If a snapshot is attached, the yellow numbers in it are the markers in the part table; use them for parts with meaningless names.
- "it", "this" and "selected" mean the selected parts.
- Use a region only when the user asks for a portion of a single part ("the top half of the vase").

Editing rules:
- "longer" means stretch along the part's long axis, anchored at the end that is attached to the rest of the model (legs grow downward: anchor [0.5,1,0.5]).
- Use modest amounts unless the user gives numbers (bigger = 1.2-1.3, a bit = 1.1).
- Colours are hex. Metal: metalness 1, roughness 0.2-0.4. Glass: opacity 0.25-0.4, roughness 0.05, metalness 0.
- A repeating surface (wood, marble, fabric, brick) is a "texture". A single picture or logo is a "decal".
- If nothing matches, reply {"summary":"what is unclear","steps":[]}.`;

export function planUserMessage(req: PlanRequest, hasImage: boolean): string {
  return [
    `Model bounding box: center=${v3(req.model_center)} size=${v3(req.model_size)}`,
    `Selected: ${req.selected_ids.length ? req.selected_ids.join(', ') : 'none'}`,
    hasImage ? 'A snapshot with four views is attached; yellow numbers are part markers.' : '',
    'Parts (id | marker | label | material | color | texture | center | size | triangles):',
    partTable(req.parts),
    '',
    `Instruction: ${req.prompt.trim().slice(0, 1000)}`,
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export const LABEL_SYSTEM_PROMPT = `You name the parts of a 3D model. A snapshot with four views is attached; yellow numbers mark parts.
Reply with ONE JSON object only: {"labels":{"part_000":"seat","3":"front left leg"}}.
Keys are part ids or marker numbers. Names are short, lowercase, specific (e.g. "front left leg", "lamp shade"), at most 5 words.
Only name parts you can identify.`;

export function labelUserMessage(parts: PartInfo[]): string {
  return `Parts (id | marker | label | material | color | texture | center | size | triangles):\n${partTable(parts)}`;
}

export function texturePrompt(prompt: string, kind: ImageKind): string {
  const subject = prompt.trim().slice(0, 300);
  switch (kind) {
    case 'seamless':
      return `seamless tileable texture of ${subject}, flat top-down orthographic view, even diffuse lighting, no shadows, no objects, no perspective, high detail, fills the whole frame`;
    case 'decal':
      return `${subject}, single isolated subject, centered, full subject visible, flat illustration, plain pure white background, no shadow, no text`;
    case 'object':
      return `${subject}, a single complete 3D object, centered, entire object in frame, three-quarter front view, studio product render, soft even lighting, plain pure white background, no shadow, no text`;
    case 'wrap':
      return `wide horizontal panorama strip of ${subject}, the body runs diagonally across the strip, seamless so it tiles horizontally, plain pure white background, no shadow, no text`;
  }
}

/** Panorama size for a wrap: height 512, width 512 × aspect (1–4), a multiple of 16. */
export function wrapSize(aspect: number): { width: number; height: number } {
  const a = Math.min(4, Math.max(1, aspect));
  return { width: Math.round((512 * a) / 16) * 16, height: 512 };
}
