import { downloadOfflineImages, getOfflineImageCacheStatus } from './offline-image-cache-service';

/**
 * The 「下载全部图片到本地」 job, seen from the page.
 *
 * The download itself belongs to the service worker (see `public/sw.js`): it is
 * ~150MB, and a page cannot be trusted to stay alive that long -- leaving
 * Settings used to throw the progress away, and backgrounding the app on
 * Android stopped it outright. What is left here is a view onto that job, plus
 * an in-page fallback for the one context that has no worker: `main.tsx`
 * deliberately unregisters it on localhost, so dev builds would otherwise have
 * no download button at all.
 */
export interface OfflineImageJobState {
  running: boolean;
  completed: number;
  total: number;
  failed: number;
}

export type OfflineImageJobListener = (state: OfflineImageJobState) => void;

const IDLE_STATE: OfflineImageJobState = { running: false, completed: 0, total: 0, failed: 0 };

const listeners = new Set<OfflineImageJobListener>();
let lastState: OfflineImageJobState = IDLE_STATE;

/**
 * Module-level, not component state. Holding it in the Settings page is what
 * made the download look like it stopped: unmounting reset the progress to
 * zero, and pressing the button again started a second download racing the
 * first for the same bandwidth.
 */
let fallbackRunning = false;
let fallbackAbort: AbortController | null = null;

function emit(state: OfflineImageJobState): void {
  lastState = state;
  for (const listener of listeners) {
    listener(state);
  }
}

function serviceWorkerController(): ServiceWorker | null {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.controller;
}

function handleWorkerMessage(event: MessageEvent): void {
  const data = event.data as (OfflineImageJobState & { type?: string }) | null;
  if (!data || data.type !== 'offline-images:progress') return;
  emit({
    running: Boolean(data.running),
    completed: data.completed ?? 0,
    total: data.total ?? 0,
    failed: data.failed ?? 0,
  });
}

let messageListenerAttached = false;

function attachWorkerListener(): void {
  if (messageListenerAttached) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
  messageListenerAttached = true;
}

export function readOfflineImageJob(): OfflineImageJobState {
  return lastState;
}

export function subscribeOfflineImageJob(listener: OfflineImageJobListener): () => void {
  attachWorkerListener();
  listeners.add(listener);
  listener(lastState);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Ask the worker to pick a job back up. Cheap and idempotent, so the page can
 * call it on mount and every time it returns to the foreground -- which is
 * exactly when the worker is most likely to have been killed mid-download.
 */
export function resumeOfflineImageJob(): void {
  const controller = serviceWorkerController();
  if (!controller) return;
  attachWorkerListener();
  controller.postMessage({ type: 'offline-images:resume' });
  controller.postMessage({ type: 'offline-images:status' });
}

async function runFallbackJob(urls: string[]): Promise<void> {
  if (fallbackRunning) return;
  fallbackRunning = true;
  fallbackAbort = new AbortController();
  try {
    const result = await downloadOfflineImages(urls, {
      signal: fallbackAbort.signal,
      onProgress: (progress) => {
        emit({ running: true, ...progress });
      },
    });
    emit({
      running: false,
      completed: result.cached + result.downloaded,
      total: result.total,
      failed: result.failed,
    });
  } catch {
    const status = await getOfflineImageCacheStatus(urls);
    emit({ running: false, completed: status.cached, total: status.total, failed: 0 });
  } finally {
    fallbackRunning = false;
    fallbackAbort = null;
  }
}

export function startOfflineImageJob(urls: string[]): void {
  const controller = serviceWorkerController();
  if (controller) {
    attachWorkerListener();
    emit({ running: true, completed: 0, total: urls.length, failed: 0 });
    controller.postMessage({ type: 'offline-images:start', urls });
    return;
  }
  emit({ running: true, completed: 0, total: urls.length, failed: 0 });
  void runFallbackJob(urls);
}

export function stopOfflineImageJob(): void {
  const controller = serviceWorkerController();
  if (controller) {
    controller.postMessage({ type: 'offline-images:stop' });
  }
  fallbackAbort?.abort();
  emit({ ...lastState, running: false });
}

/** Test seam. The module keeps state on purpose, so tests have to clear it. */
export function resetOfflineImageJobForTests(): void {
  if (messageListenerAttached && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.removeEventListener('message', handleWorkerMessage);
  }
  messageListenerAttached = false;
  listeners.clear();
  lastState = IDLE_STATE;
  fallbackRunning = false;
  fallbackAbort = null;
}
