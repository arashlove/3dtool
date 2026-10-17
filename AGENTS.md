<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Zenith

Use the checked-in .agents/skills/zenith-setup/SKILL.md to prepare this repository for Zenith. Read the Compose, test, and publish skills there as the work progresses. Run `zenith check` after adapting Dockerfile and zenith-compose.yml to the actual app. Keep secrets out of Git.

You do not need Docker installed locally; Zenith builds and runs containers on the platform, so use `zenith up` for previews. Zenith also provides outbound app email through its SMTP relay. Configure x-zenith.env using the Compose skill for previews and published apps.
