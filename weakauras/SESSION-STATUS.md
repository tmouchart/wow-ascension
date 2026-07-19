# Session status & next steps (handoff)

> Fichier **non commité** volontairement — plan de reprise. Supprime-le quand tu veux.
> Dernière session : 2026-07-20.

## Ce qui a été fait cette session

### 1. Rotations basiques pour les 21 classes / 70 specs — COMMITÉ + PUSHÉ (`0640fe6`)
- `registry/rotations/<slug>.json` (21 fichiers) : par spec, champs **déterministes**
  (resource / generators / spenders / cooldowns / defensives, extraits par regex des tooltips)
  + champs **inférés** (maintain / procs / st / aoe / summary, jugement LLM) avec `confidence`.
- Outils : `tools/rotation-scaffold.js` (`<slug>|all`, merge-preserve), `tools/rotation-merge-inference.js`.
- 33 specs `medium`, 37 `low`. Qualité vérifiée (0 hallucination sur spot-check).
- **Détail** : `registry/rotations/README.md`.

### 2. Sync felsworn Tyrant — COMMITÉ, NON PUSHÉ (`e4ed29c`)
- Ajout de **Burning Hatred** (805239) au cdRow primaire pour coller à la WA live.

### 3. Presets per-spec pour 5 classes (16 specs) — COMMITÉ, NON PUSHÉ (`b0f24e9`)
- `classes/<class>-<spec>/` : reaper (3), starcaller (4), ranger (3), pyromancer (3), knight-of-xoroth (3).
- Tous **round-trip green**, ASCII pur, 0 spellId inexistant. Bâtis depuis les rotations.
- reaper fait à la main (pattern), les 4 autres classes en fan-out d'agents.

## État git
- Arbre propre. **2 commits locaux non pushés** (`e4ed29c`, `b0f24e9`).
- `git push origin main` = **auto-deploy fly.io** (voir CLAUDE.md). Contenu preset = safe à push.

## BLOQUANT découvert (à traiter en priorité) : le web n'expose pas les per-spec

**Bug** : `web/src/specs/index.ts` construit `PRESETS[spec.slug] = spec`. Mes 4 fichiers starcaller
partagent tous `slug:"starcaller"` → ils **s'écrasent**, un seul survit (Warden). Idem reaper/ranger/
pyromancer/knight-of-xoroth. **Les 16 presets ne sont utilisables que via le build Node (`dist/*.import.txt`),
pas dans l'app.** L'app n'a jamais géré >1 preset par classe et n'a **aucun sélecteur de spé**
(`ClassEntry.specs` existe dans les données mais n'est utilisé nulle part).

### Fix proposé — "spec picker" (petit chantier front)
1. **Clé par spé** : ajouter un champ `spec` (ex. `"Moon Guard"`) à chaque `spec.json` ; indexer
   `PRESETS` par `slug+spec` (ou par `id`, déjà unique) + un index `slug -> [specs dispo]`.
2. **2e menu déroulant "Spécialisation"** (shadcn Select) à côté du menu Classe, visible si la classe a ≥2 presets.
3. **Store + drafts** : la sélection porte `(slug, spec)` ; chaque spé a son propre brouillon
   (`store.ts`, `App.tsx`, `specs/index.ts`, `Editor.tsx`).
4. Aussi : uniformiser le ncommage des 5 anciens presets (felsworn=Tyrant, runemaster=Runic, barbarian=Brutality,
   cultist=?, tinker=Demolition) — leur donner un champ `spec` cohérent.

**Décision UX en attente** (posée en fin de session, non tranchée) : le menu Spé liste-t-il
*seulement les spés avec preset*, ou *toutes les spés (grisées si pas de preset)* ?

## Next steps (par priorité)
1. **[bloquant]** Implémenter le spec picker web (ci-dessus) — sinon les 16 nouveaux presets sont invisibles dans l'app.
2. **Valider en jeu** au moins 1 preset per-spec (import) avant de scaler — confirmer les blind spots :
   noms d'aura (Reaped Soul, Scattered Stars, Advantage, Flamecasting, Demonfire, DoTs…),
   caps de stacks (devinés), index de ressource custom.
3. **Scaler** aux 11 classes restantes sans preset (même méthode : fan-out d'agents piloté par les rotations).
4. (Optionnel) `tools/preset-vs-rotation.js` — audit auto rotation↔preset, **en tenant compte** que la rotation
   est un *menu* (superset), pas une build : ne pas crier au loup sur un sort hors-niveau / hors-points-de-talent.
   `load.use_spellknown` masque déjà les sorts non appris → inclure le superset est OK.

## Rappels / gotchas appris
- `load.use_spellknown` masque les icônes de sorts non appris → un preset peut porter le **superset** de la spé
  (ex. inclure Tyrannical Resolve ET Infernal Whipcrack même si un seul est pris au 60).
- Un icône `procRow` **doit** avoir une condition (`buff`/`execute`/`stealable`/`when`) — un simple `glow` échoue au build.
- `"spell":<id>` numérique auto-résout l'icône ; seuls `byName`/procs manuels ont besoin d'un `fallbackIcon`.
- Rotation = superset filtré par niveau + points de talent (certains sorts mutuellement exclusifs).
