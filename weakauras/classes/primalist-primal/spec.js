// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/primalist.json (Primal). Awaits in-game confirmation
// (aura names "Frenzied Roar" / "Boon of the Bear" / "Rock Barrier" / "Bearskin", Rage power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
