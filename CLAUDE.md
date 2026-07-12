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

### `weakauras/wa-codec.js` (the heart of the project)

```bash
cd weakauras
node wa-codec.js decode <file>       # !WA:2! string  -> <basename>.decoded.json (human-readable)
node wa-codec.js encode <json>       # decoded JSON    -> <basename>.import.txt   (importable string)
node wa-codec.js roundtrip <file>    # decode->encode->decode deep-equality check
```

Also usable as a module: `const { decodeWA, encodeWA } = require('./wa-codec.js')`.

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
- `weakauras/luxthos-elemental.json` (+ `.decoded.json`) — Elemental Shaman.
- `weakauras/luxthos/luxthos-{druid,paladin,rogue}.wa` (+ `.decoded.json`).
- `weakauras/luxthos/ANALYSIS.md` — **read this** for segmented-resource + cooldown patterns
  (Rogue combo points, Paladin holy power, etc.).

We do NOT reuse Luxthos Lua that references their addon namespace (`LWA`) — those functions (e.g. `customGrow`)
are not self-contained. We write our own equivalents.

## How a package is built

We **clone known-good regions** from a decoded Luxthos file (so every internal field WeakAuras 5.x requires is
present and correctly shaped), then override only what matters. Templates live in `weakauras/_template-*.json`:
- `_template-bar.json` — an `aurabar` region (resource bars, Felfury boxes).
- `_template-icon.json` — an `icon` region with a cooldown trigger + `subglow` at subRegion index 3.
- `_template-group.json` — a static `group` (the root container; `controlledChildren` lists child ids).
- `_template-dyngroup.json` — a `dynamicgroup` (auto-arranging rows).

A build script (see `weakauras/build-v*.js`) assembles the top-level export:
`{ d: <root group>, c: [<all regions, flat>], m: "d", s: "5.20.2", v: 2000 }`, then `encodeWA` it.
Every build re-decodes its own output and asserts deep-equality before writing the `.import.txt`.

### Key region/trigger patterns (validated in-game on Ascension)

- **Energy / primary resource bar** — `aurabar`, trigger `type:"unit"`, `event:"Power"`, `use_powertype:true`,
  `powertype:3` (Energy; 0=mana, 4=combo, 9=holy power). `progressSource:[-1,""]` (auto).
- **Point/stack resource (Felfury)** — one `aurabar` box per point. Trigger 1 = `aura2` on the buff name
  (`auranames:["Felfury"]`, `matchesShowOn:"showAlways"`), trigger 2 = trivial custom stateupdate that keeps
  the bar 100% full (`value=1,total=1` — no aura API, so it works on any client). Default `barColor` transparent;
  a **condition** `{trigger:1, variable:"stacks", op:">=", value:"N"}` sets `barColor` to the fill color.
  Dark `backgroundColor` gives the empty-box look. (We avoid reading auras in custom Lua — `C_UnitAuras`
  does not exist on this client; the `aura2` trigger is the portable way to detect buffs/stacks.)
- **Cooldown icon** — `icon`, `auto:true`, trigger `type:"spell"`, `event:"Cooldown Progress (Spell)"`,
  `genericShowOn:"showAlways"`, `spellName:<id or "Name">`, `use_exact_spellName:true` for ids / `false` for
  names. Condition `{trigger:1, variable:"onCooldown", value:1} -> desaturate:true` greys it while on CD.
- **Glow on a proc/buff** — add a 2nd `aura2` trigger on the buff name and a condition
  `{trigger:2, variable:"show", value:1} -> sub.3.glow:true` (+ `glowType`, `glowColor`).
- **Charges** — add a `subtext` subregion with `text_text:"%s"` (shows the cooldown trigger's charge count).
- **Auto-arranging icon row** — a `dynamicgroup` with `grow:"CUSTOM"` and our own `customGrow` Lua
  (centered, wraps to a new row every N icons). Icons are children (`parent:<dyngroup id>`), the dyngroup is a
  child of the root group.

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

Current Felsworn/Tyrant data: `weakauras/felsworn-tyrant-abilities.md` (67 abilities → castable spellIds).

## Current status — Felsworn Tyrant

Latest = **v4** (`weakauras/felsworn-v4.import.txt`, built by `build-v4.js`). Working in-game:
Energy bar + 6 green Felfury boxes + 8-icon cooldown dynamicgroup row (30×30, centered, wrapping), with
grey-on-cooldown, Chaos Rush charges, and green glow for Fel Fireball (on "Carve" buff) & Hateforged Barrier.

Known open items: confirm the v4 `customGrow` renders correctly in-game (fallback = native `grow:"GRID"`);
optional baseline abilities pending their spellIds; other 20 classes not started.

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
+ user-provided baseline ids), and a generator that turns each registry entry into a cloned+overridden region
(the patterns already proven in `build-v4.js`). Only after the single-class generator generalizes cleanly do
we add the fly.io web app + preview/customization frontend.

## Conventions

- Node.js only (v24 present), zero npm dependencies. Windows shell = PowerShell; `node` works from `weakauras/`.
- Never hand-edit `.import.txt`. Edit a `build-*.js` (or the decoded JSON) and re-encode.
- Each new package version = a new `build-vN.js` so we can diff/rollback; keep prior versions.
- Always assert the self round-trip before handing a string to the user.
- Reusable procedures are captured as skills in `.claude/skills/` — see below.

## Skills (in `.claude/skills/`)

- **wa-decode** — decode a `!WA:2!` string / inspect a package's structure.
- **wa-scrape-class** — pull a CoA class's abilities + castable spellIds (+ resource model) from the builder.
- **wa-build-package** — assemble & encode a class package (resource bars + cooldown row) via template-cloning.
