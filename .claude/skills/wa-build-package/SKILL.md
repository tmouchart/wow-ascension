---
name: wa-build-package
description: Build and encode a WeakAuras import string for a class/spec — resource bars (primary power + segmented point resource) and an auto-arranging cooldown icon row — by cloning known-good region templates. Use when generating or iterating a WeakAura package, adding icons/bars/glows, or turning a scraped ability list into an importable `!WA:2!` string.
---

# Build a WeakAuras class package

Assemble a package as a Node build script that clones templates, overrides fields, and calls
`encodeWA` from `weakauras/wa-codec.js`. Study `weakauras/build-v4.js` (the Felsworn reference) —
prefer copying it to `build-v<N+1>.js` and editing, so versions diff/rollback.

## Rules

- **Clone templates, don't author regions from scratch** — `weakauras/_template-{bar,icon,group,dyngroup}.json`
  carry every internal field the target WA version (5.20.2 / toc 110200) requires. Override only what matters.
- Each new version = a new `build-v<N>.js`. Keep prior ones.
- **Always self-verify**: after `encodeWA`, `decodeWA` it back and assert deep-equality before writing
  `.import.txt`. `build-v4.js` shows the one-liner.
- `load` = load-always for custom classes (no class/spec gate — Ascension classes aren't standard):
  `{use_never:false, size:{multi:[]}, talent:{multi:[]}, spec:{multi:[]}, class:{multi:[]}, zoneIds:"", role:[], use_petbattle:false, pvptalent:[]}`.
- Anchor everything `anchorFrameType:"SCREEN"`, `anchorPoint/selfPoint:"CENTER"`; center rows around x=0.
- Top-level export: `{ d:<root group>, c:[<all regions flat>], m:"d", s:"5.20.2", v:2000 }`. The root group's
  `controlledChildren` lists direct children (bars + the dyngroup id); the dyngroup's `controlledChildren`
  lists the icon ids; every region sets `parent` accordingly.
- Never hand-edit the `.import.txt`.

## Building blocks (all validated on Ascension) — see CLAUDE.md for exact field lists

- **Primary resource bar** — `aurabar`, `type:"unit"` / `event:"Power"` / `use_powertype:true` / `powertype:N`
  (3=energy, 0=mana, 4=combo, 9=holy power).
- **Segmented point resource** — one `aurabar` box per point. Trigger 1 = `aura2` on the buff name
  (`matchesShowOn:"showAlways"`); trigger 2 = trivial custom stateupdate returning `value=1,total=1`
  (keeps the bar full — no aura API, portable). Default `barColor` transparent + dark `backgroundColor`;
  condition `{trigger:1, variable:"stacks", op:">=", value:"N"}` → `barColor` = fill color. `activeTriggerMode:2`.
  Do NOT read auras in custom Lua (`C_UnitAuras` is absent on this client) — `aura2` is the portable detector.
- **Cooldown icon** — `icon`, `auto:true`, `type:"spell"` / `event:"Cooldown Progress (Spell)"` /
  `genericShowOn:"showAlways"`, `spellName:<id | "Name">`, `use_exact_spellName:true` (id) / `false` (name).
  Condition `{trigger:1, variable:"onCooldown", value:1}` → `desaturate:true` (grey while on CD).
- **Proc glow** — 2nd `aura2` trigger on the buff; condition `{trigger:2, variable:"show", value:1}` →
  `sub.3.glow:true` (+ `glowType`, `glowColor`). (`sub.3` = the `subglow` subregion index in the icon template.)
- **Charges** — append a `subtext` subregion `text_text:"%s"`.
- **Auto-arranging icon row** — `dynamicgroup`, `grow:"CUSTOM"` + a self-contained `customGrow` Lua that
  centers each row and wraps every N icons (Luxthos's own `customGrow` depends on their `LWA` addon — don't
  reuse it). Fallback if custom layout misbehaves: native `grow:"GRID"`, `gridType:"RD"`, `gridWidth:N`.

## Toward the generator (21 classes)

Long-term this becomes data-driven. The checked-out WeakAuras source at `weakauras/weakauras2/` already
defines the shape to mirror: `WeakAurasTemplates/TriggerTemplatesData.lua` lists per-spell entries
`{spell, type=buff|debuff|ability, unit, flags}` grouped by section (Buffs/Debuffs/Cooldowns/Resources), and
`WeakAurasTemplates/TriggerTemplates.lua` maps each type to a trigger (ability→cooldown, buff/debuff→aura2,
resource→power). Build a **per-class registry** in that shape (retail spellIds are game-API-derived and
useless for custom classes) and a generator that turns a registry entry into the cloned+overridden region.
Keep the single-class reference (Felsworn Tyrant, `build-v4.js`) working as the ground truth.
