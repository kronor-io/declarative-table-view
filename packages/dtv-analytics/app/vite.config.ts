import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The app, built into dist/app for the server to serve. In development the server's API is
// proxied: start a source with `dtv-analytics up` first.
export default defineConfig({
    root: fileURLToPath(new URL('.', import.meta.url)),
    plugins: [react()],
    build: {
        outDir: fileURLToPath(new URL('../dist/app', import.meta.url)),
        emptyOutDir: true,
    },
    server: {
        port: 5180,
        proxy: { '/api': process.env.DTV_ANALYTICS_SERVER ?? 'http://localhost:4310' },
    },
});
