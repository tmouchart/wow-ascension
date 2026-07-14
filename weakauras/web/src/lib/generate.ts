// Client-side WeakAuras generation: SPEC -> parts -> top envelope -> !WA:2! string, 100% in the browser.
// Reuses the SAME isomorphic compiler as the Node build (lib/spec-builder.js + lib/builders-core.js),
// only swapping the codec for the async CompressionStream port. Cross-tested in tools/webcodec-crosstest.mjs.
import { specToParts, assembleTop } from '../generated/generator.js';
import { encodeWA } from './wa-codec.js';

export async function generateString(spec: unknown): Promise<string> {
  const parts = specToParts(spec);
  const top = assembleTop(parts);
  return await encodeWA(top);
}
