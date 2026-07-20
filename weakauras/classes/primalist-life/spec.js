// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/primalist.json (Life). Awaits in-game confirmation
// (aura names "Primal Power" / "Rock Barrier" / "Bearskin", Rage power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
