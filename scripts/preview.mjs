import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { normalizeSiteBasePath } from './lib/fs-utils.mjs';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.map': 'application/json; charset=utf-8',
};

function parsePreviewArgs(argv) {
  const options = {
    dir: '_site',
    basePath: '',
    port: 4173,
    host: '127.0.0.1',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--base-path=')) {
      options.basePath = arg.slice('--base-path='.length);
    } else if (arg === '--base-path' && i + 1 < argv.length) {
      options.basePath = argv[++i];
    } else if (arg.startsWith('--port=')) {
      options.port = Number(arg.slice('--port='.length));
    } else if (arg === '--port' && i + 1 < argv.length) {
      options.port = Number(argv[++i]);
    } else if (arg.startsWith('--dir=')) {
      options.dir = arg.slice('--dir='.length);
    } else if (arg === '--dir' && i + 1 < argv.length) {
      options.dir = argv[++i];
    }
  }
  return options;
}

async function statOptional(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

const opts = parsePreviewArgs(process.argv.slice(2));
const siteDir = path.resolve(process.cwd(), opts.dir);
const basePath = normalizeSiteBasePath(opts.basePath);

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  let pathname;
  try {
    pathname = decodeURIComponent(reqUrl.pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  if (basePath) {
    if (pathname === '/' || pathname === basePath) {
      res.writeHead(302, { Location: `${basePath}/` });
      res.end();
      return;
    }
    if (!pathname.startsWith(`${basePath}/`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Not found. Site is mounted at ${basePath}/`);
      return;
    }
    pathname = pathname.slice(basePath.length);
  }

  const safeRel = path.posix.normalize(pathname).replace(/^\/+/, '');
  const resolvedPath = path.resolve(siteDir, safeRel);
  const insideSiteDir =
    resolvedPath === siteDir || resolvedPath.startsWith(`${siteDir}${path.sep}`);
  if (!insideSiteDir) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let fileStat = await statOptional(resolvedPath);
  let targetFile = resolvedPath;

  if (fileStat?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(302, { Location: `${basePath}${pathname}/` });
      res.end();
      return;
    }
    targetFile = path.join(resolvedPath, 'index.html');
    fileStat = await statOptional(targetFile);
  } else if (!fileStat) {
    // Support clean URLs like /foo -> /foo/index.html or /foo.html
    const htmlCandidate = `${resolvedPath}.html`;
    const htmlStat = await statOptional(htmlCandidate);
    if (htmlStat?.isFile()) {
      targetFile = htmlCandidate;
      fileStat = htmlStat;
    }
  }

  if (fileStat?.isFile()) {
    const content = await fs.readFile(targetFile);
    res.writeHead(200, { 'Content-Type': getMimeType(targetFile) });
    res.end(content);
    return;
  }

  const notFoundPath = path.join(siteDir, '404.html');
  const notFoundStat = await statOptional(notFoundPath);
  if (notFoundStat?.isFile()) {
    const content = await fs.readFile(notFoundPath);
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(content);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found');
});

server.listen(opts.port, opts.host, () => {
  const mount = basePath ? `${basePath}/` : '/';
  console.log(`Preview server running at http://${opts.host}:${opts.port}${mount}`);
  console.log(`Serving directory: ${siteDir}`);
});
