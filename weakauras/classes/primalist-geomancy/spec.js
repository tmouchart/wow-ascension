// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/primalist.json (Geomancy). Awaits in-game confirmation
// (aura names "Earthshaping" + its stack cap, "Golem Form", "Earth's Embrace", Rage power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
