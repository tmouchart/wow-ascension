# AI Agent — Design Doc (in-app WeakAura editor agent)

> Status: **design, not built.** Decisions locked with the user 2026-07-16:
> **(1) shared key behind a fly.io backend**, **(2) Vercel AI SDK + OpenRouter**,
> **(3) this doc first, code after review.**
> **Topology: ONE fly app — a single Node server serves the static SPA build AND `/api/agent`
> (replaces nginx). One image, one deploy, one secret, no CORS.**

## 0. Goal

A chat panel inside the web editor. The user types intent in natural language
("ajoute Chaos Rush en CD offensif", "track le buff Inner Demon en uptime bar",
"fais glow Decapitate quand la cible est sous 35% de vie", "enlève la secondary
row") and the agent performs **validated mutations of the current SPEC** via tool
calling, then the preview updates and the user can apply / diff / undo.

Non-goals (for v1): editing the raw `!WA:2!` JSON, multi-turn autonomous planning
beyond one request, generating brand-new classes from scratch (that's `wa-new-class`).

## 1. The core contract — the agent edits the SPEC, never the WA JSON

The app is **SPEC-first**. The store (`web/src/store.ts`) holds one `Spec`:

```ts
type Spec = { id: string; name: string; global: Record<string, number>;
              stack: El[]; left?: El; right?: El; combatOnly?: boolean };
type El   = { kind: string; enabled?: boolean; icons?: IconCfg[]; secondary?: boolean; [k]: unknown };
```

and `web/src/lib/generate.ts` compiles it: `specToParts(spec) -> assembleTop -> encodeWA`
-> the `!WA:2!` string, 100% client-side. The compiled WA package is tens of thousands
of lines (see `registry/*.json`); it is NOT something an LLM should touch directly.

**Therefore the agent's only output is SPEC mutations**, exactly the same edits the UI
already makes by drag & drop (`addIcon` / `addElement` / `setIconField` / `moveElement` …).
This buys us three things for free:

1. **Small, bounded action surface.** ~12 store actions already model every legal edit.
2. **A built-in `verify:` step.** `specToParts` (`lib/spec-builder.js`) validates loudly —
   unknown `kind`, missing field, duplicate region id, malformed `when`-clause all throw.
   It is the SAME isomorphic module the browser bundles, so the server can `require()` it.
   Every agent mutation is re-validated by regenerating; a throw => reject/retry, never ship.
3. **The DSL is already the user's language.** The taxonomy `kind`s (`cdRow`, `procRow`,
   `uptimeBar`, `powerBar`, `stacks`, `chargeStacks`, `stackBar`, `healthBar`, `buffRow`,
   `buffWarnText`, plus side columns `left`/`right`) map 1:1 onto "add a CD icon / track
   this buff / add the resource bar". The agent speaks kinds, not JSON.

The **enriched registry** (`registry/<slug>.json`, just committed with `primary`/`tags`/
`details`) is the agent's grounding data: it resolves "Chaos Rush" -> `{spellId, iconUrl,
primary:"Rotational", tags, details.Cooldown}` and lets the agent place a spell in the
right row by its category.

## 2. Architecture — stateless server-side agent on fly.io

Because the validator (`specToParts`) runs in Node and the registry is plain data, the
cleanest shape is a **stateless agent endpoint**. The browser never sees the OpenRouter key.
It's all **one fly app**: a single Node server serves the built SPA as static files AND handles
`/api/agent` — same origin, no CORS.

```
Browser (SPA, same origin)            fly app: one Node server (Hono)
------------                          -------------------------------
AgentPanel                            GET /*         -> serve dist/ (the SPA build)
  currentSpec (from zustand store) -> POST /api/agent  body: { slug, spec, messages }
  user message                          runs AI SDK loop with OpenRouter key (env)
                                        tools mutate an in-memory copy of `spec`
                                        tools resolve spells from registry/<slug>.json
                                        each mutation -> specToParts(spec) to validate
  applies result <----------------      streams: tool-trace + final { newSpec, summary }
  setClass(newSpec) / diff / undo
```

**Request:** `{ slug, spec, messages[] }` — the full current SPEC travels with the request
(it's small JSON). **Response (streamed):** the tool-call trace (for a live "the agent is
doing X" view) plus a final `{ newSpec, summary, changed: [...] }`. The browser diffs
`newSpec` against its store spec, shows what changed, and applies via `setClass` (with undo).

Why server-side (not a thin proxy running the loop in the browser):
- **Key stays server-side** (the whole point of the backend decision).
- **One validation code path** — the real Node `lib/spec-builder.js`, byte-identical to the
  golden guardrail, not a re-implementation.
- **Central rate-limiting / model-cascade / abuse control** (critical: shared key, public site).
- Tools are **pure `Spec -> Spec` transforms** — they don't need the live React store; they
  operate on the in-memory `spec` and the server returns the final one.

Rejected alternative — *client runs the AI SDK loop, server is a dumb `/v1/chat/completions`
passthrough*: simpler proxy, but the tool-calling protocol and validation leak into the
browser, retries burn user round-trips, and abuse control is harder. Keep the loop server-side.

**Code sharing:** the server is a new package (e.g. `weakauras/server/`) that `require`s the
existing `lib/spec-builder.js` and reads `registry/*.json` — zero duplication. The tool
*mutation* logic (add icon to row, add element, set field) should be factored into a shared
pure module both the store actions and the server tools call, so UI edits and agent edits
are provably the same operation. (v1 can inline them server-side and refactor later.)

## 3. Tool surface (grounded in the DSL + registry)

Semantic tools, one per intent — NOT a raw JSON-patch tool and NOT a 1:1 mirror of internal
setters. Each is small, typed (zod), and its handler mutates the in-memory `spec` then
re-validates. Draft set:

| Tool | Args | Effect |
|---|---|---|
| `describeSpec` | – | Returns a compact human/LLM view of the current spec: rows, elements, per-row spells. The agent calls this first to orient. |
| `searchAbilities` | `query, slug` | Registry lookup -> `[{spellId, name, iconUrl, primary, tags, details}]`. Resolves names -> ids and categories. |
| `addCooldownIcon` | `row('primary'\|'secondary'), spell, glow?` | Append a `cdRow` icon (creates the row if absent). |
| `addProc` | `spell, when[]` | Append a `procRow` icon with a composable `when` clause list. |
| `addUptimeBar` | `buff, label?, warnText?` | Append an `uptimeBar` element. |
| `addPowerBar` / `addHealthBar` / `addStacks` / `addChargeStacks` / `addStackBar` | kind-specific | Append the matching resource element. |
| `setIconGlow` | `row, index, glow` | Set/clear a glow rule on an existing icon. |
| `setIconField` / `setElementField` | `ref, key, value` | Generic field patch (escape hatch, still validated). |
| `moveElement` / `removeElement` / `removeIcon` | positional | Reorder / delete. |
| `setCombatOnly` / `addSideColumn` | – | Layout-shell toggles. |

Design rules:
- Tools accept **spell names OR ids**; the handler resolves via the registry (mirrors the
  SPEC's own `byName`/`spell` duality). If a name is ambiguous, the tool returns candidates
  and the agent asks the user.
- Every mutating tool runs `specToParts` on the result; on throw it returns the error text to
  the model so it can self-correct (the AI SDK feeds tool errors back into the loop).
- Glow/color/geometry defaults come from the taxonomy (CLAUDE.md "Glow taxonomy") so the
  agent stays consistent across classes without the user specifying RGBs.

## 4. Agent loop (Vercel AI SDK)

`ai` + `@openrouter/ai-sdk-provider`. `generateText`/`streamText` with `tools` and
`stopWhen: stepCountIs(N)` (multi-step tool loop, N ~ 8). The system prompt encodes: the SPEC
schema, the element taxonomy + glow rules (lifted from CLAUDE.md), the current `slug`, and the
rule "resolve spells via `searchAbilities`, never invent a spellId". The final assistant text
is the `summary` shown in chat; the mutated `spec` is returned alongside.

## 5. Model routing — "free, switch between available models"

OpenRouter is the switch: one OpenAI-compatible API, `:free` model variants, and a `models: []`
fallback array (+ provider routing) that auto-retries the next model on error/rate-limit —
literally "switch between available models".

**Reality check (the #1 risk):** the whole design hinges on reliable **tool calling**, and free
models are the most uneven at it — many `:free` variants don't support `tools` well or at all.
Strategy = a **cascade**, cheapest-first:

1. 1–2 free models known-good at tool calling (verify against OpenRouter's live model list —
   filter `supported_parameters` includes `tools`; exact free availability shifts over time, so
   don't hard-code names in the doc — resolve at deploy).
2. Fall back to a very cheap paid model (Gemini Flash / Claude Haiku / GPT-mini class — a
   fraction of a cent per request) when the free tier errors, rate-limits, or refuses the tool call.

The cascade lives server-side so the key, the model list, and the fallback policy are one place.
Config: an env-driven ordered list `AGENT_MODELS=free-a,free-b,cheap-paid`.

## 6. Validation, safety & apply/undo

- **Validate every step**: tool handler -> `specToParts` -> on throw, return error to model.
- **Final gate**: before responding, run `specToParts` once more on `newSpec`; if it fails,
  return an error result, do NOT return a spec. The browser also re-validates on apply (it
  already regenerates the string), so a bad spec can never become an import.
- **Apply is user-gated**: the panel shows a diff (added/removed/changed elements) and an
  Apply button; applying pushes onto an undo stack (store already clones on every mutation).
- **No silent spellId invention**: system prompt + the `searchAbilities`-only rule; a tool that
  receives an unresolvable name errors rather than guessing (CLAUDE.md "NO GUESSING").

## 7. Abuse & cost control (shared key => this matters)

Public site + your key = you pay and can be abused. Mitigations, server-side:
- Per-IP rate limit + a global daily request/token ceiling (fail closed to "try later").
- Cap `stepCountIs` and max output tokens per request.
- Free-first cascade keeps the median request at ~zero cost; paid fallback is the exception.
- Optional later: a lightweight turnstile/hCaptcha on the endpoint, or a "bring your own key"
  toggle for power users (the hybrid path) to offload cost.

## 8. Deployment on fly.io — one app, one Node server

A single fly app (keep `wa-forge`). One Node server (Hono) does both jobs:
- `GET /*` -> serves the Vite build (`web/dist/`) as static files (`@hono/node-server` +
  `serveStatic`). **Replaces nginx** — drop `web/nginx.conf` from the deploy path.
- `POST /api/agent` -> the stateless agent endpoint. Holds the OpenRouter key, runs the AI SDK
  loop, `require`s `../lib/spec-builder.js` and reads `../registry/*.json` from the image.

The `Dockerfile` becomes multi-stage: stage 1 `npm run build` the SPA -> `dist/`; stage 2 the
Node server image copies `dist/`, `lib/`, `registry/`, and the server code. `fly.toml` keeps
`internal_port` on the Node server; auto-stop/auto-start unchanged.

Same origin => **no CORS**, the frontend calls `/api/agent` relatively. Secret:
`fly secrets set OPENROUTER_API_KEY=…`. One image, one `fly deploy`.

## 9. Open questions / risks

1. **Free-model tool-calling reliability** — must be spiked against the live OpenRouter list;
   if no free model is dependable, v1 may run on the cheap-paid tier with free as best-effort.
2. **System-prompt size** — the taxonomy + SPEC schema is large; consider prompt caching or a
   condensed "agent cheatsheet" derived from CLAUDE.md.
3. **Diff UX** — how to present a SPEC diff meaningfully (element-level, not JSON-level).
4. **Shared mutation module** — factoring store actions + server tools onto one pure core is
   the clean end state; v1 may duplicate a little and converge later.
5. **Backend framework** — Hono vs plain node http for the API app (minor; Hono for DX).

## 10. Incremental build plan (after this doc is approved)

- **P0 — server skeleton:** DONE (`server/server.js`, plain node http, zero deps). `POST /api/agent`
  `require`s `lib/spec-builder.js` and validates a posted spec via `specToParts`; `GET /health`.
  Verified: felsworn spec -> `{ok:true, regions:27}`, unknown kind -> loud error, missing spec -> 400.
  No LLM yet. Deploy consolidation (nginx -> Node static + this API in the one fly app) is deferred to
  the phase that wires static serving, so the frontend deploy isn't broken by an API-only image.
- **P1 — 3 tools, 1 model:** BUILT. `server/spec-ops.js` (pure, validated ops: `searchAbilities` /
  `resolveSpell` / `describeSpec` / `addCooldownIcon`) — 6/6 unit tests green (`spec-ops.test.js`):
  resolves by name, adds a CD icon and re-validates (+1 region), rejects duplicates & unknown spells,
  pure on failure. `server/agent.mjs` wires the AI SDK loop (Vercel `ai` + `@openrouter/ai-sdk-provider`)
  with those 3 tools closing over a per-request working spec. `server/server.js` runs the agent when
  `messages` are posted (else the P0 validation path). Verified without a key: module loads, 503 when
  no key, validation path intact. **Live run verified** (`openai/gpt-4o-mini` via OpenRouter):
  "add Felwrath to the cooldown row" -> searchAbilities + addCooldownIcon -> 27->28 regions, re-validates;
  "add Chaos Rush" (already present) -> searchAbilities + describeSpec -> no mutation, reports it's already
  there (agent reasons over current state, doesn't blindly add). Deps added to `server/`: `ai`,
  `@openrouter/ai-sdk-provider`, `zod`. Model via `AGENT_MODEL` (default `openai/gpt-4o-mini`).
- **P2 — full tool surface + cascade:** DONE. `spec-ops.js` now has 10 validated ops (addCooldownIcon,
  addProc, addUptimeBar, setCooldownGlow, removeElement, removeIcon, moveElement, setCombatOnly +
  search/describe) — 14/14 unit tests. `agent.mjs` exposes all as tools and runs a **model cascade**
  (`AGENT_MODELS`, free-first default `llama-3.3-70b:free, gpt-oss-20b:free, gpt-4o-mini`): tries each in
  order, rolls back the working spec + falls through on error. Verified live: forced-fallback (bogus ->
  gpt-4o-mini), and a **free model completing the full tool loop** (`gpt-oss-20b:free` did describeSpec +
  searchAbilities + addCooldownIcon, and a multi-tool remove+glow edit). Free tier works for tool calling.
  Free tool-capable models resolved from OpenRouter's live `/models` (filtered `supported_parameters ⊇ tools`).
- **P3 — app panel:** DONE. `web/src/components/AgentPanel.tsx` (chat input + transcript + tool-trace badges
  + one-step Undo) docked under the Preview; posts `{ slug, spec: activeSpec, messages }` to `/api/agent`
  and applies the returned `newSpec` via `setClass`. Vite dev proxies `/api` -> `:8080` (same relative path
  as prod, no CORS). Verified: `npm run build` (tsc strict) green; a real request **through the vite proxy**
  returned a validated newSpec from a free model. Known v1 limit: applying an agent edit drops disabled
  elements (we send `activeSpec`).
- **Streaming:** DONE. The backend streams **NDJSON** events (`model` / `text` / `tool` / `reset` / `done` /
  `error`) via `streamText().fullStream`, flushed per line; the panel renders them live (answer scrolls
  token-by-token with a `▍` cursor, tool badges appear as calls happen). The cascade is **resilient
  mid-stream**: `started` flips only on real output (not control parts, which would defeat fallback), and a
  model that fails after emitting yields `reset` so the client discards partial output and the next model
  retries. `maxRetries:1` per model = fail fast to the next. Verified via raw curl: ordered events
  model->tool->tool->text*->done, a free model (`gpt-oss-20b:free`) completing the full loop.
- **P4 — hardening:** abuse limits, prompt caching, optional BYOK toggle.
