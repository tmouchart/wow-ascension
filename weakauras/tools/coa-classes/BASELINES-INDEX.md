# Conquest of Azeroth — baseline / grimoire spells (per class)

Baseline abilities are learned on level-up from the class grimoire and are **NOT** in the
talent trees, so the CoA builder scrape misses them. They are recovered from the Ascension
spell DB (`db.ascension.gg`, an aowow instance) which indexes every custom (`@`-prefixed)
class spell under a per-class **skill line**. Regenerate with `node coa-baselines.js all`.

Per class: `<slug>/<slug>-baselines.md` (readable) + `<slug>-baselines.json` (full rank ladders).

| Class | baseline-only | skill line(s) |
|---|---|---|
| Barbarian | 5 | Barbarian=490 |
| Bloodmage | 4 | Fleshweaver=500 |
| Chronomancer | 10 | Chronomancer=485 |
| Cultist | 16 | Cultist=477, Dreadnought=497 |
| Felsworn | 14 | Felsworn=489 |
| Guardian | 9 | Guardian=487 |
| Knight of Xoroth | 10 | Knight of Xoroth=493 |
| Necromancer | 15 | Necromancer=475 |
| Primalist | 15 | Primalist=482, Mountain King=496 |
| Pyromancer | 11 | Pyromancer=476 |
| Ranger | 13 | Ranger=495 |
| Reaper | 9 | Reaper=483 |
| Runemaster | 11 | Runemaster=481 |
| Starcaller | 10 | Starcaller=478, Warden=502 |
| Stormbringer | 9 | Stormbringer=488 |
| Sun Cleric | 10 | Sun Cleric=479, Valkyrie=498 |
| Templar | 14 | Templar=494 |
| Tinker | 16 | Tinker=480 |
| Venomancer | 16 | Venomancer=484, Vizier=499 |
| Witch Doctor | 11 | Witch Doctor=491 |
| Witch Hunter | 11 | Witch Hunter=492, Black Knight=501 |

**Total: 239 baseline-only abilities across 21 classes.**

### Caveat — Bloodmage
Bloodmage has no skill line titled "Bloodmage"; only its spec line **Fleshweaver (500)** was
found, so its baseline set is likely incomplete. Its other specs (Sanguine, Accursed, Eternal)
have no dedicated line in the scanned range. Confirm Bloodmage baselines in-game if building it.

### How it works
- `?skill=<id>` on db.ascension.gg lists a class/spec skill line (id 475..502 = the CoA block).
- Custom spells are name-prefixed `@`; the row-level `isCoaClass` flag is unreliable.
- Each ability carries a rank ladder (`level` = learn level); the lowest-level id is the base learn id.
- We subtract the tree spellIds already in `<slug>-nodes.json` to isolate baseline-only.
