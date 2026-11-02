# 3DTool — Shape Studio

Describe furniture and simple shapes in plain English and get an editable 3D scene. A Hugging Face
language model runs on GPUs through **Hugging Face Inference Providers**, using your own token, and
turns your request into a restricted JSON plan. The app validates that plan and builds every object
with its own procedural Three.js geometry. The AI never produces meshes, code or URLs.

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
prompt ─▶ compact scene context ─▶ browser ─▶ router.huggingface.co (your token) ─▶ GPU provider
                                          │ streamed raw text (untrusted)
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

## AI models, tokens and "strength"

AI generation needs **your own Hugging Face token**. Create a fine-grained token with the
"Make calls to Inference Providers" permission at
[huggingface.co/settings/tokens](https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained),
then paste it into **Model & strength**. Usage is billed to your Hugging Face account; PRO accounts
include monthly credits.

| Preset | Model |
|---|---|
| Fast | `openai/gpt-oss-20b` |
| **Balanced (default)** | `openai/gpt-oss-120b` |
| Strong | `Qwen/Qwen2.5-72B-Instruct` |
| Custom | any chat model on Inference Providers, e.g. `zai-org/GLM-5.3` or `google/gemma-4-31B-it:fastest` |

The token is kept in your browser (session storage, or local storage if you tick "remember") and sent
only to `router.huggingface.co`. It is never sent to the 3DTool server, and the app has no server-side
token. See [docs/MODEL_NOTES.md](docs/MODEL_NOTES.md) for details and what has been verified.

## Browser requirements

- A recent desktop Chromium, Firefox or Safari with WebGL.
- An internet connection for AI generation. Manual editing works offline and without a token.

## Privacy

Scenes and autosaves stay in your browser. When you generate, your prompt and a compact scene summary
(object names, kinds, sizes and positions) go from your browser to Hugging Face and the inference
provider it selects. The 3DTool server only serves the app.

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

## View in AR

**View in AR** in Shape Studio or Future Lab exports the whole scene as one GLB, in metres, and shows
a QR code. On the phone, **View in your room** places the scene on the floor at its real size:

- **Android:** Chrome with ARCore, using WebXR, with Scene Viewer as a fallback.
- **iPhone:** Safari, using Quick Look. model-viewer converts the GLB to USDZ in the browser.

All objects move together as one group in AR.

- **Share links:** each link works for 60 minutes. The server keeps shared scenes in memory (at most
  30 MB each, 300 MB and 50 scenes in total, oldest dropped first), so a restart ends all links.
- **Limits:** uploads are limited to 10 per client per 10 minutes and 300 a day, and cross-site
  uploads are refused.
- **HTTPS:** Android's AR camera needs it. Locally, the QR code points to the laptop's Wi-Fi address,
  so a phone on the same network gets the 3D view only. Use the deployed app, or set
  `PUBLIC_BASE_URL` to an HTTPS address, for AR.

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
npm run e2e          # smoke tests against the production build (no Hugging Face calls)
```

## Deployment (Zenith)

A single CPU-only container, defined by `Dockerfile` and `zenith-compose.yml`. It needs no secrets,
because each visitor brings their own Hugging Face token. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

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
