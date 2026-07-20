// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/stormbringer.json (Maelstrom). Awaits in-game confirmation
// (aura names, and the Mana power index, which is inferred not confirmed for this class).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
