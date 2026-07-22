import { useEffect, useState } from 'react';
import { Moon, Sun, Save, FolderOpen, Trash2, RotateCcw, CircleHelp } from 'lucide-react';
import INDEX from '../../registry/INDEX.json';
import { useStore, initialSlug, initialSpecName } from './store';
import { SPECS_WITH_PRESET, presetKey } from './specs';
import {
  saveDraft,
  clearDraft,
  listSnapshots,
  saveSnapshot,
  deleteSnapshot,
  hasWelcomed,
  markWelcomed,
  type Snapshot,
} from './lib/persistence';
import { track } from './lib/analytics';
import { Editor } from './components/Editor';
import { WelcomeModal } from './components/WelcomeModal';
import { ExportModal } from './components/ExportModal';
import { GuideModal } from './components/GuideModal';
import { Button } from './components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from './components/ui/tooltip';
import { Separator } from './components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { ToggleGroup, ToggleGroupItem } from './components/ui/toggle-group';

type Theme = 'light' | 'dark';

type ClassEntry = { slug: string; class: string; specs: string[] };
const CLASSES = (INDEX as { classes: ClassEntry[] }).classes;

export function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [slug, setSlug] = useState(initialSlug);
  // Which spec of `slug` is selected. undefined = the class has no per-spec presets (its single preset, or
  // an auto-default, covers the whole class).
  const [specName, setSpecName] = useState<string | undefined>(initialSpecName);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [wowOpen, setWowOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savedOpen, setSavedOpen] = useState(false);
  const [snaps, setSnaps] = useState<Snapshot[]>(() => listSnapshots());
  const [showWelcome, setShowWelcome] = useState(() => !hasWelcomed());

  const storeSlug = useStore((st) => st.slug);
  const storeSpecName = useStore((st) => st.specName);
  const storeSpec = useStore((st) => st.spec);
  const setClass = useStore((st) => st.setClass);
  const switchClass = useStore((st) => st.switchClass);
  const forceReload = useStore((st) => st.forceReload);

  // Autosave the working SPEC as this class+spec's draft (debounced), so a reload reopens on it. Skip
  // sentinel slugs ('__boot__' / '__reload__') — those are transient states the Editor's load effect resolves.
  useEffect(() => {
    if (storeSlug.startsWith('__')) return;
    const t = setTimeout(() => saveDraft(presetKey(storeSlug, storeSpecName), storeSpec), 400);
    return () => clearTimeout(t);
  }, [storeSlug, storeSpecName, storeSpec]);

  const flash = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 4000); };

  // Specs of the selected class that have a preset. Empty => no spec dropdown (single-preset class).
  const specOptions = SPECS_WITH_PRESET[slug] ?? [];

  // Switching class also picks a spec: keep the current one if that class has it, else its first preset,
  // else none. Without this the spec would stay stale and key a draft that doesn't belong to the class.
  function pickClass(next: string) {
    const opts = SPECS_WITH_PRESET[next] ?? [];
    setSlug(next);
    setSpecName(specName && opts.includes(specName) ? specName : opts[0]);
    setStatus('');
    track('class_selected', { slug: next, spec: specName && opts.includes(specName) ? specName : opts[0] });
  }

  function pickSpec(next: string) {
    setSpecName(next);
    setStatus('');
    track('class_selected', { slug, spec: next });
  }

  // First-visit welcome: apply the chosen class+spec and never show the modal again. The modal already
  // resolved a valid spec for the class, so set it directly rather than letting pickClass re-derive one.
  function confirmWelcome(next: string, nextSpec?: string) {
    setSlug(next);
    setSpecName(nextSpec);
    setStatus('');
    markWelcomed();
    setShowWelcome(false);
  }

  // Save the current working WA as a named snapshot in localStorage.
  function doSaveAs() {
    const name = saveName.trim();
    if (!name) return;
    saveSnapshot(name, storeSlug, storeSpec, storeSpecName);
    setSnaps(listSnapshots());
    setSaveAsOpen(false); setSaveName('');
    flash(`Saved "${name}"`);
    track('snapshot_saved', { slug: storeSlug });
  }
  // Load a snapshot: point the dropdowns at its class+spec and commit its SPEC atomically (the keys match
  // afterwards, so the Editor's load effect won't reload the draft over it). It then becomes that draft.
  function doLoad(snap: Snapshot) {
    setSlug(snap.slug);
    setSpecName(snap.specName);
    switchClass(snap.slug, snap.spec, snap.specName);
    setSavedOpen(false);
    flash(`Loaded "${snap.name}"`);
    track('snapshot_loaded', { slug: snap.slug });
  }
  function doDelete(id: string) {
    deleteSnapshot(id);
    setSnaps(listSnapshots());
  }
  // Discard this class's draft and reload its preset/default (the Editor rebuilds it — it has the registry).
  function doReset() {
    clearDraft(presetKey(slug, specName));
    forceReload();
    flash('Reset to preset');
    track('preset_reset', { slug });
  }
  function pickTheme(t: Theme) {
    if (!t) return; // ToggleGroup emits '' when deselecting the active item — ignore
    setTheme(t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }

  // Import a WA string (generated by this tool) back into the editor as the current SPEC. The backend
  // (/api/import) decodes it and decompiles it to a SPEC (lib/wa-to-spec.js); we load that into the store.
  async function importString() {
    setBusy(true); setStatus('');
    try {
      const res = await fetch('/api/import', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ string: importText.trim() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'import failed');
      // The WA string carries no slug, but our generated SPEC ids embed class then spec
      // ("Starcaller Moon Guard SPEC"). Infer both so the dropdowns, icon resolution AND the autosave
      // draft all match; fall back to the current class for an unrecognized (external) id.
      const id = String(data.spec.id ?? '');
      const cls = CLASSES.find((c) => id.toLowerCase().startsWith(c.class.toLowerCase()));
      // Longest match first, so "Moon Guard" wins over a hypothetical "Moon".
      const spec = cls && [...cls.specs].sort((a, b) => b.length - a.length)
        .find((s) => id.slice(cls.class.length).toLowerCase().includes(s.toLowerCase()));
      if (cls) { setSlug(cls.slug); setSpecName(spec); switchClass(cls.slug, data.spec, spec); }
      else setClass(data.spec);
      const inferred = cls?.slug;
      setImportOpen(false); setImportText('');
      setStatus(inferred ? `Imported — ${data.regions} regions` : `Imported as ${slug} — class not detected`);
    } catch (e) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 4000);
    }
  }

  return (
    <div className="grid h-screen grid-rows-[auto_1fr]">
      {showWelcome && (
        <WelcomeModal classes={CLASSES} defaultSlug={slug} defaultSpecName={specName} onConfirm={confirmWelcome} />
      )}
      <header className="flex h-14 items-center gap-4 border-b bg-[image:var(--grad-bar)] px-4">
        <div className="flex items-center gap-2.5 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground shadow-sm">
            W
          </span>
          <span className="tracking-tight">Forge</span>
          <span className="text-[11px] font-normal uppercase tracking-wider text-muted-foreground">
            CoA WeakAuras
          </span>
        </div>

        <Separator orientation="vertical" className="!h-6" />

        <Select value={slug} onValueChange={pickClass}>
          <SelectTrigger className="w-[168px]" aria-label="Class">
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            {CLASSES.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>{c.class}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Spec picker — only for classes that actually have per-spec presets. Lists the specs we ship a
            preset for, in registry order; the rest of a class's specs appear once they're built. */}
        {specOptions.length > 1 && (
          <Select value={specName ?? ''} onValueChange={pickSpec}>
            <SelectTrigger className="w-[168px]" aria-label="Specialization">
              <SelectValue placeholder="Specialization" />
            </SelectTrigger>
            <SelectContent>
              {(CLASSES.find((c) => c.slug === slug)?.specs ?? specOptions)
                .filter((s) => specOptions.includes(s))
                .map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex-1" />

        {status && (
          <span className="font-mono text-xs text-muted-foreground">{status}</span>
        )}

        <Button variant="ghost" onClick={() => { setGuideOpen(true); track('guide_opened'); }}>
          <CircleHelp /> Guide
        </Button>

        <ToggleGroup
          type="single"
          value={theme}
          onValueChange={(v) => pickTheme(v as Theme)}
        >
          <ToggleGroupItem value="light" aria-label="Light">
            <Sun /> Light
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="Dark">
            <Moon /> Dark
          </ToggleGroupItem>
        </ToggleGroup>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Revert to preset" onClick={doReset}>
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Revert to preset</TooltipContent>
        </Tooltip>

        <div className="relative">
          <Button variant="outline" onClick={() => { setSaveAsOpen((o) => !o); setSavedOpen(false); }}>
            <Save /> Save as
          </Button>
          {saveAsOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[280px] rounded-md border bg-card p-3 shadow-lg">
              <label className="mb-1.5 block text-xs text-muted-foreground">Snapshot name</label>
              <input
                autoFocus
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') doSaveAs(); }}
                placeholder="My Felsworn v2"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setSaveAsOpen(false); setSaveName(''); }}>Cancel</Button>
                <Button onClick={doSaveAs} disabled={!saveName.trim()}>Save</Button>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <Button variant="outline" onClick={() => { setSavedOpen((o) => !o); setSaveAsOpen(false); }}>
            <FolderOpen /> Saved
          </Button>
          {savedOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[300px] rounded-md border bg-card p-1.5 shadow-lg">
              {snaps.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">No saved snapshots</div>
              ) : (
                snaps.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">
                    <button className="min-w-0 flex-1 text-left" onClick={() => doLoad(s)}>
                      <div className="truncate text-sm">{s.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {CLASSES.find((c) => c.slug === s.slug)?.class ?? s.slug}
                        {s.specName ? ` — ${s.specName}` : ''} · {new Date(s.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                    <button
                      className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => doDelete(s.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="relative">
          <Button variant="outline" onClick={() => { setImportOpen((o) => !o); setSaveAsOpen(false); setSavedOpen(false); }}>
            Import string
          </Button>
          {importOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[420px] rounded-md border bg-card p-3 shadow-lg">
              <label className="mb-1.5 block text-xs text-muted-foreground">
                Paste a WeakAuras string generated by Forge
              </label>
              <textarea
                autoFocus
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="!WA:2!..."
                spellCheck={false}
                className="h-24 w-full resize-none rounded-md border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setImportOpen(false); setImportText(''); }}>
                  Cancel
                </Button>
                <Button onClick={importString} disabled={busy || !importText.trim().startsWith('!WA:2!')}>
                  {busy ? 'Importing…' : 'Load'}
                </Button>
              </div>
            </div>
          )}
        </div>

        <Button onClick={() => { setWowOpen(true); setSaveAsOpen(false); setSavedOpen(false); setImportOpen(false); }}>
          Export to WoW
        </Button>
      </header>

      {wowOpen && <ExportModal onClose={() => setWowOpen(false)} />}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} />}

      <Editor slug={slug} specName={specName} />
    </div>
  );
}
