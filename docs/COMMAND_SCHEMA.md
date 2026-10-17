# Command schema (AI plan format)

The model must reply with exactly one JSON object. It is untrusted input: the app extracts the first
JSON object, rejects forbidden keys (`__proto__`, `constructor`, `prototype`), validates it with strict
Zod schemas (`src/core/schema/plan.ts`) and dry-runs it on a copy of the scene before applying anything.
If any of those steps fails, the app makes one correction request; if that also fails, it shows an error
and leaves the scene unchanged.

```json
{
  "version": 1,
  "status": "ok",
  "message": "short summary",
  "operations": [ /* at most 6 */ ]
}
```

- `status: "ok"` requires at least one operation.
- `status: "unsupported"` and `status: "clarify"` require `operations: []`. The `message` is shown to
  the user.
- Unknown keys are rejected everywhere (strict objects).

## Units and conventions

- Metres, with Y up. Objects use a bottom-centre pivot, so `y = 0` stands on the floor.
- Rotations in plans and in the UI are **degrees**. They are stored as radians internally.
- Positions are limited to ±20 m, scale to 0.05–10, relative gaps to 0–5 m, and a scene to 40 objects.

## Targets

`target` and `anchor` accept:

| Form | Meaning |
|---|---|
| `"selected"` | the currently selected object |
| `"obj:3"` | a short alias from the scene context sent to the model |
| `"new:a"` | an object created earlier in the same plan via `"ref":"new:a"` |
| raw id | an object id |
| name | a unique object name (`"the oak desk"` works; a leading "the" is ignored) |
| kind | a unique kind, with synonyms (`desk` → table, `couch` → sofa, `bookcase` → shelf) |

An ambiguous name or kind is an error, so the model is asked to clarify instead of guessing. Locked
objects cannot be changed.

## Operations

```jsonc
{"op":"create","ref":"new:a","kind":"table","name":"Oak Desk",
 "params":{"width":1.6},"materials":{"top":{"preset":"wood","color":"oak"}},
 "transform":{"position":[0,0,0],"rotationDeg":[0,90,0],"scale":[1,1,1]}}   // everything but kind is optional

{"op":"set_params","target":"selected","changes":{"width":1.8}}             // absolute values, validated per kind

{"op":"set_material","target":"obj:1","part":"legs",
 "changes":{"preset":"matteMetal","color":"black","roughness":0.6}}          // part "main"/"all" = every part

{"op":"set_transform","target":"obj:2","position":[1,0,0],"rotationDeg":[0,45,0],"scale":[1,1,1]}  // at least one field

{"op":"place_relative","target":"new:a","anchor":"obj:1","relation":"right_of","gap":0.15}

{"op":"duplicate","target":"selected","ref":"new:b"}

{"op":"delete","target":"obj:4"}                                             // the UI asks for confirmation
```

`relation` is one of `left_of`, `right_of`, `in_front_of`, `behind`, `above` or `on_top_of`. Placement
uses the world bounding boxes of the built geometry.

### Materials

```json
{"preset":"wood|matteMetal|polishedMetal|plastic|fabric|glassLike",
 "color":"#RRGGBB or a colour word (oak, walnut, silver, navy, …)",
 "metalness":0.0, "roughness":0.5, "opacity":1.0}
```

All fields are optional. A preset supplies metalness, roughness and a default colour; explicit fields
override it. Opacity is limited to 0.2–1.

### Parameters per kind

Parameter ranges, defaults and part names come from `KIND_DEFS` in `src/core/schema/kinds.ts`. The
same table generates the kind list in the system prompt, so the prompt and the validator cannot drift
apart. Cross-parameter rules are also enforced, for example:

- table legs must fit under the top;
- a chair back must be at least 15 cm above the seat;
- shelf boards must be at least 8 cm apart;
- lamp shades and sofa arms must stay in proportion.

## Applying a plan

The dispatcher (`src/core/commands/dispatcher.ts`) applies every operation to a `structuredClone` of the
document:

- If any operation fails, nothing changes.
- On success the new document is validated against `SceneDocumentSchema`, the triangle budget
  (150k) is checked, and the result is committed as **one undo step**.
