# WeakAuras Webapp — Plan & Status (handoff doc)

> Self-contained plan for the next phase: a **static, client-side webapp** that generates a ready-made
> WeakAura import string for any Conquest of Azeroth class/spec. Read alongside `../CLAUDE.md`.
> Last updated 2026-07-13.

## 1. Vision

A web editor where a player picks a class/spec, sees a **live preview**, drags abilities into containers
(main CD row, proc row, left/right vertical columns), toggles resource bars (hp/mana/energy/stacks),
tweaks global values (sizes, colors), and downloads a `!WA:2!` import string. **A rigid-but-creative
frame** — not a re-implementation of the in-game addon. Scope v1 = **basics only**: resource bars + CDs +
procs (glow or not). Advanced on-demand stuff (execute procs <35%, armor-buff tracking, conditional
stack-cap glows) comes later.

Long-term host: **fly.io**, free tier, **static** (no backend — generation runs 100% in the browser).

## 2. Core architecture — a DSL over the WeakAuras format

The keystone insight: the webapp produces **data, not code**. We built a small **DSL** (a declarative
"SPEC" document) that compiles to a WeakAuras string:

```
 SPEC (declarative doc the UI edits)
   -> specToParts(spec)   [layout engine: derives every yOffset, auto-centers the stack, uniform gaps]
                          [auto-wiring: derives root controlledChildren + flat children[] from one tree]
   -> assembleTop(parts)  [pure envelope {d,c,m,s,v}]
   -> encodeWA(top)       [LibSerialize -> raw deflate -> EncodeForPrint]
   -> !WA:2!....
```

SPEC = the source code · `specToParts`/`assembleTop` = the compiler · `!WA:2!` string = the binary.
The web UI is just a **visual editor for this DSL**: drag Chaos Rush into the CD row = push
`{spell:'Chaos Rush'}` into an array; toggle a mana bar = add `{kind:'powerBar'}`; then recompile.

### DSL vocabulary (the `kind`s) — in `lib/spec-builder.js`
Central `stack` (top→bottom, auto-laid-out): **`procRow`**, **`cdRow`**, **`powerBar`**, **`healthBar`**,
**`stacks`**, **`uptimeBar`**. Side rails: **`left`**, **`right`** (vertical columns of CD icons).
Global: `{barWidth, iconSize, secIconSize, procSize, gap, xOffset, yOffset}`. Adding a capability = adding
one `kind` (proven: uptimeBar was added in one step and re-laid-out the whole stack automatically).
On-demand extensions later: execute proc, conditional stack-cap glow.

Example SPEC: `classes/felsworn/spec.js` (felsworn basics — zero hand geometry/wiring).

## 3. Status — milestones

- **M0 SPEC schema** — DONE.
- **M1 `specToParts`/layout engine/auto-wiring** — DONE and **VALIDATED IN-GAME** (felsworn-spec imports and
  renders correctly: order, sizes, icons, glows). The generalized generator works end-to-end.
- **M2 per-class registry** — DONE. `registry/<slug>.json` ×21 + `INDEX.json` (palette-ready abilities:
  `{spellId,name,iconUrl,source/spec,guessActive,desc}`) + `resource-model.json`. Generators:
  `tools/registry-build.js`, `tools/resource-infer.js`.
- **M3 icon assets** — DONE/resolved. Source = **db.ascension.gg hosts 100% of icons incl. all custom packs**.
  URL: `https://db.ascension.gg/static/images/wow/icons/{large|medium|tiny}/<name>.{jpg|gif}` (medium=jpg for
  ~26px). `<name>` = scraped icon stub lowercased, `Interface\Icons\` stripped, `_border` KEPT, parens URL-encoded.
  Hotlink via `<img>` works (no CORS needed for display); fallback = self-host all 2744 (~14MB) if throttled.
- **B1 client-side generation** — DONE, the frontend's #1 risk eliminated:
  - `web/src/lib/wa-codec.js` = **zero-dep browser port** of the codec (CompressionStream 'deflate-raw'
    instead of zlib; Uint8Array/DataView instead of Buffer; `encodeWA`/`decodeWA` are **async**, ESM).
    Cross-tested against the Node codec in `tools/webcodec-crosstest.mjs` (4/4): web-encode->node-decode,
    node-encode->web-decode, web full-circle, all == felsworn-spec top (web string ~16 chars longer, both valid).
  - Isomorphic split DONE (Node regression-free — golden guardrail: 4 hand-built classes byte-identical):
    **`lib/builders-core.js`** = all region/trigger builders + pure `assembleTop`, **no fs/path/zlib** (browser-safe;
    templates via `require('*.json')` which Vite inlines). `lib/builders.js` = thin Node wrapper (`buildPackage` +
    `DIST_DIR`) that `require`s core and re-exports it, so class `build.js` call sites are unchanged.
    `lib/spec-builder.js` `specToParts` now imports from **core**; `specToPackage` lazily requires builders.js.
    Browser path = `specToParts -> assembleTop -> await webEncode`.
- **B2 the actual frontend** — IN PROGRESS. See §5.
  - Step 1 DONE: static 3-theme editor-shell mockup at **`web/mockup.html`** (real felsworn abilities +
    hotlinked db.ascension.gg icons + DOM preview of the felsworn stack; switcher for Atelier/Parchemin/Arcane).
  - Decisions made (§7): **keep all 3 themes + shipped switcher (default Atelier)**; **CSS Modules + CSS-var tokens**.
  - Scaffold + minimal slice + full editor for all 21 classes are DONE (see step 5). NEXT = M5 deploy.
- **M5 deploy static on fly.io** — NEXT.

## 4. Two data blockers (need in-game curation, deferred)

- **A — power indices per class.** The scrape has NO power-type data. GOTCHA: the resource NAME != the WoW
  power INDEX on this client (barbarian "Rage" reads power index 3=Energy). `resource-model.json` has
  `powerIndex` confirmed only for felsworn(3)/barbarian(3)/runemaster(0); the other 18 = `null`, need a
  UnitPower probe in-game. **Neutralized in the editor**: confirmed index is used where known; otherwise a
  best-guess (standard name->index) is applied AND the **Power index is a user-editable field in the inspector**
  (with a "verify in-game" hint for unconfirmed classes). So all classes are usable; the user corrects the
  index after checking. `defaultSpec.ts` `powerIndexConfirmed(slug)` drives the hint.
- **B (icons)** — RESOLVED (see M3).
- Minor: proc buff-NAMES (needed for proc-glow) aren't scraped; default = ability name (felsworn proc keys
  off buff "Carve" != ability name). Per-class curation, in-game.

## 5. B2 — the frontend (design brief + build plan)

### Design constraints (from the user — HARD)
NO generic "made in Claude" look: **no black/gold gradients, no glassmorphism, no decorative gradients, no
violet accent, no Inter font.** Guiding principle: **UI chrome stays sober/neutral — the real color is the
WoW class colors inside the live preview** (fel green, rage pink, mana blue). Flat surfaces, crisp 1px
borders, assumed density (a tool, not a landing page), ONE brand accent, zero decorative gradients.

### Themes — build ALL 3, switchable (DECIDED)
Ship a **theme switcher in the top bar**. Implement as CSS custom-property token sets toggled by a
`data-theme` attribute on the root; components stay theme-agnostic (consume the vars). User picks the winner
visually later. **First B2 deliverable = a static HTML mockup of the editor shell in all 3 themes** to choose
from before investing in React.

1. **Atelier** — warm dark + single coral accent (pro creative-tool vibe):
   `canvas #17191F · canvas-2 #1E2129 · surface #262A33 · border #343A45 · text #E7E2D6 · muted #8A8578 · accent #FF6A5A`
2. **Parchemin** — warm light / editorial + deep teal (a tool need not be dark; dark WoW icons read well on
   light; the PREVIEW panel is a dark inset so the WA looks in-game):
   `canvas #F3EFE6 · surface #FBF9F4 · border #DAD3C4 · ink #1B1917 · muted #6B6558 · accent #12726B`
3. **Arcane** — deep indigo/plum + arcane teal (owns the fantasy DNA, sober not RGB-gamer):
   `canvas #15121F · canvas-2 #1B1729 · surface #241E36 · border #342B4A · text #E9E5F2 · muted #8B84A0 · accent #4FE0C2`

Shared class colors in the preview (examples): `fel #56BA04 · rage #E0559A · mana #3B82F6` (real per-class
colors from the registry / sampling, e.g. felsworn green `[0.337,0.729,0.016]`).

### Component stack
- **Radix UI primitives** — DECIDED. Unstyled/accessible behavior only (DropdownMenu, Slider, Popover,
  Tooltip, Switch, Tabs); we hand-style them → look is 100% ours, can't be generic. (shadcn = "Radix + styles";
  we skip shadcn and style Radix directly.)
- **Styling method — STILL OPEN:** CSS Modules + a CSS-variable token system (my reco: cleanest for the
  3 switchable themes, full control, small surface) **vs** Tailwind (fine if the dev is faster in it; Tailwind v4
  reads CSS vars too). PICK THIS before building.
- Fixed regardless: **dnd-kit** (drag&drop), **react-colorful** (color picker), **@fontsource** (self-hosted
  fonts — avoid Inter; candidates: IBM Plex Sans/Mono, Geist, General Sans, Space Grotesk for titles),
  **lucide-react** (UI icons), **Zustand** (SPEC state). Build: **Vite + React + TS**.

### Layout
3-pane editor: **palette left** (abilities from `registry/<slug>.json`, default-filter to `guessActive`,
toggle "show all") · **canvas + live preview center** (a DOM/CSS mock — WA can't run in a browser, so it's
*representative, not pixel-perfect*; truth = in-game import) · **inspector right** (global knobs). Plus a
**top bar** (class/spec selector · theme switcher · export/copy button).

### Bundling note for B2 — DONE
The browser needs the region builders + `assembleTop` but NOT `buildPackage` (fs). Resolved by the
**`builders-core.js`** split (see B1): the browser imports `specToParts` (spec-builder) + `assembleTop`
(builders-core), which never pull fs/path/zlib. No Vite fs/path/zlib aliasing needed.

### B2 step order
1. ✅ Static HTML mockup of the editor shell in all 3 themes → `web/mockup.html` (user picked: keep all 3 + switcher).
2. ✅ CSS Modules vs Tailwind → **CSS Modules + CSS-var tokens**.
3. ✅ Scaffolded Vite/React/TS (`web/`); split `builders-core.js`; wired the web codec (cross-tested).
4. ✅ Minimal working slice DONE: pick class → **Generate** → **Copy** string, 100% client-side. Validated in-browser
   (`localhost:5173`) — the generated `!WA:2!` decodes through the Node codec to the **exact same top** as the
   Node build of the same SPEC. Prod build passes (`npm run build`: tsc + vite, 185 kB JS / 59 kB gzip).
   - Generator bundling: esbuild pre-bundles `lib/browser-entry.mjs` (re-exports `specToParts` + `assembleTop`
     from the CJS core, inlining the JSON templates) → `web/src/generated/generator.js` (gitignored). Rebuilt by
     `npm run gen`, auto-run via the `predev`/`prebuild` hooks. Chosen over vite-plugin-commonjs (which only does
     esbuild *transform*, not bundle → couldn't emit named exports for external `/@fs/` CJS files).
   - App shape: top bar (class/spec selects from `registry/INDEX.json` + 3-theme switcher + Copy-string) then the
     Felsworn editor (step 5) or a gated card. `web/src/specs/felsworn.ts` = the data-only SPEC the editor loads.
   - Web app files (all `web/src/`): `store.ts` (Zustand SPEC + setClass/addIcon/insertIcon/removeIcon/moveIcon/
     toggleElement/setElementField/setGlobal + `activeStack` which strips editor-only `enabled`/`_uid`),
     `registry.ts` (`useRegistry` slug-gated lazy loader + icon resolver, `pathToIconUrl`), `lib/generate.ts`,
     `lib/defaultSpec.ts` (per-class auto SPEC + `powerIndexConfirmed`), `specs/felsworn.ts` (curated reference),
     `App.tsx`, `components/{Editor,Palette,Preview,Inspector}.tsx`, `App.module.css` + `editor.module.css` +
     `themes.css`. Generator bundle built by `scripts/gen.mjs` (esbuild JS API, not the CLI — no `.bin` PATH dep).
5. ✅ Editor DONE — **all 21 classes**: 3-pane shell + **Zustand** SPEC store + **registry-driven palette** (lazy
   `import.meta.glob` per class, guessActive/All filter + search, dnd-kit draggable) + **live DOM preview**
   driven by the store + **full dnd-kit drag-drop** (palette→cdRow add; reorder within a row; move between rows
   via the multi-container `onDragOver` pattern + stable per-icon `_uid`; overlay centered on cursor via
   `snapCenterToCursor`; MouseSensor+TouchSensor) + **inspector** (global sliders, resource toggles, editable
   **Power index**). Preview enlarged at native ×1.7 (not CSS zoom/transform — those break dnd-kit). Themed
   scrollbars. Class switch loads a SPEC: **felsworn = curated reference** (`specs/felsworn.ts`, with proc/uptime/
   stacks/glows), **every other class = auto-default** from its registry (`lib/defaultSpec.ts`: cdRow of guessed-
   active abilities + power bar + health bar). Validated in-browser + Node round-trip: barbarian auto-spec decodes
   to 15 valid regions, real spellIds present, no `_uid`/placeholder leak; a class-switch race (stale abilities
   seeding the wrong class) was fixed in `useRegistry` (only use data whose slug matches).
   Remaining polish (later): side-rail columns, per-icon glow/proc/charges config, color pickers, procRow drop,
   stacks/uptime auto-add (need buff names), spec-tab filtering of the palette, icon 404 fallback, save/load + import.
6. M5 deploy static on fly.io.  ← NEXT

## 6. Key files
- `lib/spec-builder.js` — the DSL compiler (`specToParts` pure [imports builders-core], `specToPackage` Node writer).
- `lib/builders-core.js` — **isomorphic** region/trigger builders + pure `assembleTop` (no fs/path/zlib; browser-safe).
- `lib/builders.js` — thin Node wrapper: `buildPackage` + `DIST_DIR`, re-exports all of builders-core.
- `lib/wa-codec.js` — Node codec (zlib). `web/src/lib/wa-codec.js` — browser codec (CompressionStream, async, ESM).
- `tools/webcodec-crosstest.mjs` — asserts web codec == Node codec (run after touching either codec).
- `web/mockup.html` — static 3-theme editor-shell mockup (design reference for the React build).
- `classes/felsworn/spec.js` — first SPEC (felsworn basics); builds `dist/felsworn-spec.import.txt`.
- `registry/<slug>.json` ×21 + `INDEX.json` + `resource-model.json` — frontend data.
- `tools/registry-build.js`, `tools/resource-infer.js` — regenerate the registry.
- `tools/verify-unchanged.js` (+ `tools/golden/`) — refactor guardrail (rebuild all == golden snapshot).

## 7. Open decisions before writing B2 code
1. ✅ **CSS Modules + CSS-var tokens** (styling method over Radix).
2. ✅ **Keep all 3 themes + shipped switcher** (default Atelier); user picks the winner visually later.
3. Font pick — still open (avoid Inter; candidates: IBM Plex Sans/Mono, Geist, General Sans, Space Grotesk).
   Deferred: scaffold with a neutral system stack + one distinctive title face, swap later.
