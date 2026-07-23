import { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { Button } from './ui/button';
import { SPECS_WITH_PRESET } from '../specs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

type ClassEntry = { slug: string; class: string; specs: string[] };

// First-visit welcome: a short pitch of what Auraforge does + a class/spec picker + OK. Shown once (persistence
// flag), hand-rolled overlay to match the header's existing Tailwind-token popovers (no radix Dialog dep).
export function WelcomeModal({
  classes,
  defaultSlug,
  defaultSpecName,
  onConfirm,
}: {
  classes: ClassEntry[];
  defaultSlug: string;
  defaultSpecName?: string;
  onConfirm: (slug: string, specName?: string) => void;
}) {
  const [slug, setSlug] = useState(defaultSlug);
  const [specName, setSpecName] = useState<string | undefined>(defaultSpecName);

  // Specs of the selected class that ship a preset, in registry order (same rule as the header picker).
  const specOptions = SPECS_WITH_PRESET[slug] ?? [];
  const orderedSpecs = (classes.find((c) => c.slug === slug)?.specs ?? specOptions)
    .filter((s) => specOptions.includes(s));

  // Changing class must re-point the spec, else OK would confirm a spec the new class doesn't have.
  function pickClass(next: string) {
    const opts = SPECS_WITH_PRESET[next] ?? [];
    setSlug(next);
    setSpecName(specName && opts.includes(specName) ? specName : opts[0]);
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-base font-bold text-primary-foreground shadow-sm">
            W
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight tracking-tight">Welcome to Auraforge</h2>
            <p className="text-xs text-muted-foreground">CoA WeakAuras generator</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Auraforge builds ready-to-import <span className="font-medium text-foreground">WeakAuras</span> for
          Conquest of Azeroth custom classes — resource bars, cooldown rows, buff trackers and procs — then
          gives you an import string to paste in-game.
        </p>

        <div className="mt-4 flex items-start gap-2.5 rounded-md border bg-muted/40 p-3">
          <Wand2 className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs text-muted-foreground">
            A built-in <span className="font-medium text-foreground">AI agent</span> can help you create and
            modify your WeakAura — just describe what you want in plain language.
          </p>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Pick your class</label>
            <Select value={slug} onValueChange={pickClass}>
              <SelectTrigger className="w-full" aria-label="Class">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent className="z-[110]">
                {classes.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>{c.class}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {orderedSpecs.length > 1 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Specialization</label>
              <Select value={specName ?? ''} onValueChange={setSpecName}>
                <SelectTrigger className="w-full" aria-label="Specialization">
                  <SelectValue placeholder="Spec" />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {orderedSpecs.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={() => onConfirm(slug, specName)}>
            <Sparkles /> OK, let&apos;s go
          </Button>
        </div>
      </div>
    </div>
  );
}
