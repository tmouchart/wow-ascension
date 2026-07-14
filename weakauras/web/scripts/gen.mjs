// Pre-bundle the isomorphic generator (lib/browser-entry.mjs -> src/generated/generator.js) via the
// esbuild JS API. Uses the API (not the `esbuild` CLI) so it doesn't depend on a node_modules/.bin shim
// being on PATH (flaky on Windows). Run by `npm run gen` (predev/prebuild hooks).
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const web = dirname(dirname(fileURLToPath(import.meta.url)));
await build({
  entryPoints: [join(web, '..', 'lib', 'browser-entry.mjs')],
  bundle: true,
  format: 'esm',
  outfile: join(web, 'src', 'generated', 'generator.js'),
  logLevel: 'info',
});
