// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/witch-hunter.json. Awaits in-game confirmation
// (aura names, Rage power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
