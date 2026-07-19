---
name: ability-classification
description: "Per-class ability tagging system (primary category + secondary tags) for the web palette, + the db.ascension.gg enrichment that feeds it"
metadata: 
  node_type: memory
  type: project
  originSessionId: 8b0a200c-2427-4907-b29c-e3bd946a78d7
---

Started 2026-07-15: classify every class's abilities so the web palette groups them instead of showing
one flat mixed list. One pass per class -> `registry/<slug>.tags.json` (keyed by spellId:
primary category + secondary tags + passive/grantsProc/grantsBuff flags). Frozen vocabulary + rules live
in `tools/CLASSIFY-SPEC.md`. `registry-build.js` merges the tags sidecar (and scraped details) into
`registry/<slug>.json`, so the web reads one file and re-scrapes never wipe tags. Gold example:
`registry/felsworn.tags.json` (144 abilities, user-validated). ~73% of talent nodes are Passive.

Key data-origin fact: cooldown / cast time / school / cost / range / effects were NOT in the CoA builder
fiber scrape NOR the baselines listing — they live on db.ascension.gg spell DETAIL pages (`?spell=<id>`,
the `#spelldetails` table). `tools/registry-enrich.js` fetches them (throttled) into
`tools/coa-classes/<slug>/<slug>-spell-details.json` (structured `details` + `text` + `rawHtml` so a later
AI pass never misses a field). ~10-15% of spellIds are DB-404 (mostly passives/multi-choice nodes).

Status (2026-07-15): ALL 21 classes classified -> registry/<slug>.tags.json (3252 abilities, 71% Passive,
190 low-confidence flagged). felsworn hand-done + user-validated; other 20 done by parallel sonnet
subagents against tools/CLASSIFY-SPEC.md. Vocab-compliance validated (0 out-of-vocab categories; category
names Movement/Control/Heal/Buff/Defensive are allowed as cross-role secondary tags). Registries rebuilt
with tags+details merged. NEXT: web palette should group by `primary` + filter by `tags` (currently uses
the weaker `guessActive` boolean); optionally spot-review the 190 low-confidence entries in-game.
Related: [[felsworn-wa-project]].
