import fs from 'node:fs/promises';
import path from 'node:path';
import { pathExists, readTextOptional } from './fs-utils.mjs';

async function findConfigFile(projectDir, candidates) {
  for (const candidate of candidates) {
    const fullPath = path.join(projectDir, candidate);
    if (await pathExists(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

async function checkNextProject(project, findings) {
  const configPath = await findConfigFile(project.absPath, [
    'next.config.ts',
    'next.config.mjs',
    'next.config.js',
    'next.config.cjs',
  ]);

  if (!configPath) {
    findings.push({
      level: 'error',
      projectId: project.id,
      message: 'Missing next.config.* file.',
      hint: 'Add next.config.ts with output: "export", images: { unoptimized: true }, and basePath.',
    });
    return;
  }

  const configText = (await readTextOptional(configPath)) ?? '';
  if (!/output\s*:\s*['"]export['"]/.test(configText)) {
    findings.push({
      level: 'error',
      projectId: project.id,
      message: `${path.basename(configPath)} does not configure output: "export".`,
      hint: 'GitHub Pages only hosts static files. Replace output: "standalone" (or default) with output: "export".',
    });
  }

  if (!/(?:\bbasePath\s*:|\{\s*basePath\b|,\s*basePath\b)/.test(configText)) {
    findings.push({
      level: 'warn',
      projectId: project.id,
      message: `${path.basename(configPath)} has no basePath configuration.`,
      hint: 'Read process.env.NEXT_PUBLIC_BASE_PATH || process.env.PAGES_BASE_PATH || "" so assets work under /<repo>/<project>/.',
    });
  }

  if (!/unoptimized\s*:\s*true/.test(configText)) {
    findings.push({
      level: 'warn',
      projectId: project.id,
      message: `${path.basename(configPath)} does not set images: { unoptimized: true }.`,
      hint: 'Static Next.js exports require images: { unoptimized: true } if next/image is used.',
    });
  }

  const apiCandidates = ['app/api', 'src/app/api', 'pages/api', 'src/pages/api'];
  for (const relApi of apiCandidates) {
    if (await pathExists(path.join(project.absPath, relApi))) {
      findings.push({
        level: 'warn',
        projectId: project.id,
        message: `Detected server route directory "${relApi}".`,
        hint: 'GitHub Pages cannot execute Next.js API routes. Move logic client-side or remove unused API routes.',
      });
    }
  }
}

async function checkViteProject(project, findings) {
  const configPath = await findConfigFile(project.absPath, [
    'vite.config.ts',
    'vite.config.mjs',
    'vite.config.js',
  ]);
  if (!configPath) {
    return;
  }
  const configText = (await readTextOptional(configPath)) ?? '';
  if (/\bbase\s*:\s*['"]\/['"]/.test(configText)) {
    findings.push({
      level: 'warn',
      projectId: project.id,
      message: `${path.basename(configPath)} hardcodes base: "/".`,
      hint: 'Use process.env.PAGES_BASE_PATH ? `${process.env.PAGES_BASE_PATH}/` : "./" so sub-path deployment works.',
    });
  }
}

async function checkHtmlForRootPaths(htmlPath, projectId, findings) {
  const html = await readTextOptional(htmlPath);
  if (!html) {
    return;
  }
  const rootAssetPattern = /\b(?:src|href)\s*=\s*["']\/(?!\/)[^"']*["']|\bfetch\s*\(\s*["']\/(?!\/)/i;
  if (rootAssetPattern.test(html)) {
    findings.push({
      level: 'warn',
      projectId,
      message: `${path.basename(htmlPath)} contains root-relative URLs ("/...").`,
      hint: 'Replace "/..." with relative paths ("./...") so the project works inside /<repo>/<project>/.',
    });
  }
}

/**
 * Validates discovered projects for GitHub Pages static hosting compatibility.
 */
export async function checkProjects(projects) {
  const findings = [];

  for (const project of projects) {
    if (project.kind === 'node') {
      const hasBuildScript = Boolean(project.pkgJson?.scripts?.build || project.config?.buildCommand);
      if (!hasBuildScript) {
        findings.push({
          level: 'error',
          projectId: project.id,
          message: 'No "build" script in package.json and no "buildCommand" in gh-pages.json.',
          hint: 'Add a static build script or set "ignore": true in gh-pages.json.',
        });
      }

      if (project.framework === 'next') {
        await checkNextProject(project, findings);
      } else if (project.framework === 'vite') {
        await checkViteProject(project, findings);
      }

      // Warn if client code appears to reference non-public env vars
      for (const codeDir of ['app', 'src', 'components', 'pages']) {
        const fullDir = path.join(project.absPath, codeDir);
        if (await pathExists(fullDir)) {
          await scanDirForSecretsWarning(fullDir, project.id, findings);
        }
      }
    } else if (project.kind === 'static-html') {
      await checkHtmlForRootPaths(project.absPath, project.id, findings);
    } else if (project.kind === 'static-site') {
      const entry = project.config?.entry || 'index.html';
      const entryPath = path.join(project.absPath, entry);
      if (await pathExists(entryPath)) {
        await checkHtmlForRootPaths(entryPath, project.id, findings);
      }
    }
  }

  return findings;
}

async function scanDirForSecretsWarning(dirPath, projectId, findings) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await scanDirForSecretsWarning(fullPath, projectId, findings);
      continue;
    }
    if (!/\.(tsx?|jsx?|mjs)$/i.test(entry.name)) {
      continue;
    }
    const content = (await readTextOptional(fullPath)) ?? '';
    const matches = content.match(/\bprocess\.env\.([A-Z0-9_]+)/g) ?? [];
    for (const match of matches) {
      const varName = match.replace('process.env.', '');
      if (
        varName === 'NODE_ENV' ||
        varName.startsWith('NEXT_PUBLIC_') ||
        varName.startsWith('VITE_') ||
        varName === 'PAGES_BASE_PATH'
      ) {
        continue;
      }
      findings.push({
        level: 'warn',
        projectId,
        message: `${entry.name} references process.env.${varName}.`,
        hint: 'Static builds cannot use server secrets at runtime. Move to user-provided input or remove unused server code.',
      });
    }
  }
}
