// P2/P3 agent loop: natural language -> validated SPEC mutations, via Vercel AI SDK + OpenRouter.
//
// Stateless: one call per request. A per-request `ctx` holds the working spec; the tools close over it and
// mutate it through the PURE, validated ops in spec-ops.js (every mutation re-runs specToParts, so a bad op
// is rejected and fed back to the model to self-correct).
//
// `runAgentStream` is the primitive: an async generator that yields events as they happen
//   { type:'model', model } | { type:'text', value } | { type:'tool', name } | { type:'done', newSpec, summary, trace, model } | { type:'error', error }
// so the frontend can show the answer + tool trace scrolling live. `runAgent` drains it to a single result
// (used by the CLI). Model cascade: AGENT_MODELS (cheapest/free first) is tried in order; a model that fails
// BEFORE emitting anything falls through to the next (the working spec is snapshotted + restored).
import { streamText, tool, stepCountIs } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import ops from './spec-ops.js';   // CJS default import

const DEFAULT_MODELS = 'meta-llama/llama-3.3-70b-instruct:free,openai/gpt-oss-20b:free,openai/gpt-4o-mini';
const MODELS = (process.env.AGENT_MODELS || DEFAULT_MODELS).split(',').map(s => s.trim()).filter(Boolean);

const SYSTEM = `You edit a WeakAuras "SPEC" for a custom WoW class, through tools only.

The SPEC is a vertical "stack" of elements (top -> bottom). Element kinds:
- bars: powerBar (resource, needs powerType), healthBar, stackBar (aura-stack resource), uptimeBar (buff countdown), buffWarnText
- boxes: stacks (aura point boxes, has a "count"), chargeStacks (spell charge boxes)
- icon containers (hold icons): cdRow (cooldowns: a primary + optional secondary), procRow ("use it now" procs), buffRow (buff-state icons)
Containers are referenced by role: primary | secondary | proc | buff | left | right (side rails), or a numeric stack index.

Tools:
- describeSpec: the current layout — every element with its index and fields (count, powerType, colors...), the icons per container, global sizing, combatOnly. CALL FIRST.
- searchAbilities: resolve a spell NAME to its spellId + metadata. ALWAYS call before adding a spell — NEVER invent a spellId.
- addElement: add a stack element (typed per kind). Container kinds are created empty — fill them with addIcon.
- updateElement: merge-patch ONE element's fields by index (null deletes a field). This is how you change a value — e.g. a stack "count" or a bar color.
- removeElement / moveElement: drop or reorder an element by index.
- addIcon / updateIcon / removeIcon: manage icons in a container. Offensive CDs -> primary; defensive/utility -> secondary; procs -> proc; buff-state -> buff.
- setGlobal: sizing/offsets + combatOnly (hide the whole WA out of combat).

Rules:
- describeSpec first; act by the index/role it returns.
- If a tool returns ok:false, read the error and fix your call (a duplicate already exists; "ambiguous" returns candidates to choose from).
- Keep your final answer short: say what you changed (or why you couldn't).`;

const clone = o => JSON.parse(JSON.stringify(o));

// ---- shared Zod shapes (structure is generic; fields are typed per kind, `raw` reaches the rest, and
// every mutation is revalidated by specToParts so a malformed payload is rejected, not shipped) ----
const color = z.array(z.number()).length(4).describe('[r,g,b,a], each 0..1');
const containerRef = z.union([z.enum(['primary', 'secondary', 'proc', 'buff', 'left', 'right']), z.number().int()])
  .describe('container role or a numeric stack index');

// proc `when` clause — set EXACTLY ONE key (validated downstream)
const whenClause = z.object({
  buff: z.string().optional().describe('self-buff present'),
  buffMissing: z.string().optional().describe('self-buff absent'),
  anyBuff: z.array(z.string()).optional().describe('any of these buffs present'),
  buffStacks: z.object({ name: z.string(), op: z.string().optional(), value: z.number() }).optional(),
  targetHpBelow: z.number().optional().describe('target HP% below (execute window)'),
  powerAtLeast: z.number().optional(),
  powerType: z.number().int().optional(),
  spellReady: z.boolean().optional().describe("this icon's own spell off cooldown"),
  charges: z.object({ op: z.string().optional(), value: z.number() }).optional(),
  stealable: z.boolean().optional(),
});
const glow = z.object({
  type: z.enum(['ready', 'readyPower', 'powerPct', 'buff', 'buffMissing', 'targetHealthBelow', 'onCharges']).optional()
    .describe('cd-icon glow rule (omit for a proc-icon glow, which only styles color/glowType/when)'),
  color: color.optional(),
  glowType: z.enum(['buttonOverlay', 'Pixel', 'ACShine']).optional().describe('buttonOverlay = Action Button (act now); Pixel = passive state'),
  buff: z.string().optional().describe('for type buff|buffMissing'),
  power: z.number().optional().describe('for type readyPower'),
  pct: z.number().optional().describe('for type powerPct|targetHealthBelow'),
  spell: z.union([z.string(), z.number()]).optional().describe('for type onCharges'),
  byName: z.boolean().optional(), op: z.string().optional(), value: z.number().optional(),
  when: z.array(whenClause).optional().describe('proc-icon: extra clauses gating the glow'),
});
// one rich icon schema; the op guards container-appropriateness + specToParts validates the shape
const icon = z.object({
  label: z.string().optional().describe('display label + region id; defaults to the resolved spell name'),
  spell: z.union([z.string(), z.number()]).optional().describe('spellId or name (cd/proc icons); resolved via the registry'),
  byName: z.boolean().optional().describe('match by name, not spellId (no art on this client)'),
  fallbackIcon: z.string().optional(),
  glow: glow.optional(),
  proc: z.string().optional().describe('cd icon: proc-only, shows/glows while this buff is up'),
  charges: z.boolean().optional().describe('cd icon: append a charge-count subtext'),
  showPowerAbove: z.number().optional(), powerType: z.number().int().optional(),
  when: z.array(whenClause).optional().describe('proc icon: AND-ed clauses that light it up'),
  hide: z.enum(['slot', 'collapse']).optional(),
  display: z.object({ timer: z.enum(['cooldown', 'buff', 'none']).optional(), stacks: z.boolean().optional(),
    cooldownNumbers: z.boolean().optional(), desaturateOnCd: z.boolean().optional() }).optional(),
  anyOf: z.array(z.string()).optional().describe('buff icon: shown while ANY of these buffs is up'),
  weaponEnchant: z.enum(['main', 'off']).optional(),
  indicator: z.string().optional().describe('buff icon: always shown, dim while this buff is missing'),
  lowPowerGlow: z.object({ pct: z.number(), powerType: z.number().int().optional(), color: color.optional(), glowType: z.string().optional() }).optional(),
});

// addElement: a discriminated union over `kind` — typed per kind, with `raw` for rare fields + `at` position
const capGlow = z.object({ at: z.number().optional(), unlessBuff: z.string().optional(), color: color.optional(), glowType: z.string().optional() });
const elBase = { at: z.number().int().optional().describe('insert position (default: end of the stack)'),
  raw: z.record(z.any()).optional().describe('escape hatch: extra fields merged verbatim, then revalidated') };
const el = (kind, shape) => z.object({ kind: z.literal(kind), ...shape, ...elBase });
const elementUnion = z.discriminatedUnion('kind', [
  el('powerBar', { powerType: z.number().int().describe('power index: 0 Mana,1 Rage,2 Focus,3 Energy,4 Combo,6 Runic,9 Holy'),
    hi: color.optional(), lo: color.optional(), bg: color.optional(), text: z.string().optional(), textSize: z.number().optional(), height: z.number().optional(), width: z.number().optional(), id: z.string().optional() }),
  el('healthBar', { unit: z.string().optional(), hi: color.optional(), lo: color.optional(), bg: color.optional(), text: z.string().optional(), height: z.number().optional(), id: z.string().optional() }),
  el('stackBar', { aura: z.string().describe('the stacking buff name'), max: z.number(), hi: color.optional(), lo: color.optional(), bg: color.optional(), text: z.string().optional(), debuffType: z.string().optional(), height: z.number().optional(), id: z.string().optional() }),
  el('uptimeBar', { buff: z.union([z.string(), z.array(z.string())]).describe('one buff name, or [names] for any-of'), label: z.string().optional(), warnText: z.string().optional(), bg: color.optional(), downBg: color.optional(), height: z.number().optional(), id: z.string().optional() }),
  el('buffWarnText', { buff: z.string(), text: z.string().describe('ASCII only'), color: color.optional(), fontSize: z.number().optional(), height: z.number().optional(), width: z.number().optional(), id: z.string().optional() }),
  el('stacks', { auraNames: z.array(z.string()).describe('buff names giving the stack count'), count: z.number().int(), hi: color.optional(), lo: color.optional(), emptyBg: color.optional(), unit: z.string().optional(), debuffType: z.string().optional(), unitExists: z.boolean().optional(), gap: z.number().optional(), height: z.number().optional(), capGlow: capGlow.optional(), id: z.string().optional() }),
  el('chargeStacks', { spell: z.union([z.string(), z.number()]), count: z.number().int(), byName: z.boolean().optional(), hi: color.optional(), lo: color.optional(), emptyBg: color.optional(), gap: z.number().optional(), height: z.number().optional(), id: z.string().optional() }),
  el('procRow', { size: z.number().optional(), id: z.string().optional() }),
  el('cdRow', { secondary: z.boolean().optional(), size: z.number().optional(), id: z.string().optional() }),
  el('buffRow', { secondary: z.boolean().optional(), size: z.number().optional(), id: z.string().optional() }),
]);

// Build the tool set closing over a mutable ctx ({ slug, spec }). Each mutating tool commits the validated
// spec to ctx on success and never returns the whole spec to the model.
function buildTools(ctx) {
  const commit = r => { if (r.ok) ctx.spec = r.spec; const { spec: _s, ...view } = r; void _s; return view; };
  return {
    describeSpec: tool({
      description: 'The current SPEC: every stack element with its index + fields, the icons per container, global sizing, combatOnly. Call this first.',
      inputSchema: z.object({}),
      execute: async () => ops.describeSpec(ctx.spec),
    }),
    searchAbilities: tool({
      description: 'Resolve a spell name to its spellId + metadata (category, tags, cooldown). Always call before adding a spell.',
      inputSchema: z.object({ query: z.string().describe('a spell name or fragment') }),
      execute: async ({ query }) => ops.searchAbilities(ctx.slug, query),
    }),
    addElement: tool({
      description: 'Add a stack element (typed per kind). Container kinds (cdRow/procRow/buffRow) are created empty — fill them with addIcon.',
      inputSchema: z.object({ element: elementUnion }),
      execute: async ({ element }) => commit(ops.addElement(ctx.spec, ctx.slug, element)),
    }),
    updateElement: tool({
      description: 'Merge-patch one element\'s fields by index (null deletes a field). Use to change a value, e.g. a stack count or a bar color.',
      inputSchema: z.object({ index: z.number().int(), set: z.record(z.any()).describe('fields to merge; null deletes a key') }),
      execute: async a => commit(ops.updateElement(ctx.spec, a)),
    }),
    removeElement: tool({
      description: 'Remove a stack element by its index (see describeSpec).',
      inputSchema: z.object({ index: z.number().int() }),
      execute: async a => commit(ops.removeElement(ctx.spec, a)),
    }),
    moveElement: tool({
      description: 'Reorder the vertical stack: move the element at `from` to index `to`.',
      inputSchema: z.object({ from: z.number().int(), to: z.number().int() }),
      execute: async a => commit(ops.moveElement(ctx.spec, a)),
    }),
    addIcon: tool({
      description: 'Add an icon to a container (created if absent). Offensive CDs -> primary, defensive -> secondary, procs -> proc, buff-state -> buff.',
      inputSchema: z.object({ container: containerRef, icon }),
      execute: async a => commit(ops.addIcon(ctx.spec, ctx.slug, a)),
    }),
    updateIcon: tool({
      description: 'Merge-patch an existing icon (found by spell name/id or label) in a container. e.g. set glow to {type:"ready"}, or null to clear it.',
      inputSchema: z.object({ container: containerRef, match: z.string().describe('spell name/id or icon label'), set: z.record(z.any()) }),
      execute: async a => commit(ops.updateIcon(ctx.spec, ctx.slug, a)),
    }),
    removeIcon: tool({
      description: 'Remove an icon (by spell name/id or label) from a container.',
      inputSchema: z.object({ container: containerRef, match: z.string() }),
      execute: async a => commit(ops.removeIcon(ctx.spec, ctx.slug, a)),
    }),
    setGlobal: tool({
      description: 'Patch global sizing/offsets and combatOnly (hide the whole WA out of combat).',
      inputSchema: z.object({ set: z.object({
        barWidth: z.number().optional(), iconSize: z.number().optional(), secIconSize: z.number().optional(),
        procSize: z.number().optional(), gap: z.number().optional(), xOffset: z.number().optional(),
        yOffset: z.number().optional(), combatOnly: z.boolean().optional(),
      }) }),
      execute: async a => commit(ops.setGlobal(ctx.spec, a)),
    }),
  };
}

// Structured, timestamped logging so the backend (dev.log) tells the story of a run: which model is being
// tried, how long we waited for the first token (TTFT), each tool call, and every fall-through. Prefixed
// `[agent]` to stand apart from server request lines (the dev launcher already tags them `[backend]`).
const clock = () => new Date().toISOString().slice(11, 23);   // HH:MM:SS.mmm
const log = (...a) => console.log('[agent]', clock(), ...a);
// One-line, human-readable reason a model was dropped (429 rate-limit is the common one — surface its detail).
const briefErr = (e) => {
  const code = e?.statusCode ? `${e.statusCode} ` : '';
  const msg = String(e?.message || e).split('\n')[0].replace(/\s+/g, ' ').slice(0, 160);
  return `${code}${msg}`;
};

// Async generator: yields streaming events. Tries each model in the cascade; a model that fails before
// emitting anything falls through to the next (spec snapshotted + restored). Once a model has started
// emitting, we are committed to it (a mid-stream error ends with an error event).
export async function* runAgentStream({ slug, spec, messages }) {
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  const ctx = { slug, spec };
  const tools = buildTools(ctx);

  const t0 = Date.now();
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  log(`── run start · slug=${slug} · "${String(lastUser?.content || '').replace(/\s+/g, ' ').slice(0, 120)}"`);
  log(`   cascade: ${MODELS.join(' -> ')}`);

  let lastErr;
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    const snapshot = clone(ctx.spec);
    let started = false, text = '', tools_n = 0;
    const trace = [];
    const tModel = Date.now();
    log(`[${i + 1}/${MODELS.length}] trying ${model}`);
    try {
      // maxRetries: 0 — a rate-limited free model (429 with Retry-After: 30) must fall through to the NEXT
      // model in the cascade INSTANTLY, not sleep ~30s honoring the retry header. The cascade IS the retry.
      const result = streamText({ model: openrouter(model), system: SYSTEM, messages, tools, maxRetries: 0, stopWhen: stepCountIs(8) });
      // `started` flips only on REAL output (text/tool) — control parts (start/start-step) arrive before the
      // model actually responds, so counting them would defeat the cascade (a model that rate-limits before
      // emitting anything must fall through to the next).
      const begin = () => { if (!started) { started = true; return { type: 'model', model }; } };
      // Per-STEP timing: a tool-using turn is several LLM round-trips (call -> tool -> call -> ...), each with
      // its OWN queue wait on the free tier. The wait is the SILENT gap between sending a call (or getting a
      // tool result) and the next first token — measure it from there (start-step fires only AFTER the wait,
      // so it would under-report). No wait stays invisible.
      let step = 0, stepStarted = false, tWait = Date.now();
      const markStepOutput = () => {
        if (!stepStarted) { stepStarted = true; log(`      step ${step}: first token after ${Date.now() - tWait}ms of waiting`); }
      };
      for await (const part of result.fullStream) {
        if (part.type === 'error') throw part.error;
        if (part.type === 'start-step') { step++; stepStarted = false; }
        else if (part.type === 'text-delta') {
          const v = part.text ?? part.delta ?? '';
          if (v) { markStepOutput(); const m = begin(); if (m) yield m; text += v; yield { type: 'text', value: v }; }
        } else if (part.type === 'tool-call') {
          markStepOutput(); const m = begin(); if (m) yield m;
          tools_n++;
          log(`      step ${step}: tool -> ${part.toolName}(${JSON.stringify(part.input || {}).slice(0, 120)})`);
          trace.push({ tool: part.toolName, args: part.input });
          yield { type: 'tool', name: part.toolName };
        } else if (part.type === 'tool-result') {
          tWait = Date.now();   // model must now think again — the next silent wait starts here
          log(`      step ${step}: tool result in -> calling model again, waiting …`);
        }
      }
      log(`✓ done via ${model} · ${tools_n} tool(s) · ${text.length} chars · ${Date.now() - t0}ms total`);
      yield { type: 'done', newSpec: ctx.spec, summary: text, trace, model };
      return;
    } catch (e) {
      lastErr = e;
      ctx.spec = snapshot;   // roll back any partial mutation
      const where = started ? `MID-stream (after ${tools_n} tool(s), ${text.length} chars)` : `before any output`;
      log(`✗ ${model} failed ${where} after ${Date.now() - tModel}ms: ${briefErr(e)}`);
      if (i + 1 < MODELS.length) log(`   -> falling through to ${MODELS[i + 1]}`);
      // Free models routed through flaky providers can fail MID-stream. Rather than commit to a broken run,
      // tell the client to discard this model's partial output (`reset`) and retry with the next model.
      if (started) yield { type: 'reset' };
    }
  }
  log(`✗✗ all ${MODELS.length} models failed after ${Date.now() - t0}ms — giving up`);
  yield { type: 'error', error: `all models failed (${MODELS.join(', ')}): ${lastErr?.message || lastErr}` };
}

// Non-streaming convenience (CLI): drain the stream to a single result.
export async function runAgent(req) {
  let out = null;
  for await (const ev of runAgentStream(req)) {
    if (ev.type === 'done') out = { newSpec: ev.newSpec, summary: ev.summary, trace: ev.trace, model: ev.model };
    else if (ev.type === 'error') throw new Error(ev.error);
  }
  return out;
}
