import { useMemo, useState } from 'react';
import s from './App.module.css';
import INDEX from '../../registry/INDEX.json';
import { generateString } from './lib/generate';
import { useStore, activeStack } from './store';
import { Editor } from './components/Editor';

const THEMES = ['atelier', 'parchemin', 'arcane'] as const;
type Theme = (typeof THEMES)[number];

type ClassEntry = { slug: string; class: string; specs: string[] };
const CLASSES = (INDEX as { classes: ClassEntry[] }).classes;

export function App() {
  const [theme, setTheme] = useState<Theme>('atelier');
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
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
  }

  async function copyString() {
    setBusy(true); setStatus('');
    try {
      const str = await generateString({ ...storeSpec, stack: activeStack(storeSpec) });
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
    <div className={s.app}>
      <header className={s.topbar}>
        <div className={s.brand}><span className={s.mark}>W</span> Forge <small>CoA WeakAuras</small></div>
        <span className={s.sep} />
        <select className={s.sel} value={slug} onChange={(e) => pickClass(e.target.value)} title="Class">
          {CLASSES.map((c) => <option key={c.slug} value={c.slug}>{c.class}</option>)}
        </select>
        <select className={s.sel} value={spec} onChange={(e) => setSpec(e.target.value)} title="Spec">
          {cls.specs.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
        </select>
        <div className={s.spacer} />
        {status && <span className={s.meta}>{status}</span>}
        <div className={s.themesw}>
          {THEMES.map((t) => (
            <button key={t} aria-pressed={theme === t} onClick={() => pickTheme(t)}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button className={`${s.btn} ${s.primary}`} onClick={copyString} disabled={busy}>
          {busy ? 'Generating…' : 'Copy import string'}
        </button>
      </header>

      <Editor slug={slug} />
    </div>
  );
}
