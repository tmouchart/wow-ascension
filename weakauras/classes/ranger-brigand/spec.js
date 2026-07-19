// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/ranger.json (Brigand). Awaits in-game confirmation
// (aura names "Ravage" + "Advantage" cap, Focus resource index 2).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
