import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server proxies /api and /uploads to the Express backend, so the
 * browser only ever talks to one origin (works locally, in Docker and in
 * sandboxed previews).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true, // allow *.e2b.app and other preview hosts
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true, secure: false },
      '/uploads': { target: 'http://127.0.0.1:4000', changeOrigin: true, secure: false },
    },
  },
  preview: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1200 },
});
