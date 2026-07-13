---
name: coa-baseline-spells-source
description: How to get CoA baseline/grimoire spellIds (not in talent trees) — db.ascension.gg aowow skill lines
metadata:
  type: reference
---

CoA baseline/grimoire spells (learned on level-up, NOT in the talent trees, so the CoA builder
scrape misses them) are recoverable from **`db.ascension.gg`** — an **aowow** (Wowhead-clone)
instance indexing all Ascension custom spells.

Endpoints (work via plain curl/fetch, no browser):
- `?spells&filter=na=<Name>` → JSON `Listview` (`"data":[...]`), resolves a spell by name → spellId.
- `?spell=<id>` → spell detail page.
- `?skill=<id>` → a class/spec **skill line**; the CoA class block is skill ids **475–502**
  (489=Felsworn, 488=Stormbringer, 490=Barbarian, 481=Runemaster, ...). Enumerates that class's
  grimoire spells with rank ladders (`level` = learn level; lowest-level id = the base learn id).

Key gotchas:
- Custom spells are **name-prefixed `@`** — that is the reliable CoA marker. The row-level
  `isCoaClass` flag is INCONSISTENT (e.g. Runemaster's baselines have it 0). Filter on `@`.
- The talent-tree scrape gives different skill lines than the baseline line; don't try to find the
  baseline line from tree ability names — scan `?skill=` titles instead.
- **Bloodmage** has no base skill line (only its Fleshweaver spec line 500) → its baseline set is
  incomplete; confirm in-game.

Harness: `node weakauras/tools/coa-baselines.js all` scans the lines, subtracts tree spellIds from
`<slug>-nodes.json`, writes `coa-classes/<slug>/<slug>-baselines.{md,json}` + `BASELINES-INDEX.md`.
Recovered 239 baseline-only abilities across 21 classes. This closes the blind spot the CLAUDE.md
scrape section used to call "NOT scrapable". Related: [[coa-class-scrape]].
