// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/reaper.json (Soul). Awaits in-game confirmation
// (aura names "Reaped Soul" / "Ghostly Weapon", resource model).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
