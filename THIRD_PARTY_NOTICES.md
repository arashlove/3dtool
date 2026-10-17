# Third-party notices

3DTool's original source code is MIT-licensed (see `LICENSE`). That license does **not** extend to the
third-party software, services and models listed here; each keeps its own license and terms.

## AI models (remote, via Hugging Face Inference Providers)

No model weights are stored in this repository or in the container image. Generation requests are sent
from the visitor's browser to Hugging Face Inference Providers with the visitor's own token, under the
[Hugging Face terms](https://huggingface.co/terms-of-service) and those of the selected provider.

| Preset | Model | License |
|---|---|---|
| Fast | [openai/gpt-oss-20b](https://huggingface.co/openai/gpt-oss-20b) | Apache-2.0 |
| Balanced (default) | [openai/gpt-oss-120b](https://huggingface.co/openai/gpt-oss-120b) | Apache-2.0 |
| Strong | [Qwen/Qwen2.5-72B-Instruct](https://huggingface.co/Qwen/Qwen2.5-72B-Instruct) | [Qwen license](https://huggingface.co/Qwen/Qwen2.5-72B-Instruct/blob/main/LICENSE) |

The "Custom" option uses any model id the visitor enters. That model's license and terms are the
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
| [Zustand](https://github.com/pmndrs/zustand) | MIT |
| [Zod](https://github.com/colinhacks/zod) | MIT |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | Apache-2.0 |

Development-only tools (TypeScript, ESLint, Vitest, Playwright, Testing Library) are not shipped in the
production image.

## Generated content

Scenes and GLB files are built entirely by this app's procedural geometry code from user-editable
parameters. No external 3D assets are bundled.
