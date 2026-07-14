// Thin Node writer — the SPEC data lives in spec.json (the SAME file the web app consumes as its preset).
// Output stays separate from the known-good hand-built build.js until the spec-generated package is
// confirmed in-game, then build.js retires.
module.exports = require('../../lib/spec-node.js').specToPackage(require('./spec.json'));
