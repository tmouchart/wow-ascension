---
name: rotation-vs-preset-model
description: "A class rotation is a MENU (superset), not a build — presets carry the superset and load.use_spellknown hides what the player hasn't learned/picked"
metadata: 
  node_type: memory
  type: project
  originSessionId: a6a4c5fb-2844-461c-aa92-62383620cb4f
---

Per-spec rotations live in `weakauras/registry/rotations/<slug>.json` (see [[felsworn-wa-project]]).

**Key model (user feedback):** a rotation lists *all* viable abilities, but a real character runs only a
subset, filtered by **level** (some abilities unlock at 60) and **talent points** (some are mutually
exclusive — e.g. Felsworn Tyrant can take Tyrannical Resolve XOR Infernal Whipcrack at 60, not both).

**Why:** the preset should carry the **superset** of a spec's abilities — `load.use_spellknown` gates every
icon so unknown/unpicked spells simply don't render. So including both mutually-exclusive CDs is CORRECT, not
a bug; only the learned one shows in-game.

**How to apply:**
- When building/auditing a preset, include the full rotation menu — don't trim to a guessed build.
- A `preset-vs-rotation` audit must NOT flag "in rotation but absent from preset" as a bug: it may be
  hors-niveau or hors-build. Distinguish real gaps from level/talent filtering.
- Gotcha: a `procRow` icon needs a condition (`buff`/`execute`/`stealable`/`when`); a bare `glow` fails the build.
