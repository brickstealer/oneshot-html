import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSelectedProjects } from './lib/builder.mjs';
import { checkProjects } from './lib/check.mjs';
import { FRAMEWORK_LABELS } from './lib/constants.mjs';
import { discoverWorkspace, filterProjects } from './lib/discover.mjs';
import { ensureDir, normalizeSiteBasePath, resetDir } from './lib/fs-utils.mjs';
import { renderIndexHtml, renderNotFoundHtml } from './lib/render-index.mjs';
import { buildCategoryTree } from './lib/tree.mjs';

function parseCliArgs(argv) {
  const options = {
    discover: false,
    check: false,
    strictPm: false,
    skipInstall: false,
    basePath: '',
    project: '',
    outDir: '_site',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--discover') {
      options.discover = true;
    } else if (arg === '--check') {
      options.check = true;
    } else if (arg === '--strict-pm') {
      options.strictPm = true;
    } else if (arg === '--skip-install') {
      options.skipInstall = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--base-path=')) {
      options.basePath = arg.slice('--base-path='.length);
    } else if (arg === '--base-path' && i + 1 < argv.length) {
      options.basePath = argv[++i];
    } else if (arg.startsWith('--project=')) {
      options.project = arg.slice('--project='.length);
    } else if (arg === '--project' && i + 1 < argv.length) {
      options.project = argv[++i];
    } else if (arg.startsWith('--out=')) {
      options.outDir = arg.slice('--out='.length);
    } else if (arg === '--out' && i + 1 < argv.length) {
      options.outDir = argv[++i];
    } else {
      throw new Error(`Unknown CLI option: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/build-pages.mjs [options]

Options:
  --discover            List discovered projects and hierarchy without building
  --check               Run static GitHub Pages compatibility checks
  --base-path <path>    Site root base path (e.g. /oneshot-html)
  --project <path>      Build only projects matching this relative path
  --out <dir>           Output directory (default: _site)
  --strict-pm           Fail if the lockfile package manager is missing in PATH
  --skip-install        Skip dependency install if node_modules already exists
  -h, --help            Show this help message
`);
}

function detectGitHubInfo(rootDir) {
  const envRepo = process.env.GITHUB_REPOSITORY?.trim();
  if (envRepo && envRepo.includes('/')) {
    return {
      repoName: envRepo.split('/')[1],
      githubRepoUrl: `https://github.com/${envRepo}`,
    };
  }

  const remote = spawnSync('git', ['config', '--get', 'remote.origin.url'], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (remote.status === 0 && remote.stdout) {
    const rawUrl = remote.stdout.trim();
    const match = rawUrl.match(/github\.com[:/]([^/]+)\/([^/.]+?)(?:\.git)?$/i);
    if (match) {
      return {
        repoName: match[2],
        githubRepoUrl: `https://github.com/${match[1]}/${match[2]}`,
      };
    }
  }

  return {
    repoName: path.basename(rootDir),
    githubRepoUrl: '',
  };
}

function printDiscoveryReport(workspace) {
  console.log(`Discovered ${workspace.projects.length} project(s):`);
  for (const project of workspace.projects) {
    const label = FRAMEWORK_LABELS[project.framework] ?? project.framework;
    const pmInfo = project.packageManager ? ` [pm: ${project.packageManager.name}]` : '';
    console.log(`  - ${project.relPath} (${label})${pmInfo} -> "${project.title}"`);
  }
  if (workspace.ignored.length > 0) {
    console.log(`\nIgnored (${workspace.ignored.length}):`);
    for (const item of workspace.ignored) {
      console.log(`  - ${item.relPath} (${item.reason})`);
    }
  }
}

function printFindings(findings) {
  let errors = 0;
  let warnings = 0;
  for (const item of findings) {
    const prefix = item.level === 'error' ? '[ERROR]' : '[WARN] ';
    if (item.level === 'error') {
      errors += 1;
    } else {
      warnings += 1;
    }
    console.log(`${prefix} ${item.projectId}: ${item.message}`);
    if (item.hint) {
      console.log(`        Hint: ${item.hint}`);
    }
  }
  return { errors, warnings };
}

/**
 * Runs discovery, compatibility checks, static/Node builds, and catalog index generation.
 */
export async function buildPages({
  rootDir = process.cwd(),
  outDir = '_site',
  basePath = '',
  projectFilter = '',
  discoverOnly = false,
  checkOnly = false,
  strictPm = false,
  skipInstall = false,
} = {}) {
  const absRoot = path.resolve(rootDir);
  const siteBasePath = normalizeSiteBasePath(basePath);
  const workspace = await discoverWorkspace(absRoot);
  const selectedProjects = filterProjects(workspace.projects, projectFilter);

  if (discoverOnly) {
    printDiscoveryReport(workspace);
    return { workspace, selectedProjects, findings: [], results: [] };
  }

  const findings = await checkProjects(selectedProjects);
  if (checkOnly) {
    if (findings.length === 0) {
      console.log(`All ${selectedProjects.length} project(s) passed GitHub Pages checks.`);
    } else {
      const { errors, warnings } = printFindings(findings);
      console.log(`\nCheck summary: ${errors} error(s), ${warnings} warning(s).`);
      if (errors > 0) {
        process.exitCode = 1;
      }
    }
    return { workspace, selectedProjects, findings, results: [] };
  }

  if (findings.length > 0) {
    printFindings(findings);
  }

  const outRoot = path.resolve(absRoot, outDir);
  if (!projectFilter) {
    await resetDir(outRoot);
  } else {
    await ensureDir(outRoot);
  }

  const results = await buildSelectedProjects({
    rootDir: absRoot,
    outRoot,
    selectedProjects,
    allProjects: workspace.projects,
    siteBasePath,
    strictPm,
    skipInstall,
  });

  const failed = results.filter((item) => item.status === 'error');
  if (failed.length > 0) {
    console.error(`\nBuild failed for ${failed.length} project(s):`);
    for (const item of failed) {
      console.error(`  - ${item.id}: ${item.error}`);
    }
    throw new Error(`${failed.length} project(s) failed to build.`);
  }

  const tree = buildCategoryTree(workspace.projects, workspace.categories);
  const { repoName, githubRepoUrl } = detectGitHubInfo(absRoot);

  const indexHtml = renderIndexHtml({
    repoName,
    tree,
    projects: workspace.projects,
    githubRepoUrl,
    generatedAtIso: new Date().toISOString(),
  });
  await fs.writeFile(path.join(outRoot, 'index.html'), indexHtml, 'utf8');

  const notFoundHtml = renderNotFoundHtml({ repoName, siteBasePath });
  await fs.writeFile(path.join(outRoot, '404.html'), notFoundHtml, 'utf8');

  // Ensure GitHub Pages does not strip underscore-prefixed assets like Next.js _next/
  await fs.writeFile(path.join(outRoot, '.nojekyll'), '', 'utf8');

  console.log(
    `\nSuccessfully built ${results.length} project(s) into ${path.relative(absRoot, outRoot) || '.'} (basePath="${siteBasePath || '/'}").`,
  );

  return { workspace, selectedProjects, findings, results, outRoot };
}

const isEntryScript =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isEntryScript) {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
  } else {
    buildPages({
      rootDir: process.cwd(),
      outDir: cli.outDir,
      basePath: cli.basePath,
      projectFilter: cli.project,
      discoverOnly: cli.discover,
      checkOnly: cli.check,
      strictPm: cli.strictPm,
      skipInstall: cli.skipInstall,
    }).catch((error) => {
      console.error(`\n[fatal] ${error.message}`);
      process.exit(1);
    });
  }
}
