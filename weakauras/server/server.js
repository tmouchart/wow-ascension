// WA-Forge agent backend — P0 skeleton.
//
// One Node server (later serves the SPA build too). For now it proves the core contract: a posted SPEC
// round-trips through the SAME isomorphic validator the browser and the golden guardrail use
// (lib/spec-builder.js -> specToParts). No LLM yet — that arrives in P1 (Hono + Vercel AI SDK).
//
//   node server/server.js                 # listens on $PORT (default 8080)
//   GET  /health                          # -> { ok: true }
//   POST /api/agent   { spec }            # -> { ok, regions, name }  |  { ok:false, error }  (400)
//
// Zero npm dependencies (project convention). Kept plain-http so it runs & tests without an install.
const http = require('http');
const { specToParts } = require('../lib/spec-builder.js');

const PORT = Number(process.env.PORT) || 8080;

// Validate a SPEC exactly as the generator would. Throws are turned into a structured error by the caller.
function validate(spec) {
  const { name, children } = specToParts(spec);   // throws loudly on any invalid element/field/dup id
  return { ok: true, name, regions: children.length };
}

function sendJson(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s) });
  res.end(s);
}

// Read a request body with a hard cap (a SPEC is small JSON; reject anything absurd).
const MAX_BODY = 1 << 20;   // 1 MB
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '', size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return sendJson(res, 200, { ok: true });

  if (req.method === 'POST' && req.url === '/api/agent') {
    let body;
    try { body = JSON.parse(await readBody(req)); }
    catch { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
    if (!body || typeof body.spec !== 'object' || body.spec === null)
      return sendJson(res, 400, { ok: false, error: 'body needs a `spec` object' });

    // No messages -> pure validation round-trip (P0 behavior). With messages -> run the agent (P1).
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      try { return sendJson(res, 200, validate(body.spec)); }
      catch (e) { return sendJson(res, 400, { ok: false, error: String(e.message || e) }); }
    }
    if (!process.env.OPENROUTER_API_KEY)
      return sendJson(res, 503, { ok: false, error: 'OPENROUTER_API_KEY not set' });
    if (typeof body.slug !== 'string')
      return sendJson(res, 400, { ok: false, error: 'agent requests need a `slug`' });

    // Stream the run as NDJSON: one JSON event per line ({type:model|text|tool|done|error}), flushed as it
    // happens so the frontend can show the answer + tool trace scrolling live.
    const { runAgentStream } = await import('./agent.mjs');   // ESM agent, lazy-loaded from this CJS server
    res.writeHead(200, { 'content-type': 'application/x-ndjson', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
    try {
      for await (const ev of runAgentStream({ slug: body.slug, spec: body.spec, messages: body.messages }))
        res.write(JSON.stringify(ev) + '\n');
    } catch (e) {
      res.write(JSON.stringify({ type: 'error', error: String(e.message || e) }) + '\n');
    }
    return res.end();
  }

  sendJson(res, 404, { ok: false, error: 'not found' });
});

server.listen(PORT, () => console.log(`wa-forge agent (P0) listening on :${PORT}`));
