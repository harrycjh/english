import { describe, expect, it, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

interface FetchEventLike {
  request: Request;
  respondWith: (value: Promise<Response> | Response) => void;
  waitUntil: (value: Promise<unknown>) => void;
}

interface ServiceWorkerHarness {
  dispatchFetch: (url: string) => Promise<{ response: Response; pending: Promise<unknown>[] }>;
  cacheEntries: Map<string, Response>;
  networkCalls: { url: string; cache?: string }[];
}

const WORD_PAYLOAD = '/content/words/ket_vocabulary.json';

async function loadServiceWorker(options: {
  cached?: Record<string, string>;
  networkBody?: string | null;
}): Promise<ServiceWorkerHarness> {
  const source = await readFile(path.resolve('public/sw.js'), 'utf8');

  const cacheEntries = new Map<string, Response>();
  for (const [url, body] of Object.entries(options.cached ?? {})) {
    cacheEntries.set(url, new Response(body, { status: 200 }));
  }

  const networkCalls: { url: string; cache?: string }[] = [];
  const listeners = new Map<string, (event: unknown) => void>();

  const caches = {
    open: async () => ({
      addAll: async () => undefined,
      put: async (request: Request | string, response: Response) => {
        cacheEntries.set(typeof request === 'string' ? request : request.url, response);
      },
    }),
    match: async (request: Request | string) =>
      cacheEntries.get(typeof request === 'string' ? request : request.url),
    keys: async () => [],
    delete: async () => true,
  };

  const fetchStub = async (request: Request, init?: { cache?: string }) => {
    networkCalls.push({ url: request.url, cache: init?.cache });
    if (options.networkBody === null) {
      throw new Error('offline');
    }
    return new Response(options.networkBody ?? 'from-network', { status: 200 });
  };

  const context = vm.createContext({
    self: {
      registration: { scope: 'https://example.test/' },
      addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
      skipWaiting: async () => undefined,
      clients: { claim: async () => undefined },
    },
    caches,
    fetch: fetchStub,
    Response,
    Request,
    URL,
    Promise,
  });

  vm.runInContext(source, context);

  return {
    cacheEntries,
    networkCalls,
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

  it('serves the precached copy when the network is gone and the version moved on', async () => {
    const sw = await loadServiceWorker({
      cached: { [`https://example.test${WORD_PAYLOAD}`]: 'precached' },
      networkBody: null,
    });

    const { response } = await sw.dispatchFetch(versionedUrl);

    expect(await response.text()).toBe('precached');
  });
});
