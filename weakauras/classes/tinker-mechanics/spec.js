// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/tinker.json (Mechanics). Awaits in-game confirmation
// (aura name "Kinetic Shield", Mana power index, Makeshift Dynamite charge cap).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
