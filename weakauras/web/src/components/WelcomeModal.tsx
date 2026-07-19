import { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

type ClassEntry = { slug: string; class: string; specs: string[] };

// First-visit welcome: a short pitch of what Forge does + a class picker + OK. Shown once (persistence flag),
// hand-rolled overlay to match the header's existing Tailwind-token popovers (no radix Dialog dependency).
export function WelcomeModal({
  classes,
  defaultSlug,
  onConfirm,
}: {
  classes: ClassEntry[];
  defaultSlug: string;
  onConfirm: (slug: string) => void;
}) {
  const [slug, setSlug] = useState(defaultSlug);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md bg-primary text-base font-bold text-primary-foreground shadow-sm">
            W
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight tracking-tight">Welcome to Forge</h2>
            <p className="text-xs text-muted-foreground">CoA WeakAuras generator</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Forge builds ready-to-import <span className="font-medium text-foreground">WeakAuras</span> for
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

        <div className="mt-5">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Pick your class</label>
          <Select value={slug} onValueChange={setSlug}>
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

        <div className="mt-6 flex justify-end">
          <Button onClick={() => onConfirm(slug)}>
            <Sparkles /> OK, let&apos;s go
          </Button>
        </div>
      </div>
    </div>
  );
}
