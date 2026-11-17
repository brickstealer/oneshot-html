import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildPages } from './build-pages.mjs';
import { checkProjects } from './lib/check.mjs';
import { discoverWorkspace } from './lib/discover.mjs';
import {
  normalizeSiteBasePath,
  pathExists,
  resolveProjectBasePath,
} from './lib/fs-utils.mjs';
import { parseHtmlMetadata } from './lib/metadata.mjs';
import { buildCategoryTree } from './lib/tree.mjs';

async function withTempWorkspace(run) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oneshot-pages-test-'));
  try {
    await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function writeFiles(baseDir, fileMap) {
  for (const [relPath, content] of Object.entries(fileMap)) {
    const fullPath = path.join(baseDir, relPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf8');
  }
}

test('normalizeSiteBasePath and resolveProjectBasePath handle slashes consistently', () => {
  assert.equal(normalizeSiteBasePath(''), '');
  assert.equal(normalizeSiteBasePath('/'), '');
  assert.equal(normalizeSiteBasePath('oneshot-html/'), '/oneshot-html');
  assert.equal(normalizeSiteBasePath('/oneshot-html/'), '/oneshot-html');

  assert.equal(
    resolveProjectBasePath('/oneshot-html', 'aistudio/trains/aistudio-argon-1'),
    '/oneshot-html/aistudio/trains/aistudio-argon-1',
  );
  assert.equal(
    resolveProjectBasePath('', 'aistudio/trains/aistudio-argon-1'),
    '/aistudio/trains/aistudio-argon-1',
  );
});

test('parseHtmlMetadata extracts title and description with entities', () => {
  const html = `<!doctype html>
  <html>
    <head>
      <title>Demo &amp; Lab &mdash; v1</title>
      <meta content='Interactive &quot;3D&quot; train' name="description">
    </head>
  </html>`;
  const meta = parseHtmlMetadata(html);
  assert.equal(meta.title, 'Demo & Lab — v1');
  assert.equal(meta.description, 'Interactive "3D" train');
});

test('discoverWorkspace detects static HTML, static sites, Node projects, and ignores hidden/ignored entries', async () => {
  await withTempWorkspace(async (rootDir) => {
    await writeFiles(rootDir, {
      'oneshot/_category.json': JSON.stringify({
        title: 'Oneshot Collection',
        order: -1,
      }),
      'oneshot/games/_category.json': JSON.stringify({
        title: 'Mini Games',
        description: 'Single-file HTML games',
        order: 2,
      }),
      'oneshot/alpha/tool.html': '<html><head><title>Alpha Tool</title></head></html>',
      'oneshot/games/snake.html':
        '<html><head><title>Neon Snake</title><meta name="keywords" content="arcade, canvas"></head></html>',
      'oneshot/games/shared.css': 'body { margin: 0; }',
      'apps/multipage/index.html': '<html><head><title>Multi Page App</title></head></html>',
      'apps/multipage/about.html': '<html><head><title>About</title></head></html>',
      'apps/vite-demo/package.json': JSON.stringify({
        name: 'vite-demo',
        scripts: { build: 'vite build' },
        devDependencies: { vite: '^6.0.0' },
      }),
      'apps/vite-demo/pnpm-lock.yaml': 'lockfileVersion: 9.0',
      'apps/ignored-app/package.json': JSON.stringify({ name: 'broken' }),
      'apps/ignored-app/gh-pages.json': JSON.stringify({ ignore: true }),
      '.aistudio/artifacts/ignored.html': '<html><title>Hidden</title></html>',
    });

    const workspace = await discoverWorkspace(rootDir);
    const ids = workspace.projects.map((p) => p.id);

    assert.deepEqual(ids, [
      'apps/multipage',
      'apps/vite-demo',
      'oneshot/alpha/tool.html',
      'oneshot/games/snake.html',
    ]);
    assert.equal(workspace.ignored.length, 1);
    assert.equal(workspace.ignored[0].relPath, 'apps/ignored-app');

    const snake = workspace.projects.find((p) => p.id === 'oneshot/games/snake.html');
    assert.equal(snake.title, 'Neon Snake');
    assert.deepEqual(snake.tags, ['arcade', 'canvas']);

    const viteDemo = workspace.projects.find((p) => p.id === 'apps/vite-demo');
    assert.equal(viteDemo.framework, 'vite');
    assert.equal(viteDemo.packageManager.name, 'pnpm');

    const tree = buildCategoryTree(workspace.projects, workspace.categories);
    assert.equal(tree.totalCount, 4);
    assert.equal(tree.children[0].title, 'Oneshot Collection');
    assert.equal(tree.children[0].children[0].title, 'alpha');
    assert.equal(tree.children[0].children[1].title, 'Mini Games');
    assert.equal(tree.children[0].children[1].totalCount, 1);
  });
});

test('checkProjects flags Next.js standalone config and root-relative HTML links', async () => {
  await withTempWorkspace(async (rootDir) => {
    await writeFiles(rootDir, {
      'web/next-bad/package.json': JSON.stringify({
        name: 'next-bad',
        scripts: { build: 'next build' },
        dependencies: { next: '15.0.0' },
      }),
      'web/next-bad/next.config.ts': 'export default { output: "standalone" };',
      'web/next-good/package.json': JSON.stringify({
        name: 'next-good',
        scripts: { build: 'next build' },
        dependencies: { next: '15.0.0' },
      }),
      'web/next-good/next.config.ts':
        'export default { output: "export", basePath: process.env.PAGES_BASE_PATH || "", images: { unoptimized: true } };',
      'html/root-link.html': '<html><script src="/bundle.js"></script></html>',
      'web/vite-root-asset/package.json': JSON.stringify({
        name: 'vite-root-asset',
        scripts: { build: 'vite build' },
        devDependencies: { vite: '^8.0.0' },
      }),
      'web/vite-root-asset/src/scene.ts': "const tex = '/src/assets/images/stone.jpg';",
    });

    const workspace = await discoverWorkspace(rootDir);
    const findings = await checkProjects(workspace.projects);

    assert.ok(
      findings.some(
        (f) => f.projectId === 'web/next-bad' && f.level === 'error' && f.message.includes('export'),
      ),
    );
    assert.equal(
      findings.filter((f) => f.projectId === 'web/next-good').length,
      0,
    );
    assert.ok(
      findings.some(
        (f) => f.projectId === 'html/root-link.html' && f.level === 'warn',
      ),
    );
    assert.ok(
      findings.some(
        (f) => f.projectId === 'web/vite-root-asset' && f.level === 'warn' && f.message.includes('/src/assets/'),
      ),
    );
  });
});

test('buildPages assembles static projects, hierarchy index.html, 404.html, and .nojekyll', async () => {
  await withTempWorkspace(async (rootDir) => {
    await writeFiles(rootDir, {
      'experiments/ui/card.html':
        '<html><head><title>Glass &lt;Card&gt;</title><meta name="description" content="CSS demo"></head><body>ok</body></html>',
      'experiments/ui/helpers.js': 'export const ok = true;',
      'experiments/canvas-app/index.html': '<html><head><title>Canvas App</title></head><body>hi</body></html>',
      'experiments/canvas-app/assets/data.json': '{"v":1}',
      'experiments/canvas-app/gh-pages.json': JSON.stringify({ tags: ['webgl'] }),
    });

    const result = await buildPages({
      rootDir,
      outDir: '_site',
      basePath: '/oneshot-html',
    });

    assert.equal(result.results.length, 2);
    assert.ok(await pathExists(path.join(rootDir, '_site', '.nojekyll')));
    assert.ok(await pathExists(path.join(rootDir, '_site', '404.html')));
    assert.ok(await pathExists(path.join(rootDir, '_site', 'experiments/ui/card.html')));
    assert.ok(await pathExists(path.join(rootDir, '_site', 'experiments/ui/helpers.js')));
    assert.ok(await pathExists(path.join(rootDir, '_site', 'experiments/canvas-app/assets/data.json')));
    assert.equal(
      await pathExists(path.join(rootDir, '_site', 'experiments/canvas-app/gh-pages.json')),
      false,
    );

    const indexContent = await fs.readFile(path.join(rootDir, '_site', 'index.html'), 'utf8');
    assert.match(indexContent, /href="\.\/experiments\/ui\/card\.html"/);
    assert.match(indexContent, /href="\.\/experiments\/canvas-app\/"/);
    assert.match(indexContent, /Glass &lt;Card&gt;/);
  });
});
