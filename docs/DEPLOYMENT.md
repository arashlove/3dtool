# Deployment

3DTool runs as **one CPU-only web service**. The server only serves the built Next.js app. Each
visitor's browser calls Hugging Face Inference Providers directly with that visitor's own token, and
scene state and autosave live in the browser. The container needs no GPU, no volume and no secrets.
**Do not** put a Hugging Face token in `zenith-compose.yml`, the Dockerfile or any `NEXT_PUBLIC_*`
variable.

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

Visitors' browsers must be able to reach `https://router.huggingface.co`. The server makes no outbound
calls.

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
