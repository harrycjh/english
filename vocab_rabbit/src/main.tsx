import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles/ipad.css';

const SERVICE_WORKER_URL = `${import.meta.env.BASE_URL}sw.js`;

function registerServiceWorker() {
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