const CACHE_NAME = 'vocab-rabbit-shell-v14';
const OFFLINE_IMAGE_CACHE_PREFIX = 'vocab-rabbit-images-';
const OFFLINE_IMAGE_CACHE_NAME = 'vocab-rabbit-images-v2';
const OFFLINE_DOWNLOAD_HEADER = 'X-VocaRabbit-Offline-Download';
const SCOPE_URL = new URL(self.registration.scope);
const APP_ROOT_URL = new URL('./', SCOPE_URL).toString();
const INDEX_URL = new URL('index.html', SCOPE_URL).toString();
const MANIFEST_URL = new URL('manifest.webmanifest', SCOPE_URL).toString();
// Deliberately without the word list. Precaching it made install download
// 2.7MB that the app could not even use -- it lands under the bare URL, while
// the app asks for a ?v=-suffixed one -- so the first visit paid for the list
// twice. Warming it from the activate handler is no better: that download runs
// alongside the page's own, and on a phone the two just halve each other's
// bandwidth (measured: first open 2.0s -> 8.3s). So the list is fetched once,
// by the app, and cached on the way past.
const PRECACHE = [APP_ROOT_URL, INDEX_URL, MANIFEST_URL];

/*
 * 「下载全部图片到本地」 used to run in the Settings page. That put a ~150MB
 * download on the page's lifetime: leaving Settings threw the progress away,
 * and backgrounding the app froze the tab and stopped it outright. It lives
 * here now, where nothing the child does to the page can interrupt it.
 */
const OFFLINE_JOB_STATE_URL = new URL('__offline-image-job', SCOPE_URL).toString();
const OFFLINE_JOB_SYNC_TAG = 'vocab-rabbit-offline-images';
const OFFLINE_JOB_CONCURRENCY = 8;
// A worker whose event has been pending too long gets killed, taking the
// download with it. Each slice stops well short of that and asks the browser
// for a fresh event, so the job is a chain of short events rather than one long
// one it would not survive.
const OFFLINE_JOB_SLICE_MS = 90000;
const OFFLINE_JOB_PROGRESS_INTERVAL = 8;

/** In-flight guard. The saved state is what survives the worker being killed. */
let offlineJobRunning = false;

async function readOfflineJob() {
  const cache = await caches.open(OFFLINE_IMAGE_CACHE_NAME);
  const stored = await cache.match(OFFLINE_JOB_STATE_URL);
  if (!stored) return null;
  try {
    return await stored.json();
  } catch {
    return null;
  }
}

async function writeOfflineJob(job) {
  const cache = await caches.open(OFFLINE_IMAGE_CACHE_NAME);
  await cache.put(OFFLINE_JOB_STATE_URL, new Response(JSON.stringify(job)));
}

async function clearOfflineJob() {
  const cache = await caches.open(OFFLINE_IMAGE_CACHE_NAME);
  await cache.delete(OFFLINE_JOB_STATE_URL);
}

async function broadcastOfflineJob(snapshot) {
  // includeUncontrolled so a page that loaded before this worker took over
  // still sees the progress bar move.
  const windows = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of windows) {
    client.postMessage({ type: 'offline-images:progress', ...snapshot });
  }
}

/**
 * Ask the browser to wake us again. Background Sync fires even while the app is
 * backgrounded, which is the whole point of it; where it is missing there is
 * nothing to fall back on but the app asking again next time it is opened.
 */
async function requestOfflineJobWakeUp() {
  if (!self.registration.sync) return false;
  try {
    await self.registration.sync.register(OFFLINE_JOB_SYNC_TAG);
    return true;
  } catch {
    return false;
  }
}

async function cachedOfflineUrls(cache) {
  const requests = await cache.keys();
  return new Set(requests.map((request) => request.url));
}

function absoluteOfflineUrl(url) {
  return new URL(url, SCOPE_URL).toString();
}

/**
 * Work through whatever is still missing, for one slice.
 *
 * Nothing tracks a position: what is already in the cache is the progress, so
 * being killed half way through costs at most the images that were in flight.
 */
async function runOfflineJobSlice() {
  const job = await readOfflineJob();
  if (!job) return { finished: true };

  const cache = await caches.open(OFFLINE_IMAGE_CACHE_NAME);
  const alreadyCached = await cachedOfflineUrls(cache);
  const missing = job.urls.filter((url) => !alreadyCached.has(absoluteOfflineUrl(url)));
  const total = job.urls.length;
  const deadline = Date.now() + OFFLINE_JOB_SLICE_MS;
  let done = total - missing.length;
  let failed = 0;
  let nextIndex = 0;
  let sinceReport = 0;

  async function report(force) {
    sinceReport += 1;
    if (!force && sinceReport < OFFLINE_JOB_PROGRESS_INTERVAL) return;
    sinceReport = 0;
    await broadcastOfflineJob({ running: true, completed: done, total, failed });
  }

  await report(true);

  async function worker() {
    while (nextIndex < missing.length && Date.now() < deadline) {
      const url = missing[nextIndex];
      nextIndex += 1;
      try {
        // No cache: 'no-store' here. Letting the HTTP cache answer is the
        // difference between re-downloading images the browser already holds
        // and not, and this runs on a child's mobile data.
        const response = await fetch(url);
        if (!response.ok) throw new Error(String(response.status));
        await cache.put(url, response);
        done += 1;
      } catch {
        failed += 1;
      }
      await report(false);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(OFFLINE_JOB_CONCURRENCY, missing.length) }, () => worker()),
  );

  if (nextIndex >= missing.length) {
    await clearOfflineJob();
    // The final slice is the one that attempted everything still missing, so
    // its own tally is also the job's: anything that failed here is still
    // missing, and anything that failed earlier was retried here.
    await broadcastOfflineJob({ running: false, completed: done, total, failed });
    return { finished: true };
  }

  await broadcastOfflineJob({ running: true, completed: done, total, failed });
  return { finished: false };
}

/**
 * Run slices until the job is done, or until the browser agrees to wake us for
 * the rest of it.
 *
 * The guard is what stops a resume message arriving mid-download from starting
 * a second set of workers to race the first for the same bandwidth.
 */
async function runOfflineJob() {
  if (offlineJobRunning) return;
  offlineJobRunning = true;
  try {
    for (;;) {
      const { finished } = await runOfflineJobSlice();
      if (finished) return;
      if (await requestOfflineJobWakeUp()) return;
      // No Background Sync: carry on in this event for as long as we are
      // given, rather than stopping and waiting to be asked again.
    }
  } finally {
    offlineJobRunning = false;
  }
}

async function offlineJobSnapshot() {
  const job = await readOfflineJob();
  if (!job) return { running: false, completed: 0, total: 0, failed: 0 };
  const cache = await caches.open(OFFLINE_IMAGE_CACHE_NAME);
  const alreadyCached = await cachedOfflineUrls(cache);
  const completed = job.urls.filter((url) => alreadyCached.has(absoluteOfflineUrl(url))).length;
  return { running: true, completed, total: job.urls.length, failed: 0 };
}

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message) return;

  if (message.type === 'offline-images:start') {
    event.waitUntil((async () => {
      await writeOfflineJob({ urls: message.urls });
      await runOfflineJob();
    })());
    return;
  }

  if (message.type === 'offline-images:resume') {
    // Sent when Settings opens and whenever the app comes back to the
    // foreground, so a job the worker was killed out of picks itself back up.
    event.waitUntil(runOfflineJob());
    return;
  }

  if (message.type === 'offline-images:stop') {
    event.waitUntil((async () => {
      await clearOfflineJob();
      await broadcastOfflineJob({ running: false, completed: 0, total: 0, failed: 0 });
    })());
    return;
  }

  if (message.type === 'offline-images:status') {
    event.waitUntil((async () => {
      const snapshot = await offlineJobSnapshot();
      const port = event.ports && event.ports[0];
      if (port) port.postMessage(snapshot);
      else await broadcastOfflineJob(snapshot);
    })());
  }
});

self.addEventListener('sync', (event) => {
  if (event.tag === OFFLINE_JOB_SYNC_TAG) {
    event.waitUntil(runOfflineJob());
  }
});

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
  // ignoreSearch so a cached copy still counts after CONTENT_VERSION moves on.
  // It may be one version old, which is exactly what the background refresh
  // below is for -- and it beats another 600KB before the first paint.
  const cached = await caches.match(request, { ignoreSearch: true });

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
  return response || Response.error();
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
