import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The API runs on its own port in development; Vite proxies /api to it so the
// browser only ever talks to one origin (same as production).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3000}` },
  },
});
