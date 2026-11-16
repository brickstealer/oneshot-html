import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  FRAMEWORK_OUTPUT_CANDIDATES,
  IGNORED_DIRS,
  NON_DEPLOY_FILES,
} from './constants.mjs';
import {
  copyFilteredTree,
  ensureDir,
  pathExists,
  readTextOptional,
  resolveProjectBasePath,
} from './fs-utils.mjs';

const commandAvailabilityCache = new Map();

/**
 * Checks whether a CLI tool is installed and reachable in PATH.
 */
export function isCommandAvailable(command) {
  if (commandAvailabilityCache.has(command)) {
    return commandAvailabilityCache.get(command);
  }
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [command], { stdio: 'ignore' });
  const available = result.status === 0;
  commandAvailabilityCache.set(command, available);
  return available;
}

function quoteShellArg(arg) {
  if (/^[a-zA-Z0-9_./:=+-]+$/.test(arg)) {
    return arg;
  }
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

function runProcess(command, args, { cwd, env, shell = false }) {
  return new Promise((resolve, reject) => {
    const useSingleCommandString = shell && args.length > 0;
    const spawnCmd = useSingleCommandString
      ? [command, ...args.map(quoteShellArg)].join(' ')
      : command;
    const spawnArgs = useSingleCommandString ? [] : args;

    const child = spawn(spawnCmd, spawnArgs, {
      cwd,
      env,
      shell,
      stdio: 'inherit',
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command "${[command, ...args].join(' ')}" exited with code ${code}`));
      }
    });
  });
}

function resolvePackageManagerForBuild(project, { strictPm }) {
  const preferred = project.packageManager?.name ?? 'npm';
  if (isCommandAvailable(preferred)) {
    return { pm: preferred, fellBack: false };
  }
  if (strictPm) {
    throw new Error(
      `Required package manager "${preferred}" (from ${project.packageManager?.source}) was not found in PATH.`,
    );
  }
  if (!isCommandAvailable('npm')) {
    throw new Error('Neither the preferred package manager nor "npm" was found in PATH.');
  }
  console.warn(
    `[warn] ${project.id}: "${preferred}" not found in PATH, falling back to "npm" locally.`,
  );
  return { pm: 'npm', fellBack: true };
}

function getInstallCommandSpec(pm, project, fellBack) {
  if (project.config?.installCommand) {
    return { command: project.config.installCommand, args: [], shell: true };
  }
  const winShell = process.platform === 'win32';
  switch (pm) {
    case 'bun':
      return { command: 'bun', args: ['install'], shell: winShell };
    case 'pnpm':
      return { command: 'pnpm', args: ['install'], shell: winShell };
    case 'yarn':
      return { command: 'yarn', args: ['install'], shell: winShell };
    case 'npm':
    default: {
      const args = ['install', '--no-audit', '--no-fund'];
      if (fellBack) {
        args.push('--no-package-lock');
      }
      return { command: 'npm', args, shell: winShell };
    }
  }
}

async function shouldPassViteBaseFlag(project) {
  if (project.framework !== 'vite') {
    return false;
  }
  const buildScript = project.pkgJson?.scripts?.build ?? '';
  if (!/\bvite\s+build\b/.test(buildScript)) {
    return false;
  }
  if (/\bvite\s+build\b[^;&|]*(?:&&|\|\||;)/.test(buildScript)) {
    return false;
  }

  for (const name of ['vite.config.ts', 'vite.config.mjs', 'vite.config.js']) {
    const text = await readTextOptional(path.join(project.absPath, name));
    if (text && /(?:\bbase\s*:|\{\s*base\b|,\s*base\b)/.test(text)) {
      return false;
    }
  }
  return true;
}

async function getBuildCommandSpec(pm, project, projectBasePath) {
  if (project.config?.buildCommand) {
    return { command: project.config.buildCommand, args: [], shell: true };
  }

  const winShell = process.platform === 'win32';
  const passViteBase = await shouldPassViteBaseFlag(project);
  const extraArgs = passViteBase ? ['--', `--base=${projectBasePath}/`] : [];

  return {
    command: pm,
    args: ['run', 'build', ...extraArgs],
    shell: winShell,
  };
}

async function resolveNodeOutputDir(project) {
  if (project.config?.outputDir) {
    const explicitDir = path.resolve(project.absPath, project.config.outputDir);
    if (!(await pathExists(explicitDir))) {
      throw new Error(
        `Configured outputDir "${project.config.outputDir}" does not exist after build.`,
      );
    }
    return explicitDir;
  }

  const candidates =
    FRAMEWORK_OUTPUT_CANDIDATES[project.framework] ?? FRAMEWORK_OUTPUT_CANDIDATES.node;

  for (const candidate of candidates) {
    const candidatePath = path.join(project.absPath, candidate);
    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  throw new Error(
    `Could not locate build output directory for ${project.id}. Checked: ${candidates.join(', ')}. Set "outputDir" in gh-pages.json if custom.`,
  );
}

/**
 * Builds a single Node.js frontend project and copies its static bundle to outRoot.
 */
async function buildNodeProject(project, outRoot, options) {
  const projectBasePath = resolveProjectBasePath(options.siteBasePath, project.relPath);
  const { pm, fellBack } = resolvePackageManagerForBuild(project, { strictPm: options.strictPm });

  const env = {
    ...process.env,
    CI: 'true',
    PAGES_BASE_PATH: projectBasePath,
    NEXT_PUBLIC_BASE_PATH: projectBasePath,
    PUBLIC_URL: projectBasePath,
    VITE_BASE_PATH: `${projectBasePath}/`,
  };

  const nodeModulesExists = await pathExists(path.join(project.absPath, 'node_modules'));
  if (!(options.skipInstall && nodeModulesExists)) {
    const installSpec = getInstallCommandSpec(pm, project, fellBack);
    console.log(`  -> Installing dependencies with ${pm}...`);
    await runProcess(installSpec.command, installSpec.args, {
      cwd: project.absPath,
      env,
      shell: installSpec.shell,
    });
  } else {
    console.log('  -> Skipping install (--skip-install and node_modules present)');
  }

  const buildSpec = await getBuildCommandSpec(pm, project, projectBasePath);
  console.log(`  -> Building with ${pm} (basePath=${projectBasePath || '/'})...`);
  await runProcess(buildSpec.command, buildSpec.args, {
    cwd: project.absPath,
    env,
    shell: buildSpec.shell,
  });

  const buildOutputDir = await resolveNodeOutputDir(project);
  const entryFile = project.config?.entry || 'index.html';
  if (!(await pathExists(path.join(buildOutputDir, entryFile)))) {
    throw new Error(
      `Build output at ${buildOutputDir} does not contain "${entryFile}". Ensure static export is configured (e.g. Next.js output: "export").`,
    );
  }

  const destDir = path.join(outRoot, ...project.relPath.split('/'));
  await fs.rm(destDir, { recursive: true, force: true });
  await copyFilteredTree(buildOutputDir, destDir, (entry) => entry.name !== '.git');
  console.log(`  -> Published ${path.relative(project.absPath, buildOutputDir)} -> _site/${project.relPath}/`);
}

function shouldIncludeStaticSourceEntry(entry) {
  if (entry.name.startsWith('.')) {
    return false;
  }
  if (entry.isDirectory()) {
    return !IGNORED_DIRS.has(entry.name);
  }
  if (NON_DEPLOY_FILES.has(entry.name) || /\.gh-pages\.json$/i.test(entry.name)) {
    return false;
  }
  return true;
}

/**
 * Copies a multi-file static HTML folder project into _site.
 */
async function buildStaticSiteProject(project, outRoot) {
  const destDir = path.join(outRoot, ...project.relPath.split('/'));
  await fs.rm(destDir, { recursive: true, force: true });
  await copyFilteredTree(project.absPath, destDir, shouldIncludeStaticSourceEntry);
  console.log(`  -> Copied static app -> _site/${project.relPath}/`);
}

/**
 * Copies standalone HTML files and sibling non-project assets for category directories.
 */
async function buildStaticHtmlProject(project, outRoot, rootDir, copiedStaticDirs, allProjects) {
  const destFile = path.join(outRoot, ...project.relPath.split('/'));
  await ensureDir(path.dirname(destFile));
  await fs.copyFile(project.absPath, destFile);

  const dirRel = project.dirRelPath ?? '';
  if (copiedStaticDirs.has(dirRel)) {
    return;
  }
  copiedStaticDirs.add(dirRel);

  const srcDir = dirRel ? path.join(rootDir, ...dirRel.split('/')) : rootDir;
  const destDir = dirRel ? path.join(outRoot, ...dirRel.split('/')) : outRoot;
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isSymbolicLink() || !shouldIncludeStaticSourceEntry(entry)) {
      continue;
    }
    const childRel = dirRel ? `${dirRel}/${entry.name}` : entry.name;
    if (entry.isFile()) {
      // Skip root index/404 and .html files (handled individually per project)
      if (/\.html?$/i.test(entry.name)) {
        continue;
      }
      await fs.copyFile(path.join(srcDir, entry.name), path.join(destDir, entry.name));
    } else if (entry.isDirectory()) {
      const containsProjects = allProjects.some(
        (other) => other.relPath === childRel || other.relPath.startsWith(`${childRel}/`),
      );
      if (!containsProjects) {
        await copyFilteredTree(
          path.join(srcDir, entry.name),
          path.join(destDir, entry.name),
          shouldIncludeStaticSourceEntry,
        );
      }
    }
  }
  console.log(`  -> Copied HTML -> _site/${project.relPath}`);
}

/**
 * Executes builds for all selected projects and returns a per-project result summary.
 */
export async function buildSelectedProjects({
  rootDir,
  outRoot,
  selectedProjects,
  allProjects,
  siteBasePath,
  strictPm = false,
  skipInstall = false,
  ciGroups = Boolean(process.env.GITHUB_ACTIONS),
}) {
  const results = [];
  const copiedStaticDirs = new Set();

  for (const project of selectedProjects) {
    const startMs = Date.now();
    const label = `[${project.framework}] ${project.relPath}`;
    if (ciGroups) {
      console.log(`::group::Build ${label}`);
    } else {
      console.log(`\n==> Building ${label}`);
    }

    try {
      if (project.kind === 'node') {
        await buildNodeProject(project, outRoot, {
          siteBasePath,
          strictPm,
          skipInstall,
        });
      } else if (project.kind === 'static-site') {
        await buildStaticSiteProject(project, outRoot);
      } else {
        await buildStaticHtmlProject(project, outRoot, rootDir, copiedStaticDirs, allProjects);
      }

      results.push({
        id: project.id,
        framework: project.framework,
        status: 'ok',
        durationMs: Date.now() - startMs,
      });
    } catch (error) {
      console.error(`[error] Failed building ${project.id}: ${error.message}`);
      results.push({
        id: project.id,
        framework: project.framework,
        status: 'error',
        durationMs: Date.now() - startMs,
        error: error.message,
      });
    } finally {
      if (ciGroups) {
        console.log('::endgroup::');
      }
    }
  }

  return results;
}
