/**
 * Shared constants for project discovery, building, and static generation.
 */

export const PROJECT_CONFIG_FILE = 'gh-pages.json';
export const CATEGORY_CONFIG_FILE = '_category.json';

export const IGNORED_DIRS = new Set([
  '.git',
  '.github',
  '.gemini',
  '.aistudio',
  '.vscode',
  '.idea',
  'node_modules',
  'scripts',
  '_site',
  '.pages-cache',
  '.next',
  'out',
  'dist',
  'build',
  '.turbo',
  '.astro',
  '.svelte-kit',
  '.nuxt',
  '.output',
  'coverage',
]);

export const NON_DEPLOY_FILES = new Set([
  PROJECT_CONFIG_FILE,
  CATEGORY_CONFIG_FILE,
  'README.md',
  'AGENTS.md',
  'LICENSE',
  'CNAME',
  '.gitignore',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.prettierrc',
  'package.json',
  'package-lock.json',
  'bun.lock',
  'bun.lockb',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.json',
  'next-env.d.ts',
]);

export const FRAMEWORK_LABELS = {
  html: 'HTML',
  'html-app': 'HTML App',
  next: 'Next.js',
  vite: 'Vite',
  astro: 'Astro',
  cra: 'CRA',
  node: 'Node.js',
};

export const FRAMEWORK_OUTPUT_CANDIDATES = {
  next: ['out', 'dist'],
  vite: ['dist', 'out', 'build'],
  astro: ['dist', 'out'],
  cra: ['build', 'dist'],
  node: ['dist', 'out', 'build', 'public'],
};
