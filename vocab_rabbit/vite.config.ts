import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: command === 'build' ? env.VITE_BASE_PATH || '/english/' : '/',
    plugins: [react()],
    server: {
      allowedHosts: true,
      host: '0.0.0.0',
      port: 4173,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true,
    },
  };
});