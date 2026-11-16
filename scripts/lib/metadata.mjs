import path from 'node:path';
import {
  CATEGORY_CONFIG_FILE,
  PROJECT_CONFIG_FILE,
} from './constants.mjs';
import { pathExists, readJsonOptional, readTextOptional } from './fs-utils.mjs';

const ENTITY_MAP = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&mdash;': '—',
  '&ndash;': '–',
  '&nbsp;': ' ',
};

/**
 * Decodes common named and numeric HTML entities and collapses whitespace.
 */
export function decodeHtmlText(text) {
  return String(text ?? '')
    .replace(/&(amp|lt|gt|quot|apos|mdash|ndash|nbsp|#39);/gi, (match) => {
      const lower = match.toLowerCase();
      return ENTITY_MAP[lower] ?? match;
    })
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts <title> and <meta name="description"> from an HTML document string.
 */
export function parseHtmlMetadata(html) {
  if (!html) {
    return { title: '', description: '' };
  }

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlText(titleMatch[1]) : '';

  let description = '';
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const nameMatch = tag.match(/\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const nameVal = (nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3] ?? '').toLowerCase();
    if (nameVal !== 'description') {
      continue;
    }
    const contentMatch = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (contentMatch) {
      description = decodeHtmlText(contentMatch[1] ?? contentMatch[2] ?? '');
      break;
    }
  }

  return { title, description };
}

/**
 * Extracts the first Markdown H1 heading from README text.
 */
export function parseMarkdownTitle(markdown) {
  if (!markdown) {
    return '';
  }
  const match = markdown.match(/^\s*#\s+(.+?)\s*$/m);
  return match ? match[1].replace(/`+/g, '').trim() : '';
}

/**
 * Formats a folder or file slug into a clean fallback display title.
 */
export function formatFallbackTitle(slug) {
  return slug
    .replace(/\.html?$/i, '')
    .trim();
}

/**
 * Validates and loads an optional gh-pages.json file from a directory.
 */
export async function readProjectConfig(dirPath) {
  const configPath = path.join(dirPath, PROJECT_CONFIG_FILE);
  const config = await readJsonOptional(configPath);
  if (config === null) {
    return null;
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`Invalid ${PROJECT_CONFIG_FILE} at ${configPath}: expected a JSON object.`);
  }
  return config;
}

/**
 * Validates and loads an optional _category.json file from a directory.
 */
export async function readCategoryConfig(dirPath) {
  const configPath = path.join(dirPath, CATEGORY_CONFIG_FILE);
  const config = await readJsonOptional(configPath);
  if (config === null) {
    return null;
  }
  if (typeof config !== 'object' || Array.isArray(config)) {
    throw new Error(`Invalid ${CATEGORY_CONFIG_FILE} at ${configPath}: expected a JSON object.`);
  }
  return config;
}

/**
 * Detects the frontend framework used by a Node.js project.
 */
export async function detectFramework(projectDir, pkgJson, configOverride) {
  if (configOverride?.framework) {
    return configOverride.framework;
  }
  const deps = {
    ...(pkgJson?.dependencies ?? {}),
    ...(pkgJson?.devDependencies ?? {}),
  };

  if (
    deps.next ||
    (await pathExists(path.join(projectDir, 'next.config.ts'))) ||
    (await pathExists(path.join(projectDir, 'next.config.mjs'))) ||
    (await pathExists(path.join(projectDir, 'next.config.js')))
  ) {
    return 'next';
  }
  if (
    deps.astro ||
    (await pathExists(path.join(projectDir, 'astro.config.mjs'))) ||
    (await pathExists(path.join(projectDir, 'astro.config.ts')))
  ) {
    return 'astro';
  }
  if (
    deps.vite ||
    (await pathExists(path.join(projectDir, 'vite.config.ts'))) ||
    (await pathExists(path.join(projectDir, 'vite.config.js'))) ||
    (await pathExists(path.join(projectDir, 'vite.config.mjs')))
  ) {
    return 'vite';
  }
  if (deps['react-scripts']) {
    return 'cra';
  }
  return 'node';
}

/**
 * Detects the preferred package manager from gh-pages.json, package.json, or lockfiles.
 */
export async function detectPackageManager(projectDir, pkgJson, configOverride) {
  if (configOverride?.packageManager) {
    return { name: configOverride.packageManager, source: PROJECT_CONFIG_FILE };
  }

  if (typeof pkgJson?.packageManager === 'string') {
    const pmName = pkgJson.packageManager.split('@')[0].trim();
    if (['npm', 'bun', 'pnpm', 'yarn'].includes(pmName)) {
      return { name: pmName, source: 'package.json' };
    }
  }

  const lockCandidates = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['bun.lock', 'bun'],
    ['bun.lockb', 'bun'],
    ['package-lock.json', 'npm'],
  ];

  for (const [lockFile, pmName] of lockCandidates) {
    if (await pathExists(path.join(projectDir, lockFile))) {
      return { name: pmName, source: lockFile };
    }
  }

  return { name: 'npm', source: 'default' };
}

/**
 * Resolves display metadata (title, description, tags, order) for a folder-based project.
 */
export async function resolveFolderProjectMetadata(projectDir, folderName, { pkgJson, projectConfig }) {
  const aiStudioMeta = await readJsonOptional(path.join(projectDir, 'metadata.json'));
  const indexHtml = await readTextOptional(path.join(projectDir, 'index.html'));
  const htmlMeta = parseHtmlMetadata(indexHtml);
  const readmeText = await readTextOptional(path.join(projectDir, 'README.md'));
  const readmeTitle = parseMarkdownTitle(readmeText);

  const pkgName = pkgJson?.name && pkgJson.name !== 'ai-studio-applet' ? pkgJson.name : '';

  const title =
    projectConfig?.title ||
    aiStudioMeta?.name ||
    htmlMeta.title ||
    pkgName ||
    readmeTitle ||
    formatFallbackTitle(folderName);

  const description =
    projectConfig?.description ||
    aiStudioMeta?.description ||
    htmlMeta.description ||
    pkgJson?.description ||
    '';

  const tags = Array.isArray(projectConfig?.tags)
    ? projectConfig.tags.map((tag) => String(tag))
    : [];

  const order = typeof projectConfig?.order === 'number' ? projectConfig.order : 0;

  return { title, description, tags, order };
}
