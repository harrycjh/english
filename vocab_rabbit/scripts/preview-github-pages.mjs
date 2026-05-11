import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4173;
const BASE_PATH = '/english/';

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.webp': 'image/webp',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const indexPath = path.join(distDir, 'index.html');

function readArgValue(argv, flag, fallback) {
  const flagIndex = argv.indexOf(flag);
  if (flagIndex === -1) {
    return fallback;
  }

  const nextValue = argv[flagIndex + 1];
  return nextValue && !nextValue.startsWith('--') ? nextValue : fallback;
}

function resolveSafeFile(baseDir, relativePath) {
  const normalizedPath = relativePath ? path.normalize(relativePath) : 'index.html';
  const resolvedPath = path.resolve(baseDir, normalizedPath);

  if (!resolvedPath.startsWith(baseDir)) {
    return null;
  }

  return resolvedPath;
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Type': MIME_TYPES[extension] ?? 'application/octet-stream',
  });

  createReadStream(filePath).pipe(response);
}

if (!existsSync(indexPath)) {
  console.error('Missing dist/index.html. Run npm run build first.');
  process.exit(1);
}

const host = readArgValue(process.argv, '--host', DEFAULT_HOST);
const port = Number.parseInt(readArgValue(process.argv, '--port', `${DEFAULT_PORT}`), 10);

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
  const { pathname } = requestUrl;

  if (pathname === '/') {
    response.writeHead(302, { Location: BASE_PATH });
    response.end();
    return;
  }

  if (pathname === '/english') {
    response.writeHead(302, { Location: BASE_PATH });
    response.end();
    return;
  }

  if (!pathname.startsWith(BASE_PATH)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const relativePath = decodeURIComponent(pathname.slice(BASE_PATH.length));
  const filePath = resolveSafeFile(distDir, relativePath);

  if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(response, filePath);
    return;
  }

  if (relativePath && path.extname(relativePath)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  sendFile(response, indexPath);
});

server.listen(port, host, () => {
  console.log(`  ➜  Local:   http://${host}:${port}${BASE_PATH}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}