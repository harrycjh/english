import ReactDOM from 'react-dom/client';
import App from './app/App';
import { StartupSyncGate } from './components/StartupSyncGate';
import './styles/ipad.css';

const SERVICE_WORKER_URL = `${import.meta.env.BASE_URL}sw.js`;

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

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL).catch(() => {
      // Ignore registration failures during local iteration.
    });
  });
}

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StartupSyncGate>
    <App />
  </StartupSyncGate>,
);
