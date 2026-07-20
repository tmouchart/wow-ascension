// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/templar.json (Oathkeeper). Awaits in-game confirmation
// (Blade of Faith debuff name, the Libram/Testament/Barrier buff names, Energy power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
