import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';

// Built into the library for analytics events (see src/framework/dtv-version.ts). `npm publish`
// builds again after the version bump, so the published build has the released version.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Library build config. Builds the App component + types with embedded CSS.
export default defineConfig({
    define: {
        __DTV_VERSION__: JSON.stringify(version)
    },
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
