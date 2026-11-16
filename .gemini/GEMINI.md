# Project Instructions (`oneshot-html`)

This repository is a GitHub Pages monorepo containing standalone HTML demos and frontend-only Node.js projects, assembled into a hierarchical catalog via `scripts/build-pages.mjs` and `.github/workflows/pages.yml`.

## Mandatory Rules for Agents

1. **Read `AGENTS.md` first** before adding, moving, or adapting any project in this repository.
2. **Never commit secrets or build artifacts** (`node_modules/`, `_site/`, `.next/`, `out/`, `dist/`, `.env*`).
3. **Ensure every new project is static-export and subpath safe**:
   - Must work under `/oneshot-html/<project-rel-path>/` (never hardcode root `/` URLs).
   - Must have zero runtime backend requirements (no API routes, SSR, or server-side secrets).
4. **Always verify before concluding**:
   - Run `npm test`
   - Run `npm run discover` and `npm run check`
   - Run `npm run build:pages` (or targeted `--project` build + full build) and check the output under `/oneshot-html/` via `npm run preview:pages`.
