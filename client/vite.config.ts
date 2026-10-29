import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    // The API runs on its own port in development; in production the server serves this app itself.
    proxy: { '/api': { target: 'http://localhost:8787' } },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1200 },
});
