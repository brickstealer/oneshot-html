# AGENTS.md — Playbook for Working with `oneshot-html`

This repository is a multi-project static showcase deployed to **GitHub Pages** (`https://brickstealer.github.io/oneshot-html/`) via GitHub Actions (`.github/workflows/pages.yml`).
Every HTML file and frontend-only Node.js project placed in the repository tree is automatically discovered, built into `_site/`, and listed on the root `index.html` according to the folder hierarchy.

When the user drops a new project (HTML file, static folder, Google AI Studio export, Vite/Next.js/React/Vue app, etc.) into this repo and asks to adapt or add it, follow this playbook end-to-end.

---

## 1. Repository Architecture

- **Projects live anywhere outside ignored directories**:
  - `.git`, `.github`, `.gemini`, `.aistudio`, `node_modules`, `scripts`, `_site`, `.pages-cache`, `dist`, `out`, `build`, `.next`, and any dotfile/dotdir (`.*`) are ignored by the scanner.
- **Root orchestrator (`scripts/`)**:
  - `scripts/build-pages.mjs` — CLI & build orchestrator (`--discover`, `--check`, `--base-path`, `--project`, `--strict-pm`, `--skip-install`).
  - `scripts/preview.mjs` — local HTTP server simulating GitHub Pages subpath hosting (`--base-path=/oneshot-html`).
  - `scripts/lib/discover.mjs` — recursive project & category discovery.
  - `scripts/lib/check.mjs` — static compatibility checks for GitHub Pages.
  - `scripts/lib/builder.mjs` — package manager resolution, Node.js builds, static copying.
  - `scripts/lib/render-index.mjs` — generates `_site/index.html`, `_site/404.html`, and `_site/.nojekyll`.
- **GitHub Actions (`.github/workflows/pages.yml`)**:
  - Installs Node.js, Corepack (`pnpm`/`yarn`), and Bun (`oven-sh/setup-bun`), resolves the Pages `base_path` via `actions/configure-pages`, runs tests/checks/build, and deploys `_site/`.

---

## 2. How Discovery Works

For each directory outside ignored folders:

1. **Node.js project (`kind: "node"`)**: contains `package.json` (or `gh-pages.json` with `"type": "node"`). The scanner does **not** descend further into this folder.
2. **Static multi-file app (`kind: "static-site"`)**: no `package.json`, contains `index.html` (or `gh-pages.json` with `"type": "static"` and optional `"entry"`). The whole folder (minus non-deploy/hidden files) is copied to `_site/<relPath>/`.
3. **Category folder**: no `package.json` and no `index.html`.
   - Every `*.html` file inside becomes a separate `static-html` project (`_site/<relPath>.html`).
   - Non-project sibling assets (CSS, JS, images, non-project asset subfolders) in the same category folder are copied alongside the HTML files.
   - Subdirectories inside it are scanned recursively.

---

## 3. Step-by-Step Workflow When Adding or Adapting a Project

### Step 1: Place and Classify

- Place the project in a meaningful hierarchy folder, e.g.:
  - `oneshot-html/<category>/<name>.html` for single-file HTML experiments
  - `aistudio/<category>/<project-name>/` for Google AI Studio exports
  - `<stack-or-category>/<project-name>/` for other Node.js / static apps
- Avoid spaces in folder/file names; prefer lowercase `kebab-case`.
- Do **not** place project HTML files named `index.html` or `404.html` directly at the repo root (reserved for the generated showcase).

### Step 2: Audit for Frontend-Only / GitHub Pages Constraints

GitHub Pages serves **pure static files** under a subpath (`/oneshot-html/<relPath>/`). Before finishing adaptation, check for:

1. **Server-side dependencies**:
   - Next.js API routes (`app/api/`, `pages/api/`), `middleware.ts`, `getServerSideProps`, Server Actions, database clients, or server secrets (`process.env.GEMINI_API_KEY`, `.env.local`).
   - If unused (e.g., template boilerplate from AI Studio): verify nothing calls them or remove the dead server files.
   - If required at runtime: convert to client-side logic (or user-provided API key stored in `localStorage`/state), or explicitly inform the user that backend functionality cannot run on GitHub Pages.
2. **Root-relative URLs (`/...`)**:
   - Any `src="/..."`, `href="/..."`, `fetch('/...')`, or hardcoded CSS `url(/...)` breaks when mounted under `/oneshot-html/<relPath>/`.
   - Convert them to relative paths (`./...`) or prepend the configured base path (`process.env.NEXT_PUBLIC_BASE_PATH` / `import.meta.env.BASE_URL`).
3. **Client-side routing**:
   - GitHub Pages has no per-subproject SPA rewrite fallback (`/* -> index.html`).
   - Prefer hash routing (`HashRouter` / `createHashRouter` / `createWebHashHistory`) or single-page state navigation.

### Step 3: Stack-Specific Adaptation Recipes

#### A. Standalone `.html` or Static Folder (`index.html`)
- Ensure `<title>` and `<meta name="description" content="...">` are meaningful (they populate the root catalog).
- Optional `<meta name="keywords" content="threejs, shader, ...">` is parsed as tags.
- Ensure all local asset/script/style links are relative (`./styles.css`, `./app.js`).

#### B. Next.js (including Google AI Studio exports)
Update `next.config.ts` / `next.config.mjs`:
```ts
const basePath = (
  process.env.NEXT_PUBLIC_BASE_PATH ||
  process.env.PAGES_BASE_PATH ||
  ''
).replace(/\/+$/, '');

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  // ...existing project-specific options
};
```
Checklist for Next.js:
- Remove `output: 'standalone'` (incompatible with static export).
- Add `images: { unoptimized: true }` (`output: 'export'` fails otherwise if `next/image` is used).
- Verify `typescript.ignoreBuildErrors` and build cleanly (`next build` outputs to `out/`).
- Do **not** hardcode `/oneshot-html/...` in `next.config.*` — always read `NEXT_PUBLIC_BASE_PATH` / `PAGES_BASE_PATH` so `npm run dev` still works at `http://localhost:3000/`.
- If dynamic routes `[slug]` exist, ensure `generateStaticParams()` is implemented or replace them with query/hash params.

#### C. Vite (React / Vue / Svelte / Vanilla TS)
In `vite.config.ts` / `vite.config.js`:
```ts
export default defineConfig(({command}) => {
  const pagesBase = process.env.PAGES_BASE_PATH?.replace(/\/+$/, '');
  const base = pagesBase ? `${pagesBase}/` : command === 'serve' ? '/' : './';
  return {
    base,
    // ...
  };
});
```
- Also avoid hardcoded `base: '/'`. (If `base` is omitted completely and the build script is plain `vite build`, the orchestrator automatically passes `--base=<projectBasePath>/`.)
- Use `import.meta.env.BASE_URL` when referencing files inside `public/`.
- **AI Studio Vite template gotcha**: some exports pin `"esbuild": "^0.25.0"` alongside `"vite": "^8.3.0"`, which causes `npm install` to fail with `ERESOLVE` (`vite` expects `esbuild@^0.27 || ^0.28`). If `esbuild` is unused in project code, remove that redundant `devDependencies` pin so clean `npm install` succeeds in CI.

#### D. Astro / CRA / Generic Node Bundlers
- Ensure `npm run build` outputs pure static files (`dist/`, `out/`, or `build/`) containing `index.html`.
- For CRA (`react-scripts`), the orchestrator automatically exports `PUBLIC_URL=<projectBasePath>`.
- For non-standard tools, add `gh-pages.json` specifying `buildCommand` and `outputDir`.

---

## 4. Metadata & Optional Per-Project Config (`gh-pages.json` / `_category.json`)

The catalog extracts titles and descriptions automatically in priority order:
1. `gh-pages.json` (`title`, `description`, `tags`, `order`) — or `<name>.gh-pages.json` next to a standalone `<name>.html` file
2. `metadata.json` (`name`, `description` — standard in Google AI Studio)
3. HTML `<title>` and `<meta name="description">`
4. `package.json` (`name` if not `"ai-studio-applet"`, `description`)
5. First `# Heading` in local `README.md`
6. Folder/file name

### Optional `gh-pages.json` schema (inside a project folder)
```json
{
  "title": "Custom Display Name",
  "description": "Short description shown in the hierarchy catalog",
  "tags": ["threejs", "webgl"],
  "order": 0,
  "framework": "next",
  "packageManager": "bun",
  "installCommand": "npm ci",
  "buildCommand": "npm run build",
  "outputDir": "out",
  "entry": "index.html",
  "ignore": false
}
```
- Set `"ignore": true` to temporarily exclude an unfinished or broken project from CI and the catalog without deleting its source files.

### Optional `_category.json` schema (inside any hierarchy folder)
```json
{
  "title": "Train Simulations",
  "description": "3D procedural railway experiments",
  "order": 0,
  "ignore": false
}
```

---

## 5. Mandatory Verification Before Finishing

After adding or adapting any project, always run from the repository root:

1. `npm test` — orchestrator unit & integration tests pass.
2. `npm run discover` — verify the new project appears under the expected hierarchy path and title.
3. `npm run check` — verify zero errors (and resolve/explain any warnings).
4. `npm run build:pages` (or `node scripts/build-pages.mjs --base-path=/oneshot-html --project <relPath>` during iteration, followed by full `npm run build:pages`) — confirm real build succeeds with the GitHub Pages subpath.
5. Verify output via `npm run preview:pages` (or local HTTP request against `http://127.0.0.1:4173/oneshot-html/`): confirm `_site/index.html`, the project entry page, and its JS/CSS assets return HTTP `200` with zero missing `/_next/` or `./` assets.
6. `git status` — confirm no `node_modules/`, `_site/`, `.next/`, `out/`, `dist/`, or `.env*` secrets are staged or left untracked outside `.gitignore`.
