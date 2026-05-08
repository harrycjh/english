const CACHE_NAME = 'vocab-rabbit-shell-v2';
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/content/words/ket_vocabulary.json'];

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
    const response = await fetch(request);
    await putInCache('/index.html', response.clone());
    return response;
  } catch {
    return caches.match('/index.html');
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
    return caches.match('/index.html');
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

  event.respondWith(handleStaticAsset(event.request));
});