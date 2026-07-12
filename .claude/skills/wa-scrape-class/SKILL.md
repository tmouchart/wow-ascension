---
name: wa-scrape-class
description: Scrape a Conquest of Azeroth (Ascension) class's abilities, castable spellIds, icons, descriptions and resource model from the CoA talent builder using browser automation. Use when starting a new class package, when you need a class/spec's spell list + spellIds, or when the user asks to pull/extract a class's spells from the Ascension builder.
---

# Scrape a CoA class from the Ascension builder

The builder https://ascension.gg/en/v2/coa-builder/voljin-alpha is a Next.js/React app. Talent data is
NOT in the DOM or `__NEXT_DATA__` — it lives in **React fiber props**. Use the `mcp__claude-in-chrome__*`
tools (load them via ToolSearch first; call `tabs_context_mcp` before anything else).

## Procedure

1. `tabs_create_mcp` → `navigate` to the builder URL. Have the user select the **class + spec tab** they want
   (or click it). Confirm the visible tree matches the target spec.
2. Extract talent nodes from fibers. Find rank-label elements (`textContent` matching `^\s*0/[12]\s*$`),
   walk `el[__reactFiber$...]` up via `.return` to the first `memoizedProps.node` that has a `spellId`.
   Collect unique nodes by `node.id`. Each node has:
   `id, name, spellId (CASTABLE id — what WeakAuras needs), spellIds, tabId, iconPath, entryType,
    isPassive (UNRELIABLE), aeCost, teCost, maxPoints, description, rankDescriptions`.
   Group by `tabId` (one tab = class tree, another = spec tree).
3. **Tool output truncates at ~1000 chars.** Never return whole node objects. Stash on
   `window.__nodes`, build a compact string, and page it with `.slice(a,b)` across several calls.
   Compact line: `` `${spellId}|${name}|${isPassive?'P':'A'}|ae${aeCost}te${teCost}|mp${maxPoints}` ``.
   Pull descriptions separately, trimmed (`desc.slice(0,~150)`), only for the abilities you need to classify.
4. Save the result to `weakauras/classes/<name>/abilities.md` (a table: spellId | name | rank, per tree).
   All 21 classes are already bulk-scraped under `weakauras/tools/coa-classes/<slug>/` (regenerate with
   `node weakauras/tools/coa-process.js <dump.json>`) — check there first before re-scraping.

## Important gotchas

- The builder **Export** button yields `:<nodeId>t<rank>:...` — those are **node ids, not castable spellIds**.
  Only `node.spellId` (from the fiber) is usable in WeakAuras triggers.
- `isPassive`/`entryType` are unreliable (often all "Ability"). Classify active vs passive from the
  `description` text (mentions of cooldown, "generates/consumes <resource>", cast, buff duration).
- **Baseline abilities** (not in the talent tree) can't be scraped — ask the user for their spellIds
  (in-game tooltip with an id addon, or `/dump GetSpellInfo("<name>")`). If a name doesn't resolve via
  `GetSpellInfo`, track that spell **by name** in the WeakAura trigger and verify in-game.
- Note the **resource model** from tooltips (primary power type + any secondary point/stack resource,
  its name, min/max, and which abilities build/spend it) — needed for the resource bars.

## Output for the build step

Produce, per class/spec: the ability→spellId map, the resource model, and a shortlist of
cooldown-worthy abilities (defensives, big CDs, procs/glows). Feed these into `wa-build-package`.
Reference example: `weakauras/classes/felsworn/abilities.md`.
