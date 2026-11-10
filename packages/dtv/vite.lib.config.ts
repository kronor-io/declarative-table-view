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
            // React and every entry point of it, `react/jsx-runtime` included, come from the host.
            // A bundled jsx-runtime would `require('react')` in development, which Rolldown cannot
            // turn into an import of the external `react`: the host's dev build would fail with
            // "Calling `require` for "react" in an environment that doesn't expose the `require` function".
            external: [/^react(-dom)?(\/.*)?$/],
            output: {
                globals: {
                    react: 'React',
                    'react-dom': 'ReactDOM'
                }
            }
        }
    }
});
