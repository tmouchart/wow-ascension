// Dev launcher — starts the agent backend AND the Vite frontend together (`npm run dev`).
//
// The frontend (Vite, :8372) proxies `/api` to the backend (server/server.mjs, :8374), so both must be up
// for the in-app Agent panel to work. We spawn the two processes with
// node's own child_process and forward their output, and kill both when either exits or on Ctrl+C.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createWriteStream } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// Tee every child's output to dev.log (truncated each run) so it can be read back on demand, while still
// echoing to the console. Both children pipe stdout/stderr here instead of inheriting the terminal directly.
const logPath = join(root, 'dev.log');
const logFile = createWriteStream(logPath, { flags: 'w' });
function tee(name, stream, out) {
  stream.on('data', chunk => {
    const text = chunk.toString();
    out.write(text);
    logFile.write(text.replace(/^(?=.)/gm, `[${name}] `));
  });
}
function logLine(text) {
  process.stdout.write(text + '\n');
  logFile.write(text + '\n');
}

// On Windows, npm is a .cmd shim — Node 24 refuses to spawn it without shell:true (EINVAL). node.exe
// spawns fine directly, so only the npm process needs the shell.
// Both run through `npm run dev`: the backend's dev script is nodemon (hot-reloads server.mjs + ../lib on
// change), the frontend's is Vite. On Windows npm is a .cmd shim so it needs shell:true (Node refuses to
// spawn .cmd otherwise); killTree reaps the whole shim->nodemon/vite tree by pid on shutdown.
const procs = [
  { name: 'backend', cmd: npm, args: ['--prefix', join(root, 'weakauras', 'server'), 'run', 'dev'], shell: process.platform === 'win32' },
  { name: 'frontend', cmd: npm, args: ['--prefix', join(root, 'weakauras', 'web'), 'run', 'dev'], shell: process.platform === 'win32' },
];

const children = [];
let shuttingDown = false;

// On Windows a shell-spawned npm.cmd has vite as a grandchild; child.kill() only reaps the shim and orphans
// vite (leaving :8372 held). Kill the whole tree by pid via taskkill /T — SYNCHRONOUSLY, so the tree is
// actually gone before shutdown() calls process.exit(). Elsewhere a plain kill suffices.
function killTree(c) {
  if (!c.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { c.kill(); } catch {}
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) killTree(c);
  process.exit(code);
}

logLine(`[dev] logging to ${logPath}`);
for (const p of procs) {
  const child = spawn(p.cmd, p.args, { cwd: root, stdio: ['inherit', 'pipe', 'pipe'], shell: p.shell });
  tee(p.name, child.stdout, process.stdout);
  tee(p.name, child.stderr, process.stderr);
  child.on('exit', code => { logLine(`[dev] ${p.name} exited (${code})`); shutdown(code ?? 0); });
  child.on('error', err => { logLine(`[dev] ${p.name} failed to start: ${err.message}`); shutdown(1); });
  children.push(child);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
