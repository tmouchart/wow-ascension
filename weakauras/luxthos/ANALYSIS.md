# Luxthos WeakAuras — Analysis for a TANK Resource/Cooldown WeakAura

Focus: segmented/point-based resource displays and reusable cooldown/buff trigger shapes.
Three groups decoded from !WA:2! strings (serVersion 1).

| Class | Root group id | Children | RegionTypes |
|-------|---------------|----------|-------------|
| Druid | Luxthos - Druid | 192 | icon 152, aurabar 29, dynamicgroup 10, group 1 |
| Paladin | Luxthos - Paladin | 161 | icon 138, aurabar 14, dynamicgroup 8, group 1 |
| Rogue | Luxthos - Rogue | 145 | icon 107, aurabar 28, dynamicgroup 9, group 1 |

## Shared architecture (all 3)
- Segmented points = one aurabar region PER point, all parented to a dynamicgroup (e.g. `Combo Points - LWA - Rogue`, `Holy Power - LWA - Paladin`). NOT one region with N sub-textures.
- Each point region main trigger is `type:"unit"`, `event:"Power"` with `use_powertype:true` + a `powertype`. Codes seen: 4=combo points, 9=Holy Power, 3=energy, 0=mana.
- Fill/empty state is driven by `conditions` comparing trigger-1 `power`/`percentpower` to the point index, NOT by separate show/hide triggers. Each condition change is a `customcode` setting `aura_env.region.colorState` ("full"/"charge"/"dk") then `WeakAuras.ScanEvents("LWA_UPDATE_BAR", aura_env, 1, total)`. `actions.init.custom` tags the region: `aura_env.region.configGroup = "combo_points"`.
- Dynamicgroup layout: `grow:"CUSTOM"`, `align:"LEFT"`, `space:2`, `useLimit:false`.
- Reusable spell-cooldown trigger (icons): `type:"spell"`, `event:"Cooldown Progress (Spell)"`, `use_genericShowOn:true`, `genericShowOn:"showAlways"`, `use_exact_spellName:true`, `spellName:<id>`, `use_track:true`.
- Reusable buff trigger (icons): `type:"aura2"`, `unit:"player"`, `ownOnly:true`, `useName:true`, `auranames:["<spellId>"]`, `debuffType:"HELPFUL"`.

## Rogue — Combo Points (powertype:4)
- 7 point bars Combot Point 1..7 (point 7 has Assassination/Subtlety/Outlaw variants). Primary energy = Energy Bar - LWA - Rogue (aurabar, unit/Power, powertype:3, use_showCost:true).
- Point uses a 3-trigger disjunctive ("any") set: (1) Power/combo, (2) Talent Known (class ROGUE, spec), (3) aura2 charged-CP buff 457280.
- Filled logic (Combot Point 3):
```json
{"op":">=","trigger":1,"variable":"countCharged","value":"3",
 "checks":[{"trigger":1,"variable":"power","op":"==","value":"3"}]}  // colorState="charge"
{"op":"==","trigger":1,"variable":"power","value":"5"}                // colorState="dk"/"full"
```
- Charged CP handled via percentpower==100 + power==6 branches. Layout dynamicgroup grow:CUSTOM, space:2, limit:6.

## Paladin — Holy Power (powertype:9)
- 5 point bars Holy Power 1..5 under Holy Power - LWA - Paladin dynamicgroup. Primary = Mana Bar (Holy) (aurabar, Power, powertype:0, use_showCost:true) + optional Prot/Ret mana bar.
- Point main trigger mixes Power + rune flavour: `use_rune:true`, `rune:1`, `power:["1"]`, `power_operator:["=="]`, `powertype:9`. ~5 conditions; first compares power to 5:
```json
{"op":"==","trigger":1,"variable":"power","value":"5"}
```
- Same colorState + LWA_UPDATE_BAR recolor mechanism. Cleanest template for a Prot Paladin tank Holy Power bar: 5 aurabars in a CUSTOM-grow dynamicgroup, filled by power>=index conditions.
- CD icons (Holy Bulwark (Protection), Holy Armaments (Protection), Avenging Wrath) use the standard Cooldown Progress (Spell) shape; buffs use aura2.

## Druid — Combo Points + Mana/Energy (powertype 4/3/0)
- Two point sets: Combo Points - LWA - Druid (Feral) and Combo Points (Off-Spec), each 5 Combot Point N aurabars. Resources group also has Mana Bar, Energy Bar, Energy Bar (Off-Spec), optional off-spec mana bar.
- Point main trigger identical to Rogue Power/combo but with `use_showChargedComboPoints:true` (shows charged CP natively). powertype:4.
- Same condition-driven colorState + ScanEvents fill mechanism.
- Off-spec duplication: entire point set + resource bars duplicated with (Off-Spec) suffix and different load spec filters (load.class_and_spec).

## Takeaways for a tank build
1. Model each resource point as its own aurabar; group in a dynamicgroup with grow:"CUSTOM", space:2.
2. Give every point ONE unit/Power trigger with the right powertype (Prot Pally = 9).
3. Drive fill via conditions on trigger-1 power/percentpower vs the point index; put the visual change in a customcode that sets region.colorState and ScanEvents("LWA_UPDATE_BAR", ...).
4. Reuse Cooldown Progress (Spell) (use_exact_spellName, use_track, genericShowOn:"showAlways") for defensive/CD icons and aura2 (ownOnly, auranames:[id]) for mitigation buffs.
