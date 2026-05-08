import ReactDOM from 'react-dom/client';
import App from './app/App';
import './styles/ipad.css';

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore registration failures during local iteration.
    });
  });
}

registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);