import { useMemo, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import INDEX from '../../registry/INDEX.json';
import { generateString } from './lib/generate';
import { useStore, activeSpec } from './store';
import { Editor } from './components/Editor';
import { Button } from './components/ui/button';
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
  const [slug, setSlug] = useState('felsworn');
  const cls = useMemo(() => CLASSES.find((c) => c.slug === slug)!, [slug]);
  const [spec, setSpec] = useState(cls.specs[0] ?? '');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const storeSpec = useStore((st) => st.spec);

  function pickClass(next: string) {
    setSlug(next);
    setSpec(CLASSES.find((c) => c.slug === next)!.specs[0] ?? '');
    setStatus('');
  }
  function pickTheme(t: Theme) {
    if (!t) return; // ToggleGroup emits '' when deselecting the active item — ignore
    setTheme(t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }

  async function copyString() {
    setBusy(true); setStatus('');
    try {
      const str = await generateString(activeSpec(storeSpec));
      await navigator.clipboard.writeText(str);
      setStatus(`Copied — ${str.length} chars`);
    } catch (e) {
      setStatus('Error: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      setTimeout(() => setStatus(''), 4000);
    }
  }

  return (
    <div className="grid h-screen grid-rows-[auto_1fr]">
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

        <Select value={spec} onValueChange={setSpec}>
          <SelectTrigger className="w-[150px]" aria-label="Spec">
            <SelectValue placeholder="Spec" />
          </SelectTrigger>
          <SelectContent>
            {cls.specs.map((sp) => (
              <SelectItem key={sp} value={sp}>{sp}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        {status && (
          <span className="font-mono text-xs text-muted-foreground">{status}</span>
        )}

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

        <Button onClick={copyString} disabled={busy}>
          {busy ? 'Generating…' : 'Copy import string'}
        </Button>
      </header>

      <Editor slug={slug} />
    </div>
  );
}
