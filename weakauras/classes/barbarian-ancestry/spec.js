// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/barbarian.json (Ancestry). Awaits in-game confirmation
// (aura names "Fill Level" + its stack cap, the enrage aura names, Energy power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
