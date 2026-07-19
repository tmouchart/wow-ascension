import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The generator is pre-bundled by esbuild into src/generated/generator.js (see `npm run gen`), so no
// CommonJS-in-Vite gymnastics are needed. server.fs.allow '..' lets App.tsx import the registry JSON
// (registry/INDEX.json) from the weakauras root, one level up from web/.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Fixed non-standard ports so the dev/preview servers never collide with other local projects.
  // /api -> the agent backend (server/server.mjs on :8374), so the app calls `/api/agent` relatively in
  // dev exactly as it will same-origin in prod (no CORS). Run the backend with `node server/server.mjs`.
  server: {
    port: 8372, strictPort: true, fs: { allow: ['..'] },
    proxy: { '/api': 'http://localhost:8374' },
  },
  preview: { port: 8373, strictPort: true },
});
