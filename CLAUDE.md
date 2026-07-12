# WoW Ascension — WeakAuras Package Generator

## Goal

Generate **WeakAuras import strings** (`!WA:2!...`) for the custom classes of **Conquest of Azeroth**
(the "Voljin Alpha" CoA realm on the Ascension private server — https://ascension.gg). There are
**21 custom classes**, each with original spells, resources and specs that do NOT match retail WoW.

- **Short-term (current focus):** produce ONE working package for **Felsworn — Tyrant** (tank spec):
  a resource display (Energy bar + Felfury point boxes) + a cooldown icon row. This is the reference
  implementation everything else generalizes from.
- **Long-term (later):** a web app (hosted on **fly.io**) that generates a WA import string per class,
  with a live **preview / customization** frontend before the user downloads the string. Not started yet —
  do not build web infra until the single-class generator is solid and generalized.

## The core insight — we can read AND write WeakAuras strings

A `!WA:2!` string is NOT JSON. It is: a Lua table → **LibSerialize** (binary) → **LibDeflate** raw deflate
→ **LibDeflate EncodeForPrint** (custom base64) → prefixed with `!WA:2!`. We reverse-engineered the full
format and built a dependency-free Node codec that round-trips losslessly.

### `weakauras/lib/wa-codec.js` (the heart of the project)

```bash
cd weakauras/lib
node wa-codec.js decode <file>       # !WA:2! string  -> <basename>.decoded.json (human-readable)
node wa-codec.js encode <json>       # decoded JSON    -> <basename>.import.txt   (importable string)
node wa-codec.js roundtrip <file>    # decode->encode->decode deep-equality check
```

Also usable as a module: `const { decodeWA, encodeWA } = require('./lib/wa-codec.js')`.

Format specifics (all handled by the codec — documented here so we never have to rediscover them):
- **EncodeForPrint charset** (LibDeflate): `abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()`
  (lowercase, uppercase, digits, parens — NOT digits-first). This 6-bit little-endian bitstream tripped us
  up first; get it wrong and deflate fails with "invalid block type".
- **Deflate:** raw deflate (`zlib.inflateRawSync` / `deflateRawSync`). No zlib/gzip header.
- **LibSerialize v1:** first byte is the serialization version (`1`), then one tagged object stream.
  Big-endian integers. Tag scheme by low bits: `xxxxxxx1`=7-bit uint; `CCCCTT10`=embedded str/table/array/mixed
  with 4-bit count; `NNNNS100`=12-bit int; `TTTTT000`=extended type index (see the `ext()` table in the codec).
- **Numeric map keys** (e.g. `load.class_and_spec.multi = {[262]=true}`) MUST be preserved. In the decoded
  JSON they are stored with a `$n$` prefix (`"$n$262"`) so the encoder re-emits them as integers, not strings.
  Getting this wrong silently breaks class/spec load conditions.
- Our encoder is non-optimizing (no string/table dedup) so re-encoded strings are ~30% larger than the
  original, but WeakAuras imports them fine (the reader handles all tag forms).

### Reference material — Luxthos packages

Real, known-good retail WeakAuras packages we decode to copy exact field shapes (region types, triggers,
conditions). `tocversion 110200` = WoW 11.2 / WeakAuras 5.20.2 — the format our generated strings target.
The user's Ascension client accepts this format (validated by import).
- `weakauras/reference/luxthos-elemental.json` (+ `.decoded.json`) — Elemental Shaman.
- `weakauras/reference/luxthos/luxthos-{druid,paladin,rogue}.wa` (+ `.decoded.json`).
- `weakauras/reference/luxthos/ANALYSIS.md` — **read this** for segmented-resource + cooldown patterns
  (Rogue combo points, Paladin holy power, etc.).

We do NOT reuse Luxthos Lua that references their addon namespace (`LWA`) — those functions (e.g. `customGrow`)
are not self-contained. We write our own equivalents.

## How a package is built

We **clone known-good regions** from a decoded Luxthos file (so every internal field WeakAuras 5.x requires is
present and correctly shaped), then override only what matters. Templates live in `weakauras/lib/templates/`:
- `bar.json` — an `aurabar` region (resource bars, Felfury boxes).
- `icon.json` — an `icon` region with a cooldown trigger + `subglow` at subRegion index 3.
- `group.json` — a static `group` (the root container; `controlledChildren` lists child ids).
- `dyngroup.json` — a `dynamicgroup` (auto-arranging rows).

The shared engine `weakauras/lib/builders.js` exposes the region/trigger builders and `buildPackage()`,
which assembles the top-level export `{ d: <root group>, c: [<all regions, flat>], m: "d", s: "5.20.2",
v: 2000 }`, `encodeWA`s it, asserts the self round-trip, then writes `dist/<class>.import.txt` (rotating the
prior string to `dist/<class>.prev.import.txt`). uids are **deterministic from each region's stable `id`**
(`uidFor()`) so re-imports say "Update" instead of creating a new aura set — never bump uids per version.

### Element taxonomy — the reusable vocabulary (validated in-game on Ascension)

Every class package is assembled from these element types. Reuse the SAME element (builder + recipe +
glow/color rule) across all classes so packages stay consistent — only the data (spellIds, buff names,
colors, geometry) changes. Builders live in `lib/builders.js`; per-class data + wiring in `classes/<name>/build.js`.

**Detection is always via the `aura2` trigger** (portable — `C_UnitAuras` does not exist on this client, and
custom Lua can't read auras). Key condition variables: `stacks` (point count), `buffed` (0/1 presence, use with
`matchesShowOn:"showAlways"`), `expirationTime` (seconds remaining, op `<=`), `show` (1 when a `showOnActive`
aura is up), `percenthealth` (unit HP %), `onCooldown` (0/1). Combine checks with an AND wrapper:
`{ checks:[...], trigger:-2, variable:"AND" }`.

| Element | Region / builder | Recipe |
|---|---|---|
| **Resource (primary)** | `aurabar` · `baseBar`+`powerTrigger(pt)` | Gradient fill, text `%p`. `pt`: 0=Mana, 3=Energy, 4=Combo, 9=HolyPower. `progressSource:[-1,""]`. |
| **HP** | `aurabar` · `baseBar`+`healthTrigger("player")` | Red gradient, text `%p`. |
| **Resource à tracker** (point/stack, self) | N× `aurabar` · `segmentBar` | One box per point. `aura2` self-buff (`unit:"player"`, HELPFUL, `showAlways`) → `stacks`; trigger 2 = always-full stateupdate. Empty (transparent bar + dark bg); condition `stacks>=i` paints the gradient fill. |
| **Debuff à tracker** (point/stack, target) | N× `aurabar` · `segmentBar` | Same as above but `unit:"target"`, HARMFUL, `unitExists:false` (drops to 0 when the debuff is consumed). |
| **Charges à tracker** (spell charges) | N× `aurabar` · `chargeSegmentBar` | One box per charge of a *charged spell* (e.g. Runeblade 0..3). Trigger 1 = `cooldownTrigger`; condition `charges>=i` paints the fill. Pair with a **Charges** subtext on the spell's icon. |
| **Buff à tracker** (maintenance uptime) | `aurabar` · `baseBar`+`buffTrigger(name,"showAlways")` | Duration countdown (`progressSource:[-1,""]`). Color by `expirationTime` (green→yellow `<=8`→red `<=4`). DOWN = condition `buffed==0` → deep red + pulsing red `subglow` + label subtext swap. |
| **CD Offensif** | `icon` · `iconBase`+`cooldownTrigger` | `genericShowOn:"showAlways"`, `desaturate` while `onCooldown`. Optional execute-window glow (e.g. `targetHealthTrigger` + `percenthealth<35` → gold). |
| **CD Défensif** | `icon` · `iconBase`+`cooldownTrigger` | Same base; when the self-buff it grants is active (`buffTrigger` trigger 2, `show==1`) → **Pixel glow, class color**. |
| **Proc** (use-this-now) | `icon` on its own centered row above the CDs | Hidden by default (`alpha:0`); art from `cooldownTrigger` fallback `displayIcon` (path). Condition `buffed==1` on the proc buff → `alpha:1` + **Action Button Glow (`buttonOverlay`), WHITE**. |
| **CD secondaires** | `icon` (smaller, ~26px) in a 2nd `dynamicgroup` below HP | Defensives / utility. Same icon recipe as CDs. |
| **Charges** | `subtext` `text_text:"%s"` appended to a CD icon | Shows the cooldown trigger's charge count. |
| **Row container** | `dynamicgroup` · `makeDynGroup` | `grow:"CUSTOM"` + our `customGrow` Lua (centered, wraps). Pass `maxWidth` (= bar width) so it derives how many icons fit per row and wraps beyond that; or pass an explicit `perRow`. Icons are its children; the dyngroup is a child of the root group. |
| **Root** | `group` · `makeGroup` | Static container; `controlledChildren` lists the top-level element ids in display order. |

### Glow taxonomy — keep it consistent across classes

Glow = a `subglow` sub-region toggled by a condition (`glowChanges(color, glowType)` for icons at `sub.3`; add
`subglow()` + hand-write `sub.N.glow*` for bars). **Glow style = urgency, color = meaning:**

- **Action Button Glow** (`glowType:"buttonOverlay"`) = the **strong "act NOW" cue** (the "glow hard" François
  wants). Use it for: a proc is up, a key spell is *ready*, or a resource is capped/spent and must be dumped.
  Color it: **white** by default (proc up / spell ready), **orange or gold** for a specific dump/optimal cue
  (e.g. Primordial Blast lights orange when Runeblade charges are spent).
- **Pixel glow** = a **soft/passive state** (not an urgent action): **class color** = a defensive self-buff is
  active ("is my buff up", e.g. Hateforged Barrier); **red (pulsing)** = a maintenance buff fell off (Inner Demon).

> Consistency debt: felsworn's *situational cues* (Tyrant's Gaze `<35%`, Felfury capped@6) still use **Pixel gold**,
> while runemaster's use the stronger **Action Button Glow**. Unify to Action Button Glow when revisiting felsworn.

### Icon source gotcha

To show a specific spell's art on a proc/manual icon: use `iconSource:-1` (auto) + a `cooldownTrigger` whose
`displayIcon` is the fallback **texture path** (`"Interface\\Icons\\Spell_..."`). Do NOT use `iconSource:0`
(manual) with a path — manual mode needs a **numeric fileID**, and a path renders as a `?`.

### Standard layout & sizing (compact)

Top → bottom: `Proc row` · `primary CD row` · `Buff à tracker bar(s)` · `primary Resource bar` ·
`point/charge Resource boxes` · `HP bar` · `secondary CD row`. Sizing convention (keep it consistent —
compact, everything within one width):
- **Width = 250** for everything: bars are `BAR_W = 250`; segment/point boxes span the full `BAR_W`
  (derive box width from it, e.g. `BOX_W = (BAR_W - (N-1)*gap) / N`); each `dynamicgroup` gets
  `maxWidth: BAR_W` so a CD row never exceeds it (it wraps instead).
- **Bar heights ~12–14**; **icons 26 primary / 24 secondary** (`~30` for a standalone proc icon).
- **Vertical gaps ~3px** between adjacent elements (compute yOffsets from heights + a small gap).

See `classes/felsworn/build.js` (Energy / Felfury stacks / Inner Demon uptime) and
`classes/runemaster/build.js` (Mana / Runeblade *charge* segments) for the two worked examples.

### Colors / class identity

Felsworn class color (green) ≈ `RGB(86,186,4)` → normalized `[0.337, 0.729, 0.016, 1]`. Sampled from the
Details damage-meter highlight in `screenshots/image copy.png` by decoding the PNG in Node.

## Getting a class's spells + spellIds (the scrape)

The CoA builder (https://ascension.gg/en/v2/coa-builder/voljin-alpha) is a Next.js/React app. Talent data is
NOT in the DOM/`__NEXT_DATA__`; it lives in React fiber props. Using the browser tools we:
1. Select the spec tab in-game, find talent-node elements (rank labels like `0/1`), walk `__reactFiber$...`
   up to the prop `node` which has: `id, name, spellId (the real CASTABLE id), spellIds, iconPath, entryType,
   isPassive (unreliable), aeCost/teCost, tabId, description, rankDescriptions`.
2. The builder's **Export** button gives `:<nodeId>t<rank>:...` — node ids, NOT castable spell ids. The React
   `node.spellId` is the one WeakAuras needs.
3. Tool output truncates ~1000 chars — dump compact/paged (`window.__x` + `.slice()`), never whole objects.
4. **Baseline** abilities (not in the talent tree — e.g. Felsworn's Twin Slice, Chaos Rush, Fel Fireball,
   Cripple, Consume Magic) are NOT scrapable this way; get their spellIds from the user (in-game tooltip/macro).
   Some may not resolve by name via `GetSpellInfo` — track those by name in the trigger and confirm in-game.

Current Felsworn/Tyrant data: `weakauras/classes/felsworn/abilities.md` (67 abilities → castable spellIds).

**ALL 21 classes are already scraped** → `weakauras/tools/coa-classes/<slug>/` (one folder per class), each with
`<slug>-nodes.json` (full node data) + `<slug>-abilities.md` (readable, grouped by tree/spec), plus
`tools/coa-classes/INDEX.md`. Master dump: `weakauras/tools/coa-all-classes.json` (~2.6 MB). ~3012 unique castable
spellIds. Re-generate the folders from a dump with `node weakauras/tools/coa-process.js <dump.json>`.
Key fact: **tabId 87 = the class tree** for every class (nodes cost Ability Essence, `aeCost>0`); each spec
has its own tabId (nodes cost Talent Essence, `teCost>0`). Baseline/grimoire spells are NOT in the trees.

Scrape reliability lesson: the CoA builder tab gets **background-throttled** by Chrome when hidden, which
stalls a `setTimeout`-based in-page loop. Use a **`MessageChannel`-based `sleep`** (not throttled) for the
scrape harness, let it run to completion, and DON'T poll it mid-run (polling starves the busy message loop
and looks like a freeze). Have it auto-download the result (Blob → `a.click()`) — retrieving ~MBs of data
through the truncated JS-eval channel isn't feasible. Harness lives inline in the session; see
`wa-scrape-class` skill.

## Project layout (`weakauras/`)

```
lib/            shared engine — wa-codec.js, builders.js, templates/{bar,icon,group,dyngroup}.json
classes/<name>/ per-class package — build.js (data + layout) + abilities.md
build.js        CLI: `node build.js [class...|all]` -> writes dist/
dist/           generated output — <class>.import.txt (current) + <class>.prev.import.txt + <class>.decoded.json
reference/      known-good decoded packages (luxthos/, luxthos-elemental*) + LibDeflate.lua
tools/          coa-process.js + the scraped coa-classes/ + coa-all-classes.json dump
```

Add a class = new `classes/<name>/build.js` that `require('../../lib/builders.js')`, declares its colors/
geometry/resource model/cooldown lists, and calls `B.buildPackage(...)`. No per-version files — the CLI
rotates the previous string into `<class>.prev.import.txt` on each build.

## Current status

Two classes wired to the shared engine, both **compact (250px width, ~3px gaps)**:
- **Felsworn — Tyrant** (`node build.js felsworn`): Fel Fireball proc row (shows only while "Carve" is up,
  white Action-Button glow) · 8-icon primary CD row · Inner Demon uptime bar · Energy(gold) · 6 Felfury
  stack boxes · Health(red) · 3-icon secondary row. Grey-on-cooldown, Chaos Rush charges; Felfury glows
  gold when capped@6 AND Inner Demon missing; defensive buffs glow Pixel green.
- **Runemaster — Runic** (`node build.js runemaster`): primary CD row · Runeblade 3-segment **charge** bar
  (0..3) · Mana(blue) · Health(red) · secondary row. Runic Brand glows white (Action Button) when ready,
  Primordial Blast glows orange when Runeblade charges are spent, Power Overwhelming is a proc-only icon.

Known open items: some baseline spellIds tracked by name (Fel Fireball, Fel Bargain, Arcane Torrent,
Runeblade, Primordial Blast) — cooldown/charge tracking needs a resolvable spell; unify the situational-cue
glow style (see Glow taxonomy); other 19 classes not started.

## Generator architecture (long-term direction)

> **Deep reference:** `docs/weakauras-format.md` documents the full WeakAuras data model
> (import pipeline, export envelope, region defaults, sub-regions, trigger prototypes, power
> types, conditions, load conditions, the table-driven template model) with file/line anchors
> into the source below. Read it before touching trigger/region shapes.

The WeakAuras2 source is checked out locally at **`weakauras/weakauras2/`** — use it as the schema of record.
Key files:
- `WeakAuras/RegionTypes/` — the region types we emit (icon, aurabar, progresstexture, group, dynamicgroup,
  + text/texture/model). Field lists and condition property keys live here (e.g. aurabar bar color = `barColor`).
- `WeakAurasTemplates/TriggerTemplatesData.lua` — a **table-driven template model** we should mirror:
  `templates.class.CLASS[specIdx][sectionId]` where section `1`=Buffs, `2`=Debuffs, `3`=Cooldowns,
  `11`=Resources; each entry is `{spell, type=buff|debuff|ability, unit, flags(charges/buff/debuff/overlayGlow/talent)}`.
- `WeakAurasTemplates/TriggerTemplates.lua` — the constructors to mirror: `ability`→`Cooldown Progress (Spell)`,
  `buff|debuff`→`aura2`, resource→`Power`, plus Cast/Health.
- `WeakAuras/Types.lua` — `class_types` / `spec_types_specific` and retail spellIds are built from the retail
  game API → **NOT usable for Ascension custom classes**. We must maintain our own per-class registry.

Plan: build a **per-class registry** in the `{spell, type, unit, flags}` shape (populated by `wa-scrape-class`
+ user-provided baseline ids), and a generator that turns each registry entry into a cloned+overridden region.
The `lib/builders.js` engine + the `classes/<name>/build.js` data files are the first step toward this — the
cooldown lists in each class file are already close to that registry shape. Only after the generator
generalizes cleanly do we add the fly.io web app + preview/customization frontend.

## Conventions

- Node.js only (v24 present), zero npm dependencies. Windows shell = PowerShell; `node` works from `weakauras/`.
- Never hand-edit `.import.txt`. Edit the class `build.js` (or the decoded JSON) and re-encode via `node build.js <class>`.
- No per-version build files. One current output + one `.prev` per class (the CLI rotates it). Shared logic goes in `lib/`.
- Keep uids stable (derived from ids via `uidFor`) so imports Update in place — never renumber per version.
- Always assert the self round-trip before handing a string to the user (`buildPackage` does this and refuses to write on failure).
- **ASCII only in generated text** (labels, `text_text`, ids). The codec does not round-trip multi-byte UTF-8 (e.g. `⚠`, `—`) — round-trip fails and `buildPackage` refuses to write. Use `!`, `-`, etc.
- Reusable procedures are captured as skills in `.claude/skills/` — see below.

## Skills (in `.claude/skills/`)

- **wa-decode** — decode a `!WA:2!` string / inspect a package's structure.
- **wa-scrape-class** — pull a CoA class's abilities + castable spellIds (+ resource model) from the builder.
- **wa-build-package** — assemble & encode a class package (resource bars + cooldown row) via template-cloning.
