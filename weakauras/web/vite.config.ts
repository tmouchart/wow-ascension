import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The generator is pre-bundled by esbuild into src/generated/generator.js (see `npm run gen`), so no
// CommonJS-in-Vite gymnastics are needed. server.fs.allow '..' lets App.tsx import the registry JSON
// (registry/INDEX.json) from the weakauras root, one level up from web/.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
});
