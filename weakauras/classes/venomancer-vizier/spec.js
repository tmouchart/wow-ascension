// Thin Node writer — SPEC data lives in spec.json (also consumed by the web app).
// Built from registry/rotations/venomancer.json (Vizier). Awaits in-game confirmation
// (every aura name matched by exact string, and the primary power index).
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
