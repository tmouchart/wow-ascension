# Ability classification spec (FROZEN vocabulary)

One classification pass per class produces `registry/<slug>.tags.json`. The web palette groups abilities
by their **primary category** and lets the user filter by **secondary tags**. Reference gold example:
`registry/felsworn.tags.json` (144 abilities, hand-validated 2026-07-15).

## Input (per class)
- `registry/<slug>.json` — each ability has `{ spellId, name, source, desc, details }`.
  `details` (when present) has `Cooldown`, `Cast time`, `School`, `Cost`, `Range`, `Duration`,
  `Mechanic`, `Effects[]` — scraped from db.ascension.gg. ~10-15% of spells are DB-404 (no `details`);
  classify those from `name` + `desc` alone (set `confidence: "low"` if truly ambiguous).
- `tools/coa-classes/<slug>/<slug>-abilities.md` — readable grouping by tree/spec (optional context).

## Primary category (exactly ONE per ability, user-overridable in the UI)
- **Rotational** — core damage ability, spammable / short or no cooldown (builders, spenders, fillers,
  nukes). Executes go here too (+ `Execute` tag).
- **CD Offensif** — a damage cooldown (typically >= ~45s, or a burst/steroid self-buff).
- **CD Defensif** — a mitigation / survival cooldown (absorb, dmg-reduction, immunity, max-hp, taunt,
  raid mitigation cooldown). ASCII spelling: `CD Defensif` (no accent).
- **Utility** — non-CC tech: interrupt, purge/spellsteal, dispel, reflect, mana burn, reveal-stealth.
- **Control** — hard crowd control on the target: stun, fear, horrify, root, silence, knockback, sleep.
  (An **interrupt** is Utility + `Interrupt` tag, NOT Control.)
- **Movement** — mobility / gap-closer: charge, dash, leap, blink, teleport.
- **Heal** — a direct heal or healing cooldown (self or ally). Passive self-leech is NOT Heal — it is a
  `Selfheal` tag on whatever the ability's real category is.
- **Buff** — a maintained / long self or raid buff (minutes, or a maintained aura/toggle, or a castable
  raid "Pact"/blessing). Aspect-style self buffs, Immolation-style maintained auras.
- **Passive** — a talent that only modifies stats / other spells / adds a proc. NEVER gets its own icon.
  The MAJORITY of talent-tree nodes are Passive (felsworn: 106/144 = 73%).

### Deciding Passive vs active (the `isPassive` scrape flag is USELESS — always false)
Passive if the desc reads like a modifier: opens with "Increases/Reduces/Your/Each/When/While/Casting/
Dealing/Direct/After/Whenever...", or is an "X now Y" talent, or its only Effects are `Mod .../Add Modifier`.
Active if it is a thing you press: has an Energy/Mana `Cost` AND a `Range`/`Cast time`, or the desc is an
imperative ("Charge an enemy", "Unleash", "Manifest a barrier", "Channel a beam").

## Secondary tags (multiple; pick the salient 2-5, not an exhaustive stat dump)
- **School** (from `details.School`; "Fire, Shadow" = Shadowflame -> tag both): `Fire` `Shadow` `Physical`
  `Arcane` `Chaos` `Frost` `Nature` `Holy`. Add `Chaos` when the desc says "Chaos damage".
- **Mechanic**: `DoT` `HoT` `Shield` `Absorb` `Selfheal` `Leech` `Enrage` `Immunity` `Reflect`
  `SpellSteal` `Dispel` `Interrupt` `Fear` `Horrify` `Stun` `Root` `Slow` `Silence` `Knockback` `Taunt`
  `Summon` `Tracking` `Poison` `Bleed`
- **Delivery**: `AoE` `Cleave` `Melee` `Ranged` `Channel` `Charge` `Execute`
- **Resource**: `Generator` (generates the class point/combo/felfury) · `Spender` (consumes it)
- **Role/misc**: `Raidbuff` `Haste` `Crit` `Agility` `Defensive` (a passive mitigation talent) `Buff`
- **Cross-role** (a category name used as a secondary tag to mark a mixed-purpose ability): `Movement`
  `Control` `Heal` `Buff` `Defensive`. Example: an offensive cooldown that also heals ->
  `primary: "CD Offensif"`, `tags: [..., "Heal"]`. A damage CD that also roots -> tag `Control`.

## Flags
- `grantsProc: true` — a **Passive** whose effect is a `Proc Trigger Spell` that creates a named,
  trackable buff/debuff (e.g. a damage-buff proc, a generated stack). Set liberally on proc passives —
  these feed the WA "Proc" / "Buff a tracker" elements.
- `grantsBuff: true` — a passive/spell that ENABLES a core maintenance buff the class tracks
  (e.g. felsworn "The Demon Within" -> Inner Demon).
- `confidence: "low"` — no desc and ambiguous; add a `notes` telling the user to verify in-game.

## Output schema — `registry/<slug>.tags.json`
```json
{
 "slug": "<slug>",
 "class": "<Class name>",
 "count": <number of abilities, MUST equal registry abilityCount>,
 "categories": ["Rotational","CD Offensif","CD Defensif","Utility","Control","Movement","Heal","Buff","Passive"],
 "spells": {
   "<spellId>": {
     "name": "<name>", "source": "<class|SpecName|baseline>",
     "primary": "<one category>", "tags": ["<tag>", ...],
     "passive": <true if primary==Passive>,
     "grantsProc": <bool>, "grantsBuff": <bool>,
     "confidence": "low"   // optional
     "notes": "..."        // optional, ASCII only
   }
 }
}
```

## Rules
- **Cover EVERY ability** in `registry/<slug>.json` — `count` and the number of `spells` keys must match
  the registry `abilityCount`. Missing one is a hard error.
- **ASCII only** in every string (names may already be ASCII; keep notes ASCII: `-`, `!`, no accents/emoji).
- Use ONLY the categories and tags listed above. Do not invent new ones.
- `passive` must be `true` exactly when `primary` is `Passive`.
- Resource point names differ per class (Felfury, Combo, Holy Power, Insanity, Runeblade...): tag the
  generator/spender relative to THAT class's resource.
