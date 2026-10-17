# Deployment

3DTool runs as **one CPU-only web service**. Scene state and autosave happen in the visitor's browser.
AI planning uses either the hosted vision model (default), which the server calls through
`/api/plan` on Hugging Face Inference Providers, or an on-device model in the browser. The container
needs no GPU, no model weights and no volume.

## Hugging Face token

The hosted vision model needs one secret, `HF_TOKEN`: a Hugging Face token with the
"Make calls to Inference Providers" permission (https://huggingface.co/settings/tokens). The server
reads it at request time; it is never sent to the browser.

- **Local:** copy `.env.example` to `.env.local` in the project root, set `HF_TOKEN=hf_...`, restart
  `npm run dev`. `.env.local` is gitignored and excluded from the Docker build.
- **Docker:** `docker run --rm -p 3000:3000 -e HF_TOKEN=hf_... 3dtool`.
- **Zenith:** `zenith-compose.yml` declares `HF_TOKEN` as a secret input; set it in the deployment's
  credentials panel.

The Future Lab mesh editor uses the same token for its planner (`HF_LLM_MODEL`), vision model
(`HF_VLM_MODEL`) and text-to-image model (`HF_IMAGE_MODEL`), routed through `HF_PROVIDER`; see
`.env.example` for the defaults. Without a token the Lab falls back to an offline keyword planner and
procedural textures; texture segmentation never needs a token.

`HF_VISION_MODEL` optionally changes the default model (`Qwen/Qwen3-VL-30B-A3B-Instruct`). Calls are
billed to the token's Hugging Face account, and anyone who can reach a public deployment can use it,
so watch usage or add rate limiting before sharing the URL widely.

## Container

`Dockerfile` uses a multi-stage build:

1. **deps:** `npm ci` from `package-lock.json`.
2. **build:** `next build` with `output: "standalone"`. `postbuild` then copies `.next/static` and
   `public/` into `.next/standalone`.
3. **runtime:** `node:22-alpine` with only the standalone folder. It runs as the `node` user with
   `HOSTNAME=0.0.0.0 PORT=3000` and starts with `node server.js`.

Local check:

```bash
docker build -t 3dtool .
docker run --rm -p 3000:3000 3dtool
# open http://localhost:3000/studio
```

`.dockerignore` excludes `node_modules`, `.next`, test output, `.git`, env files and any model-weight
files.

## Headers

`src/proxy.ts` adds `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` to every response. Keep them if you put a CDN or reverse
proxy in front: without them the model still works but falls back to single-threaded WASM, which is
much slower. Visitors' browsers must be able to reach `huggingface.co` (plus its file CDN) and
`cdn.jsdelivr.net`.

## Zenith

`zenith-compose.yml` declares the catalog metadata (MIT, source `https://github.com/arashlove/3dtool`)
and exposes service `web` on port 3000 as the primary web endpoint.

```bash
zenith check --upload-size   # local manifest checks
zenith up                    # preview deployment (needs `zenith auth`)
zenith logs --source build   # or --source runtime
zenith down
zenith publish               # catalogue submission, after pushing to the public GitHub repo
```

### Windows note

With Node 22.14 on Windows, `zenith check` (CLI 0.1.5) fails every file with `PROJECT_FILE_CHANGED`.
The cause is that `fs.lstat` reports `dev: 0` while the opened file handle reports the real device
number, so the CLI's safety comparison never matches. It is not related to the project files. Options:

- run the CLI from WSL or macOS/Linux;
- try a newer Node release;
- for a local check only, preload a shim that copies `dev` from the opened handle:
  `node -r ./zenith-win-dev-fix.cjs "%APPDATA%\npm\node_modules\@zenith-hosting\cli\dist\index.js" check`.
  The shim is not part of this repository.

With that shim, `zenith check --upload-size` reported "Project check passed. Local checks passed."
`zenith up` has **not** been run; server-side validation and a live preview are still to do.
