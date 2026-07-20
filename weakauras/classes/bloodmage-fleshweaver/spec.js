// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/bloodmage.json (Fleshweaver). Awaits in-game confirmation
// (debuff name "Vampyr's Kiss", buff "Pooled Vitality" + its real stack cap, Rage power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
