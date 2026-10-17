# 3DTool — Shape Studio

Describe furniture and simple shapes in plain English and get an editable 3D scene. A small open
Hugging Face language model runs **in your browser, on your CPU (WebAssembly)** and turns your request
into a restricted JSON plan. The app validates that plan and builds every object with its own
procedural Three.js geometry. The AI never produces meshes, code or URLs.

- **Shape Studio** (`/studio`): the working editor.
- **Future Lab** (`/future`): a placeholder for a second module. It has no functionality yet.

## What it can do

- **Object kinds:** box, sphere, cylinder, cone, torus, table, chair, shelf, lamp, sofa. Each kind is
  built from typed parameters (width, depth, leg thickness, shelf count, …) with named material parts
  (for example `top` and `legs` on a table).
- **AI edits:** create objects, change parameters, change part materials, move, rotate or scale, place
  objects relative to each other (left/right/front/behind/on top), duplicate and delete. Follow-up
  prompts edit the selected or named object instead of rebuilding the scene.
- **Manual editing:** click to select, use the move/rotate/scale gizmo, and edit dimensions, materials
  and transforms in the inspector. You can also rename, hide, lock, duplicate and delete objects.
- Undo and redo, with each AI plan undone as a single step.
- Autosave to browser storage, project save/load as JSON, and **GLB export**.

Requests outside the supported kinds (people, animals, vehicles, organic shapes) get a clear
"unsupported" answer instead of a fake result.

## How it works

```
prompt ─▶ compact scene context ─▶ LLM in a Web Worker (Transformers.js, WASM)
                                          │ raw text (untrusted)
                                          ▼
              JSON extraction ─▶ Zod schema validation ─▶ dry run on a copy of the scene
                                          │ (one correction retry on failure, then a visible error)
                                          ▼
                     dispatcher ─▶ SceneDocument (Zustand, undoable)
                                          ▼
                     ThreeSceneMaster builder registry ─▶ React Three Fiber canvas / GLB
```

The serializable `SceneDocument` is the single source of truth. The canvas, inspector, AI plans, JSON
files and GLB export all read from it or write to it through the same validated operations. Details are
in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and the plan format is in
[docs/COMMAND_SCHEMA.md](docs/COMMAND_SCHEMA.md).

## AI models and "strength"

Open **Model & strength** in the prompt panel to choose a model. All presets are public, ungated, Apache-2.0
ONNX models, so **no token is needed**:

| Preset | Model | Quantization | Download (approx.) |
|---|---|---|---|
| Light | `onnx-community/SmolLM2-135M-Instruct-ONNX-MHA` | q8 | 131 MB |
| Balanced | `HuggingFaceTB/SmolLM2-360M-Instruct` | q8 | 348 MB |
| **Standard (default)** | `onnx-community/Qwen2.5-0.5B-Instruct` | q8 | 488 MB |
| Strong | `onnx-community/Qwen2.5-1.5B-Instruct` | q8 | 1.5 GB |

Strength comes from the model's size, not from a token. Larger models follow instructions better but
download more, use more RAM and run slower. **Custom** accepts any Transformers.js-compatible ONNX
repository id.

An optional **Hugging Face token** only matters for gated or private custom repositories. It is kept in
your browser (session storage, or local storage if you tick "remember") and is attached only to
requests to `huggingface.co`. It is never sent to the 3DTool server.

See [docs/MODEL_NOTES.md](docs/MODEL_NOTES.md) for what has been verified and the known limitations.

## Browser requirements

- A recent desktop Chromium, Firefox or Safari with WebAssembly, Web Workers and WebGL.
- Enough free memory for the chosen model. Expect more than the download size, so a gigabyte or more
  for the Standard preset.
- The app sends cross-origin isolation headers (COOP/COEP) so the model can use several CPU threads.
  Without isolation it falls back to one thread, which is much slower.
- The model is downloaded once and then cached by the browser. Manual editing works without any model.

## Privacy

Prompts and scenes stay in your browser. The server only serves the static app. Model files come
directly from Hugging Face, and the ONNX Runtime WebAssembly files come from jsDelivr.

## Sample prompts

- Create a modern oak desk with four matte black metal legs, 160 cm wide.
- Add a blue chair to the right of the desk with a 15 cm gap.
- Make the selected object 20 cm wider.
- Add a tall white bookshelf with 6 boards.
- Put a lamp on top of the desk.

**Keyboard:** `W`/`E`/`R` select move/rotate/scale, `F` focuses the selection, `Del` deletes, `Esc`
deselects, `Ctrl+Z` undoes, and `Ctrl+Shift+Z` or `Ctrl+Y` redoes.

## Project JSON vs GLB

- **Project JSON** (`*.3dtool.json`) stores the full parametric scene: kinds, parameters, materials
  and transforms. Open it again to keep editing.
- **GLB** contains baked meshes and materials for other 3D tools. It cannot be turned back into
  editable parameters.

## Local development

```bash
npm ci
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm test             # unit and integration tests (Vitest)
npm run build        # production build (standalone output)
npm start            # serve the production build (binds 0.0.0.0, PORT env, default 3000)
npx playwright install chromium   # once
npm run e2e          # smoke tests against the production build
```

## Deployment (Zenith)

A single CPU-only container, defined by `Dockerfile` and `zenith-compose.yml`. Model weights are never
part of the image. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Adding a new object kind

1. **Schema:** add the kind, its parameters, parts and default materials in `src/core/schema/kinds.ts`
   (plus cross-parameter checks in `validateParams`), and a strict object schema in
   `src/core/schema/scene.ts`.
2. **Builder:** write a builder in `src/core/geometry/builders/` that creates one mesh per part through
   `addPart`, and register it in `ThreeSceneMaster`.
3. **Prompt:** the kind list in the system prompt is generated from `KIND_DEFS`. Add a few-shot example
   in `src/core/prompt/planner-prompt.ts` only if the model needs one.
4. **Tests:** add geometry and dispatcher tests in `tests/unit/`.

## License

The original code is [MIT](LICENSE). Third-party libraries and model weights keep their own licenses;
see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
