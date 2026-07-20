// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/chronomancer.json (Artificer). Awaits in-game confirmation
// (self-buff name "Paradox Cannon", Mana power index). Echo Fragments have no named aura -> not tracked.
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
