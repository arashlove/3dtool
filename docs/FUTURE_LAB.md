# Future Lab: prompt-driven mesh editing

The Future Lab tab edits the Three.js objects from Shape Studio (or any `.glb`) at the mesh level,
following the GLB Edit design. Everything runs inside this Next.js app; there is no separate backend.

| Piece | Where |
|---|---|
| Plan, part naming, image generation (HF token stays on the server) | `src/app/api/lab/*`, `src/lab/server/hf.ts` |
| Plan validation / clamping, offline keyword planner, prompts | `src/lab/plan.ts`, `src/lab/heuristic.ts`, `src/lab/prompts.ts` |
| Edit engine: transactions + undo, deformations, appearance, regions | `src/lab/engine/*` |
| Decals (depth-map occlusion) and 360° wraps | `src/lab/engine/decal.ts` |
| Texture segmentation (CIELAB k-means, no AI) | `src/lab/texseg.ts` |
| Set-of-marks snapshot for the vision model | `src/lab/snapshot.ts` |
| Loading the Studio scene / `.glb`, structural segmentation | `src/lab/loader.ts` |
| State and UI | `src/lab/store.ts`, `src/components/lab/*` |

Differences from the original FastAPI design:

- Structural segmentation (connected components) and texture segmentation run in the browser, so
  there is no export/upload round trip and no face-order mismatch to guard against.
- White-background cut-out for decals and wraps runs on a canvas in the browser; the server only
  returns the generated image. Procedural fallbacks are also drawn in the browser.
- Lab edits are mesh-level and do not flow back into the Shape Studio document. Use **Export GLB** to
  keep them; **From Studio** rebuilds the parts from the current Studio scene.

API: `GET /api/lab/health`, `POST /api/lab/plan`, `POST /api/lab/label-parts` (needs a token),
`POST /api/lab/texture` (returns 503 without a token, and the browser draws a procedural image).
The AI routes take the visitor's Hugging Face token from the `x-hf-token` request header (the same token
entered in Shape Studio, or via the token chip in the Lab's top bar) and use it for that request only.

## Importing and arranging models

**Import .glb → Add to scene** puts the file beside the selected object (or beside the whole scene),
standing on the floor at its own size (glTF units are metres; anything over 20 m or under 2 cm is
scaled to 1 m). Every part remembers its object (a Studio object or an imported file): clicking it in
the view selects the whole object, a second click selects the part under the cursor, and the parts
list groups parts under object headings. The selection gets a move/rotate/scale gizmo (W/E/R); each
drag is one undo step. **Import .glb → Replace scene** starts over with only that file.

## Text to 3D

No Hugging Face Inference Provider serves a text-to-3D or image-to-3D model, so **Text to 3D** calls the
public [microsoft/TRELLIS.2](https://huggingface.co/spaces/microsoft/TRELLIS.2) Space through its Gradio
API (`src/lab/server/trellis.ts`, `POST /api/lab/generate-3d`). A prompt first becomes a concept image
with `HF_IMAGE_MODEL`; TRELLIS.2 removes the background and returns a PBR-textured GLB, which is added
beside the scene (scaled to a chosen height) or replaces it. The route streams progress as NDJSON.

The Space runs on ZeroGPU with the visitor's token, so generation uses their account's daily
ZeroGPU quota, and it can queue when the Space is busy. `HF_3D_SPACE` points at another Space with
the same API (for example a duplicate on your own hardware).
