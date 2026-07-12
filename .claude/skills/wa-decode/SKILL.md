---
name: wa-decode
description: Decode a WeakAuras `!WA:2!` import string into readable JSON, or inspect a decoded package's structure (regions, triggers, conditions). Use when the user pastes/points to a WeakAuras export string, a `.wa`/`.json`/`.txt` file containing one, or asks what a WeakAura contains, how a class package tracks a spell/resource, or to extract field shapes to copy.
---

# Decode & inspect WeakAuras strings

The codec is `weakauras/wa-codec.js` (Node, no deps). A `!WA:2!` string = Lua table → LibSerialize →
raw deflate → EncodeForPrint. See `CLAUDE.md` for format internals.

## Decode a string/file

```bash
cd weakauras
node wa-codec.js decode <path-to-file-containing-the-string>
# -> writes <basename>.decoded.json next to it
```

If the user pastes a raw string, write it to a temp file first, then decode. Only `!WA:2!` is supported
(older `!WA:1!` uses AceSerializer — not implemented).

## Structure of a decoded package

Top level: `{ m:"d", s:<wa version>, v:<num>, d:<root group region>, c:[<all child regions, flat>], wagoID }`.
- `d` = root region (usually `regionType:"group"`), `d.controlledChildren` lists direct child ids.
- `c` = flat array of every descendant region. Each has `id`, `regionType`
  (`icon|aurabar|dynamicgroup|group`), `parent`, `triggers`, `conditions`, positioning.
- `triggers` is a mixed object: `{ __array:[{trigger, untrigger}, ...], disjunctive, activeTriggerMode }`.
- Numeric map keys are stored as `"$n$<n>"` (e.g. `"$n$262"`), preserving integer Lua keys.

## Inspecting (avoid dumping whole files — they're 100s of KB)

Use targeted Node one-liners, e.g.:
```bash
node -e "const j=require('./x.decoded.json'); console.log(j.c.length, Object.keys(j.c[0]))"
node -e "const j=require('./x.decoded.json'); const c=j.c; \
  const rt={}; c.forEach(a=>rt[a.regionType]=(rt[a.regionType]||0)+1); console.log(rt)"
# find how something is tracked:
node -e "const c=require('./x.decoded.json').c; const a=c.find(x=>x.id==='<id>'); \
  console.log(JSON.stringify(a.triggers,null,1))"
```

To learn a pattern to copy (a power bar, a segmented resource, a glow condition, a cooldown icon), grep
across regions for the relevant `trigger.event` / `condition.changes[].property` and print trimmed snippets.
`weakauras/luxthos/ANALYSIS.md` already summarizes rogue/paladin/druid resource + cooldown patterns.

## When extracting a reusable template

Save a full representative region to `weakauras/_template-<kind>.json` (bar/icon/group/dyngroup) so build
scripts can clone it — cloning guarantees every required internal field is present for the target WA version.
