// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/starcaller.json (Warden). Awaits in-game confirmation
// (aura names "Aspect of the Cosmos" + "Scattered Stars", stack cap, Mana power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
