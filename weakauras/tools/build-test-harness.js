// Client-compat test harness — ONE package exercising every element kind, clause, glow type and
// custom-Lua trigger the framework can emit, through the production SPEC pipeline (specToParts ->
// buildPackage). Import it in-game on Ascension: if it imports cleanly and /wa still opens, no
// emitted shape crashes the WeakAuras load loop (the IsSpellKnown incident class).
// Lives in tools/ (not classes/) so it stays out of the web presets, coverage and golden guardrail.
//   node tools/build-test-harness.js   -> dist/test-harness.import.txt
module.exports = require('../lib/spec-node.js').specToPackage(require('./test-harness.spec.json'));
