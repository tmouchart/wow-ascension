import { useRef, useState } from 'react';
import { Sparkles, ChevronDown, Undo2 } from 'lucide-react';
import { useStore, activeSpec, type Spec } from '../store';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

// In-app AI agent: natural-language edits to the current SPEC. Posts { slug, spec, messages } to the backend
// (/api/agent, proxied to server/server.js in dev), which STREAMS back NDJSON events (model/text/tool/done/
// error) as the agent works — so the answer + tool trace scroll in live. The returned newSpec is applied via
// setClass only on `done`; we keep the prior spec for one-step Undo. The backend is the only thing that talks
// to OpenRouter — no key in the browser.
type Turn = { role: 'user' | 'agent'; text: string; trace?: { tool: string }[]; model?: string; streaming?: boolean };
type Ev =
  | { type: 'model'; model: string }
  | { type: 'text'; value: string }
  | { type: 'tool'; name: string }
  | { type: 'reset' }
  | { type: 'done'; newSpec: Spec; summary: string; model: string }
  | { type: 'error'; error: string };

export function AgentPanel({ slug }: { slug: string }) {
  const spec = useStore((s) => s.spec);
  const setClass = useStore((s) => s.setClass);
  const [open, setOpen] = useState(true);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [undo, setUndo] = useState<Spec | null>(null);
  const [err, setErr] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollDown = () => requestAnimationFrame(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight));
  // Patch the last turn (the streaming agent bubble) in place.
  const patchLast = (fn: (t: Turn) => Turn) =>
    setTurns((ts) => ts.map((t, i) => (i === ts.length - 1 ? fn(t) : t)));

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setInput('');
    setErr('');
    setBusy(true);
    const history = turns.map((t) => ({ role: t.role === 'user' ? 'user' : 'assistant', content: t.text }));
    const prevSpec = spec;
    setTurns((t) => [...t, { role: 'user', text: content }, { role: 'agent', text: '', trace: [], streaming: true }]);
    scrollDown();
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug, spec: activeSpec(spec), messages: [...history, { role: 'user', content }] }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || `error ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handle(JSON.parse(line) as Ev, prevSpec);
        }
        scrollDown();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      patchLast((t) => ({ ...t, streaming: false }));
    } finally {
      setBusy(false);
      patchLast((t) => ({ ...t, streaming: false }));
      scrollDown();
    }
  }

  function handle(ev: Ev, prevSpec: Spec) {
    switch (ev.type) {
      case 'model':
        patchLast((t) => ({ ...t, model: ev.model }));
        break;
      case 'text':
        patchLast((t) => ({ ...t, text: t.text + ev.value }));
        break;
      case 'tool':
        patchLast((t) => ({ ...t, trace: [...(t.trace ?? []), { tool: ev.name }] }));
        break;
      case 'reset':   // a model failed mid-stream; discard its partial output and let the next model retry
        patchLast((t) => ({ ...t, text: '', trace: [], model: undefined, streaming: true }));
        break;
      case 'done':
        setClass(ev.newSpec);
        setUndo(prevSpec);
        patchLast((t) => ({ ...t, streaming: false, text: t.text || ev.summary || '(done)', model: ev.model }));
        break;
      case 'error':
        setErr(ev.error);
        patchLast((t) => ({ ...t, streaming: false }));
        break;
    }
  }

  function doUndo() {
    if (!undo) return;
    setClass(undo);
    setUndo(null);
    setTurns((t) => [...t, { role: 'agent', text: '(reverted the last change)' }]);
  }

  return (
    <div className="flex flex-col border-t bg-[image:var(--grad-bar)]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-muted-foreground hover:text-foreground"
      >
        <Sparkles className="size-4 text-primary" />
        Agent
        <span className="font-normal opacity-60">edit with natural language</span>
        <ChevronDown className={`ml-auto size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {open && (
        <>
          {turns.length > 0 && (
            <div ref={scrollRef} className="max-h-56 overflow-auto border-t px-4 py-3 text-sm">
              {turns.map((t, i) => (
                <div key={i} className="mb-2.5">
                  <div className={t.role === 'user' ? 'text-foreground' : 'text-muted-foreground'}>
                    <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-60">
                      {t.role === 'user' ? 'you' : 'agent'}
                    </span>
                    {t.text}
                    {t.streaming && <span className="ml-0.5 animate-pulse">▍</span>}
                  </div>
                  {t.trace && t.trace.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {t.trace.map((c, j) => (
                        <Badge key={j} variant="secondary" className="font-mono text-[10px]">{c.tool}</Badge>
                      ))}
                      {t.model && <span className="text-[10px] opacity-50">{t.model}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {err && <div className="border-t px-4 py-2 text-xs text-destructive">{err}</div>}

          <div className="flex items-center gap-2 border-t px-3 py-2.5">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
              placeholder='e.g. "add Chaos Rush to the cooldowns and make it glow when ready"'
              disabled={busy}
              className="flex-1"
            />
            {undo && (
              <Button variant="ghost" size="icon" onClick={doUndo} title="Undo last change">
                <Undo2 className="size-4" />
              </Button>
            )}
            <Button onClick={send} disabled={busy || !input.trim()}>
              {busy ? 'Thinking…' : 'Send'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
