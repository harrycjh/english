import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readOfflineImageJob,
  resetOfflineImageJobForTests,
  resumeOfflineImageJob,
  startOfflineImageJob,
  stopOfflineImageJob,
  subscribeOfflineImageJob,
} from './offline-image-job';

interface WorkerStub {
  posted: { type: string; urls?: string[] }[];
  emit: (data: unknown) => void;
}

function stubServiceWorker(): WorkerStub {
  const posted: { type: string; urls?: string[] }[] = [];
  const listeners = new Set<(event: MessageEvent) => void>();
  vi.stubGlobal('navigator', {
    serviceWorker: {
      controller: { postMessage: (data: { type: string }) => posted.push(data) },
      addEventListener: (_type: string, handler: (event: MessageEvent) => void) => listeners.add(handler),
      removeEventListener: (_type: string, handler: (event: MessageEvent) => void) => listeners.delete(handler),
    },
  });
  return {
    posted,
    emit: (data: unknown) => {
      for (const listener of listeners) listener({ data } as MessageEvent);
    },
  };
}

function stubNoServiceWorker(fetched: string[]): void {
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('caches', {
    open: async () => ({
      keys: async () => [],
      put: async () => undefined,
      match: async () => undefined,
    }),
  });
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);
    return new Response('image', { status: 200 });
  });
}

afterEach(() => {
  resetOfflineImageJobForTests();
  vi.unstubAllGlobals();
});

describe('offline image job controller', () => {
  it('hands the list to the service worker rather than downloading in the page', async () => {
    const worker = stubServiceWorker();
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);

    startOfflineImageJob(['/a.webp', '/b.webp']);

    expect(worker.posted).toEqual([{ type: 'offline-images:start', urls: ['/a.webp', '/b.webp'] }]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('passes the worker progress through to subscribers', () => {
    const worker = stubServiceWorker();
    const seen: unknown[] = [];
    subscribeOfflineImageJob((state) => seen.push(state));

    worker.emit({ type: 'offline-images:progress', running: true, completed: 40, total: 1504, failed: 2 });

    expect(seen.at(-1)).toEqual({ running: true, completed: 40, total: 1504, failed: 2 });
  });

  it('ignores messages the worker sends about anything else', () => {
    const worker = stubServiceWorker();
    subscribeOfflineImageJob(() => undefined);

    worker.emit({ type: 'sync-finished', running: true, completed: 9, total: 9, failed: 0 });

    expect(readOfflineImageJob()).toEqual({ running: false, completed: 0, total: 0, failed: 0 });
  });

  // The point of moving the job out of the page: progress has to outlive the
  // component. A new subscriber gets the current state immediately rather than
  // starting from zero.
  it('replays the current state to a subscriber that arrives late', () => {
    const worker = stubServiceWorker();
    subscribeOfflineImageJob(() => undefined)();
    worker.emit({ type: 'offline-images:progress', running: true, completed: 40, total: 1504, failed: 0 });

    const seen: unknown[] = [];
    subscribeOfflineImageJob((state) => seen.push(state));

    expect(seen[0]).toEqual({ running: true, completed: 40, total: 1504, failed: 0 });
  });

  it('asks the worker to resume, because it gets killed between slices', () => {
    const worker = stubServiceWorker();

    resumeOfflineImageJob();

    expect(worker.posted.map((message) => message.type)).toEqual([
      'offline-images:resume',
      'offline-images:status',
    ]);
  });

  it('tells the worker to stop and reports it as stopped', () => {
    const worker = stubServiceWorker();
    subscribeOfflineImageJob(() => undefined);
    worker.emit({ type: 'offline-images:progress', running: true, completed: 40, total: 1504, failed: 0 });

    stopOfflineImageJob();

    expect(worker.posted).toContainEqual({ type: 'offline-images:stop' });
    expect(readOfflineImageJob()).toEqual({ running: false, completed: 40, total: 1504, failed: 0 });
  });

  // main.tsx unregisters the worker on localhost, so without this the download
  // button would do nothing at all in dev.
  it('downloads in the page when there is no service worker', async () => {
    const fetched: string[] = [];
    stubNoServiceWorker(fetched);
    const seen: { running: boolean; completed: number }[] = [];
    subscribeOfflineImageJob((state) => seen.push(state));

    startOfflineImageJob(['/a.webp', '/b.webp']);
    await vi.waitFor(() => expect(readOfflineImageJob().running).toBe(false));

    expect(fetched).toEqual(['/a.webp', '/b.webp']);
    expect(seen.at(-1)).toEqual({ running: false, completed: 2, total: 2, failed: 0 });
  });

  // Pressing 下载 again used to start a second download racing the first for
  // the same bandwidth, because the only record of one running lived in the
  // component that had just been unmounted.
  it('does not start a second in-page download on top of a running one', async () => {
    const fetched: string[] = [];
    stubNoServiceWorker(fetched);

    startOfflineImageJob(['/a.webp', '/b.webp']);
    startOfflineImageJob(['/a.webp', '/b.webp']);
    await vi.waitFor(() => expect(readOfflineImageJob().running).toBe(false));

    expect(fetched).toEqual(['/a.webp', '/b.webp']);
  });

  it('stops the in-page download when asked', async () => {
    const fetched: string[] = [];
    stubNoServiceWorker(fetched);

    startOfflineImageJob(['/a.webp', '/b.webp']);
    stopOfflineImageJob();
    // Long enough for the loop to have downloaded both if nothing stopped it;
    // waiting on `running` alone would pass simply because stop flips the flag.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(fetched).toEqual([]);
    expect(readOfflineImageJob().running).toBe(false);
  });
});
