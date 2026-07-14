import { useMemo, useState } from 'react';
import s from './App.module.css';
import INDEX from '../../registry/INDEX.json';
import { generateString } from './lib/generate';
import { useStore, activeSpec } from './store';
import { Editor } from './components/Editor';

const THEMES = [
  { id: 'parchemin', label: 'Light' },
  { id: 'arcane', label: 'Dark' },
] as const;
type Theme = (typeof THEMES)[number]['id'];

const SunIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

type ClassEntry = { slug: string; class: string; specs: string[] };
const CLASSES = (INDEX as { classes: ClassEntry[] }).classes;

export function App() {
  const [theme, setTheme] = useState<Theme>('arcane');
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
            <button key={t.id} aria-pressed={theme === t.id} onClick={() => pickTheme(t.id)} title={t.label}>
              {t.id === 'parchemin' ? <SunIcon /> : <MoonIcon />}
              {t.label}
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
