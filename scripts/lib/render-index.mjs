import { FRAMEWORK_LABELS } from './constants.mjs';
import { escapeHtml } from './fs-utils.mjs';

function renderProjectCard(project, githubRepoUrl) {
  const frameworkLabel = FRAMEWORK_LABELS[project.framework] ?? project.framework;
  const searchBlob = [
    project.title,
    project.description,
    project.relPath,
    frameworkLabel,
    ...(project.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const sourceUrl = githubRepoUrl
    ? `${githubRepoUrl}/${project.kind === 'static-html' ? 'blob' : 'tree'}/main/${project.relPath}`
    : '';

  const tagsHtml = (project.tags ?? [])
    .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
    .join('');

  const descHtml = project.description
    ? `<p class="project-desc">${escapeHtml(project.description)}</p>`
    : '';

  const sourceLinkHtml = sourceUrl
    ? `<a class="icon-btn" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer" title="Source on GitHub" aria-label="Source on GitHub">&lt;/&gt;</a>`
    : '';

  return `
    <article
      class="project-card"
      data-project
      data-framework="${escapeHtml(project.framework)}"
      data-search="${escapeHtml(searchBlob)}"
    >
      <div class="project-main">
        <div class="project-header">
          <a class="project-title" href="./${escapeHtml(project.urlRelPath)}">${escapeHtml(project.title)}</a>
          <span class="badge badge-${escapeHtml(project.framework)}">${escapeHtml(frameworkLabel)}</span>
        </div>
        ${descHtml}
        <div class="project-meta">
          <code class="project-path">${escapeHtml(project.relPath)}</code>
          ${tagsHtml}
        </div>
      </div>
      <div class="project-actions">
        <a class="open-btn" href="./${escapeHtml(project.urlRelPath)}">Open</a>
        <a class="icon-btn" href="./${escapeHtml(project.urlRelPath)}" target="_blank" rel="noopener noreferrer" title="Open in new tab" aria-label="Open in new tab">&#8599;</a>
        ${sourceLinkHtml}
      </div>
    </article>`;
}

function renderTreeBranch(node, depth, githubRepoUrl) {
  const childrenHtml = node.children
    .map((child) => renderTreeBranch(child, depth + 1, githubRepoUrl))
    .join('');

  const projectsHtml = node.projects
    .map((project) => renderProjectCard(project, githubRepoUrl))
    .join('');

  if (depth === 0) {
    return `${projectsHtml}${childrenHtml}`;
  }

  const descHtml = node.description
    ? `<span class="branch-desc">${escapeHtml(node.description)}</span>`
    : '';

  return `
    <details class="branch" open data-branch data-depth="${depth}">
      <summary class="branch-summary">
        <span class="branch-caret" aria-hidden="true"></span>
        <span class="branch-icon" aria-hidden="true">&#128193;</span>
        <span class="branch-name">${escapeHtml(node.title)}</span>
        ${descHtml}
        <span class="branch-count" data-branch-count>${node.totalCount}</span>
      </summary>
      <div class="branch-content">
        ${projectsHtml}
        ${childrenHtml}
      </div>
    </details>`;
}

/**
 * Generates the hierarchical showcase index.html document.
 */
export function renderIndexHtml({
  repoName,
  tree,
  projects,
  githubRepoUrl,
  generatedAtIso,
}) {
  const frameworks = Array.from(new Set(projects.map((p) => p.framework))).sort();
  const filterChipsHtml = [
    '<button class="chip active" type="button" data-filter="all">All</button>',
    ...frameworks.map((fw) => {
      const label = FRAMEWORK_LABELS[fw] ?? fw;
      return `<button class="chip" type="button" data-filter="${escapeHtml(fw)}">${escapeHtml(label)}</button>`;
    }),
  ].join('\n        ');

  const topLevelCategories = tree.children.length;
  const treeHtml =
    projects.length > 0
      ? renderTreeBranch(tree, 0, githubRepoUrl)
      : '<div class="empty-state">No projects discovered yet. Add an HTML or Node.js frontend project directory to get started.</div>';

  const repoBadgeHtml = githubRepoUrl
    ? `<a class="repo-link" href="${escapeHtml(githubRepoUrl)}" target="_blank" rel="noopener noreferrer">GitHub &#8599;</a>`
    : '';

  const formattedDate = generatedAtIso.slice(0, 10);

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(repoName)} — Project Directory</title>
  <meta name="description" content="Hierarchical catalog of HTML and frontend Node.js projects hosted on GitHub Pages." />
  <style>
    :root {
      --bg: #0b101b;
      --bg-elevated: #121928;
      --bg-card: #161f31;
      --bg-card-hover: #1b263d;
      --border: rgba(148, 163, 184, 0.16);
      --border-strong: rgba(148, 163, 184, 0.3);
      --text: #e2e8f0;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-soft: rgba(56, 189, 248, 0.14);
      --tree-line: rgba(148, 163, 184, 0.22);
      --shadow: 0 12px 30px -12px rgba(0, 0, 0, 0.55);
    }

    html[data-theme="light"] {
      --bg: #f8fafc;
      --bg-elevated: #ffffff;
      --bg-card: #ffffff;
      --bg-card-hover: #f1f5f9;
      --border: rgba(15, 23, 42, 0.1);
      --border-strong: rgba(15, 23, 42, 0.22);
      --text: #0f172a;
      --text-muted: #475569;
      --accent: #0284c7;
      --accent-soft: rgba(2, 132, 199, 0.1);
      --tree-line: rgba(15, 23, 42, 0.15);
      --shadow: 0 10px 25px -12px rgba(15, 23, 42, 0.16);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 12% 0%, var(--accent-soft), transparent 42%),
        var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      line-height: 1.5;
    }

    .container {
      max-width: 1060px;
      margin: 0 auto;
      padding: 28px 18px 64px;
    }

    .hero {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      padding: 22px 24px;
      border-radius: 16px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      margin-bottom: 18px;
    }

    .hero-title {
      margin: 0;
      font-size: clamp(1.4rem, 2.8vw, 1.95rem);
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .hero-subtitle {
      margin: 6px 0 0;
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    .hero-right {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .stat-pill,
    .repo-link,
    .theme-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 0.83rem;
      border: 1px solid var(--border);
      background: var(--bg-card);
      color: var(--text);
      text-decoration: none;
    }

    .theme-btn,
    .repo-link {
      cursor: pointer;
    }

    .theme-btn:hover,
    .repo-link:hover {
      border-color: var(--accent);
    }

    .controls {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 18px;
      border-radius: 14px;
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      margin-bottom: 20px;
    }

    .controls-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    .search-wrap {
      flex: 1 1 280px;
      position: relative;
    }

    .search-input {
      width: 100%;
      padding: 10px 44px 10px 14px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font-size: 0.94rem;
      outline: none;
    }

    .search-input:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-soft);
    }

    .search-kbd {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      padding: 2px 7px;
      border-radius: 6px;
      border: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.75rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      pointer-events: none;
    }

    .tree-actions {
      display: flex;
      gap: 8px;
    }

    .ghost-btn,
    .chip {
      padding: 7px 12px;
      border-radius: 9px;
      border: 1px solid var(--border);
      background: var(--bg-card);
      color: var(--text-muted);
      font-size: 0.84rem;
      cursor: pointer;
      transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
    }

    .ghost-btn:hover,
    .chip:hover {
      border-color: var(--border-strong);
      color: var(--text);
    }

    .chip.active {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
      font-weight: 600;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .results-status {
      margin-left: auto;
      font-size: 0.82rem;
      color: var(--text-muted);
    }

    .tree-root {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .branch {
      border-radius: 12px;
    }

    .branch[data-depth="1"] {
      background: var(--bg-elevated);
      border: 1px solid var(--border);
      padding: 10px 14px;
    }

    .branch-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 4px;
      cursor: pointer;
      list-style: none;
      font-weight: 600;
      user-select: none;
    }

    .branch-summary::-webkit-details-marker {
      display: none;
    }

    .branch-caret {
      width: 0;
      height: 0;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 7px solid var(--text-muted);
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }

    .branch[open] > .branch-summary .branch-caret {
      transform: rotate(90deg);
    }

    .branch-name {
      font-size: 1rem;
    }

    .branch-desc {
      color: var(--text-muted);
      font-weight: 400;
      font-size: 0.86rem;
    }

    .branch-count {
      margin-left: auto;
      padding: 2px 9px;
      border-radius: 999px;
      font-size: 0.76rem;
      font-weight: 600;
      background: var(--bg-card);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }

    .branch-content {
      margin-left: 10px;
      padding-left: 16px;
      border-left: 2px solid var(--tree-line);
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 6px;
      margin-bottom: 4px;
    }

    .project-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 14px 16px;
      border-radius: 12px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease;
    }

    .project-card:hover {
      background: var(--bg-card-hover);
      border-color: var(--border-strong);
    }

    .project-main {
      min-width: 0;
      flex: 1;
    }

    .project-header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }

    .project-title {
      color: var(--text);
      font-weight: 600;
      font-size: 1rem;
      text-decoration: none;
    }

    .project-title:hover {
      color: var(--accent);
      text-decoration: underline;
    }

    .project-desc {
      margin: 6px 0 0;
      color: var(--text-muted);
      font-size: 0.88rem;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .project-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: 8px;
    }

    .project-path {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.78rem;
      color: var(--text-muted);
      background: var(--bg);
      padding: 2px 7px;
      border-radius: 6px;
      border: 1px solid var(--border);
      word-break: break-all;
    }

    .tag {
      font-size: 0.74rem;
      padding: 2px 7px;
      border-radius: 6px;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text-muted);
    }

    .badge {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      letter-spacing: 0.01em;
      border: 1px solid transparent;
    }

    .badge-html,
    .badge-html-app {
      background: rgba(249, 115, 22, 0.14);
      color: #fb923c;
      border-color: rgba(249, 115, 22, 0.32);
    }

    .badge-next {
      background: rgba(56, 189, 248, 0.14);
      color: #38bdf8;
      border-color: rgba(56, 189, 248, 0.35);
    }

    .badge-vite {
      background: rgba(168, 85, 247, 0.15);
      color: #c084fc;
      border-color: rgba(168, 85, 247, 0.35);
    }

    .badge-astro,
    .badge-cra,
    .badge-node {
      background: rgba(34, 197, 94, 0.14);
      color: #4ade80;
      border-color: rgba(34, 197, 94, 0.35);
    }

    html[data-theme="light"] .badge-html,
    html[data-theme="light"] .badge-html-app {
      color: #c2410c;
    }

    html[data-theme="light"] .badge-next {
      color: #0369a1;
    }

    html[data-theme="light"] .badge-vite {
      color: #7e22ce;
    }

    html[data-theme="light"] .badge-astro,
    html[data-theme="light"] .badge-cra,
    html[data-theme="light"] .badge-node {
      color: #15803d;
    }

    .project-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .open-btn,
    .icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 12px;
      border-radius: 9px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--text);
      font-size: 0.84rem;
      font-weight: 500;
      text-decoration: none;
    }

    .open-btn {
      background: var(--accent-soft);
      border-color: rgba(56, 189, 248, 0.35);
      color: var(--accent);
      font-weight: 600;
    }

    .open-btn:hover,
    .icon-btn:hover {
      border-color: var(--accent);
    }

    .empty-state {
      padding: 36px 20px;
      text-align: center;
      border-radius: 14px;
      border: 1px dashed var(--border-strong);
      color: var(--text-muted);
    }

    .hidden {
      display: none !important;
    }

    @media (max-width: 640px) {
      .project-card {
        flex-direction: column;
        align-items: stretch;
      }
      .project-actions {
        justify-content: flex-end;
      }
      .branch-content {
        margin-left: 4px;
        padding-left: 10px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="hero">
      <div>
        <h1 class="hero-title">${escapeHtml(repoName)}</h1>
        <p class="hero-subtitle">Hierarchical showcase of static HTML and frontend-only Node.js experiments</p>
      </div>
      <div class="hero-right">
        <span class="stat-pill">${projects.length} projects</span>
        <span class="stat-pill">${topLevelCategories} root groups</span>
        <span class="stat-pill">Built ${escapeHtml(formattedDate)}</span>
        ${repoBadgeHtml}
        <button class="theme-btn" id="theme-toggle" type="button">Theme</button>
      </div>
    </header>

    <section class="controls" aria-label="Catalog filters">
      <div class="controls-row">
        <div class="search-wrap">
          <input
            id="search-input"
            class="search-input"
            type="search"
            placeholder="Filter by title, path, description, or tag..."
            autocomplete="off"
          />
          <span class="search-kbd">/</span>
        </div>
        <div class="tree-actions">
          <button class="ghost-btn" id="expand-all" type="button">Expand all</button>
          <button class="ghost-btn" id="collapse-all" type="button">Collapse all</button>
        </div>
      </div>
      <div class="chips">
        ${filterChipsHtml}
        <span class="results-status" id="results-status">${projects.length} shown</span>
      </div>
    </section>

    <main class="tree-root" id="tree-root">
      ${treeHtml}
      <div class="empty-state hidden" id="no-matches">
        No projects match the current search or filter.
      </div>
    </main>
  </div>

  <script>
    (() => {
      const rootEl = document.documentElement;
      const themeBtn = document.getElementById('theme-toggle');
      const savedTheme = localStorage.getItem('oneshot-theme');
      const initialTheme = savedTheme || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      const applyTheme = (theme) => {
        rootEl.setAttribute('data-theme', theme);
        themeBtn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
      };
      applyTheme(initialTheme);
      themeBtn.addEventListener('click', () => {
        const next = rootEl.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        localStorage.setItem('oneshot-theme', next);
        applyTheme(next);
      });

      const searchInput = document.getElementById('search-input');
      const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
      const cards = Array.from(document.querySelectorAll('[data-project]'));
      const branches = Array.from(document.querySelectorAll('[data-branch]')).reverse();
      const statusEl = document.getElementById('results-status');
      const noMatchesEl = document.getElementById('no-matches');

      let activeFilter = 'all';

      const applyFilters = () => {
        const query = searchInput.value.trim().toLowerCase();
        let visibleTotal = 0;

        for (const card of cards) {
          const fw = card.getAttribute('data-framework');
          const haystack = card.getAttribute('data-search') || '';
          const matchesFilter = activeFilter === 'all' || fw === activeFilter;
          const matchesQuery = !query || haystack.includes(query);
          const visible = matchesFilter && matchesQuery;
          card.classList.toggle('hidden', !visible);
          if (visible) {
            visibleTotal += 1;
          }
        }

        for (const branch of branches) {
          const visibleCards = branch.querySelectorAll('[data-project]:not(.hidden)').length;
          branch.classList.toggle('hidden', visibleCards === 0);
          const countEl = branch.querySelector(':scope > .branch-summary [data-branch-count]');
          if (countEl) {
            countEl.textContent = String(visibleCards);
          }
          if ((query || activeFilter !== 'all') && visibleCards > 0) {
            branch.open = true;
          }
        }

        statusEl.textContent = visibleTotal + ' shown';
        noMatchesEl.classList.toggle('hidden', cards.length === 0 || visibleTotal > 0);
      };

      searchInput.addEventListener('input', applyFilters);

      for (const btn of filterButtons) {
        btn.addEventListener('click', () => {
          activeFilter = btn.getAttribute('data-filter') || 'all';
          for (const other of filterButtons) {
            other.classList.toggle('active', other === btn);
          }
          applyFilters();
        });
      }

      document.getElementById('expand-all').addEventListener('click', () => {
        for (const branch of branches) {
          branch.open = true;
        }
      });

      document.getElementById('collapse-all').addEventListener('click', () => {
        for (const branch of branches) {
          branch.open = false;
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === '/' && document.activeElement !== searchInput) {
          event.preventDefault();
          searchInput.focus();
        }
      });
    })();
  </script>
</body>
</html>
`;
}

/**
 * Generates a fallback 404.html page with a relative link back to the catalog home.
 */
export function renderNotFoundHtml({ repoName, siteBasePath }) {
  const homeHref = siteBasePath ? `${siteBasePath}/` : '/';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 — ${escapeHtml(repoName)}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0b101b;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, sans-serif;
      padding: 24px;
      text-align: center;
    }
    .card {
      max-width: 460px;
      padding: 28px;
      border-radius: 16px;
      background: #121928;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    a {
      display: inline-block;
      margin-top: 14px;
      padding: 9px 16px;
      border-radius: 10px;
      background: rgba(56, 189, 248, 0.14);
      border: 1px solid rgba(56, 189, 248, 0.35);
      color: #38bdf8;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>404 — Page Not Found</h1>
    <p>This project or path does not exist in ${escapeHtml(repoName)}.</p>
    <a href="${escapeHtml(homeHref)}">Back to catalog</a>
  </main>
</body>
</html>
`;
}
