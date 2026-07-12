---
name: wa-build-package
description: Iterate on an EXISTING class WeakAura package — add/modify a bar, cooldown icon, tracked buff, proc, glow or condition in classes/<name>/build.js and re-encode. Use when tweaking an already-scaffolded package (colors, sizing, a new icon/element, a glow rule). To create a brand-new class/spec package from scratch, use wa-new-class.
---

# Iterate on a class package

Edit the class's `classes/<name>/build.js` (data + layout on the shared engine), then re-encode with
`node build.js <name>`. To scaffold a NEW class/spec, use **wa-new-class** instead.

> Reference of record is **CLAUDE.md** — Element taxonomy, Glow taxonomy, Standard layout & sizing,
> Icon source gotcha. Don't re-derive field shapes; copy the taxonomy recipe and the two worked examples
> (`classes/felsworn/build.js`, `classes/runemaster/build.js`).

## Workflow

1. Edit `classes/<name>/build.js` (never the `.import.txt`). Build regions with the `lib/builders.js`
   helpers (`baseBar`/`segmentBar`/`chargeSegmentBar`/`iconBase`/`makeDynGroup`/`makeGroup`/`buildPackage`,
   the `*Trigger` factories, `gradient`/`barText`/`glowChanges`/`chargesSubtext`/`subglow`).
2. `node build.js <name>` — `buildPackage` re-decodes and asserts the round-trip, then writes
   `dist/<name>.import.txt` (rotating the old one to `dist/<name>.prev.import.txt`).
3. Hand the user `dist/<name>.import.txt`. uids are stable (`uidFor`), so a re-import says **Update**.

## Must-follow rules (details in CLAUDE.md)

- **Clone via builders, override only what matters** — templates carry every field WA 5.20.2 needs.
- **Detect with `aura2`** (no `C_UnitAuras`): vars `stacks` / `buffed` / `expirationTime` (op `<=`) /
  `show` / `percenthealth` / `onCooldown`; multi-condition = `{ checks:[...], trigger:-2, variable:"AND" }`.
- **Keep uids stable** — they derive from the element `id`; renaming an element re-keys it (loses Update).
- **ASCII only** in text/ids (codec won't round-trip UTF-8 — `buildPackage` refuses to write).
- **Icon art** = `iconSource:-1` + `cooldownTrigger` fallback `displayIcon` **path**; never `iconSource:0`
  with a path (`?`).
- **Glow**: `buttonOverlay` = strong "act now" (white proc/ready, orange/gold dump); `Pixel` = passive state
  (class-color buff-up, pulsing red buff-missing). Match the other classes.
- **Compact sizing**: `BAR_W=250`; boxes span `BAR_W`; `dynamicgroup` `maxWidth:BAR_W`; icons 26/24; bar
  heights 12–14; vertical gaps ~3px.
- **Always** let `buildPackage` assert the self round-trip before the string reaches the user.

## Common edits

- **Add a cooldown** → append to the class's `ICONS_MAIN` / `ICONS_SECONDARY` list.
- **Add a proc row / glow** → copy the felsworn proc-icon block (alpha-gated + white Action Button Glow).
- **Add a tracked buff bar / stacks / charges** → `baseBar`+`buffTrigger("showAlways")` /
  `segmentBar` / `chargeSegmentBar`; drive states with `expirationTime` / `stacks` / `charges` conditions.
- **Retune layout** → adjust the geometry constants (`BAR_W`, `*_Y`, `ICON_SIZE*`); keep gaps ~3px.
