# WeakAuras — technical reference

Deep reference on the WeakAuras data model, derived from reading the WeakAuras2 source
checked out at `weakauras/weakauras2/`. This complements `CLAUDE.md` (project-level
guidance): CLAUDE.md tells you *how we build our packages*; this file documents *how
WeakAuras itself is structured* so we always emit valid data.

Target format: `tocversion 110200` → WoW 11.2 / WeakAuras **5.20.2**, export version `v: 2000`.

> Source of record: `weakauras/weakauras2/`. When in doubt, grep the actual `.lua` — this
> doc lists file/line anchors so you can jump straight to the schema.

---

## 1. The import string pipeline

A `!WA:2!` string is **not JSON**. The encode chain (all handled by `weakauras/wa-codec.js`):

```
Lua table
  → LibSerialize (binary, v1, big-endian, tagged stream)
  → LibDeflate raw deflate (no zlib/gzip header)
  → LibDeflate EncodeForPrint (custom 6-bit base64, little-endian bitstream)
  → prefix "!WA:2!"
```

- **EncodeForPrint charset:** `a-z A-Z 0-9 ()` (lowercase first, then upper, digits, parens).
  Get the order wrong and inflate fails with "invalid block type".
- **LibSerialize tag scheme** (low bits of first byte): `…1`=7-bit uint; `…10`=embedded
  str/table/array/mixed with 4-bit count; `…100`=12-bit int; `…000`=extended type index.
- **Numeric map keys** (e.g. `{[262]=true}`) must round-trip as integers. Our decoded JSON
  stores them as `"$n$262"` so the encoder re-emits ints, not strings. Breaking this
  silently corrupts class/spec load conditions.

See CLAUDE.md § "The core insight" for the codec CLI.

---

## 2. Top-level export envelope

The object we serialize:

```jsonc
{
  "d": { /* the root display (a group/dynamicgroup or a single aura) */ },
  "c": [ /* flat array of ALL child displays, each a full data table */ ],
  "m": "d",            // marker
  "s": "5.20.2",       // WeakAuras version string
  "v": 2000            // export format version
}
```

- A **single aura** exports with `d` = the aura and no `c`.
- A **package** (what we build) exports `d` = the root group, `c` = every region flat.
  Parent/child links are by **id**: a group lists `controlledChildren: [ids...]`, each child
  carries `parent: "<group id>"`.

Each display in `d`/`c` has (at minimum): `id`, `uid`, `regionType`, `triggers`,
`conditions`, `load`, plus all region-type default fields, plus anchoring/positioning.

---

## 3. Region types (the display kinds)

Registered via `Private.RegisterRegionType(...)`. The ones we emit:

| `regionType`      | File (`WeakAuras/RegionTypes/`) | Use |
|-------------------|----------------------------------|-----|
| `icon`            | Icon.lua                         | cooldown/proc icons |
| `aurabar`         | AuraBar.lua                      | resource bars, point/stack boxes, cast bars |
| `progresstexture` | ProgressTexture.lua              | custom-shaped gauges |
| `group`           | Group.lua                        | static container (root) |
| `dynamicgroup`    | DynamicGroup.lua                 | auto-arranging rows/grids |
| `text`            | Text.lua                         | standalone text |
| `texture`         | Texture.lua                      | images |
| `model`, `stopmotion` | Model.lua / StopMotion.lua   | 3D / animated (unused) |
| `empty`, `fallback` | Empty.lua                      | internal |

Every region type ships a `default` table — the full field set WeakAuras 5.x expects.
**We clone a known-good region and override, rather than build from `default`,** so we never
miss a required field. But the `default` tables are the authoritative field list.

### `icon` default (Icon.lua)
```
icon, desaturate, iconSource=-1, progressSource={-1,""}, adjustedMax/Min,
inverse, width=64, height=64, color={1,1,1,1}, selfPoint/anchorPoint="CENTER",
anchorFrameType="SCREEN", xOffset/yOffset=0, zoom=0, keepAspectRatio,
frameStrata=1, cooldown=true, cooldownSwipe=true, cooldownEdge, cooldownTextDisabled,
useCooldownModRate
```

### `aurabar` default (AuraBar.lua)
```
icon=false, texture="Blizzard", textureSource="LSM", width=200, height=15,
orientation="HORIZONTAL", inverse, barColor={1,0,0,1}, barColor2={1,1,0,1},
enableGradient, backgroundColor={0,0,0,0.5}, spark(+ spark* fields), progressSource={-1,""},
adjustedMax/Min, selfPoint/anchorPoint="CENTER", anchorFrameType="SCREEN",
xOffset/yOffset, icon_side="RIGHT", frameStrata=1, zoom
```
> Bar fill color is `barColor` (RGBA 0–1). Empty-box look = dark `backgroundColor` +
> transparent `barColor`, then a condition raises `barColor` to the fill color.

---

## 4. Sub-regions (per-region decorations)

Registered via `WeakAuras.RegisterSubRegionType(...)`. Stored in a region's
`subRegions` array; conditions target them by **index** (`sub.<index>.<prop>`).

| Sub-region       | Purpose |
|------------------|---------|
| `subbackground`  | background fill |
| `subforeground`  | foreground fill |
| `subtext`        | text overlay (e.g. charges: `text_text:"%s"`) |
| `subborder`      | border |
| `subglow`        | **proc/ready glow** (`glow`, `glowType`, `glowColor`) |
| `subtick`        | bar tick marks |
| `subtexture`, `subcirculartexture`, `sublineartexture` | image overlays |
| `submodel`, `substopmotion` | model/animation overlays |

In our icon template, `subglow` sits at subRegion **index 3** → conditions flip
`sub.3.glow` on a proc.

---

## 5. Triggers

A display's `triggers` is an array; each is `{ trigger = {...}, untrigger = {...} }`,
plus `triggers.activeTriggerMode` and a `disjunctive` combine mode.

`trigger.type` is a **category key** (`Private.category_event_prototype`), and
`trigger.event` selects the prototype within it. Full prototype list in
`WeakAuras/Prototypes.lua`. The ones that matter for us:

| Intent | `type` / `event` | Key fields |
|--------|------------------|-----------|
| Cooldown icon | `spell` / `Cooldown Progress (Spell)` | `spellName` (id or name), `use_exact_spellName`, `use_genericShowOn`, `genericShowOn` ("showAlways"/"showOnCooldown"/"showOnReady"), `use_track`+`track` |
| Buff/debuff / stacks | `aura2` | `unit`, `debuffType` ("HELPFUL"/"HARMFUL"), `useName`+`auranames[]` (by name) OR `useExactSpellId`+`auraspellids[]`, `matchesShowOn`, `ownOnly` |
| Resource bar | `unit` / `Power` | `use_unit`, `unit="player"`, `use_powertype`, `powertype` (see § 6) |
| Health bar | `unit` / `Health` | `unit`, `use_absorbMode`, `use_showAbsorb` |
| Cast bar | `unit` / `Cast` | `use_unit`, `unit` |
| Item cooldown | `item` / `Cooldown Progress (Item)` | `itemName`, `genericShowOn` |
| Combat-log duration | `Combat Log` | `subeventSuffix:"_CAST_SUCCESS"`, `use_spellId`, `spellId`, `duration` |
| Totem | `Totem` | `use_totemName`/`totemName` or `use_totemType`/`totemType` |
| Custom | `custom` | your own Lua (`custom`, `customVariables`, event/every-frame update) |

> The **constructors** that build these exact trigger tables live in
> `WeakAurasTemplates/TriggerTemplates.lua` (`createAbilityTrigger`, `createBuffTrigger`,
> `createPowerTrigger`, `createHealthTrigger`, `createCastTrigger`, …). Mirror them.

### Full trigger prototype categories (from Prototypes.lua)
`Unit Characteristics, Faction Reputation, Experience, Health, Power, Alternate Power,
Combat Log, Spell Activation Overlay, Cooldown Progress (Spell), Cooldown Ready (Spell),
Charges Changed, Cooldown Progress (Item/Equipment Slot), GTFO, Global Cooldown,
Swing Timer, Action Usable, Talent Known, PvP Talent Selected, Class/Spec, Loot
Specialization, Totem, Item Count, Stance/Form/Aura, Weapon Enchant, Chat Message,
Spell Cast Succeeded, Ready Check, Combat/Encounter Events, Evoker Essence, Death Knight
Rune, Item Equipped/Type/Bonus/Set, Equipment Set, Threat Situation, Crowd Controlled,
Cast, Character Stats, Conditions, Spell Known, Pet Behavior, Queued Action, Range Check,
Money, Currency, Location`.

### ⚠️ Ascension client caveats (validated in-game)
- `C_UnitAuras` / `C_Spell` may not exist → **don't read auras in custom Lua**. Use the
  `aura2` trigger to detect buffs/stacks; it's the portable path.
- Track abilities that don't resolve by `GetSpellInfo` **by name** in the trigger and
  confirm in-game.
- Spell/point resources with no real power type: fake it with an `aura2` (buff-with-stacks)
  trigger + a trivial custom `value=1,total=1` bar. See CLAUDE.md § point resource.

---

## 6. Power types (`powertype`)

| id | resource |
|----|----------|
| 0  | Mana |
| 1  | Rage |
| 2  | Focus |
| 3  | Energy |
| 4  | Combo Points |
| 6  | Runic Power |
| 8  | Astral / Lunar |
| 9  | Holy Power |
| 11 | Maelstrom |
| 13 | Insanity |
| 17 | Fury (DH) |
| 18 | Pain |

(Full list: `WeakAuras/Types.lua`.) Ascension's Felsworn uses **3 (Energy)** as primary;
Felfury points are a faked aura-stack bar, not a native power type.

---

## 7. Conditions

`display.conditions` is an array of `{ check, changes }`:

```jsonc
{
  "check": { "trigger": 1, "variable": "onCooldown", "op": "==", "value": 1 },
  "changes": [ { "property": "desaturate", "value": true } ]
}
```

- `check.trigger` is the **1-based** trigger index (or `-1`/`-2` for combine/global).
- `variable` is a state field exposed by that trigger (`onCooldown`, `stacks`, `show`,
  `expirationTime`, `charges`, …). What's available depends on the trigger prototype.
- `property` targets a region field (`desaturate`, `barColor`, `color`) or a sub-region
  (`sub.3.glow`, `sub.1.text_color`).
- Multi-condition ordering matters: later matching conditions override earlier ones;
  include a default/else state if you need it to reset.

Patterns we use:
- On-cooldown grey: `{trigger:1, onCooldown==1} → desaturate:true`.
- Point-box fill: `{trigger:1, stacks >= N} → barColor:<fill>`.
- Proc glow: `{trigger:2, show==1} → sub.3.glow:true` (+ `glowType`, `glowColor`).

---

## 8. Load conditions

`display.load` gates when the aura is active. Relevant keys:

- `class` / `class_and_spec` — **retail-only**; `class_and_spec.multi = {[specId]=true}`
  uses numeric spec ids. These do NOT map to Ascension custom classes, so our packages
  generally don't load-gate by class/spec (the user imports the right package themselves).
- `talent`, `spec`, `role`, `zoneId`, `size` (instance), `combat`, `never`, …
- Numeric keys inside `*.multi` are the `$n$`-prefixed map-key case from § 1.

---

## 9. The template model worth mirroring

`WeakAurasTemplates/TriggerTemplatesData.lua` is a **table-driven** catalog:

```lua
templates.class.WARRIOR = {
  [1] = {                    -- spec index
    [1]  = { title="Buffs",     args={ {spell=1719, type="buff",   unit="player"}, ... } },
    [2]  = { title="Debuffs",   args={ {spell=355,  type="debuff", unit="target"}, ... } },
    [3]  = { title="Cooldowns", args={ {spell=100,  type="ability", charges=true}, ... } },
    [11] = { title="Resources", args={ ... }, icon=rageIcon },
  },
  [2] = { ... },             -- next spec
}
```

Section ids: **1**=Buffs, **2**=Debuffs, **3**=Cooldowns, **11**=Resources.
Each arg: `{ spell, type = buff|debuff|ability, unit, <flags> }` where flags include
`charges, buff, debuff, overlayGlow, requiresTarget, usable, talent, herotalent`.

**This is the shape our per-class Ascension registry should adopt** — but the actual
spell ids and the class/spec lists in `Types.lua` are built from the retail game API and
are **not usable** for CoA custom classes. We maintain our own registry (populated by the
`wa-scrape-class` skill + user-provided baseline ids) and mirror the constructor logic to
turn each entry into a cloned+overridden region.

---

## 10. Quick file map (in `weakauras/weakauras2/`)

| Need | File |
|------|------|
| Region field lists / defaults | `WeakAuras/RegionTypes/<Type>.lua` |
| Sub-region types | `WeakAuras/SubRegionTypes/` (grep `RegisterSubRegionType`) |
| Trigger prototypes (all events + their fields) | `WeakAuras/Prototypes.lua` |
| Trigger dispatch / categories | `WeakAuras/GenericTrigger.lua` |
| Power types, class/spec types, misc enums | `WeakAuras/Types.lua` |
| Per-class/spec spell catalog (retail) | `WeakAurasTemplates/TriggerTemplatesData.lua` |
| Trigger constructors to mirror | `WeakAurasTemplates/TriggerTemplates.lua` |
