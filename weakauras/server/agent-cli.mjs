// Manual P1 harness — run the agent against a class spec from the command line (no browser needed).
//   OPENROUTER_API_KEY=sk-... node server/agent-cli.mjs felsworn "add Felwrath to the cooldown row"
// Prints the agent's summary, the tool trace, and whether the resulting SPEC still validates.
import { createRequire } from 'node:module';
import { runAgent } from './agent.mjs';
const require = createRequire(import.meta.url);
const { specToParts } = require('../lib/spec-builder.js');

const [slug, ...rest] = process.argv.slice(2);
const prompt = rest.join(' ');
if (!slug || !prompt) { console.error('usage: node server/agent-cli.mjs <slug> "<instruction>"'); process.exit(1); }
if (!process.env.OPENROUTER_API_KEY) { console.error('set OPENROUTER_API_KEY'); process.exit(1); }

const spec = require(`../classes/${slug}/spec.json`);
const before = specToParts(spec).children.length;
const r = await runAgent({ slug, spec, messages: [{ role: 'user', content: prompt }] });

console.log('\n--- model ---\n' + r.model);
console.log('\n--- summary ---\n' + (r.summary || '(none)'));
console.log('\n--- tool trace ---');
for (const t of r.trace) console.log(`  ${t.tool}(${JSON.stringify(t.args)})`);
const after = specToParts(r.newSpec).children.length;   // throws if the agent produced an invalid spec
console.log(`\nregions: ${before} -> ${after}  (spec re-validates OK)`);
