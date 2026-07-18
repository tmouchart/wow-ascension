// Dev runner: `npm run dev` starts the agent backend (../server/server.js on :8080) AND vite together,
// and tears both down together — the /api proxy needs the backend up, and a ctrl-C must never leave an
// orphaned server behind. Extra args are forwarded to vite (`npm run dev -- --port 1234`).
// Both are spawned via process.execPath (not .bin shims) so this works in PowerShell too.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const waDir = path.dirname(webDir);

if (!process.env.OPENROUTER_API_KEY)
  console.warn('[dev] OPENROUTER_API_KEY not set — the Agent panel will answer 503 (rest of the app works).');

const server = spawn(process.execPath, [path.join(waDir, 'server', 'server.js')], { stdio: 'inherit' });
const vite = spawn(process.execPath, [path.join(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), ...process.argv.slice(2)],
  { cwd: webDir, stdio: 'inherit' });

let closing = false;
function shutdown(code) {
  if (closing) return;
  closing = true;
  process.exitCode = code;
  server.kill();
  vite.kill();
}
server.on('exit', (code) => shutdown(code ?? 0));
vite.on('exit', (code) => shutdown(code ?? 0));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => shutdown(0));
