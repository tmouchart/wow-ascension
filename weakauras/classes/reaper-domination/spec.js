// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/reaper.json (Domination). Awaits in-game confirmation
// (aura name "Reaped Soul", resource model).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
