---
name: wa-stable-uids
description: "WeakAuras import strings must keep uids stable so re-imports say \"Update\" not create a new set"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 97dff6ce-4302-4617-a08e-4b8941d4bffd
---

When generating WeakAura import strings for the user, keep every region's `uid` **stable across builds** (and never bump the root group's uid per-version). WeakAuras decides "Update existing aura" vs "create new set" by matching the import's `uid` against installed auras; a changed uid = a duplicate set.

**Why:** the user kept getting a brand-new aura set on every version (v4/v5/v6) because build scripts bumped `group.uid` (felswrnGrp004→005→006) and gave icons sequential uids.

**How to apply:** derive uids deterministically from the stable `id` (see `uidFor()` in `weakauras/build-v6.js`) so a uid only changes when an element is renamed. Also keep the root group `id` constant ("Felsworn Tyrant"). After switching the uid scheme once, the user must delete old duplicate sets and import once; subsequent imports update in place.

Related: [[felsworn-wa-project]]
