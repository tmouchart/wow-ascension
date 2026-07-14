// Cross-test the browser codec (web/src/lib/wa-codec.js, ESM async) against the Node codec
// (lib/wa-codec.js, zlib sync). Proves a string the web encoder produces round-trips through the
// Node codec and vice-versa — the frontend's #1 risk (client-side generation) de-risked.
//   node tools/webcodec-crosstest.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const node = require('../lib/wa-codec.js');
const web = await import('../web/src/lib/wa-codec.js');

const top = JSON.parse(readFileSync(join(__dirname, '..', 'dist', 'felsworn-spec.decoded.json'), 'utf8'));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let bad = 0;
const check = (name, cond) => { console.log(`${cond ? 'OK' : 'XX'}  ${name}`); if (!cond) bad++; };

// 1. web ENCODE -> Node DECODE recovers top
const webStr = await web.encodeWA(top);
check('web-encode -> node-decode == top', eq(node.decodeWA(webStr).data, top));

// 2. Node ENCODE -> web DECODE recovers top
const nodeStr = node.encodeWA(top);
check('node-encode -> web-decode == top', eq((await web.decodeWA(nodeStr)).data, top));

// 3. full browser circle: web ENCODE -> web DECODE
check('web-encode -> web-decode == top', eq((await web.decodeWA(webStr)).data, top));

// 4. both encoders emit a valid !WA:2! string of comparable length
console.log(`   node str ${nodeStr.length} chars | web str ${webStr.length} chars`);
check('web string is a !WA:2! string', webStr.startsWith('!WA:2!'));

process.exit(bad ? 1 : 0);
