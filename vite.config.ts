import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/portal/static/assets/table-views',
  plugins: [
    react(),
    tailwindcss(),
  ],
});
