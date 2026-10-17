# Third-party notices

3DTool's original source code is MIT-licensed (see `LICENSE`). That license does **not** extend to the
third-party software and model weights listed here; each keeps its own license.

## AI models (downloaded by the visitor's browser, not distributed with this repository)

No model weights are stored in this repository or in the container image. When a visitor loads a model,
their browser downloads the files directly from Hugging Face.

| Preset | Repository | License | Original model |
|---|---|---|---|
| Light | [onnx-community/SmolLM2-135M-Instruct-ONNX-MHA](https://huggingface.co/onnx-community/SmolLM2-135M-Instruct-ONNX-MHA) | Apache-2.0 | [HuggingFaceTB/SmolLM2-135M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) |
| Balanced | [HuggingFaceTB/SmolLM2-360M-Instruct](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct) | Apache-2.0 | same |
| Standard (default) | [onnx-community/Qwen2.5-0.5B-Instruct](https://huggingface.co/onnx-community/Qwen2.5-0.5B-Instruct) | Apache-2.0 | [Qwen/Qwen2.5-0.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct) |
| Strong | [onnx-community/Qwen2.5-1.5B-Instruct](https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct) | Apache-2.0 | [Qwen/Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct) |

The "Custom" option loads any repository id the visitor enters. That model's license and terms are the
visitor's responsibility; check its model card.

## Runtime libraries

| Package | License |
|---|---|
| [Next.js](https://github.com/vercel/next.js) | MIT |
| [React / React DOM](https://github.com/facebook/react) | MIT |
| [Material UI](https://github.com/mui/material-ui) (`@mui/material`, `@mui/icons-material`, `@mui/material-nextjs`) | MIT |
| [Emotion](https://github.com/emotion-js/emotion) | MIT |
| [three.js](https://github.com/mrdoob/three.js) (including `examples/jsm` RoundedBoxGeometry, GLTFExporter) | MIT |
| [@react-three/fiber](https://github.com/pmndrs/react-three-fiber), [@react-three/drei](https://github.com/pmndrs/drei) | MIT |
| [@huggingface/transformers](https://github.com/huggingface/transformers.js) | Apache-2.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (loaded by Transformers.js from jsDelivr) | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | MIT |
| [Zod](https://github.com/colinhacks/zod) | MIT |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | Apache-2.0 |

Development-only tools (TypeScript, ESLint, Vitest, Playwright, Testing Library) are not shipped in the
production image.

## Generated content

Scenes and GLB files are built entirely by this app's procedural geometry code from user-editable
parameters. No external 3D assets are bundled.
