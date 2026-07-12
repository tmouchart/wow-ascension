---
name: wa-new-class
description: Create a new WeakAuras package for a Conquest of Azeroth (Ascension) class + spec. Scaffolds classes/<name>/build.js on the shared engine, wires resource bars / tracked buffs / cooldown rows / procs from the element taxonomy, then builds & self-verifies into dist/. Use when starting a brand-new class or spec package (input: a class and a spec).
---

# Create a new class/spec WeakAura package

Input: a **class** (e.g. Felsworn) and a **spec** (e.g. Tyrant). Output: `dist/<name>.import.txt`, an
importable `!WA:2!` string, produced by a new `classes/<name>/build.js` on the shared engine.

> Everything below is codified in **CLAUDE.md** (Element taxonomy · Glow taxonomy · Standard layout & sizing ·
> Icon source gotcha). Read those first — this skill is the *procedure*; CLAUDE.md is the *reference*.
> The two worked examples are `classes/felsworn/build.js` (richest: proc row, Felfury stacks, Inner Demon
> uptime bar) and `classes/runemaster/build.js` (Runeblade charge segments, ready/dump glows).

## 0. Orient (do not skip)

- Read the CLAUDE.md sections named above.
- Skim `lib/builders.js` for the exact builder signatures you'll call.
- Open the closest existing `classes/*/build.js` — you will copy it, not write from a blank file.

## 1. Gather the data

- **Abilities + castable spellIds** are already scraped for all 21 classes:
  `tools/coa-classes/<slug>/<slug>-abilities.md` (grouped by tree/spec). If missing/incomplete, run the
  **wa-scrape-class** skill.
- **Not scrapable** (get from the user / in-game tooltip or macro): baseline (non-talent) abilities, the
  **resource model** (primary power type; any point/charge/stack resource; a must-keep maintenance buff),
  and the **exact buff/debuff NAMES** (we detect by name via `aura2` — `/dump GetSpellInfo("Name")`).
- **Classify** every element into the taxonomy before coding:
  primary Resource · HP · point/charge/debuff Resource-à-tracker · maintenance Buff-à-tracker ·
  CD Offensif · CD Défensif · Proc · CD secondaires.

## 2. Scaffold `classes/<name>/build.js`

- `<name>` = kebab slug (`felsworn`, or `felsworn-tyrant` if a class needs one package per spec). The CLI
  auto-discovers any `classes/<name>/build.js` — nothing else to register. `GROUP_ID = "<Class> <Spec>"`.
- **Copy the closest existing class file**, then swap: `GROUP_ID`, ids, colors, geometry, the element lists.
- `const B = require('../../lib/builders.js');` and build each element with its taxonomy builder:
  `B.baseBar`+`B.powerTrigger` / `B.healthTrigger` / `B.buffTrigger`; `B.segmentBar` (stacks) /
  `B.chargeSegmentBar` (charges); `B.gradient`, `B.barText`; `B.iconBase`+`B.cooldownTrigger`,
  `B.glowChanges`, `B.chargesSubtext`, `B.subglow`; `B.makeDynGroup`, `B.makeGroup`.
- Assemble `const group = B.makeGroup(GROUP_ID, [<top-level ids in display order>]);`
  `const children = [<every region, flat>];` then `module.exports = B.buildPackage({ name:'<name>', group, children });`

## 3. Best-practice checklist (bake all of these in)

- **Clone via builders, never author a region from scratch** — templates carry every field WA 5.20.2 needs;
  override only what matters.
- **Detect with `aura2`** (no `C_UnitAuras` on this client; custom Lua can't read auras). Condition vars:
  `stacks`, `buffed` (0/1, with `matchesShowOn:"showAlways"`), `expirationTime` (secs, op `<=`), `show`
  (showOnActive), `percenthealth`, `onCooldown`. Combine with `{ checks:[...], trigger:-2, variable:"AND" }`.
- **uids are deterministic** (`uidFor(id)` inside the builders) so re-imports say **Update**. Never renumber;
  only renaming an element changes its uid.
- **ASCII only** in all generated text/ids — the codec does not round-trip multi-byte UTF-8 (`⚠`, `—`), and
  `buildPackage` will refuse to write. Use `!`, `-`.
- **Icon art:** `iconSource:-1` (auto) + a `cooldownTrigger` whose `displayIcon` is a texture **path**
  (`"Interface\\Icons\\Spell_..."`). Never `iconSource:0` with a path (manual needs a numeric fileID → `?`).
- **Glow = style is urgency, color is meaning:** **Action Button Glow (`buttonOverlay`)** = strong "act now"
  (proc up / spell ready = white; dump/optimal cue = orange/gold). **Pixel** = passive state (defensive buff
  up = class color; maintenance buff missing = pulsing red). Keep it consistent with the other classes.
- **Sizing (compact):** `BAR_W = 250` for all bars; segment/point boxes span `BAR_W`
  (`BOX_W = (BAR_W-(N-1)*gap)/N`); every `dynamicgroup` gets `maxWidth: BAR_W` (auto-wraps); icons **26/24**
  (~30 standalone proc); bar heights **12–14**; **vertical gaps ~3px** (compute yOffsets from heights).
- **Load-always** (custom classes aren't gated): the `loadAlways()` shape — no class/spec filter.
- **Anchor** everything `SCREEN` / `CENTER`/`CENTER`; center rows at `x=0`.
- **Layout order** top→bottom: Proc row · primary CD row · Buff-à-tracker bar(s) · primary Resource ·
  point/charge Resource boxes · HP · secondary CD row.
- **Proc icon** = its own centered row, hidden (`alpha:0`) until the proc buff is up, then `alpha:1` + white
  Action Button Glow.
- **Baseline / by-name spells:** track by name; the CD swipe / charge count only works if the name resolves
  in-game — flag these for the user to confirm.

## 4. Build & verify

```
node build.js <name>        # or: node build.js all
```
`buildPackage` re-decodes its own output and **asserts deep-equality**; it throws (writes nothing) on failure.
It rotates the previous string into `dist/<name>.prev.import.txt`. No per-version files.

## 5. Hand off + confirm in-game

Give the user `dist/<name>.import.txt`. List what needs an in-game check: buff/debuff **names** resolve,
maintenance-buff **duration** is exposed by the client (else the countdown stays flat — fall back to up/down),
and **by-name** spells resolve (else cooldown/charge tracking is dark, though the fallback icon still shows).
