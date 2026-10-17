# Deployment

3DTool runs as **one CPU-only web service**. Scene state and autosave live in the browser. In Shape
Studio, each visitor's browser calls Hugging Face Inference Providers directly with that visitor's own
token, so Studio needs no server secret. **Do not** put a Hugging Face token in `zenith-compose.yml`,
the Dockerfile or any `NEXT_PUBLIC_*` variable. The container needs no GPU and no volume.

## Future Lab token (optional, server-side)

The Future Lab's AI features (prompt planner, vision model, AI part names, AI textures and decals,
Text to 3D) run on the server with `HF_TOKEN`: a token with the "Make calls to Inference Providers"
permission. It is read at request time and never sent to the browser. Without it the Lab uses an
offline keyword planner and procedural textures; texture segmentation never needs a token.

- **Local:** copy `.env.example` to `.env.local`, set `HF_TOKEN=hf_...`, restart `npm run dev`.
  `.env.local` is gitignored and excluded from the Docker build.
- **Docker:** `docker run --rm -p 3000:3000 -e HF_TOKEN=hf_... 3dtool`.
- **Zenith:** `zenith-compose.yml` declares `HF_TOKEN` as an optional secret input; enter it in the
  deployment's credentials panel, never in the file.

Model settings (`HF_PROVIDER`, `HF_LLM_MODEL`, `HF_VLM_MODEL`, `HF_IMAGE_MODEL`, `HF_3D_SPACE`) are
listed in `.env.example`. Calls are billed to the token's account (Text to 3D uses its ZeroGPU quota),
and anyone who can reach a public deployment can use them, so watch usage or add rate limiting
before sharing the URL widely.

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

## Network

Visitors' browsers must be able to reach `https://router.huggingface.co`. The `/ar/[id]` page loads
`@google/model-viewer` 4.1.0 from `cdn.jsdelivr.net`.

## View in AR share links

- **Routes:**
  - `POST /api/ar?title=…` takes a GLB body and returns `{ id, url, expiresAt, bytes, qrSvg, secure }`.
  - `GET` or `HEAD /api/ar/[id]` serves the GLB, with `X-Model-Title` and `X-Expires-At` headers.
  - `/ar/[id]` is the phone page.
- **Storage:** shared GLBs live only in server memory, held on `globalThis` so every route sees the
  same store. Each lasts 60 minutes. The caps are 30 MB per scene and 300 MB and 50 scenes in total,
  with the oldest dropped first. All the limits are in `src/ar/limits.ts`.
- **Upload rules:**
  - 10 uploads per client per 10 minutes, keyed on the first `X-Forwarded-For` address;
  - 300 uploads a day in total;
  - cross-site requests are refused (`Sec-Fetch-Site`);
  - the body must be a valid glTF 2.0 binary.
- **Link address:** links use `PUBLIC_BASE_URL` first. `zenith-compose.yml` maps it to Zenith's
  `ZENITH_PUBLIC_URL`. Next come the proxy's `X-Forwarded-Host` and `X-Forwarded-Proto`, then the
  request. When the request came to `localhost`, the link uses the machine's LAN address instead, so a
  phone on the same Wi-Fi can open it. That plain-HTTP link shows the 3D view, but Android blocks the
  AR camera without HTTPS.

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
