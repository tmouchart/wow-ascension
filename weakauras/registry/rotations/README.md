# Per-spec basic rotations

One `<slug>.json` per class, one object per spec. Purpose: drive a per-spec review
of each generated WeakAura preset — "given this rotation, what should the package
surface?" (which buff to maintain, which resource to track, which procs to glow).

## Schema (per spec)

| field | meaning | source |
|---|---|---|
| `resource` | resource name(s) used | **reliable** — tooltip / Cost field |
| `generators` | builds the point resource (`+N`) | **reliable** — tooltip "Generates N X" |
| `spenders` | spends resource (`-N` or a Cost) | **reliable** — "Consumes N X" or Cost field |
| `cooldowns` / `defensives` | offensive / defensive CDs (≥60s or tagged) | **reliable** — `primary` tag + CD length |
| `maintain` | buff(s)/DoT(s) to keep up | **inferred** — judgment |
| `procs` | use-when-available abilities + trigger | **inferred** — judgment |
| `st` / `aoe` / `summary` | prose priority (single-target / AoE) | **inferred** — judgment |
| `confidence` | `draft` (scaffold only) · `low` · `medium` · `reviewed` in-game | — |

The **reliable** fields come straight from scraped tooltips (`Generates/Consumes N`,
the `Cost` field, `primary` category, cooldown length) — not guessed. The **inferred**
fields (priority, ST vs AoE, which buff to maintain, procs) are model/human judgment and
carry a `confidence` — treat anything below `reviewed` as a draft to correct in-game.
`_note` flags a known discrepancy worth confirming.

## Regenerate

```
node tools/rotation-scaffold.js <slug>|all   # refreshes the reliable arrays;
                                             # PRESERVES st/aoe/summary/maintain/procs/confidence
```

The scaffold merges: rerunning it re-reads the registry for generators/spenders/CDs but
keeps human-authored inference fields, so it's safe to edit those by hand.

Two resource paradigms are handled: **point/combo** resources (Felfury, Reaped Souls —
explicit `Generates/Consumes N`) and **cost** resources (Energy, Mana — spenders found via
the `Cost` field). Baseline (grimoire) spells have no desc in the repo, so the scaffold
fetches their tooltip once from `db.ascension.gg` and caches it to
`tools/coa-classes/<slug>/<slug>-baseline-tips.json`.

## Status

Pilot: **felsworn** (medium, calibrated against known truth), **barbarian**, **reaper**
(low — Energy/pooled-resource classes, priority unconfirmed). Remaining 18 classes: not run.
