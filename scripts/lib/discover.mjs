import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CATEGORY_CONFIG_FILE,
  IGNORED_DIRS,
  NON_DEPLOY_FILES,
  PROJECT_CONFIG_FILE,
} from './constants.mjs';
import { pathExists, readJsonOptional, readTextOptional, toPosixPath } from './fs-utils.mjs';
import {
  detectFramework,
  detectPackageManager,
  formatFallbackTitle,
  parseHtmlMetadata,
  readCategoryConfig,
  readProjectConfig,
  resolveFolderProjectMetadata,
} from './metadata.mjs';

function isHiddenName(name) {
  return name.startsWith('.');
}

function shouldSkipDir(dirName) {
  return isHiddenName(dirName) || IGNORED_DIRS.has(dirName);
}

/**
 * Checks whether a directory (or any parent) should be skipped during scanning.
 */
function parseKeywordsMeta(html) {
  if (!html) {
    return [];
  }
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const nameMatch = tag.match(/\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const nameVal = (nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3] ?? '').toLowerCase();
    if (nameVal !== 'keywords') {
      continue;
    }
    const contentMatch = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const raw = contentMatch?.[1] ?? contentMatch?.[2] ?? '';
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Recursively discovers static HTML projects, static-site folders, and Node.js frontend projects.
 */
export async function discoverWorkspace(rootDir) {
  const absRoot = path.resolve(rootDir);
  const projects = [];
  const ignored = [];
  const categories = new Map();
  const staticDirsWithHtml = new Set();

  async function scanDir(absDir, relDir) {
    if (relDir !== '') {
      const categoryConfig = await readCategoryConfig(absDir);
      if (categoryConfig) {
        categories.set(relDir, categoryConfig);
        if (categoryConfig.ignore === true) {
          ignored.push({ relPath: relDir, reason: `${CATEGORY_CONFIG_FILE}: ignore=true` });
          return;
        }
      }

      const projectConfig = await readProjectConfig(absDir);
      if (projectConfig?.ignore === true) {
        ignored.push({ relPath: relDir, reason: `${PROJECT_CONFIG_FILE}: ignore=true` });
        return;
      }

      const pkgJson = await readJsonOptional(path.join(absDir, 'package.json'));
      const entryFile = projectConfig?.entry || 'index.html';
      const hasEntryHtml = await pathExists(path.join(absDir, entryFile));

      if (pkgJson || projectConfig?.type === 'node') {
        const framework = await detectFramework(absDir, pkgJson, projectConfig);
        const packageManager = await detectPackageManager(absDir, pkgJson, projectConfig);
        const meta = await resolveFolderProjectMetadata(absDir, path.basename(absDir), {
          pkgJson,
          projectConfig,
        });
        const parts = relDir.split('/');

        projects.push({
          id: relDir,
          kind: 'node',
          framework,
          relPath: relDir,
          absPath: absDir,
          urlRelPath: `${relDir}/`,
          categoryParts: parts.slice(0, -1),
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          order: meta.order,
          packageManager,
          pkgJson,
          config: projectConfig ?? {},
        });
        return;
      }

      if (hasEntryHtml || projectConfig?.type === 'static') {
        const meta = await resolveFolderProjectMetadata(absDir, path.basename(absDir), {
          pkgJson: null,
          projectConfig,
        });
        const parts = relDir.split('/');

        projects.push({
          id: relDir,
          kind: 'static-site',
          framework: 'html-app',
          relPath: relDir,
          absPath: absDir,
          urlRelPath: entryFile === 'index.html' ? `${relDir}/` : `${relDir}/${entryFile}`,
          categoryParts: parts.slice(0, -1),
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          order: meta.order,
          packageManager: null,
          pkgJson: null,
          config: projectConfig ?? {},
        });
        return;
      }
    }

    const entries = await fs.readdir(absDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name)) {
          continue;
        }
        const childAbs = path.join(absDir, entry.name);
        const childRel = relDir ? `${relDir}/${entry.name}` : entry.name;
        await scanDir(childAbs, childRel);
      } else if (entry.isFile()) {
        if (isHiddenName(entry.name) || NON_DEPLOY_FILES.has(entry.name)) {
          continue;
        }
        if (!/\.html?$/i.test(entry.name)) {
          continue;
        }
        if (relDir === '' && /^(index|404)\.html?$/i.test(entry.name)) {
          continue;
        }

        const fileAbs = path.join(absDir, entry.name);
        const fileRel = relDir ? `${relDir}/${entry.name}` : entry.name;
        const sidecarPath = `${fileAbs.replace(/\.html?$/i, '')}.gh-pages.json`;
        const sidecarConfig = await readJsonOptional(sidecarPath);

        if (sidecarConfig?.ignore === true) {
          ignored.push({ relPath: fileRel, reason: `${path.basename(sidecarPath)}: ignore=true` });
          continue;
        }

        const htmlContent = await readTextOptional(fileAbs);
        const htmlMeta = parseHtmlMetadata(htmlContent);
        const htmlKeywords = parseKeywordsMeta(htmlContent);

        staticDirsWithHtml.add(relDir);

        projects.push({
          id: fileRel,
          kind: 'static-html',
          framework: 'html',
          relPath: fileRel,
          absPath: fileAbs,
          dirRelPath: relDir,
          urlRelPath: fileRel,
          categoryParts: relDir ? relDir.split('/') : [],
          title: sidecarConfig?.title || htmlMeta.title || formatFallbackTitle(entry.name),
          description: sidecarConfig?.description || htmlMeta.description || '',
          tags: Array.isArray(sidecarConfig?.tags)
            ? sidecarConfig.tags.map((t) => String(t))
            : htmlKeywords,
          order: typeof sidecarConfig?.order === 'number' ? sidecarConfig.order : 0,
          packageManager: null,
          pkgJson: null,
          config: sidecarConfig ?? {},
        });
      }
    }
  }

  await scanDir(absRoot, '');

  // Sort projects deterministically for clean console output
  projects.sort((a, b) => a.relPath.localeCompare(b.relPath));

  return {
    rootDir: absRoot,
    projects,
    ignored,
    categories,
    staticDirsWithHtml: Array.from(staticDirsWithHtml).sort(),
  };
}

/**
 * Filters projects by relative path prefix or exact id.
 */
export function filterProjects(projects, projectFilter) {
  if (!projectFilter) {
    return projects;
  }
  const normalizedFilter = toPosixPath(projectFilter).replace(/^\/+|\/+$/g, '');
  const matched = projects.filter(
    (project) =>
      project.relPath === normalizedFilter ||
      project.relPath.startsWith(`${normalizedFilter}/`),
  );
  if (matched.length === 0) {
    throw new Error(`No projects matched filter "${projectFilter}". Run "npm run discover" to list available projects.`);
  }
  return matched;
}
