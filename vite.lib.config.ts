import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import tailwindcss from '@tailwindcss/vite';

// Library build config. Builds the App component + types with embedded CSS.
export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        cssInjectedByJsPlugin()
    ],
    build: {
        lib: {
            entry: 'src/lib/index.ts',
            name: 'Dtv',
            fileName: () => 'index.es.js',
            formats: ['es']
        },
        outDir: 'dist',
        emptyOutDir: false,
        rollupOptions: {
            external: [
                'react',
                'react-dom'
            ],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM'
                }
            }
        }
    }
});
