const CACHE_NAME = 'vocab-rabbit-shell-v7';
const SCOPE_URL = new URL(self.registration.scope);
const APP_ROOT_URL = new URL('./', SCOPE_URL).toString();
const INDEX_URL = new URL('index.html', SCOPE_URL).toString();
const MANIFEST_URL = new URL('manifest.webmanifest', SCOPE_URL).toString();
const WORD_PAYLOAD_URL = new URL('content/words/ket_vocabulary.json', SCOPE_URL).toString();
const PRECACHE = [APP_ROOT_URL, INDEX_URL, MANIFEST_URL, WORD_PAYLOAD_URL];

async function putInCache(request, response) {
  if (!response || response.status !== 200) {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function handleNavigation(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    await putInCache(INDEX_URL, response.clone());
    return response;
  } catch {
    return (await caches.match(INDEX_URL)) || Response.error();
  }
}

async function handleStaticAsset(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    return putInCache(request, response);
  } catch {
    return Response.error();
  }
}

async function handleWordPayload(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    return putInCache(request, response);
  } catch {
    return (await caches.match(request)) || (await caches.match(WORD_PAYLOAD_URL)) || Response.error();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(handleNavigation(event.request));
    return;
  }

  if (new URL(event.request.url).pathname.endsWith('/content/words/ket_vocabulary.json')) {
    event.respondWith(handleWordPayload(event.request));
    return;
  }

  event.respondWith(handleStaticAsset(event.request));
});
