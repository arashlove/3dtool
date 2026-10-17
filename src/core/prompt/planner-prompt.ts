import { KIND_DEFS, OBJECT_KINDS } from '../schema/kinds';
import { LIMITS } from '../schema/constants';
import { MATERIAL_PRESET_NAMES } from '../schema/material';
import { RELATIONS } from '../schema/plan';
import { formatSceneContext, type CompactSceneContext } from './scene-context';

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

function kindLines(): string {
  return OBJECT_KINDS.map((kind) => {
    const def = KIND_DEFS[kind];
    const params = def.params
      .map((p) => (p.type === 'number' ? `${p.key}=${p.default}[${p.min}-${p.max}]` : `${p.key}=${p.default}`))
      .join(',');
    return `${kind}(${params}) parts:${def.parts.map((p) => p.key).join(',')}`;
  }).join('\n');
}

export const PLANNER_SYSTEM_PROMPT = `You turn requests about a 3D scene into ONE JSON object. Reply with JSON only: no markdown, no code fences, no explanation, no JavaScript.

Units are metres (50 cm = 0.5). Y is up. Rotations are degrees.

Object kinds with parameters (default[allowed range]) and material parts:
${kindLines()}

MATERIAL = {"color":"#RRGGBB or colour word","preset":"${MATERIAL_PRESET_NAMES.join('|')}","metalness":0-1,"roughness":0-1,"opacity":0.2-1} (all fields optional)

Operations (at most ${LIMITS.maxOpsPerPlan}):
{"op":"create","ref":"new:a","kind":KIND,"name":TEXT,"params":{only non-default params},"materials":{PART:MATERIAL},"transform":{"position":[x,0,z],"rotationDeg":[x,y,z]}} (transform optional; position y is the bottom, 0 = on the floor)
{"op":"set_params","target":T,"changes":{PARAM:NUMBER}}
{"op":"set_material","target":T,"part":PART,"changes":MATERIAL}
{"op":"set_transform","target":T,"position":[x,y,z],"rotationDeg":[x,y,z],"scale":[x,y,z]}
{"op":"place_relative","target":T,"anchor":T,"relation":"${RELATIONS.join('|')}","gap":METRES}
{"op":"duplicate","target":T,"ref":"new:b"}
{"op":"delete","target":T}
T is "selected", an id such as "obj:2" from the scene list, or a "new:..." ref created earlier in the same reply.

Reply format: {"version":1,"status":"ok","message":"short summary","operations":[...]}
If the request needs things that are not in the kind list (animals, people, vehicles, plants, text, detailed organic shapes), reply {"version":1,"status":"unsupported","message":"why, and what is supported","operations":[]}.
If it is unclear which existing object is meant, reply {"version":1,"status":"clarify","message":"question","operations":[]}.

Rules:
- Keep existing objects. Change only what the user asks. Never recreate an existing object to edit it.
- For size changes to existing objects use set_params with the new absolute value computed from the current params.
- "it"/"this" means the selected object.
- Every parameter must stay inside its allowed range.
- Use place_relative for left/right/front/behind/on top of other objects.
- Objects stand on their position: position y is the bottom of the object, x/z is its centre.
- Rooms: 6 box creates, each 0.1 m thick, each with "transform":{"position":[x,y,z]} where y is the box's bottom. Floor: y=-0.1. The 4 walls stand on the floor: y=0 (never half their height), height about 2.6. Ceiling: y=wall height. Centre the room on the existing objects using their "at" values. Walls along x use width=room length, depth=0.1; walls along z use width=0.1, depth=room width.
- Use part names exactly as listed. Use "main" for the whole object.
- Never output code, HTML or URLs.`;

const EXAMPLES: ChatMessage[] = [
  {
    role: 'user',
    content: 'Scene:\nselected: none\nobjects: none\nRequest: Create a 1.6 metre oak dining table with matte black metal legs.',
  },
  {
    role: 'assistant',
    content:
      '{"version":1,"status":"ok","message":"Create a 1.6 m oak table with black legs.","operations":[{"op":"create","ref":"new:t1","kind":"table","name":"Oak Dining Table","params":{"width":1.6,"depth":0.85},"materials":{"top":{"preset":"wood","color":"oak"},"legs":{"preset":"matteMetal","color":"black"}}}]}',
  },
  {
    role: 'user',
    content:
      'Scene:\nselected: obj:1 table "Oak Dining Table" params(width=1.6,depth=0.85,height=0.75,topThickness=0.04,legThickness=0.05,legInset=0.06) parts:top,legs\nobjects (1):\nobj:1 table "Oak Dining Table" at[0,0,0] size[1.6,0.75,0.85]\nRequest: Make it 20 cm wider and the legs silver.',
  },
  {
    role: 'assistant',
    content:
      '{"version":1,"status":"ok","message":"Widen the table to 1.8 m and make the legs silver.","operations":[{"op":"set_params","target":"selected","changes":{"width":1.8}},{"op":"set_material","target":"selected","part":"legs","changes":{"preset":"polishedMetal","color":"silver"}}]}',
  },
  {
    role: 'user',
    content:
      'Scene:\nselected: none\nobjects (1):\nobj:1 table "Oak Dining Table" at[0,0,0] size[1.8,0.75,0.85]\nRequest: Add a red chair to the right of the table with a 15 cm gap.',
  },
  {
    role: 'assistant',
    content:
      '{"version":1,"status":"ok","message":"Add a red chair right of the table.","operations":[{"op":"create","ref":"new:c1","kind":"chair","name":"Red Chair","materials":{"seat":{"color":"red"},"back":{"color":"red"}}},{"op":"place_relative","target":"new:c1","anchor":"obj:1","relation":"right_of","gap":0.15}]}',
  },
  {
    role: 'user',
    content:
      'Scene:\nselected: none\nobjects (2):\nobj:1 table "Oak Dining Table" at[0,0,0] size[1.8,0.75,0.85]\nobj:2 chair "Red Chair" at[1.29,0,0] size[0.48,0.9,0.5]\nRequest: Add a white wall 3 m long and 2.4 m high at z = -1.5.',
  },
  {
    role: 'assistant',
    content:
      '{"version":1,"status":"ok","message":"Add a 2.4 m wall standing on the floor at z = -1.5.","operations":[{"op":"create","ref":"new:w1","kind":"box","name":"Wall","params":{"width":3,"height":2.4,"depth":0.1},"materials":{"main":{"color":"white"}},"transform":{"position":[0,0,-1.5]}}]}',
  },
  {
    role: 'user',
    content: 'Scene:\nselected: none\nobjects: none\nRequest: Make a photorealistic dragon.',
  },
  {
    role: 'assistant',
    content:
      '{"version":1,"status":"unsupported","message":"Detailed creatures are not supported. Try a table, chair, shelf, lamp, sofa or a basic shape.","operations":[]}',
  },
];

export function buildUserMessage(userText: string, context: CompactSceneContext): string {
  const text = userText.trim().slice(0, LIMITS.maxPromptLength);
  return `Scene:\n${formatSceneContext(context)}\nRequest: ${text}`;
}

export function createPlannerPrompt(userText: string, context: CompactSceneContext): ChatMessage[] {
  return [
    { role: 'system', content: PLANNER_SYSTEM_PROMPT },
    ...EXAMPLES,
    { role: 'user', content: buildUserMessage(userText, context) },
  ];
}

export function createCorrectionMessages(previous: ChatMessage[], badOutput: string, error: string): ChatMessage[] {
  return [
    ...previous,
    { role: 'assistant', content: badOutput.slice(0, 2000) },
    {
      role: 'user',
      content: `That reply was invalid: ${error.slice(0, 300)}. Reply again with only the corrected JSON object in the required format.`,
    },
  ];
}
