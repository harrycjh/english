import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles/ipad.css';

const SERVICE_WORKER_URL = `${import.meta.env.BASE_URL}sw.js`;

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
  if (import.meta.env.DEV) {
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

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);