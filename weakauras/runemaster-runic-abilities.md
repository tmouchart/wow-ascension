# Runemaster — Runic spec (Conquest of Azeroth / Voljin Alpha)

Scraped from https://ascension.gg/en/v2/coa-builder/voljin-alpha (React fiber `node.spellId`).
Two trees: **tab 87 = CLASS TREE** (Ability Essence), **tab 85 = RUNIC spec tree** (Talent Essence).

## Resource model

- **Primary power: Mana** (`powertype:0`). All abilities cost mana; several talents give mana back
  (Leystone Springs auto-attack restore, Glyphs of Power 10% proc, Runic Tattoos -10% costs).
- **No secondary point/stack resource** in the classic sense. The trackable "point-like" states are:
  - **Marked: Runic Brand** — a *debuff on the enemy* applied by Runic Brand, 8s, **stacks up to 3**
    (with `Leyborn` [705609]). This is the buff-on-target / detonate mechanic François described.
  - **Weapon Engraving** procs (Fire / Earth / Air / Water) — self proc-buffs triggered by attacks.
  - **Runic Tattoos** elemental stance (Fire/Earth/Air/Water) + **Runeshroud** (stealth mechanic buff).

## THE core mechanic (what François wants tracked)

**Runic Brand** [712299] → applies debuff **"Marked: Runic Brand"** on the enemy (8s, up to 3 stacks).
While marked, your next **Runeblade** on that enemy triggers a **Runic Explosion** (detonation).
So the loop = *brand the target → detonate with your attacks*. The WA must show:
1. **Marked: Runic Brand** debuff **on the target** (with stack count) — the "did I brand it / how many stacks".
2. Cooldown of **Runic Brand** (re-apply) and the **Runeblade** detonator.

## Active / cooldown-worthy abilities (from talent trees)

| spellId | name | tree | notes |
|---|---|---|---|
| 712299 | **Runic Brand** | 85 Runic | applies **Marked: Runic Brand** debuff (8s, ≤3 stacks). Core. |
| 712326 | **Fist of the Ancients** | 85 Runic | melee AoE, triggers Weapon Engraving; CD reduced by Runeblade/Primordial Blast |
| 712325 | **Zenith** | 87 Class | 6s: +100% engraving trigger chance. 45s recharge, 2 charges w/ Echoes of Eternity [521211] |
| 560036 | **Runic Tempest** | 85 Runic | CD: resets Fist of the Ancients, cast-while-moving 8s |
| 801096 | **Ley Power** | 85 Runic | damage steroid (Arcane bonus from nearby enemies) |
| 500464 | **Guarding Rune** (Rune of Guarding) | 85 Runic | defensive barrier, -40% magic dmg, 15s |
| 520229 | **Granite Resolve** | 87 Class | defensive: -30% physical dmg, 8s, usable while stunned |
| 500287 | **Warpdagger** | 87 Class | mobility: throw + teleport (reactivate) |
| 500671 | **Phase Out** | 87 Class | stealth 6s, applies Runeshroud |
| 500296 | **Power Engraving** | 87 Class | ground buff zone (+magic dmg/crit to allies), 20s |
| 801103 | **Speed Rune** | 87 Class | movement-speed rune path, 10s |
| 804060 | **Permafrost Rune** | 87 Class | CC: incapacitate (requires frozen target) |
| 807842 | **Glacial Rune** | 87 Class | AoE freeze after 1s |
| 804232 | **Warding Rune** | 87 Class | engrave (defensive) |

## Baseline abilities referenced but NOT in the talent tree — NEED spellIds from François

These are core to the rotation but not scrapable from the builder (baseline). Get the spellId in-game
(tooltip id addon, or `/dump GetSpellInfo("Name")`). If a name doesn't resolve, we track it by name.

- **Runeblade** — the main attack that **detonates Marked: Runic Brand** → Runic Explosion. *(critical)*
- **Primordial Blast** — main nuker/spender (referenced by Magic Etchings, Eternal Magic, Mark of Strength,
  Elemental Mastery). *(critical)*
- **Runic Explosion** — the detonation proc (may not be castable; effect only).
- **Elemental Burst** — triggers engravings (Decoder [706523]).
- **Leyfeed** — dispel/steal magic effect (Magic Feeder [705546]).
- **Ley Lock** — interrupt (Mind Over Matter [800757]).
- **Runeshroud** — stealth mechanic buff (from Phase Out).
- **Weapon Engraving: Fire / Earth / Air / Water** — proc buff names (self). Need exact buff names for aura2.
- **Runic Tattoos: Fire / Earth / Air / Water** — stance buff names (self).

## Full node dump (spellId | name), for reference

### Class tree (tab 87 — Ability Essence)
500287 Warpdagger · 500296 Power Engraving · 500671 Phase Out · 520054 Primordialism · 520145 Glyphs of Power ·
520229 Granite Resolve · 520237 Blade Rift · 560992 Warpmaster · 705546 Magic Feeder · 705554 Speedy Attuner ·
705562 Ley Constitution · 705563 Shroudwalker · 705581 Prismatic Flow · 705583 Runic Breakout · 705586 Sigilist ·
705605 Master Engraver · 705621 Runic Affinity · 705636 Primal Rune · 706523 Decoder · 707157 Stone Petroglyph ·
707413 Elements of Fury · 707653 Nomad's Scroll/Elemental Secrets · 712325 Zenith · 800736 Runic Tattoos ·
800757 Mind Wrath/Mind Over Matter · 801086 Convergence · 801103 Speed Rune · 804060 Permafrost Rune ·
804232 Warding Rune · 806718 Unbound · 806795 Mystical Etchings · 806797 Ancient Teachings ·
807376 Wind Walker/Master of Runes · 807842 Glacial Rune

### Runic spec tree (tab 85 — Talent Essence)
300581 Leystone Springs · 300582 Magic Etchings · 500464 Guarding Rune · 520524 Brandmaster · 520755 Ancient Warrior ·
520917 Stone Savant · 521211 Echoes of Eternity · 521219 Explosive Runes · 524697 Flowing Rivers/Wind Surge ·
560036 Runic Tempest · 560050 Mark of Strength · 560053 Sky and Stone · 560540 Leyline Disturbance ·
567233 Uncovered Engravings · 705543 Forbidden Engraving · 705609 Leyborn · 705613 Symbols of Power ·
705615 Volcanic Etching · 705619 Alteration · 706531 Earth, Wind, and Fire · 712299 Runic Brand ·
712326 Fist of the Ancients · 800756 Protective Warding/Runebound Surge · 801096 Ley Power · 805743 Steam Conjurer ·
805796 Fists of Power · 806698 Eternal Magic · 806704 Elemental Strikes · 806708 Graceful · 806711 Elemental Mastery ·
806984 Runelord · 806993 Devastating Flames/Granite Shield · 807172 Tempo
