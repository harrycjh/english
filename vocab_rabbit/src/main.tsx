import ReactDOM from 'react-dom/client';
import App from './app/App';
import { installImmersiveMode } from './app/immersive-mode';
import { StartupSyncGate } from './components/StartupSyncGate';
import { APP_VERSION } from './config/app-meta';
import './styles/ipad.css';

const SERVICE_WORKER_URL = `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(APP_VERSION)}`;

function isLocalPreviewHost() {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['127.0.0.1', '0.0.0.0', '::1', 'localhost'].includes(window.location.hostname);
}

async function disableServiceWorkerDuringDev() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));

  if (!('caches' in window)) {
    return;
  }

  const cacheKeys = await caches.keys();
  await Promise.all(
    cacheKeys
      .filter((cacheKey) => cacheKey.startsWith('vocab-rabbit-shell'))
      .map((cacheKey) => caches.delete(cacheKey))
  );
}

function registerServiceWorker() {
  if (import.meta.env.DEV || isLocalPreviewHost()) {
    void disableServiceWorkerDuringDev();
    return;
  }

  if (!('serviceWorker' in navigator)) {
    return;
  }

  let isRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (isRefreshing) return;
    isRefreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
      const requestUpdate = () => {
        void registration.update().catch(() => {
          // Keep the installed offline version when update checks fail.
        });
      };

      requestUpdate();
      window.addEventListener('pageshow', requestUpdate);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') requestUpdate();
      });
    } catch {
      // Keep the web app usable when service-worker registration fails.
    }
  });
}

registerServiceWorker();
installImmersiveMode();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StartupSyncGate>
    {(syncRevision, requestSync) => (
      <App syncRevision={syncRevision} onRequestSync={requestSync} />
    )}
  </StartupSyncGate>,
);
