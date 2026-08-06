const CACHE_NAME = 'vocab-rabbit-shell-v12';
const OFFLINE_IMAGE_CACHE_PREFIX = 'vocab-rabbit-images-';
const OFFLINE_IMAGE_CACHE_NAME = 'vocab-rabbit-images-v2';
const OFFLINE_DOWNLOAD_HEADER = 'X-VocaRabbit-Offline-Download';
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
    if (request.headers.get(OFFLINE_DOWNLOAD_HEADER) === '1') {
      return response;
    }
    return putInCache(request, response);
  } catch {
    return Response.error();
  }
}

// The word list is ~900KB over the wire. Fetching it before every first paint
// made "正在准备今天的词汇篮子" sit on screen for the whole download on phones.
// Serve the cached copy straight away and refresh it in the background, so at
// most one session ever sees week-old words.
async function handleWordPayload(event) {
  const { request } = event;
  const cached = await caches.match(request);

  // 'no-cache' rather than 'no-store': this still always reaches the server,
  // but it sends the ETag, so an unchanged word list costs a 304 instead of
  // another 900KB of the child's mobile data.
  const fromNetwork = fetch(request, { cache: 'no-cache' })
    .then((response) => putInCache(request, response))
    .catch(() => null);

  // Keep the worker alive long enough to store the refreshed copy even though
  // the page has already been handed the cached one.
  event.waitUntil(fromNetwork);

  if (cached) {
    return cached;
  }

  const response = await fromNetwork;
  return response || (await caches.match(WORD_PAYLOAD_URL)) || Response.error();
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              key !== CACHE_NAME
              && (
                !key.startsWith(OFFLINE_IMAGE_CACHE_PREFIX)
                || key !== OFFLINE_IMAGE_CACHE_NAME
              )
          )
          .map((key) => caches.delete(key))
      )
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
    event.respondWith(handleWordPayload(event));
    return;
  }

  event.respondWith(handleStaticAsset(event.request));
});
