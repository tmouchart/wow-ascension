# WA Test Harness — client-compat validation in-game

> **RÉSULTAT (2026-07-22, perso Felsworn) — ✅ PASSÉ.** Import OK, `/wa` s'ouvre, zéro erreur Lua.
> - **Macro 1 : rien manquant** → toutes les fonctions API existent sur le client, **`GetWeaponEnchantInfo`
>   compris** (→ le trigger `Weapon Enchant` de la buff row runemaster est validé).
> - **Macro 2 : les 3 en `ok`** (`GetSpellInfo` / `GetSpellCooldown` / `IsSpellKnown` sur l'id custom 500028).
>   Nos cooldown triggers sont sains. Surprise : `GetSpellInfo`/`IsSpellKnown` **ne throwent PAS** sur cet id
>   → le crash Marco était probablement **id-spécifique** (id barbarian absent de la DB client), pas "tout id
>   custom throw". `gateUnknownSpells` reste OFF malgré tout. Pas encore re-testé avec l'id barbarian exact.
>
> Conclusion : **tout le vocabulaire actuel du framework est sûr au load.**


**But.** Une seule WeakAura qui exerce **tout ce que le framework sait émettre** (chaque `kind` du DSL,
chaque clause, les 3 types de glow, chaque trigger builder, tout le Lua custom), construite par le
**pipeline SPEC de production** (`specToParts` → `buildPackage`). Si elle s'importe proprement et que
`/wa` s'ouvre encore, aucune shape émise ne casse la boucle de load de WeakAuras — la classe exacte du
crash `IsSpellKnown` de Marco (2026-07-20, cf. gotcha CLAUDE.md) est couverte, puisque ce crash se
déclenchait au load.

**Limite honnête.** Ce test valide le **vocabulaire actuel** du framework. Il ne protège pas contre un
futur ajout (nouveau load option, nouvelle globale Lua custom) — ça, c'est le rôle du lint allowlist
dans `buildPackage` (à implémenter, cf. discussion 2026-07-22).

## Fichiers

| Fichier | Rôle |
|---|---|
| `tools/test-harness.spec.json` | le SPEC du harness (dans `tools/`, PAS `classes/` — hors presets web, coverage et golden guardrail) |
| `tools/build-test-harness.js` | le writer : `node tools/build-test-harness.js` (depuis `weakauras/`) |
| `dist/test-harness.import.txt` | le string `!WA:2!` à importer (14 321 chars, 46 régions, round-trip vérifié) |

Regénérer après un changement d'engine : `cd weakauras && node tools/build-test-harness.js`.

## Ce que le package contient (audité sur le package décodé, pas sur la théorie)

- **Kinds** : `powerBar` (Energy idx 3), `healthBar`, `stackBar` (Felfury 0..6), `uptimeBar` × 3
  (simple "Inner Demon" + any-of + `unit:target` DoT "Cripple"), `buffWarnText`, `stacks` × 2 (self
  Felfury avec `capGlow`/`unlessBuff` + target HARMFUL `unitExists:false`), `chargeStacks` (Chaos Rush
  500028, 2 boxes), `iconRow` × 3 (procs + CDs + un `secondary` **combat-only**), `buffRow` (any-of,
  `indicator` + `lowPowerGlow`, **weapon enchant MH/OH**), side rails `left`/`right`.
- **Clauses `showWhen`/`glow.when`** (toutes) : `buff`, `buffMissing`, `anyBuff`, `buffStacks`,
  `targetHpBelow`, `powerAtLeast`, `powerPctAtLeast`, `spellReady`, `charges`, `stealable` — en
  `hide:"slot"` ET `hide:"collapse"`.
- **Triggers émis** : 29× `aura2` · 21× stateupdate Lua custom · 20× `Cooldown Progress (Spell)` ·
  2× `Weapon Enchant` (**`GetWeaponEnchantInfo` jamais confirmé sur ce client — ce test tranche**) ·
  `Power` · `Health`. Glows : `buttonOverlay`, `Pixel`, `ACShine`.
- **Sûreté vérifiée** : seuls les `load` `use_combat` (+ champs inertes) ; **zéro `use_spellknown`** ;
  le Lua custom n'appelle que `UnitPower`, `UnitHealth`, `UnitHealthMax`, `UnitExists`. SpellIds =
  vrais ids felsworn (baselines db.ascension.gg).

## Checklist in-game (~2 min, sur le perso Felsworn)

1. **AVANT d'importer** : `/console scriptErrors 1` — sinon les erreurs Lua sont silencieuses.
2. Importer le contenu de `dist/test-harness.import.txt`, accepter, puis `/reload`.
3. **`/wa` doit s'ouvrir.** C'est LE test critique : une erreur dans la boucle de load = `/wa` mort
   (symptôme exact de l'incident Marco). S'il s'ouvre → aucune shape émise ne crashe le load.
4. **Forcer les chemins événementiels** (le Lua custom ne tourne qu'à l'événement) :
   - cibler un mob → execute (`targetHpBelow`), DoT target, stealable ;
   - entrer/sortir de combat → la rangée "Combat only icon" doit apparaître/disparaître ;
   - attendre ~10 s en observant le chat (zéro erreur attendue).
5. **Attendu visuellement** (buffs absents = normal) : barres Energy/HP remplies ; textes
   "SINGLE DOWN" / "ANYOF DOWN" / "TEST WARN TEXT" visibles ; plein d'icônes grisées ; boxes vides.
   **Un élément vide ou gris n'est PAS une erreur** — seuls comptent : une popup d'erreur Lua, ou
   `/wa` qui ne s'ouvre plus.
6. **Macro 1 — fonctions API absentes du client** (rien d'affiché sauf `MISSING: X`) :

   ```
   /run for w in ("UnitPower UnitHealth UnitHealthMax UnitExists UnitAura GetSpellCooldown GetSpellCharges GetSpellInfo GetWeaponEnchantInfo GetInventoryItemTexture IsSpellKnown"):gmatch("%S+") do if not _G[w] then print("MISSING: "..w) end end
   ```

7. **Macro 2 — sonde de la classe exacte du crash** (appel des fonctions sur l'id custom 500028) :

   ```
   /run for f in ("GetSpellInfo GetSpellCooldown IsSpellKnown"):gmatch("%S+") do local ok,e=pcall(_G[f],500028) print(f..": "..(ok and "ok" or "ERR "..tostring(e))) end
   ```

   Interprétation : `GetSpellCooldown: ok` = ce qu'on veut voir (nos cooldown triggers sont sains).
   `GetSpellInfo`/`IsSpellKnown` en `ERR` sur un id custom = **confirmation attendue du gotcha connu**
   (la raison pour laquelle `gateUnknownSpells` est banni) — PAS un nouveau problème.
8. **Weapon enchant** (optionnel) : appliquer une sharpening stone / un engraving → l'icône
   "Engraving MH/OH" doit afficher l'enchant. Si rien n'apparaît ET que la macro 1 dit
   `MISSING: GetWeaponEnchantInfo` → le trigger `Weapon Enchant` est à bannir du framework
   (impacte la buff row du runemaster).
9. **Après le test** : supprimer le groupe "WA Test Harness" dans `/wa`.

## Grille de résultats à rapporter

| Observation | Conclusion |
|---|---|
| Import OK + `/wa` s'ouvre + zéro erreur Lua | ✅ tout le vocabulaire actuel du framework est sûr au load |
| `/wa` ne s'ouvre plus | ❌ crash de la boucle de load — noter la 1re erreur Lua, récupération : rename `WeakAuras.lua`(+`.bak`) dans SavedVariables |
| Erreur Lua ponctuelle (popup) sans bloquer `/wa` | ⚠️ noter le texte exact + ce qui l'a déclenchée (cible ? combat ?) |
| Macro 1 affiche `MISSING: X` | ⚠️ `X` n'existe pas sur le client → à bannir/contourner dans le framework |
| Macro 2 : `ERR` sur GetSpellInfo/IsSpellKnown | ℹ️ attendu (gotcha connu) |
| Macro 2 : `ERR` sur GetSpellCooldown | ❌ grave — nos 20 cooldown triggers reposent dessus |
