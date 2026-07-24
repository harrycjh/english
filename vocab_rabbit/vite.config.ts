import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isLoopbackAddress } from './scripts/dev-life-photo-access.mjs';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const devLifePhotosDir = path.join(rootDir, 'dev-life-photos');

interface RelatedMedia {
  oxford?: unknown;
  lifePhoto?: unknown;
}

interface ManifestEntry {
  wordId: string;
  relatedMedia: RelatedMedia;
}

interface RelatedMediaManifest {
  schemaVersion?: number;
  generatedAt?: string;
  stats?: Record<string, unknown>;
  entries?: ManifestEntry[];
}

function readManifest(file: string): RelatedMediaManifest {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as RelatedMediaManifest;
  } catch {
    return {};
  }
}

/**
 * Dev-only plugin: makes personal life photos visible during local development
 * without ever bundling them into the production build.
 *
 * - Serves `/life-photos/*` image files straight from the gitignored
 *   `dev-life-photos/` folder.
 * - Intercepts the related-media manifest request and returns the shipped
 *   (oxford-only) manifest merged with the local life-photo entries.
 *
 * Because `apply: 'serve'`, this never runs during `vite build`, and the
 * `dev-life-photos/` folder lives outside `public/`, so the photos are never
 * copied into `dist/` or uploaded. On iPad the photos still require a manual
 * import via Settings.
 */
function devLifePhotosPlugin(): Plugin {
  const contentTypes: Record<string, string> = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };

  return {
    name: 'vocab-rabbit-dev-life-photos',
    apply: 'serve',
    configureServer(server) {
      const photosRoot = path.join(devLifePhotosDir, 'life-photos');
      const localManifestFile = path.join(devLifePhotosDir, 'word_related_media.json');
      const shippedManifestFile = path.join(
        rootDir,
        'public',
        'content',
        'words',
        'word_related_media.json'
      );

      server.middlewares.use((req, res, next) => {
        const pathname = req.url ? req.url.split('?')[0] : '';
        const isLocalRequest = isLoopbackAddress(req.socket.remoteAddress);

        // 1) Serve local life-photo image files.
        if (pathname.startsWith('/life-photos/')) {
          if (!isLocalRequest) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          const relative = decodeURIComponent(pathname.replace(/^\/life-photos\//, ''));
          const filePath = path.join(photosRoot, relative);
          if (!filePath.startsWith(photosRoot) || !fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Not found');
            return;
          }
          res.setHeader(
            'Content-Type',
            contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
          );
          res.setHeader('Cache-Control', 'no-cache');
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        // 2) Merge local life photos into the shipped related-media manifest.
        if (pathname === '/content/words/word_related_media.json') {
          if (!isLocalRequest || !fs.existsSync(localManifestFile)) {
            next();
            return;
          }

          const shipped = readManifest(shippedManifestFile);
          const local = readManifest(localManifestFile);

          const merged = new Map<string, RelatedMedia>();
          for (const entry of shipped.entries ?? []) {
            merged.set(entry.wordId, { ...entry.relatedMedia });
          }
          for (const entry of local.entries ?? []) {
            merged.set(entry.wordId, { ...merged.get(entry.wordId), ...entry.relatedMedia });
          }

          const entries: ManifestEntry[] = [...merged.entries()].map(([wordId, relatedMedia]) => ({
            wordId,
            relatedMedia,
          }));

          const body = JSON.stringify({
            schemaVersion: shipped.schemaVersion ?? 1,
            generatedAt: new Date().toISOString(),
            stats: {
              ...(shipped.stats ?? {}),
              entries: entries.length,
              withOxford: entries.filter((entry) => entry.relatedMedia.oxford).length,
              withLifePhoto: entries.filter((entry) => entry.relatedMedia.lifePhoto).length,
            },
            entries,
          });

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(body);
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const syncProxyTarget = env.VITE_SYNC_PROXY_TARGET
    || env.VITE_SYNC_API_BASE_URL
    || 'https://vocab-sync-oxqobvibha.cn-shanghai.fcapp.run';
  const syncProxyOrigin = env.VITE_SYNC_PROXY_ORIGIN || 'https://english.cw2017.com';

  return {
    base: command === 'build' ? env.VITE_BASE_PATH || '/english/' : '/',
    plugins: [react(), devLifePhotosPlugin()],
    server: {
      allowedHosts: true,
      host: '0.0.0.0',
      port: 4173,
      proxy: {
        '/api': {
          target: syncProxyTarget,
          changeOrigin: true,
          secure: true,
          configure(proxy) {
            proxy.on('proxyReq', (proxyRequest) => {
              proxyRequest.setHeader('Origin', syncProxyOrigin);
            });
          },
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true,
    },
  };
});
