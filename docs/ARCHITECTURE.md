# Architecture

## Layers

| Layer | Path | Responsibility |
|---|---|---|
| Schema | `src/core/schema/` | Zod schemas and limits for scenes, kinds, materials and plans. Pure TypeScript with no React or Three.js. |
| Geometry | `src/core/geometry/` | `ThreeSceneMaster` builder registry; one procedural builder per kind; materials; bounds and triangle counts. |
| Commands | `src/core/commands/` | Safe JSON parsing, target resolution, and the all-or-nothing dispatcher. |
| Prompt | `src/core/prompt/` | Compact scene context (short `obj:N` aliases) and the planner prompt with few-shot examples. |
| Scene I/O | `src/core/scene/` | JSON project import/export with versioned migration, GLB export, and the sample scene. |
| State | `src/state/` | Zustand stores: scene (document, selection, history), AI (model selection, token, status), UI notices. |
| AI | `src/ai/` | Model presets, the Hugging Face Inference Providers client (streaming), and the validated plan runner. |
| UI | `src/components/` | MUI app shell, R3F canvas, inspector, object tree, toolbar, prompt panel, model settings. |
| Persistence | `src/persistence/` | IndexedDB autosave (validated on load). |

## Source of truth

`SceneDocument` (schema version 1) holds only serializable data: id, kind, name, params, per-part
materials, a transform (rotation in radians), and the visible and locked flags.

- Every change goes through `runOperations` / `runPlan`. This covers gizmo drags, inspector fields,
  toolbar actions and AI plans, which all produce the same operation types and use the same validation.
- After every commit, `shareUnchanged` reuses the object references of unchanged objects. The canvas
  memoises each object's built geometry on `[kind, params, materials]`, so editing one object rebuilds
  only that object. Transform changes never rebuild geometry.

## Geometry

`ThreeSceneMaster.buildLocal(object)` returns a `THREE.Group` that has:

- a bottom-centre pivot;
- one mesh per material part, with `userData.partKey` so clicks select the part;
- a material cache per build, disposed when the object changes.

GLB export calls the same builders on visible objects (`buildExportScene`) and passes the result to
`GLTFExporter`.

## AI pipeline

1. `buildCompactSceneContext` summarises the scene: the selected object with its params and parts,
   plus up to 20 objects with alias, kind, name, centre and size.
2. `HuggingFaceInferencePlanner` (`src/ai/hf-inference-planner.ts`) POSTs the chat messages from the
   browser to `https://router.huggingface.co/v1/chat/completions`, using the visitor's token, with
   `stream: true` and `temperature: 0`.
3. It parses the server-sent events, reports reasoning and answer token counts, and aborts the stream as
   soon as the first JSON object is closed (`JsonCompletionTracker`). HTTP and provider errors are turned
   into plain messages.
4. `requestValidatedPlan` parses the output, validates it and dry-runs it against the current store
   state. On failure it sends a single correction message, then returns an error. It never substitutes
   a canned plan.
5. The prompt panel shows the result. Delete operations require confirmation, and "review plans before
   applying" opens an editable JSON view that is re-validated before it is applied.

The Hugging Face token is stored only in the browser and sent only to `router.huggingface.co`. There
is no server-side route or secret: the 3DTool server only serves the app.

## Extending

- **New object kind:** see "Adding a new object kind" in the README.
- **New operation:** add a strict schema in `plan.ts`, handle it in `dispatcher.ts`, describe it in
  `PLANNER_SYSTEM_PROMPT`, and add dispatcher tests.
- **Second module (Future Lab):** add the feature under `src/app/future/` with its own components and
  state. Reuse `src/core/geometry` and `src/core/schema` only if it edits the same scene format.
