import { describe, expect, it, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

interface FetchEventLike {
  request: Request;
  respondWith: (value: Promise<Response> | Response) => void;
  waitUntil: (value: Promise<unknown>) => void;
}

interface JobSnapshot {
  running: boolean;
  completed: number;
  total: number;
  failed: number;
}

interface ServiceWorkerHarness {
  dispatchFetch: (url: string) => Promise<{ response: Response; pending: Promise<unknown>[] }>;
  dispatchMessage: (data: unknown) => Promise<void>;
  dispatchSync: (tag: string) => Promise<void>;
  cacheEntries: Map<string, Response>;
  networkCalls: { url: string; cache?: string }[];
  messages: JobSnapshot[];
  syncRegistrations: string[];
}

const WORD_PAYLOAD = '/content/words/ket_vocabulary.json';

async function loadServiceWorker(options: {
  cached?: Record<string, string>;
  networkBody?: string | null;
  failUrls?: string[];
  /** Jumps the clock past the slice deadline once this many images are done. */
  sliceAfter?: number;
  hasBackgroundSync?: boolean;
}): Promise<ServiceWorkerHarness> {
  const source = await readFile(path.resolve('public/sw.js'), 'utf8');

  const cacheEntries = new Map<string, Response>();
  for (const [url, body] of Object.entries(options.cached ?? {})) {
    cacheEntries.set(url, new Response(body, { status: 200 }));
  }

  const networkCalls: { url: string; cache?: string }[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  let clockOffsetMs = 0;

  const cacheApi = {
    addAll: async () => undefined,
    put: async (request: Request | string, response: Response) => {
      cacheEntries.set(typeof request === 'string' ? request : request.url, response);
    },
    // Cloned, like the real Cache API: a body can only be read once, and the
    // job state gets read on every slice.
    match: async (request: Request | string) => cacheEntries
      .get(typeof request === 'string' ? request : request.url)
      ?.clone(),
    keys: async () => [...cacheEntries.keys()].map((url) => new Request(url)),
    delete: async (request: Request | string) => cacheEntries.delete(
      typeof request === 'string' ? request : request.url,
    ),
  };

  const caches = {
    open: async () => cacheApi,
    match: async (request: Request | string, options?: { ignoreSearch?: boolean }) => {
      const url = typeof request === 'string' ? request : request.url;
      const exact = cacheEntries.get(url);
      if (exact || !options?.ignoreSearch) return exact;
      const withoutQuery = url.split('?')[0];
      for (const [key, value] of cacheEntries) {
        if (key.split('?')[0] === withoutQuery) return value;
      }
      return undefined;
    },
  };

  const fetchStub = async (request: Request | string, init?: { cache?: string }) => {
    const url = typeof request === 'string' ? request : request.url;
    networkCalls.push({ url, cache: init?.cache });
    if (options.sliceAfter !== undefined && networkCalls.length >= options.sliceAfter) {
      clockOffsetMs = 10 * 60 * 1000;
    }
    if (options.failUrls?.includes(url)) {
      return new Response('nope', { status: 404 });
    }
    if (options.networkBody === null) {
      throw new Error('offline');
    }
    return new Response(options.networkBody ?? 'from-network', { status: 200 });
  };

  const messages: JobSnapshot[] = [];
  const syncRegistrations: string[] = [];
  const client = {
    postMessage: (data: JobSnapshot & { type: string }) => {
      if (data.type !== 'offline-images:progress') return;
      const { running, completed, total, failed } = data;
      messages.push({ running, completed, total, failed });
    },
  };

  const context = vm.createContext({
    self: {
      registration: {
        scope: 'https://example.test/',
        sync: options.hasBackgroundSync === false ? undefined : {
          register: async (tag: string) => { syncRegistrations.push(tag); },
        },
      },
      addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
      skipWaiting: async () => undefined,
      clients: {
        claim: async () => undefined,
        matchAll: async () => [client],
      },
    },
    caches,
    fetch: fetchStub,
    Response,
    Request,
    URL,
    Promise,
    Date: new Proxy(Date, { get: (target, key) => (key === 'now' ? () => Date.now() + clockOffsetMs : Reflect.get(target, key)) }),
    Array,
    Set,
    Error,
    JSON,
  });

  vm.runInContext(source, context);

  async function dispatchEvent(type: string, event: Record<string, unknown>): Promise<void> {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (value: Promise<unknown>) => pending.push(value) });
    await Promise.all(pending);
  }

  return {
    cacheEntries,
    networkCalls,
    messages,
    syncRegistrations,
    dispatchMessage: (data: unknown) => dispatchEvent('message', { data }),
    dispatchSync: (tag: string) => dispatchEvent('sync', { tag }),
    dispatchFetch: async (url: string) => {
      const pending: Promise<unknown>[] = [];
      let responded: Promise<Response> | Response | undefined;
      const event: FetchEventLike = {
        request: new Request(url),
        respondWith: (value) => { responded = value; },
        waitUntil: (value) => { pending.push(value); },
      };
      listeners.get('fetch')?.(event);
      return { response: await (responded as Promise<Response>), pending };
    },
  };
}

describe('service worker word payload strategy', () => {
  const versionedUrl = `https://example.test${WORD_PAYLOAD}?v=v0.1.6`;

  it('answers from the cache without waiting for the network', async () => {
    const sw = await loadServiceWorker({
      cached: { [versionedUrl]: 'from-cache' },
      networkBody: 'from-network',
    });

    const { response } = await sw.dispatchFetch(versionedUrl);

    expect(await response.text()).toBe('from-cache');
  });

  it('still revalidates in the background so the next open is current', async () => {
    const sw = await loadServiceWorker({
      cached: { [versionedUrl]: 'from-cache' },
      networkBody: 'from-network',
    });

    const { pending } = await sw.dispatchFetch(versionedUrl);
    await Promise.all(pending);

    expect(sw.networkCalls).toHaveLength(1);
    expect(await sw.cacheEntries.get(versionedUrl)?.text()).toBe('from-network');
    // The page already has its answer, so nothing else is keeping the worker
    // alive: without waitUntil the browser is free to kill it mid-refresh and
    // the cache silently never moves on.
    expect(pending).toHaveLength(1);
  });

  it('revalidates conditionally so an unchanged list costs a 304, not 900KB', async () => {
    const sw = await loadServiceWorker({
      cached: { [versionedUrl]: 'from-cache' },
      networkBody: 'from-network',
    });

    const { pending } = await sw.dispatchFetch(versionedUrl);
    await Promise.all(pending);

    expect(sw.networkCalls[0].cache).toBe('no-cache');
  });

  it('falls back to the network on the very first visit', async () => {
    const sw = await loadServiceWorker({ networkBody: 'from-network' });

    const { response } = await sw.dispatchFetch(versionedUrl);

    expect(await response.text()).toBe('from-network');
  });

  // CONTENT_VERSION is baked into the query string, so a release changes the
  // request URL. An exact-match lookup would miss and put the child back on the
  // network for the whole 600KB on the first open after every deploy.
  it('reuses the copy cached under a previous content version', async () => {
    const sw = await loadServiceWorker({
      cached: { [`https://example.test${WORD_PAYLOAD}?v=v0.1.5`]: 'previous-version' },
      networkBody: 'from-network',
    });

    const { response, pending } = await sw.dispatchFetch(versionedUrl);
    expect(await response.text()).toBe('previous-version');

    // ...and the background refresh stores the new version under the new key,
    // so the staleness lasts exactly one open.
    await Promise.all(pending);
    expect(await sw.cacheEntries.get(versionedUrl)?.text()).toBe('from-network');
  });

  it('serves the cached copy when the network is gone', async () => {
    const sw = await loadServiceWorker({
      cached: { [`https://example.test${WORD_PAYLOAD}?v=v0.1.5`]: 'cached' },
      networkBody: null,
    });

    const { response } = await sw.dispatchFetch(versionedUrl);

    expect(await response.text()).toBe('cached');
  });

  it('does not precache the word list, which would download it twice', async () => {
    const source = await readFile(path.resolve('public/sw.js'), 'utf8');
    const precache = /const PRECACHE = \[([^\]]*)\]/.exec(source)?.[1] ?? '';

    expect(precache).not.toMatch(/WORD_PAYLOAD|ket_vocabulary/);
    expect(precache).toMatch(/INDEX_URL/);
  });
});

describe('service worker offline image download job', () => {
  const urls = ['https://example.test/a.webp', 'https://example.test/b.webp', 'https://example.test/c.webp'];
  // Longer than the worker's concurrency, so a deadline can land mid-list.
  const manyUrls = Array.from({ length: 24 }, (_, index) => `https://example.test/many-${index}.webp`);
  const JOB_STATE_URL = 'https://example.test/__offline-image-job';

  it('downloads the list and caches every image', async () => {
    const sw = await loadServiceWorker({});

    await sw.dispatchMessage({ type: 'offline-images:start', urls });

    for (const url of urls) {
      expect(sw.cacheEntries.has(url)).toBe(true);
    }
    expect(sw.messages.at(-1)).toEqual({ running: false, completed: 3, total: 3, failed: 0 });
  });

  // The whole reason the job moved out of the page: this runs on a message
  // event, not on the lifetime of a React component, so leaving Settings or
  // backgrounding the app cannot stop it.
  it('skips images already in the cache instead of downloading them again', async () => {
    const sw = await loadServiceWorker({ cached: { 'https://example.test/a.webp': 'have-it' } });

    await sw.dispatchMessage({ type: 'offline-images:start', urls });

    expect(sw.networkCalls.map((call) => call.url)).toEqual([
      'https://example.test/b.webp',
      'https://example.test/c.webp',
    ]);
  });

  it('lets the HTTP cache answer rather than forcing a re-download', async () => {
    const sw = await loadServiceWorker({});

    await sw.dispatchMessage({ type: 'offline-images:start', urls });

    expect(sw.networkCalls.every((call) => call.cache !== 'no-store')).toBe(true);
  });

  it('reports progress to the page so the bar moves', async () => {
    const sw = await loadServiceWorker({});

    await sw.dispatchMessage({ type: 'offline-images:start', urls: manyUrls });

    expect(sw.messages[0]).toEqual({ running: true, completed: 0, total: manyUrls.length, failed: 0 });
    expect(sw.messages.at(-1)?.running).toBe(false);
    // A bar that only ever reads 0 and then 100 over a 150MB download is not a
    // progress bar.
    const partway = sw.messages.filter(
      (message) => message.completed > 0 && message.completed < manyUrls.length,
    );
    expect(partway.length).toBeGreaterThan(0);
  });

  it('counts a failed image without stopping the rest of the download', async () => {
    const sw = await loadServiceWorker({ failUrls: ['https://example.test/b.webp'] });

    await sw.dispatchMessage({ type: 'offline-images:start', urls });

    expect(sw.cacheEntries.has('https://example.test/a.webp')).toBe(true);
    expect(sw.cacheEntries.has('https://example.test/c.webp')).toBe(true);
    expect(sw.messages.at(-1)).toEqual({ running: false, completed: 2, total: 3, failed: 1 });
  });

  it('clears the saved job once everything is downloaded', async () => {
    const sw = await loadServiceWorker({});

    await sw.dispatchMessage({ type: 'offline-images:start', urls });

    expect(sw.cacheEntries.has(JOB_STATE_URL)).toBe(false);
  });

  // A worker whose event has been pending too long is killed. The job has to
  // end up as a chain of short events, each one asking for the next.
  it('stops at the slice deadline and books a background sync for the rest', async () => {
    const sw = await loadServiceWorker({ sliceAfter: 1 });

    await sw.dispatchMessage({ type: 'offline-images:start', urls: manyUrls });

    expect(sw.networkCalls.length).toBeLessThan(manyUrls.length);
    expect(sw.syncRegistrations).toContain('vocab-rabbit-offline-images');
    expect(sw.cacheEntries.has(JOB_STATE_URL)).toBe(true);
    expect(sw.messages.at(-1)?.running).toBe(true);
  });

  it('picks the rest up when the background sync fires', async () => {
    const sw = await loadServiceWorker({ sliceAfter: 1 });
    await sw.dispatchMessage({ type: 'offline-images:start', urls: manyUrls });
    expect(sw.networkCalls.length).toBeLessThan(manyUrls.length);

    // Same cache contents, fresh worker: exactly what a killed worker wakes to.
    const resumed = await loadServiceWorker({});
    for (const [url, response] of sw.cacheEntries) resumed.cacheEntries.set(url, response.clone());

    await resumed.dispatchSync('vocab-rabbit-offline-images');

    expect(resumed.cacheEntries.has(JOB_STATE_URL)).toBe(false);
    for (const url of manyUrls) expect(resumed.cacheEntries.has(url)).toBe(true);
  });

  it('ignores a sync for some other tag', async () => {
    const sw = await loadServiceWorker({ sliceAfter: 1 });
    await sw.dispatchMessage({ type: 'offline-images:start', urls: manyUrls });
    const before = sw.networkCalls.length;

    await sw.dispatchSync('something-else');

    expect(sw.networkCalls).toHaveLength(before);
  });

  // Huawei and iOS browsers may have no Background Sync at all. Handing the job
  // back to a browser that will never hand it forward again means the download
  // just stops at the first slice.
  it('keeps going in the same event when background sync is missing', async () => {
    const sw = await loadServiceWorker({ hasBackgroundSync: false, sliceAfter: 1 });

    await sw.dispatchMessage({ type: 'offline-images:start', urls: manyUrls });

    expect(sw.syncRegistrations).toHaveLength(0);
    for (const url of manyUrls) expect(sw.cacheEntries.has(url)).toBe(true);
    expect(sw.cacheEntries.has(JOB_STATE_URL)).toBe(false);
  });

  it('resumes a saved job without being told the list again', async () => {
    const sw = await loadServiceWorker({ sliceAfter: 1 });
    await sw.dispatchMessage({ type: 'offline-images:start', urls: manyUrls });

    const resumed = await loadServiceWorker({});
    for (const [url, response] of sw.cacheEntries) resumed.cacheEntries.set(url, response.clone());

    await resumed.dispatchMessage({ type: 'offline-images:resume' });

    for (const url of manyUrls) expect(resumed.cacheEntries.has(url)).toBe(true);
  });

  it('does nothing on resume when there is no job', async () => {
    const sw = await loadServiceWorker({});

    await sw.dispatchMessage({ type: 'offline-images:resume' });

    expect(sw.networkCalls).toHaveLength(0);
  });

  it('stops the job when the page asks it to', async () => {
    const sw = await loadServiceWorker({ sliceAfter: 1 });
    await sw.dispatchMessage({ type: 'offline-images:start', urls: manyUrls });

    await sw.dispatchMessage({ type: 'offline-images:stop' });
    expect(sw.cacheEntries.has(JOB_STATE_URL)).toBe(false);
    expect(sw.messages.at(-1)?.running).toBe(false);

    const before = sw.networkCalls.length;
    await sw.dispatchMessage({ type: 'offline-images:resume' });
    expect(sw.networkCalls).toHaveLength(before);
  });

  it('answers a status request with what is left to do', async () => {
    const sw = await loadServiceWorker({ sliceAfter: 1 });
    await sw.dispatchMessage({ type: 'offline-images:start', urls: manyUrls });
    const downloaded = sw.networkCalls.length;
    const beforeStatus = sw.messages.length;

    await sw.dispatchMessage({ type: 'offline-images:status' });

    expect(sw.messages.at(-1)).toEqual({
      running: true,
      completed: downloaded,
      total: manyUrls.length,
      failed: 0,
    });
    expect(sw.messages.length).toBeGreaterThan(beforeStatus);
  });

  it('reports nothing running once the job is done', async () => {
    const sw = await loadServiceWorker({});
    await sw.dispatchMessage({ type: 'offline-images:start', urls });

    await sw.dispatchMessage({ type: 'offline-images:status' });

    expect(sw.messages.at(-1)).toEqual({ running: false, completed: 0, total: 0, failed: 0 });
  });

  it('ignores messages it does not own', async () => {
    const sw = await loadServiceWorker({});

    await sw.dispatchMessage({ type: 'something-else' });
    await sw.dispatchMessage(null);

    expect(sw.networkCalls).toHaveLength(0);
  });
});
