---
name: felsworn-wa-project
description: Ongoing project — WeakAura GENERATOR for Ascension custom classes (started with Felsworn/Tyrant), Luxthos-style resource bar + cooldowns
metadata: 
  node_type: memory
  type: project
  originSessionId: 738aa4c0-d7f7-4507-a16c-c289238608b1
---

User plays **Ascension** private server (ascension.gg, CoA/Voljin-Alpha realm), custom class **Felsworn**, spec **Tyrant** (tank). **Scope broadened (2026-07-12): the goal is now a GENERATOR able to produce a WeakAura per class/spec on Ascension**, not just Felsworn. Felsworn/Tyrant is the first target.

**WeakAuras2 source is checked out locally at `weakauras/weakauras2/`.** Key findings for the generator architecture:
- Region schema: `WeakAuras/RegionTypes/` — usable types are icon, aurabar, progresstexture, group, dynamicgroup (+ text/texture/model/stopmotion). Reusable as-is.
- Class/spec/spell template model: `WeakAurasTemplates/TriggerTemplatesData.lua` — `templates.class.CLASS[specIdx][sectionId]` where section 1=Buffs, 2=Debuffs, 3=Cooldowns, 11=Resources; each arg is `{spell, type=buff|debuff|ability, unit, flags(charges/buff/debuff/overlayGlow/talent)}`. **Adopt this table-driven shape for the Ascension registry.**
- `WeakAuras.class_types` / `spec_types_specific` (in `WeakAuras/Types.lua`) and the retail spellIds are **built dynamically from the retail game API → NOT usable for Ascension custom classes**. Must build our own registry per custom class.
- Trigger constructors in `WeakAurasTemplates/TriggerTemplates.lua` are the exact generator logic to mirror: `ability`→`Cooldown Progress (Spell)` (spellName); `buff/debuff`→`aura2` (auranames/auraspellids, debuffType HELPFUL/HARMFUL); resource→`Power` (powertype); plus Cast/Health.

**Resource model (reverse-engineered):** Energy 0–100 (rogue-style, fast auto-regen, yellow) as primary; **Felfury** stacks 0–6 as secondary (built by energy-spending attacks like Twin Slice/Felrend, spent by attacks like Carve which costs 2).

**Reorganized (2026-07-12) into a shared-engine + per-class layout** (`weakauras/`): `lib/` (wa-codec.js, builders.js, templates/), `classes/<name>/build.js` (+ abilities.md), `build.js` CLI (`node build.js felsworn|runemaster|all`), outputs in `dist/<class>.import.txt` (+ `.prev`), `reference/` (luxthos), `tools/` (coa-process + scraped coa-classes). No more `build-vN.js` — one current + one prev per class. See [[wa-stable-uids]]. Two classes wired: **felsworn** (Energy gold / Felfury green / Health red + 2 cd rows) and **runemaster** (Runic Brand 3-seg + Mana / Health + 2 cd rows).

**Codec** `lib/wa-codec.js` decodes AND encodes `!WA:2!` (LibDeflate charset `a-zA-Z0-9()`, raw deflate, LibSerialize v1, big-endian; numeric map keys preserved via `$n$` prefix). Round-trip validated. Felsworn abilities: `classes/felsworn/abilities.md` (67 talents scraped from React fibers).

**ALL 21 CoA classes scraped (2026-07-12)** → `weakauras/tools/coa-classes/<slug>/` (nodes.json + abilities.md per class) + `tools/coa-classes/INDEX.md`; master dump `weakauras/tools/coa-all-classes.json`. ~3012 unique castable spellIds. Scrape harness = MessageChannel-sleep (Chrome throttles hidden-tab setTimeout) + auto-download; don't poll mid-run. tabId 87 = class tree (AE cost) for every class; specs have own tabIds (TE cost). Baseline/grimoire spells not in trees. Process a dump with `node weakauras/tools/coa-process.js`.

See [[felsworn-tyrant-abilities]] reference file in repo. Luxthos reference: `weakauras/reference/luxthos-elemental.json` (Elemental Shaman export, decoded to `.decoded.json`).
