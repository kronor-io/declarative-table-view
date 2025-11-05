import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Playground Vite config to run the consumer example that imports the built library (@kronor/dtv)
// Root points to the example folder so its index.html is used.
// We removed require.resolve usage (CommonJS) to stay compatible with ESM config execution.
export default defineConfig({
    root: 'library-playground',
    plugins: [react(), tailwindcss()],
    server: {
        port: 5174,
    },
    optimizeDeps: {
        // Ensure React is pre-bundled once.
        include: ['react', 'react-dom']
    }
});
