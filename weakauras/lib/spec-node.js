// Node-only glue: SPEC -> package written to dist. Keeps spec-builder.js browser-safe (it must not
// reference builders.js, which pulls fs/zlib). The browser uses spec-builder's specToParts +
// builders-core's assembleTop + the async web codec instead.
const { specToParts } = require('./spec-builder.js');
const { buildPackage } = require('./builders.js');

// build + encode (sync) + assert round-trip + write dist.
function specToPackage(spec) {
  return buildPackage(specToParts(spec));
}

module.exports = { specToParts, specToPackage };
