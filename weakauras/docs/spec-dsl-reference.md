# SPEC DSL & Engine Reference

> **Purpose.** A precise lookup so an agent can author/edit a `spec.json`, add an element, or reason about
> a generated region **without re-reading `lib/spec-builder.js` + `lib/builders-core.js` every time.** It is
> derived verbatim from that source (2026-07-19). If you change those files, update the tables here.
> The source is still the schema of record — when this doc and the code disagree, the code wins (and this
> doc is stale: fix it). For the WeakAuras data model itself (region/trigger field shapes) see
> `weakauras-format.md`; for the `!WA:2!` codec see CLAUDE.md.

---

## 1. The pipeline in one picture

```
classes/<slug>/spec.json           the declarative SPEC (single source of truth, Node AND web)
        │
        │  specToParts(spec)        lib/spec-builder.js  — validate → layout engine → build regions → auto-wire
        ▼
{ name, group, children[], combatOnly }     "parts": the root group + every flat region
        │
        │  assembleTop(parts)       lib/builders-core.js — wrap in the export envelope
        ▼
{ d: group, c: children, m:"d", s:"5.20.2", v:2000 }
        │
        ├─ Node:    buildPackage (lib/builders.js) → encodeWA (sync zlib) → self round-trip assert → dist/<name>.import.txt
        └─ Browser: encodeWA (web/src/lib/wa-codec.js, async CompressionStream) → !WA:2! string
```

- **`specToParts` and `assembleTop` are isomorphic** (`spec-builder.js` + `builders-core.js`, no `fs`/`zlib`).
  The exact same compiler runs in Node and in the browser — the browser only swaps the codec.
- Node entry points: `classes/<slug>/spec.js` (2-line writer → `specToPackage`), or `node build.js` for the
  frozen hand-built `build.js` reference family.
- Web entry point: `web/src/generated/generator.js` is an **esbuild bundle of `lib/browser-entry.mjs`**
  (which re-exports `specToParts` + `assembleTop`). It is a build artifact — **never hand-edit it.** Regenerate
  with `npm run gen` in `web/` (runs `web/scripts/gen.mjs`; also fires on `predev`/`prebuild`). If you change
  `spec-builder.js`/`builders-core.js`, the web app only picks it up after `gen` re-bundles.

### File → responsibility map

| File | Responsibility |
|---|---|
| `lib/wa-codec.js` | `!WA:2!` ↔ JSON codec (Node, sync). Documented in CLAUDE.md. |
| `lib/builders-core.js` | **Isomorphic engine.** Region/trigger/sub-region builders + `assembleTop`. No fs/zlib. |
| `lib/builders.js` | Node wrapper: re-exports core + `buildPackage` (encode + round-trip assert + write/rotate dist). |
| `lib/spec-builder.js` | **The DSL.** `specToParts`: validate → layout engine → per-kind region builders → auto-wire. |
| `lib/spec-node.js` | `specToPackage = specToParts + buildPackage` (Node glue, keeps spec-builder browser-safe). |
| `lib/templates/*.json` | Known-good Luxthos regions cloned by the builders (bar/icon/group/dyngroup). |
| `lib/browser-entry.mjs` | Re-exports the isomorphic API for the esbuild bundle. |
| `classes/<slug>/spec.json` | The declarative SPEC. |
| `classes/<slug>/build.js` | Frozen hand-built reference (retires once the spec package is confirmed in-game). |
| `web/src/generated/generator.js` | esbuild bundle of `browser-entry.mjs` (artifact). |
| `web/src/store.ts` | zustand SPEC store the editor mutates (`activeSpec` cleans it for generation). |
| `registry/<slug>.json` | Per-class ability data (spellId, name, icon, classification tags). |
| `registry/resource-model.json` | Per-class primary power name + index (`confirmed` flag). |

---

## 2. SPEC document shape

```jsonc
{
  "slug": "felsworn",                 // registry key (icon resolution in web); not used by the compiler
  "id": "Felsworn Tyrant SPEC",       // REQUIRED. Prefix for every region id → seeds every uid (uidFor).
                                      //   Changing it re-uids everything → re-import creates a NEW aura set.
  "name": "felsworn-spec",            // dist filename (dist/<name>.import.txt). Defaults to id.
  "global": { "barWidth": 250, "iconSize": 26, "secIconSize": 24, "procSize": 30, "gap": 3,
              "xOffset": 0, "yOffset": 0, "gateUnknownSpells": true },   // all optional; these are the DEFAULTS
  "stack": [ <element>, ... ],        // REQUIRED, non-empty. Top→bottom vertical list (the central column).
  "left":  { "icons": [<cdIcon>...], "xOffset": -170, "yOffset": 0, "size": 26 },   // optional side rail (DEF)
  "right": { "icons": [<cdIcon>...], "xOffset":  170, "yOffset": 0, "size": 26 },   // optional side rail (OFF)
  "combatOnly": true                  // optional: set load.use_combat on the group AND every child
}
```

- **`global` defaults** (from `specToParts`): `barWidth 250, iconSize 26, secIconSize 24, procSize 30, gap 3,
  xOffset 0, yOffset 0, gateUnknownSpells true`. Override any subset.
- **`gateUnknownSpells`** (default **false** since 2026-07-20): when **true**, every `cdRow` / `procRow` /
  side-rail icon that has a `spell` gets `load.use_spellknown = true` + `load.spellknown = <spell>`
  (+ `use_exact_spellknown = !byName`), mirroring its own cooldown trigger's spell identity — so the icon only
  loads while the player knows the spell. **DEFAULT OFF and do NOT enable on Ascension:** `IsSpellKnown` →
  `GetSpellInfo` **throws `"Invalid spell slot"`** for custom CoA spellIds, and the Lua error aborts the whole
  WeakAuras load loop (symptom: `/wa` stops opening). Confirmed in-game with barbarian-brutality (2026-07-20).
  Gating is derived (not stored), so it round-trips without any `wa-to-spec` change.
- **Side rails** are vertical `makeColumn` dynamicgroups. Default `xOffset` = `-170` (left) / `+170` (right),
  default `yOffset` = `global.yOffset`, default icon `size` = `global.iconSize`. Icons are **iconRow-shaped**
  (`showWhen[]`/`glow.when[]`, §4) as soon as any uses the clause DSL — else legacy `cdRow`-shaped. An empty rail
  is skipped by the web `activeSpec` (an empty dynamicgroup would still emit otherwise).

### Editor-only fields (never reach the compiler)

`store.ts` stamps `_uid` on each element and icon (stable @dnd-kit keys) and reads `el.enabled`. `activeSpec` /
`activeStack` / `cleanCol` strip `_uid`, drop `enabled === false` elements, and omit empty rails before
generation. Don't add these to a hand-written `spec.json`.

---

## 3. Stack element kinds

Every entry in `stack[]` has a `kind`. The layout engine (`elementHeight` + `specToParts` §5) computes each
element's height and centers the whole stack on `global.yOffset`; you never set `yOffset` on a stack element
(only on side-rail columns). `id` defaults are derived from `spec.id` — **set an explicit `id` when two
elements would collide** (e.g. two `procRow`s both default to `"<id> Procs"` → duplicate-id error).

Common bar fields: `hi`/`lo` = gradient high/low `[r,g,b,a]` (0..1); `bg` = background `[r,g,b,a]`;
`width` defaults to `global.barWidth`; `height` default noted per kind; `text` defaults to `%p`.

| kind | Purpose | Required | Key optional fields | Region(s) |
|---|---|---|---|---|
| `powerBar` | Primary resource (Mana/Energy/…) | `powerType` (index) | `hi,lo,bg,text,textSize,height(14),width,id` | 1 `aurabar` |
| `healthBar` | Unit health | — | `unit('player'),hi,lo,bg,text,height(14),id` | 1 `aurabar` |
| `stackBar` | Resource that is an **aura stack count** (cultist Insanity 0..100) | `aura` (buff name), `max` | `hi,lo,bg,text,debuffType('BOTH'),height(14),id` | 1 `aurabar` |
| `uptimeBar` | Maintenance countdown (keep-it-up) — self-buff **or** target DoT | `buff` (name **or** [names]) | `unit('player'\|'target'),label,warnText,bg,downBg,colors,height(14),id` | 1 `aurabar` |
| `buffWarnText` | Big text shown only while a buff is **missing** | `buff`, `text` | `color,fontSize(20),height(22),width,id` | 1 invisible `aurabar` (text carrier) |
| `stacks` | Point boxes from an aura **stack** (Felfury) | `auraNames` [names], `count` | `hi,lo,emptyBg,unit('player'),debuffType('HELPFUL'),unitExists,gap(4),height(12),capGlow,id` | N `aurabar` |
| `chargeStacks` | Point boxes from a spell's **charges** (Runeblade 0..3) | `spell`, `count` | `byName,hi,lo,emptyBg,gap(4),height(12),id` | N `aurabar` |
| `iconRow` | **Unified icon row** — SHOW-IF `showWhen[]` + GLOW-IF `glow.when[]` (§4) | `icons[]` | `secondary(bool→secIconSize 24),size,perRow,iconGap,combatOnly,id` | 1 dynamicgroup + N icons |
| `procRow` | *(legacy → iconRow)* Row of proc/reminder icons | `icons[]` | `size(procSize 30),id` | 1 dynamicgroup + N icons |
| `cdRow` | *(legacy → iconRow)* Row of cooldown icons | `icons[]` | `secondary,size,id` | 1 dynamicgroup + N icons |
| `buffRow` | Row of buff-state icons | `icons[]` | `secondary,size,id` | 1 dynamicgroup + N icons |

Notes captured from source you can't infer from the table:
- **`stacks.capGlow`** = `{ at?, unlessBuff?, color?, glowType? }`: every box glows when `stacks >= at`
  (default `at = count`), optionally gated on `unlessBuff` being **missing** (Felfury capped@6 *while* Inner
  Demon down = dump). Glow is a `subglow` appended at **sub.5** of each box.
- **`stacks`** for a *target debuff* point tracker: set `unit:"target"`, `debuffType:"HARMFUL"`,
  `unitExists:false` (so it drops to 0 when the debuff is consumed).
- **`uptimeBar.buff`** as a `[names]` array = "any-of" state (enraged = buff A **or** B **or** C); `expirationTime`
  is whichever matched. `colors` overrides the green/yellow/red/down/glow set (see `uptimeBar` in §7).
- **`uptimeBar.unit: 'target'`** tracks a DoT/debuff YOU applied to the target instead of a self-buff
  (`targetDebuffTrigger`: HARMFUL, `ownOnly`, `unitExists:false` so no target reads as DOWN). Everything else is
  identical — same countdown ramp, same fall-off warning + glow. This is what a DoT spec wants; do NOT fall back
  to a `stacks count:1` presence box, which has no countdown and no fall-off cue. Omit `unit` for a self-buff.
- **`stackBar`** pins max via `useAdjustededMax + adjustedMax = String(max)` and `progressSource:[1,"stacks"]`;
  `debuffType:"BOTH"` scans buffs **and** debuffs.

---

## 4. `iconRow` — the unified icon element (`iconElement`)

**One element models both a "CD" and a "proc"** — there is no separate WeakAuras region behind them: each is an
`icon` region. The only difference is our config. The mental model is **SHOW IF `showWhen[]` · GLOW IF
`glow.when[]`**, both AND-arrays of the same clause vocabulary (§5). Used by every `iconRow`, `left`, and `right`
icon:

```jsonc
{
  "label": "Decapitate",           // REQUIRED — used in the region id ("<dgId> - <label>"). ASCII only.
  "spell": 804414,                 // spellId (number) OR spell name (string, needs "byName": true)
  "byName": true,                  // match by name instead of exact spellId (by-name doesn't resolve art on this client)
  "fallbackIcon": "Interface\\Icons\\Spell_...",  // texture path shown when art can't resolve (by-name spells)
  "charges": true,                 // append a "%s" charge subtext
  "showWhen": [ {clause}, ... ],   // ABSENT = always visible (a "CD"). Present = hidden until ALL clauses pass (a "proc")
  "hide": "slot",                  // with showWhen: "slot" (default, alpha 0 keeps its slot) | "collapse" (row recenters)
  "glow": { "color": [1,1,1,1], "glowType": "buttonOverlay",
            "when": [ {clause}, ... ] },   // ABSENT/[] = glow whenever visible; else glow only while these also pass
  "display": { "timer": "cooldown|buff|none", "stacks": true,
               "cooldownNumbers": false, "desaturateOnCd": true }
}
```

- **`showWhen` absent** ⇒ always visible; with a `spell` it **desaturates while `onCooldown == 1`** by default
  (the old cd behaviour). **`showWhen` present** ⇒ `alpha 0` + an `AND(clauses) → alpha 1` condition reveals it
  (`hide:"slot"`), or the show-driving triggers control it and the row recenters (`hide:"collapse"`, only
  `collapse`-gating clauses — §5 ✅ column). Condition-driven show is **reliable on this client** (unlike
  disjunctive trigger-activeness). `display.desaturateOnCd` overrides the default either way.
- **`glow.when`** is the same clause array. `readyPower` = `[{spellReady:true},{powerAtLeast:N}]`, a compound
  execute cue = `[{powerPctAtLeast:60},{targetHpBelow:35}]`, a defensive = `[{buff:name}]`, etc. — no named
  `glow.type` enum. `glow.color` default white, `glowType` ∈ `buttonOverlay` (Action Button) | `Pixel` | `ACShine`.
- **`display.timer`**: `cooldown` (default), `buff` (swipe = a tracked buff's remaining time — needs a
  buff-family clause), `none`. `display.stacks:true` appends a `%N.s` subtext on the first buff-family trigger.
- Triggers are **deduped by shape**, so a clause in `showWhen` and one in `glow.when` on the same buff share one
  trigger. Round-trips through `wa-to-spec` (`invertIconElement` + `checkToClause`, the inverse of `clauseToCheck`).

### Legacy `cdRow` / `procRow` (kept until the Étape 3 codemod, then removed)

`cdRow` and `procRow` still parse (70 preset specs use them; byte-frozen goldens). They build via the old
`cooldownIcon` / `procIcon` and map onto `iconElement` shapes as follows — use `iconRow` for new work:

| Legacy | iconRow equivalent |
|---|---|
| `cdRow` glow `ready` | `glow.when:[{spellReady:true}]` |
| `readyPower:N` | `glow.when:[{spellReady:true},{powerAtLeast:N}]` |
| `powerPct:P` | `glow.when:[{powerPctAtLeast:P}]` |
| `buffMissing` | `glow.when:[{buffMissing:name}]` |
| `targetHealthBelow:H` | `glow.when:[{targetHpBelow:H}]` |
| `glow.type:"buff"` | `glow.when:[{buff:name}]` (+ `display.timer:"buff"` for the swipe takeover) |
| `onCharges:{spell,value}` | `glow.when:[{charges:{value},...}]` (charges clause reads the icon's own cd) |
| `showPowerAbove:N` | `showWhen:[{powerAtLeast:N}]` |
| proc `buff:X` | `showWhen:[{buff:X}]` |
| proc `execute:P` + `glowAlways` | `showWhen:[{targetHpBelow:P}], hide:"collapse", glow:{when:[]}` |
| proc `stealable` | `showWhen:[{stealable:true}], hide:"collapse"` |

---

## 5. Clause DSL — `showWhen[]` and `glow.when[]` (shared by iconRow and legacy procRow)

Every clause is AND-ed; each has exactly ONE key. `clauseToCheck` (spec-builder) turns each into a
condition-check; `checkToClause` (wa-to-spec) inverts it. The legacy `procRow` `when[]` uses the same list
(legacy sugar `buff:` / `execute:pct` (+`glowAlways`) / `stealable:true` still parses and is byte-frozen).

```jsonc
{
  "label": "Fel Fireball",
  "spell": "Fel Fireball", "byName": true,      // optional — needed for spellReady/charges clauses & timer:'cooldown'
  "fallbackIcon": "Interface\\Icons\\...",
  "when": [ <clause>, ... ],                     // ALL must pass for the icon to light
  "hide": "slot",                                // "slot" (default): alpha 0, keeps its row slot
                                                 // "collapse": triggers drive show, row RECENTERS (legacy execute shape)
  "glow": { "color": [1,1,1,1], "glowType": "buttonOverlay",
            "when": [ <clause>... ] },           // empty/absent glow.when = glow whenever the icon shows
  "display": { "timer": "cooldown|buff|none", "stacks": true,
               "cooldownNumbers": false, "desaturateOnCd": true }
}
```

### `when` clauses — exactly ONE key per clause

| Clause | Meaning | Can gate `collapse`? | Backing trigger / variable |
|---|---|---|---|
| `{ "buff": name }` | self-buff present | ✅ | `buffTrigger` → `buffed==1` (slot) / `show==1` (collapse) |
| `{ "buffMissing": name }` | self-buff absent | ❌ | `buffTrigger showAlways` → `buffed==0` |
| `{ "anyBuff": [names] }` | any of the buffs present | ✅ | `anyBuffTrigger` → `buffed==1`/`show==1` |
| `{ "buffStacks": {name,op?,value} }` | buff stacks `op value` (op default `>=`) | ❌ | `buffTrigger showAlways` → `stacks` |
| `{ "targetHpBelow": pct }` | target HP % < pct (execute) | ✅ | `targetExecuteTrigger` → `show==1` |
| `{ "powerAtLeast": N, powerType? }` | UnitPower ≥ N, **absolute** (powerType default 3) | ✅ | `powerAtLeastTrigger` → `show==1` |
| `{ "powerPctAtLeast": P, powerType? }` | resource **percent** ≥ P (powerType default 3) | ❌ | `powerTrigger` → `percentpower>=` |
| `{ "spellReady": true }` | this icon's spell off cooldown | ❌ | own cooldown trigger → `onCooldown==0` |
| `{ "charges": {op?,value} }` | this icon's spell charges `op value` | ❌ | own cooldown trigger → `charges` |
| `{ "stealable": true }` | target has ANY spell-stealable buff | ✅ | `stealableTargetTrigger` → `show==1` |

- **`hide:"slot"`** (default): icon is `alpha:0`; a condition on `AND(when)` sets `alpha:1` (+ glow). It stays
  *active* (so it holds its slot in the row) — this needs a spell **or** a buff-family/`buffMissing` clause to
  keep a trigger alive. This is the felsworn Fel Fireball shape.
- **`hide:"collapse"`**: the show-driving triggers control visibility (`disjunctive:"all"`), so the icon
  disappears entirely and the row **recenters**. Only `collapse`-gating clauses (✅ column) are allowed —
  they're the ones that can drive `show`. This is the barbarian Decapitate execute shape.
- Triggers are **deduped by shape**, so a clause in `when` and one in `glow.when` on the same buff share one
  trigger.
- **`display.timer`**: `cooldown` (default, spell art + cd swipe), `buff` (swipe = the proc buff's remaining
  time — needs a buff-family clause), `none` (no swipe). `display.stacks:true` appends a per-trigger `%N.s`
  subtext reading the first buff-family trigger. `display.desaturateOnCd` / `timer:"cooldown"` need a `spell`.

---

## 6. `buffRow` icon config (`buffRowIcon`) — three shapes

| Shape | Fields | Behaviour |
|---|---|---|
| any-of | `{ label, anyOf: [names], fallbackIcon? }` | shown only while ANY buff up (`showOnActive`); `iconSource:-1` = matched buff's own art (runemaster tattoo) |
| weapon enchant | `{ label, weaponEnchant: "main"\|"off" }` | current temp weapon enchant (engraving); appends a `%c` element-letter subtext via `withEngravingLetter` |
| indicator | `{ label, indicator: name, lowPowerGlow? }` | always shown; desaturated + `alpha 0.5` while the buff is missing. `lowPowerGlow = {pct,powerType?,color?,glowType?}` = strong glow when power% ≤ pct |

---

## 7. Trigger builders & their condition variables (cheat sheet)

All in `builders-core.js`. When you write a raw condition `check`, this is which `variable` each trigger
exposes (op defaults to equality unless a string `op` is given):

| Builder | WA trigger | Variables you can check |
|---|---|---|
| `powerTrigger(idx)` | Power | `power`, `percentpower` |
| `healthTrigger(unit)` | Health | `health`, `percenthealth` |
| `targetHealthTrigger()` | Health (target, `unitExists:false`) | `percenthealth` |
| `cooldownTrigger(spell,byName?)` | Cooldown Progress (Spell) | `onCooldown` (0/1), `charges`, `spellInRange`, … |
| `buffTrigger(name, showOn?)` | aura2 (player, HELPFUL) | `buffed` (0/1, needs `showAlways`), `show` (1 while active on `showOnActive`), `stacks`, `expirationTime` |
| `anyBuffTrigger(names, showOn?)` | aura2 (player, any-of) | same as buffTrigger; matches ANY listed name |
| `targetDebuffTrigger(names)` | aura2 (target, HARMFUL, showAlways) | `stacks`, `buffed`, `expirationTime` |
| `stealableTargetTrigger()` | aura2 (target, `use_stealable`) | `show` (1 while a stealable buff present) |
| `weaponEnchantTrigger(weapon)` | item / Weapon Enchant (`showOnActive`) | `show`, `expirationTime`, `stacks` |
| `powerAtLeastTrigger(N,pt)` | custom stateupdate (UnitPower ≥ N) | `show` (1/0) |
| `targetExecuteTrigger(pct)` | custom stateupdate (target HP% < pct) | `show` (1/0) |

**Ascension client constraints (why the custom stateupdates exist):**
- `C_UnitAuras` does **not** exist → all aura detection is via the **`aura2`** trigger, matched **by exact
  name** (`useName:true`, `auranames:[...]`). Custom Lua can't read auras. A buff's name ≠ its spell name is
  common and mismatches fail **silently** → confirm names in-game (`tools/audit-aura-names.js`).
- The built-in **Power/Health "min value / percent" filters do NOT gate** on this client. To gate on a power
  or target-HP threshold you must use a **custom `UnitPower`/`UnitHealth` stateupdate** (`powerAtLeastTrigger`,
  `targetExecuteTrigger`) whose `show` field drives visibility.

**AND-wrapping conditions:** combine checks with `{ checks:[...], trigger:-2, variable:"AND" }`. A single
check needs no wrapper.

**Power indices** (`powerType`): `0` Mana, `1` Rage, `2` Focus, `3` Energy, `4` Combo Points, `6` Runic Power,
`9` Holy Power (per WeakAuras + `store.ts` POWER_NAMES). Only **barbarian (Rage=3)** and **felsworn (Energy=3)**
are `confirmed:true` in `registry/resource-model.json`; every other class's index is inferred/`null` — a
`powerBar` for them is a guess until verified in-game.

---

## 8. Sub-region index conventions

Conditions address sub-regions as `sub.N.<prop>` (1-based, in template order). Confirmed from the templates:

**Icon** (`templates/icon.json`): `sub.1` subbackground · `sub.2` subborder · **`sub.3` subglow**.
→ `glowChanges(color, glowType)` always targets **sub.3** (icon glow).

**Bar** (`templates/bar.json`): `sub.1` subbackground · `sub.2` subforeground · `sub.3` subborder ·
**`sub.4` subtext** (the bar text / label written by `barText`).
- `uptimeBar` **appends** `warnSubtext` → **`sub.5`** (warning text) and `subglow` → **`sub.6`** (down-state glow).
- `stacks` capGlow **appends** a `subglow` → **`sub.5`** on each box.
- `buffWarnText` reuses the stock **`sub.4`** subtext as its warning text (toggles `sub.4.text_visible`).

A glow condition change-set is: `sub.N.glow=true`, `sub.N.glowType`, `sub.N.useGlowColor=true`, `sub.N.glowColor`.

---

## 9. Trigger-array conventions (`wrap` / `T` / activeTriggerMode / disjunctive)

- `T(def)` = `{ untrigger:[], trigger:def }`. `wrap(triggerArr, activeTriggerMode)` =
  `{ __array:[...], disjunctive:"any", activeTriggerMode }`. (`__array` is flattened into `triggers[1..n]` on
  encode; index `1..n` is what condition `trigger:` refers to.)
- **`activeTriggerMode`** = which trigger drives the display (icon art / bar value / swipe):
  `1` = trigger 1; `2` = trigger 2; `-10` = **first-active** (`Private.trigger_modes.first_active` — the buff
  while it's up, else the fallback). Segmented bars use `2` (the always-full stateupdate). `glowBuff` icons use
  `-10` so the swipe shows the buff's remaining time while up, else the cooldown.
- **`disjunctive`** = how multiple triggers combine for **show**: default `"any"` (show if any trigger active).
  Set **`"all"`** when one trigger is *always* active (a cooldown trigger, or the always-full stateupdate) and
  another must gate show — otherwise `"any"` would show the icon permanently. Used by `collapse` procs and
  execute procs.
- **Condition `trigger` indices**: positive = that trigger (1-based); `-1` = the active/display trigger;
  `-2` = the AND meta-trigger (used with `variable:"AND", checks:[...]`).

---

## 10. Layout engine (how yOffsets are derived)

`specToParts` centers the vertical stack on `global.yOffset`:

```
heights = stack.map(elementHeight)                       // intrinsic height per element (§3 table)
H       = Σ heights + gap * (n - 1)                       // gap = global.gap (default 3)
topEdge = gy + H/2
for each element:  center = topEdge - h/2 ; topEdge = center - h/2 - gap
```

- **Row height** (`procRow`/`cdRow`/`buffRow`) wraps at `barWidth`: `perRow = floor((barWidth+4)/(size+4))`,
  `rows = ceil(count/perRow)`, `height = rows*size + (rows-1)*4` (hSpace/vSpace = 4, matching `customGrowLua`).
- Bars/stacks default heights: bars 14, stack/charge boxes 12, `buffWarnText` 22. Icon rows use their `size`.
- **Stack/charge box geometry**: `boxW = (barWidth - (n-1)*gap)/n`, boxes span the full `barWidth`, centered.
- `global.xOffset` shifts the whole central stack; side rails add their own `xOffset` on top.
- Dynamicgroups grow via our **`customGrow` Lua** (`grow:"CUSTOM"`) — centered + wrapping (`makeDynGroup`) or
  vertical top→bottom (`makeColumn`/`vGrowLua`). They carry a trivial `stateupdate` trigger so the group is
  always shown; the children are independent displays.

---

## 11. Identity, uids & the golden guardrail

- **`uidFor(id)`** = deterministic 11-char base61 (FNV-1a×2) from the region id. Every region's `uid` is
  derived from its **stable `id`**, which is prefixed by `spec.id`. Same id → same uid across builds → re-import
  says **"Update"** instead of creating a new aura set. **Never renumber uids per version.** Renaming an element
  (or `spec.id`) changes its uid — that's the only time it should change.
- `buildPackage` asserts the **self round-trip** (`decode(encode(top)) deep-equals top`) and refuses to write
  on failure. Always trust this over eyeballing.
- **ASCII only** in any generated text (ids, labels, `text_text`) — the codec doesn't round-trip multi-byte
  UTF-8, so a `⚠`/`—` makes the round-trip fail and `buildPackage` refuses to write. Use `!`, `-`.
- **Golden guardrail**: `node tools/verify-unchanged.js` rebuilds every `build.js` **and** `spec.js` package and
  asserts the decoded output is byte-identical to `tools/golden/`. Run it after refactoring the engine;
  `--snapshot` re-baselines after an *intended* change. It normalizes CRLF (don't let Windows line endings
  make it a false-red).

---

## 12. Recipes — "how do I …"

- **Add a class**: create `classes/<name>/spec.json` (+ a 2-line `spec.js` that calls `specToPackage`). Pull
  spellIds from `tools/coa-classes/<slug>/` (trees) + `tools/coa-baselines.js` (grimoire). Confirm the primary
  power index (`registry/resource-model.json`) and every aura name in-game before trusting detection.
- **Add an element to a spec**: append to `stack[]` with the right `kind` (§3). Give it an explicit `id` if it
  could collide. Re-run `node classes/<slug>/spec.js`; the round-trip assert gates the write.
- **Add a glowing cooldown**: an `iconRow` icon (no `showWhen`) with `glow.when:[…]` (§4). Style = urgency,
  color = meaning (Action Button Glow = act-now; Pixel = passive state) — see CLAUDE.md Glow taxonomy.
- **Track a maintenance buff**: `uptimeBar` (single or any-of). Down-state warning + pulsing glow are built in.
- **A "use it now" proc**: an `iconRow` icon with `showWhen:[…]` (§4). Buff proc → `hide:"slot"`; execute window →
  `hide:"collapse"` + `targetHpBelow`.
- **Make the whole WA combat-only**: `"combatOnly": true` at SPEC top level.
- **See the web app pick up an engine change**: re-run `npm run gen` in `web/` (rebundles
  `generated/generator.js`); `npm run dev` is already running (read `dev.log`, don't launch it).
