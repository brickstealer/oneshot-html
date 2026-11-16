import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Converts a platform-specific path into a POSIX-style relative path with forward slashes.
 */
export function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join('/');
}

/**
 * Checks whether a filesystem path exists.
 */
export async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensures a directory exists cleanly.
 */
export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Removes a directory if present and recreates it empty.
 */
export async function resetDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Reads a UTF-8 text file if it exists, otherwise returns null.
 */
export async function readTextOptional(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Reads and parses a JSON file if it exists. Throws a descriptive error on invalid JSON.
 */
export async function readJsonOptional(filePath) {
  const raw = await readTextOptional(filePath);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
  }
}

/**
 * Normalizes a site base path (e.g. "/oneshot-html/" -> "/oneshot-html", "/" -> "").
 */
export function normalizeSiteBasePath(rawBasePath = '') {
  const trimmed = String(rawBasePath ?? '').trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.includes('..')) {
    throw new Error(`Invalid base path "${trimmed}": expected a root-relative path like "/oneshot-html".`);
  }
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, '');
}

/**
 * Resolves the full URL base path for a project directory under the site root.
 */
export function resolveProjectBasePath(siteBasePath, projectRelPath) {
  const normalizedSite = normalizeSiteBasePath(siteBasePath);
  const normalizedProject = toPosixPath(projectRelPath).replace(/^\/+|\/+$/g, '');
  if (!normalizedProject) {
    return normalizedSite;
  }
  return `${normalizedSite}/${normalizedProject}`;
}

/**
 * Escapes HTML special characters for safe interpolation into generated HTML.
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Recursively copies files and subdirectories from srcDir to destDir with optional filtering.
 */
export async function copyFilteredTree(srcDir, destDir, shouldIncludeEntry) {
  await ensureDir(destDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (shouldIncludeEntry && !shouldIncludeEntry(entry)) {
      continue;
    }
    if (entry.isDirectory()) {
      await copyFilteredTree(srcPath, destPath, shouldIncludeEntry);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
