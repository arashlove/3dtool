# Model notes

## Runtime

- [Transformers.js](https://huggingface.co/docs/transformers.js) 4.x in a module Web Worker, with
  `device: 'wasm'` (CPU only, no WebGPU).
- Generation uses greedy decoding (`do_sample: false`) with `max_new_tokens` set to 384. It stops early
  once the first JSON object closes.
- The page is cross-origin isolated, so ONNX Runtime uses several WASM threads (half the logical
  cores, capped at 8). Without isolation it uses one thread.
- Files are cached by the browser (Cache Storage) after the first download.

## Presets

| Preset | Repository | dtype | Approx. download |
|---|---|---|---|
| Light | `onnx-community/SmolLM2-135M-Instruct-ONNX-MHA` | q8 | 131 MB |
| Balanced | `HuggingFaceTB/SmolLM2-360M-Instruct` | q8 | 348 MB |
| Standard (default) | `onnx-community/Qwen2.5-0.5B-Instruct` | q8 | 488 MB |
| Strong | `onnx-community/Qwen2.5-1.5B-Instruct` | q8 | 1.5 GB |

Sizes were read from the Hugging Face repository listings and are not measured downloads. All four
repositories are public, ungated and Apache-2.0.

## What has been verified

These results come from one Windows 11 machine (20 logical cores) in Cursor's built-in Chromium browser,
running the local production build:

- **Model loading works:** the Standard preset downloaded from Hugging Face and loaded on CPU/WASM in
  48.8 s on first load.
- **Single-threaded generation was too slow.** Before cross-origin isolation was added, one prompt was
  still generating after more than 5 minutes and was abandoned. That led to the COOP/COEP headers and
  multi-threading.
- **The first isolated build failed.** The model worker crashed because the worker script under
  `_next/static` lacked the COEP header. This was fixed by moving the headers into `src/proxy.ts`. The
  headers on both the page and the worker script were then confirmed with HTTP requests, and the
  Playwright smoke test confirms `self.crossOriginIsolated === true`.
- **Not yet confirmed:** an end-to-end generation (prompt to applied plan) with multi-threaded WASM.
  Plan quality for each preset has also not been measured. Treat speed and accuracy as unverified
  until tested on your own hardware.

## Known limitations

- Small models misread multi-step or vague requests. The validator and dry run stop bad plans from
  changing the scene, but the user may need to rephrase or pick a stronger preset.
- Memory use exceeds the download size. The Strong preset needs a well-equipped desktop browser;
  phones are not a target.
- The app does not detect a model's maximum context. Very large scenes are summarised to 20 objects.
- Custom models must be Transformers.js-compatible ONNX text-generation repositories with a chat
  template. Others fail at load time with the library's error message.
