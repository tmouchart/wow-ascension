// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/bloodmage.json (Eternal). Awaits in-game confirmation
// (Rotclaw charge count, aura names "Eternal Resolve" / "Blood Pact" / "Blood Veil", Rage power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
