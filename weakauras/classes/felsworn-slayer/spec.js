// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/felsworn.json (Slayer). Awaits in-game confirmation
// (aura names "Inner Demon" / "Immolation Aura" / "Felfury" + the defensive buff names).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
