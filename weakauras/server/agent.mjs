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

const SYSTEM = `You edit a WeakAuras "SPEC" for a custom WoW class. The SPEC is a vertical stack of elements
(kinds: procRow, cdRow, buffRow, powerBar, healthBar, stackBar, uptimeBar, stacks, chargeStacks). A cdRow
holds cooldown icons; there is a primary cdRow and an optional secondary one. A procRow holds "use it now"
proc icons. An uptimeBar tracks a buff's remaining duration.

You act ONLY through tools. Rules:
- ALWAYS resolve a spell with searchAbilities before adding it — NEVER invent a spellId.
- Call describeSpec first to see the current layout (element indices, icons).
- If a tool returns ok:false, read the error and fix your call (a duplicate means it is already there).
- Place damage/offensive cooldowns on the primary cdRow, defensive/utility on the secondary.
Keep your final answer to the user short: say what you changed (or why you couldn't).`;

const clone = o => JSON.parse(JSON.stringify(o));

// Build the tool set closing over a mutable ctx ({ slug, spec }). Each mutating tool commits the validated
// spec to ctx on success and never returns the whole spec to the model.
function buildTools(ctx) {
  const commit = r => { if (r.ok) ctx.spec = r.spec; const { spec: _s, ...view } = r; void _s; return view; };
  return {
    describeSpec: tool({
      description: 'Return a compact view of the current SPEC: every stack element (with its index) and its icons.',
      inputSchema: z.object({}),
      execute: async () => ops.describeSpec(ctx.spec),
    }),
    searchAbilities: tool({
      description: 'Resolve a spell name to its spellId + metadata (category, tags, cooldown) from the class registry.',
      inputSchema: z.object({ query: z.string().describe('a spell name or fragment') }),
      execute: async ({ query }) => ops.searchAbilities(ctx.slug, query),
    }),
    addCooldownIcon: tool({
      description: 'Add a cooldown icon for a spell to the primary or secondary cdRow.',
      inputSchema: z.object({ spell: z.string(), row: z.enum(['primary', 'secondary']).default('primary') }),
      execute: async a => commit(ops.addCooldownIcon(ctx.spec, ctx.slug, a)),
    }),
    addProc: tool({
      description: 'Add a proc icon (shows + glows white when the given buff is up; defaults to the spell\'s own buff).',
      inputSchema: z.object({ spell: z.string(), whenBuff: z.string().optional() }),
      execute: async a => commit(ops.addProc(ctx.spec, ctx.slug, a)),
    }),
    addUptimeBar: tool({
      description: 'Add a bar tracking a buff\'s remaining duration.',
      inputSchema: z.object({ buff: z.string(), label: z.string().optional() }),
      execute: async a => commit(ops.addUptimeBar(ctx.spec, a)),
    }),
    setCooldownGlow: tool({
      description: 'Set or clear a glow rule on an existing cooldown icon. type: buff|buffMissing (need `buff`), ready, or none.',
      inputSchema: z.object({
        spell: z.string(), row: z.enum(['primary', 'secondary']).default('primary'),
        type: z.enum(['buff', 'buffMissing', 'ready', 'none']), buff: z.string().optional(),
      }),
      execute: async a => commit(ops.setCooldownGlow(ctx.spec, ctx.slug, a)),
    }),
    removeElement: tool({
      description: 'Remove a stack element by its index (see describeSpec).',
      inputSchema: z.object({ index: z.number().int() }),
      execute: async a => commit(ops.removeElement(ctx.spec, a)),
    }),
    removeIcon: tool({
      description: 'Remove a cooldown icon (by spell name or id) from the primary or secondary cdRow.',
      inputSchema: z.object({ spell: z.string(), row: z.enum(['primary', 'secondary']).default('primary') }),
      execute: async a => commit(ops.removeIcon(ctx.spec, ctx.slug, a)),
    }),
    moveElement: tool({
      description: 'Reorder the vertical stack: move the element at `from` to index `to`.',
      inputSchema: z.object({ from: z.number().int(), to: z.number().int() }),
      execute: async a => commit(ops.moveElement(ctx.spec, a)),
    }),
    setCombatOnly: tool({
      description: 'Toggle whether the whole WeakAura is hidden out of combat.',
      inputSchema: z.object({ on: z.boolean() }),
      execute: async a => commit(ops.setCombatOnly(ctx.spec, a)),
    }),
  };
}

// Async generator: yields streaming events. Tries each model in the cascade; a model that fails before
// emitting anything falls through to the next (spec snapshotted + restored). Once a model has started
// emitting, we are committed to it (a mid-stream error ends with an error event).
export async function* runAgentStream({ slug, spec, messages }) {
  const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
  const ctx = { slug, spec };
  const tools = buildTools(ctx);

  let lastErr;
  for (const model of MODELS) {
    const snapshot = clone(ctx.spec);
    let started = false, text = '';
    const trace = [];
    try {
      const result = streamText({ model: openrouter(model), system: SYSTEM, messages, tools, maxRetries: 1, stopWhen: stepCountIs(8) });
      // `started` flips only on REAL output (text/tool) — control parts (start/start-step) arrive before the
      // model actually responds, so counting them would defeat the cascade (a model that rate-limits before
      // emitting anything must fall through to the next).
      const begin = () => { if (!started) { started = true; return { type: 'model', model }; } };
      for await (const part of result.fullStream) {
        if (part.type === 'error') throw part.error;
        if (part.type === 'text-delta') {
          const v = part.text ?? part.delta ?? '';
          if (v) { const m = begin(); if (m) yield m; text += v; yield { type: 'text', value: v }; }
        } else if (part.type === 'tool-call') {
          const m = begin(); if (m) yield m;
          trace.push({ tool: part.toolName, args: part.input });
          yield { type: 'tool', name: part.toolName };
        }
      }
      yield { type: 'done', newSpec: ctx.spec, summary: text, trace, model };
      return;
    } catch (e) {
      lastErr = e;
      ctx.spec = snapshot;   // roll back any partial mutation
      // Free models routed through flaky providers can fail MID-stream. Rather than commit to a broken run,
      // tell the client to discard this model's partial output (`reset`) and retry with the next model.
      if (started) yield { type: 'reset' };
    }
  }
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
